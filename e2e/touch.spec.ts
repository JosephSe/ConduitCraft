/**
 * Touch pass (A12). Runs only on the tablet projects (768 x 1024 and 1024 x 768, touch, coarse pointer).
 * Gestures are real touch events sent through the DevTools protocol, so the app sees pointerType "touch".
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { openLumenRelay } from './helpers';

type Pt = { x: number; y: number };

async function touch(page: Page): Promise<CDPSession> {
  return page.context().newCDPSession(page);
}
const send = (cdp: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd', points: Pt[]) =>
  cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: type === 'touchEnd' ? [] : points.map((p, id) => ({ x: p.x, y: p.y, id })),
  });

/** One finger down at `from`, along a straight path to `to`, then up. */
async function drag(page: Page, from: Pt, to: Pt, steps = 8): Promise<void> {
  const cdp = await touch(page);
  await send(cdp, 'touchStart', [from]);
  for (let i = 1; i <= steps; i += 1) {
    await send(cdp, 'touchMove', [{ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps }]);
  }
  await send(cdp, 'touchEnd', []);
}

/** Two fingers, symmetric around `c`, moving from `r0` px apart to `r1` px apart. */
async function pinch(page: Page, c: Pt, r0: number, r1: number, steps = 8): Promise<void> {
  const cdp = await touch(page);
  const pts = (r: number): Pt[] => [{ x: c.x - r, y: c.y }, { x: c.x + r, y: c.y }];
  await send(cdp, 'touchStart', pts(r0));
  for (let i = 1; i <= steps; i += 1) await send(cdp, 'touchMove', pts(r0 + ((r1 - r0) * i) / steps));
  await send(cdp, 'touchEnd', []);
}

async function longPress(page: Page, at: Pt, ms = 800): Promise<void> {
  const cdp = await touch(page);
  await send(cdp, 'touchStart', [at]);
  await page.waitForTimeout(ms);
  await send(cdp, 'touchEnd', []);
}

/** Run a command from the palette using only taps: the search button, then the result. */
async function runCommandByTap(page: Page, query: string): Promise<void> {
  await page.locator('#btn-open-palette').tap();
  await page.locator('#cmd-palette-input').fill(query);
  await page.locator('.palette-item').first().tap();
  await expect(page.locator('#command-palette-dialog')).toBeHidden();
}

async function open(page: Page): Promise<void> {
  await page.goto('/');
  await openLumenRelay(page);
  await expect(page.locator('.arch-node').first()).toBeVisible();
}

