import { expect, test, type Page } from '@playwright/test';
import { openLumenRelay } from './helpers';

async function loadShowcase(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await openLumenRelay(page);
  await expect(page.locator('.arch-node').first()).toBeVisible();
}

const zoomPercent = async (page: Page) =>
  parseInt((await page.locator('#zoom-readout').textContent()) ?? '0', 10);

async function zoomInTo(page: Page, minPercent: number): Promise<void> {
  for (let i = 0; i < 12 && (await zoomPercent(page)) < minPercent; i += 1) {
    await page.locator('#btn-zoom-in').click();
  }
}

/** A visible, uncovered node near the middle of the canvas, with its centre in viewport coordinates. */
async function nodeNearCentre(page: Page) {
  const found = await page.evaluate(() => {
    const vp = document.getElementById('canvas-viewport')!.getBoundingClientRect();
    const cx = vp.x + vp.width / 2;
    const cy = vp.y + vp.height / 2;
    let best: { id: string; d: number } | null = null;
    for (const el of document.querySelectorAll<HTMLElement>('.arch-node')) {
      const hit = el.querySelector<HTMLElement>('.node-select-hit');
      if (!hit) continue;
      const r = hit.getBoundingClientRect();
      const x = r.x + r.width / 2;
      const y = r.y + r.height / 2;
      if (x < vp.x || x > vp.right || y < vp.y || y > vp.bottom) continue;
      if (document.elementFromPoint(x, y)?.closest('.arch-node') !== el) continue;
      const d = Math.hypot(x - cx, y - cy);
      if (!best || d < best.d) best = { id: el.dataset.node!, d };
    }
    return best?.id ?? null;
  });
  expect(found, 'a visible node near the centre').not.toBeNull();
  return found!;
}

/** Where the node sits relative to the middle of the canvas viewport. */
async function offsetFromCentre(page: Page, id: string) {
  return page.evaluate((nodeId) => {
    const vp = document.getElementById('canvas-viewport')!.getBoundingClientRect();
    const r = document.querySelector<HTMLElement>(`.arch-node[data-node="${nodeId}"] .node-select-hit`)!.getBoundingClientRect();
    return { x: r.x + r.width / 2 - (vp.x + vp.width / 2), y: r.y + r.height / 2 - (vp.y + vp.height / 2) };
  }, id);
}

const nodeScreenX = (page: Page, id: string) =>
  page.evaluate(
    (nodeId) => {
      const r = document.querySelector<HTMLElement>(`.arch-node[data-node="${nodeId}"] .node-select-hit`)!.getBoundingClientRect();
      return r.x + r.width / 2;
    },
    id,
  );

const nodeDocPosition = (page: Page, id: string) =>
  page.evaluate(
    (nodeId) => {
      const el = document.querySelector<HTMLElement>(`.arch-node[data-node="${nodeId}"]`)!;
      return [el.style.getPropertyValue('--nx'), el.style.getPropertyValue('--ny')];
    },
    id,
  );

async function overCanvas(page: Page) {
  const box = (await page.locator('#canvas-viewport').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
}

test('resizing the window keeps the zoom and the point at the centre of the view', async ({ page }) => {
  await loadShowcase(page);
  await zoomInTo(page, 70);
  const id = await nodeNearCentre(page);
  const zoom = await zoomPercent(page);
  const before = await offsetFromCentre(page, id);

  await page.setViewportSize({ width: 1100, height: 760 });
  await expect.poll(async () => Math.abs((await offsetFromCentre(page, id)).x - before.x)).toBeLessThan(3);
  expect(Math.abs((await offsetFromCentre(page, id)).y - before.y)).toBeLessThan(3);
  expect(await zoomPercent(page), 'a resize must not reset the zoom').toBe(zoom);

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect.poll(async () => Math.abs((await offsetFromCentre(page, id)).x - before.x)).toBeLessThan(3);
  expect(await zoomPercent(page)).toBe(zoom);
});

test('switching between Design and Data View keeps the zoom', async ({ page }) => {
  await loadShowcase(page);
  await zoomInTo(page, 70);
  const zoom = await zoomPercent(page);

  await page.locator('input[name="workspace-mode"][value="data"]').evaluate((el: HTMLElement) => el.click());
  await expect(page.locator('#data-inspector-pane')).toBeVisible();
  expect(await zoomPercent(page), 'switching to Data View must not refit').toBe(zoom);

  await page.locator('input[name="workspace-mode"][value="design"]').evaluate((el: HTMLElement) => el.click());
  await expect(page.locator('#data-inspector-pane')).toBeHidden();
  expect(await zoomPercent(page), 'switching back must not refit either').toBe(zoom);
});

test('wheel zoom is proportional to how far the wheel moved', async ({ page }) => {
  await loadShowcase(page);
  await zoomInTo(page, 95);
  await overCanvas(page);

  const base = await zoomPercent(page);
  await page.mouse.wheel(0, -100); // one mouse-wheel notch: about +8%
  await expect.poll(() => zoomPercent(page)).toBeGreaterThan(base * 1.05);
  const afterNotch = await zoomPercent(page);
  expect(afterNotch / base).toBeLessThan(1.11);

  await page.mouse.wheel(0, -8); // a tiny trackpad event barely moves it
  await page.waitForTimeout(150);
  expect((await zoomPercent(page)) / afterNotch).toBeLessThan(1.02);

  const beforeFlick = await zoomPercent(page);
  await page.mouse.wheel(0, 5000); // a hard flick is capped, not a leap
  await expect.poll(() => zoomPercent(page)).toBeLessThan(beforeFlick);
  expect((await zoomPercent(page)) / beforeFlick).toBeGreaterThan(0.88);
});

test('a pinch (ctrl+wheel) zooms faster than the same wheel delta without it', async ({ page }) => {
  await loadShowcase(page);
  await zoomInTo(page, 95);
  await overCanvas(page);

  const base = await zoomPercent(page);
  await page.mouse.wheel(0, -5);
  await page.waitForTimeout(150);
  const plain = (await zoomPercent(page)) / base;

  const afterPlain = await zoomPercent(page);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -5);
  await page.keyboard.up('Control');
  await expect.poll(() => zoomPercent(page)).toBeGreaterThan(afterPlain);
  const pinch = (await zoomPercent(page)) / afterPlain;
  expect(pinch).toBeGreaterThan(plain);
  expect(pinch).toBeGreaterThan(1.03);
});

test('scrolling sideways pans without changing the zoom', async ({ page }) => {
  await loadShowcase(page);
  await zoomInTo(page, 70);
  const id = await nodeNearCentre(page);
  const zoom = await zoomPercent(page);
  const x0 = await nodeScreenX(page, id);
  await overCanvas(page);

  await page.mouse.wheel(120, 0);
  await expect.poll(async () => x0 - (await nodeScreenX(page, id))).toBeGreaterThan(80);
  expect(await zoomPercent(page)).toBe(zoom);
});

test('holding Space and dragging pans from anywhere, even over a component, without moving it', async ({ page }) => {
  await loadShowcase(page);
  await zoomInTo(page, 70);
  const id = await nodeNearCentre(page);
  const hit = page.locator(`.arch-node[data-node="${id}"] .node-select-hit`);
  const box = (await hit.boundingBox())!;
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const docBefore = await nodeDocPosition(page, id);
  const x0 = await nodeScreenX(page, id);

  await page.keyboard.down('Space');
  await expect(page.locator('#canvas-viewport')).toHaveClass(/is-space-pan/);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 90, start.y + 40, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up('Space');
  await expect(page.locator('#canvas-viewport')).not.toHaveClass(/is-space-pan/);

  expect((await nodeScreenX(page, id)) - x0, 'the view panned with the drag').toBeGreaterThan(70);
  expect(await nodeDocPosition(page, id), 'the component itself did not move').toEqual(docBefore);
});

test('a Space press-and-release on the canvas does not deselect, and Space does not pan once released', async ({ page }) => {
  await loadShowcase(page);
  const id = await nodeNearCentre(page);
  await page.locator(`.arch-node[data-node="${id}"] .node-select-hit`).click();
  await expect(page.locator(`.arch-node[data-node="${id}"] .node-select-hit`)).toHaveAttribute('aria-pressed', 'true');

  const box = (await page.locator('#canvas-viewport').boundingBox())!;
  await page.keyboard.down('Space');
  await page.mouse.click(box.x + box.width - 60, box.y + 120); // bare canvas, no movement
  await page.keyboard.up('Space');
  await expect(page.locator(`.arch-node[data-node="${id}"] .node-select-hit`)).toHaveAttribute('aria-pressed', 'true');

  // With Space released, a plain drag on a component moves the component again.
  const docBefore = await nodeDocPosition(page, id);
  const r = (await page.locator(`.arch-node[data-node="${id}"] .node-select-hit`).boundingBox())!;
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
  await page.mouse.down();
  await page.mouse.move(r.x + r.width / 2 + 70, r.y + r.height / 2 + 30, { steps: 8 });
  await page.mouse.up();
  expect(await nodeDocPosition(page, id)).not.toEqual(docBefore);
});

test('typing a space in a text field types a space and does not start panning', async ({ page }) => {
  await loadShowcase(page);
  const id = await nodeNearCentre(page);
  await page.locator(`.arch-node[data-node="${id}"] .node-title`).dblclick();
  const editor = page.locator('.inline-edit-input');
  await expect(editor).toBeVisible();
  await editor.fill('');
  await page.keyboard.type('Two Words');
  await expect(editor).toHaveValue('Two Words');
  await expect(page.locator('#canvas-viewport')).not.toHaveClass(/is-space-pan/);
  await page.keyboard.press('Escape');
});