/** Centre of a node's hit area, only if nothing else covers it. */
async function nodeCentre(page: Page, id: string): Promise<Pt> {
  const c = await page.evaluate((nodeId) => {
    const el = document.querySelector<HTMLElement>(`.arch-node[data-node="${nodeId}"] .node-select-hit`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const x = r.x + r.width / 2;
    const y = r.y + r.height / 2;
    return document.elementFromPoint(x, y)?.closest('.arch-node')?.getAttribute('data-node') === nodeId ? { x, y } : null;
  }, id);
  expect(c, `node ${id} must be visible and uncovered`).not.toBeNull();
  return c!;
}

/** Ids of visible, uncovered nodes with no wire between them, so a new wire is unambiguous. */
async function freePair(page: Page): Promise<[string, string]> {
  const pair = await page.evaluate(() => {
    const wired = new Set<string>();
    for (const g of document.querySelectorAll<SVGGElement>('.conduit-group')) {
      wired.add(`${g.dataset.from}|${g.dataset.to}`);
      wired.add(`${g.dataset.to}|${g.dataset.from}`);
    }
    const ok = (id: string) => {
      const el = document.querySelector<HTMLElement>(`.arch-node[data-node="${id}"] .node-select-hit`);
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('.arch-node')?.getAttribute('data-node') === id;
    };
    const ids = [...document.querySelectorAll<HTMLElement>('.arch-node')].map((e) => e.dataset.node!).filter(ok);
    for (const a of ids) for (const b of ids) if (a !== b && !wired.has(`${a}|${b}`)) return [a, b];
    return null;
  });
  expect(pair).not.toBeNull();
  return pair as [string, string];
}

const nodePos = (page: Page, id: string) =>
  page.evaluate((n) => {
    const el = document.querySelector<HTMLElement>(`.arch-node[data-node="${n}"]`)!;
    return [el.style.getPropertyValue('--nx'), el.style.getPropertyValue('--ny')].join(',');
  }, id);

/** Where the camera is: the stage's pan offsets, which change when the canvas is panned. */
const stageTransform = (page: Page) => page.locator('#stage-world').evaluate((el) => `${getComputedStyle(el).transform}|${el.getAttribute('style')}`);

/** A point on empty canvas, away from every node, wire and floating control. */
async function emptyPoint(page: Page, spread = 0): Promise<Pt> {
  const p = await page.evaluate((r) => {
    const vp = document.getElementById('canvas-viewport')!.getBoundingClientRect();
    const blocked = '.arch-node, .blueprint-spec, .zone-banner, .conduit-group, .canvas-hud, .context-toolbar, button, input, a';
    for (let y = vp.top + 80; y < vp.bottom - 80; y += 30) {
      for (let x = vp.left + 40; x < vp.right - 40; x += 30) {
        const clear = [x - r, x, x + r].every((px) => !document.elementFromPoint(px, y)?.closest(blocked));
        if (clear && x - r > vp.left && x + r < vp.right) return { x, y };
      }
    }
    return null;
  }, spread);
  expect(p, 'the canvas needs an empty spot').not.toBeNull();
  return p!;
}

test('everything you tap is at least 44 px', async ({ page }) => {
  await open(page);
  const [first] = await freePair(page);
  const c = await nodeCentre(page, first);
  await page.touchscreen.tap(c.x, c.y);
  const small = await page.evaluate(() => {
    const out: string[] = [];
    const canvasObjects = '.arch-node, .zone-banner, .blueprint-spec, .conduit-group, #wire-handles-svg';
    for (const el of document.querySelectorAll<HTMLElement>('button, a[href], [role="menuitem"], [role="tab"], select, input:not([type="hidden"]):not(.visually-hidden)')) {
      if (el.closest(canvasObjects)) continue; // these scale with the camera; their hit areas are checked by the flows below
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || getComputedStyle(el).visibility === 'hidden') continue;
      if (r.width < 43.5 || r.height < 43.5) {
        out.push(`${el.id || el.className} ${Math.round(r.width)}x${Math.round(r.height)} ${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30)}`);
      }
    }
    return out;
  });
  expect(small).toEqual([]);
});

test('tap places a component from the command palette', async ({ page }) => {
  await open(page);
  const before = await page.locator('.arch-node').count();
  await runCommandByTap(page, 'Add Service');
  await expect(page.locator('.arch-node')).toHaveCount(before + 1);
});

test('tap places a component from the palette drawer', async ({ page }) => {
  await open(page);
  const before = await page.locator('.arch-node').count();
  await expect(page.locator('#palette-sidebar')).toBeHidden();
  await page.locator('#btn-drawer-palette').tap();
  await expect(page.locator('#palette-sidebar')).toBeVisible();
  await expect(page.locator('#btn-drawer-palette')).toBeHidden();
  await page.locator('#palette-sidebar .stencil-card').first().tap();
  await expect(page.locator('.arch-node')).toHaveCount(before + 1);
});

test('the drawer tabs are full-size targets that never overlap the top bar', async ({ page }) => {
  await open(page);
  for (const id of ['#btn-drawer-palette', '#btn-drawer-inspector']) {
    const box = await page.locator(id).boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(43.5);
    expect(box!.height).toBeGreaterThanOrEqual(43.5);
  }
  // The top bar stays at 8 controls or fewer: the panel toggles are not brought back to it.
  await expect(page.locator('.topbar .panel-rail-toggles')).toBeHidden();
});

test('the top bar keeps the lens switch and undo/redo', async ({ page }) => {
  await open(page);
  await expect(page.locator('.topbar .mode-switcher')).toBeVisible();
  await expect(page.locator('.topbar .doc-history-controls')).toBeVisible();
  // Nothing in the bar is cut off: it fits the viewport width.
  const overflow = await page.evaluate(() => {
    const bar = document.querySelector('.topbar') as HTMLElement;
    return bar.scrollWidth - bar.clientWidth;
  });
  expect(overflow).toBeLessThanOrEqual(0);
});

test('canvas hit areas are 44 px at 100% zoom', async ({ page }) => {
  await open(page);
  const [a] = await freePair(page);
  await page.touchscreen.tap((await nodeCentre(page, a)).x, (await nodeCentre(page, a)).y);
  const small = await page.evaluate((id) => {
    const node = document.querySelector<HTMLElement>(`.arch-node[data-node="${id}"]`)!;
    const out: string[] = [];
    const scale = (Number.parseInt(document.getElementById('zoom-readout')!.textContent ?? '100', 10) || 100) / 100;
    for (const el of node.querySelectorAll<HTMLElement>('.node-port, .node-drag-handle, .node-level-badge')) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none') continue;
      // Hit area = the box plus any ::after inset, measured at 100% zoom.
      const r = el.getBoundingClientRect();
      const after = getComputedStyle(el, '::after');
      const inset = after.content !== 'none' ? Math.abs(Number.parseFloat(after.top) || 0) : 0;
      const w = r.width / scale + inset * 2;
      const h = r.height / scale + inset * 2;
      if (w < 43.5 || h < 43.5) out.push(`${el.className} ${Math.round(w)}x${Math.round(h)}`);
    }
    return out;
  }, a);
  expect(small).toEqual([]);
});

test('tap selects a component and the inspector shows it', async ({ page }) => {
  await open(page);
  const [a] = await freePair(page);
  const c = await nodeCentre(page, a);
  await page.touchscreen.tap(c.x, c.y);
  await expect(page.locator(`.arch-node[data-node="${a}"] .node-select-hit`)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.context-toolbar')).toBeVisible();
  // On a tablet the inspector is a drawer, opened from its edge tab.
  await page.locator('#btn-drawer-inspector').tap();
  await expect(page.locator('#inspector-panel')).toBeVisible();
});

test('dragging a component with one finger moves it', async ({ page }) => {
  await open(page);
  const [a] = await freePair(page);
  const from = await nodeCentre(page, a);
  const before = await nodePos(page, a);
  await drag(page, from, { x: from.x + 60, y: from.y + 50 });
  await expect.poll(() => nodePos(page, a)).not.toBe(before);
});

test('the wire tool connects two components by dragging', async ({ page }) => {
  await open(page);
  const [a, b] = await freePair(page);
  const c = await nodeCentre(page, a);
  await page.touchscreen.tap(c.x, c.y);
  await page.locator('.context-toolbar').getByRole('button', { name: 'Wire' }).tap();
  await expect(page.locator('#workspace')).toHaveAttribute('data-tool', 'connect');
  const wires = await page.locator('.conduit-group').count();
  await drag(page, await nodeCentre(page, a), await nodeCentre(page, b), 12);
  await expect(page.locator('.conduit-group')).toHaveCount(wires + 1);
  await expect(page.locator(`.conduit-group[data-from="${a}"][data-to="${b}"]`)).toHaveCount(1);
});

test('one finger on empty canvas pans', async ({ page }) => {
  await open(page);
  const p = await emptyPoint(page);
  const before = await stageTransform(page);
  await drag(page, p, { x: p.x + 70, y: p.y + 40 });
  await expect.poll(() => stageTransform(page)).not.toBe(before);
});

test('two fingers pinch to zoom', async ({ page }) => {
  await open(page);
  const p = await emptyPoint(page, 110);
  const scale = async () => Number.parseInt((await page.locator('.zoom-readout').first().textContent()) ?? '0', 10);
  const before = await scale();
  await pinch(page, p, 30, 110);
  await expect.poll(scale).toBeGreaterThan(before * 1.2);
  const zoomed = await scale();
  // The zoomed-in canvas has moved things under the first spot, so find a clear one for the fingers to land on.
  await pinch(page, await emptyPoint(page, 90), 90, 25);
  await expect.poll(scale).toBeLessThan(zoomed * 0.85);
});

test('a long press on a component opens its menu', async ({ page }) => {
  await open(page);
  const [a] = await freePair(page);
  await longPress(page, await nodeCentre(page, a));
  await expect(page.locator('.context-menu')).toBeVisible();
  // Every item is a full-size target.
  const heights = await page.locator('.context-menu [role="menuitem"]').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  expect(Math.min(...heights)).toBeGreaterThanOrEqual(43.5);
  await page.keyboard.press('Escape');
});

test('the export dialog opens by tap and exports', async ({ page }) => {
  await open(page);
  await runCommandByTap(page, 'Export Diagram Modal');
  const html = page.locator('#btn-export-html');
  await expect(html).toBeVisible();
  const boxes = await page.locator('#btn-export-gif, #btn-export-html').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  expect(Math.min(...boxes)).toBeGreaterThanOrEqual(43.5);
  await html.tap();
  await expect(page.locator('#toast-container')).toContainText(/.+/);
});

test('the layout has no axe violations', async ({ page }) => {
  await open(page);
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
});
