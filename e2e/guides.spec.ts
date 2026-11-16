import { expect, test, type Page } from '@playwright/test';
import { openLumenRelay, undo } from './helpers';

async function load(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/');
  await openLumenRelay(page);
  await expect(page.locator('.arch-node').first()).toBeVisible();
}

interface Pick {
  a: string;
  b: string;
  /** Screen pixels to drag A so its left edge ends 3 world pixels to the right of B's. */
  dx: number;
  from: { x: number; y: number };
  bX: number;
}

/** Two components far enough apart in x to drag between, and where the first can be grabbed. */
async function pick(page: Page): Promise<Pick> {
  const result = await page.evaluate(() => {
    const els = [...document.querySelectorAll<HTMLElement>('.arch-node')];
    const info = els.map((el) => {
      const hit = el.querySelector<HTMLElement>('.node-select-hit');
      const r = hit?.getBoundingClientRect();
      const x = r ? r.x + r.width / 2 : 0;
      const y = r ? r.y + r.height / 2 : 0;
      const top = document.elementFromPoint(x, y)?.closest('.arch-node') === el;
      return {
        id: el.dataset.node!,
        nx: Number(el.style.getPropertyValue('--nx')),
        scale: el.getBoundingClientRect().width / el.offsetWidth,
        x,
        y,
        grabbable: top && !!r && r.width > 0,
      };
    });
    for (const a of info) {
      if (!a.grabbable) continue;
      for (const b of info) {
        if (a === b || Math.abs(b.nx - a.nx) < 80) continue;
        return { a: a.id, b: b.id, dx: (b.nx + 3 - a.nx) * a.scale, from: { x: a.x, y: a.y }, bX: b.nx };
      }
    }
    return null;
  });
  if (!result) throw new Error('no pair of components to drag between');
  return result;
}

const nodeX = (page: Page, id: string) =>
  page.evaluate((nid) => Number(document.querySelector<HTMLElement>(`.arch-node[data-node="${nid}"]`)!.style.getPropertyValue('--nx')), id);

const guideLines = (page: Page) => page.locator('#guides-g line.guide-line');

test('dragging a component near another snaps its edge to it and draws a guide', { tag: '@quick' }, async ({ page }) => {
  await load(page);
  const { a, bX, dx, from } = await pick(page);

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y, { steps: 10 });
  await expect.poll(() => guideLines(page).count()).toBeGreaterThan(0);
  await page.mouse.up();

  await expect.poll(() => nodeX(page, a)).toBe(bX);
  await expect(page.locator('#guides-g > *')).toHaveCount(0);
});

test('holding Ctrl while dragging draws no guides', async ({ page }) => {
  await load(page);
  const { dx, from } = await pick(page);

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.keyboard.down('Control');
  await page.mouse.move(from.x + dx, from.y, { steps: 10 });
  await expect(guideLines(page)).toHaveCount(0);
  await page.keyboard.up('Control');
  await page.mouse.up();
});

test('holding Alt while dragging shows distances in px', async ({ page }) => {
  await load(page);
  const { dx, from } = await pick(page);

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.keyboard.down('Alt');
  await page.mouse.move(from.x + dx, from.y + 2, { steps: 10 });
  const labels = page.locator('#guides-g text.guide-label');
  await expect(page.locator('#guides-g .guide-distance').first()).toBeAttached();
  await expect(labels.first()).toContainText('px');
  await page.keyboard.up('Alt');
  await page.mouse.up();
  await expect(page.locator('#guides-g > *')).toHaveCount(0);
});

test('a snapped drag is still one undo step', async ({ page }) => {
  await load(page);
  const { a, dx, from } = await pick(page);
  const before = await nodeX(page, a);

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y, { steps: 10 });
  await page.mouse.up();
  expect(await nodeX(page, a)).not.toBe(before);

  await undo(page);
  await expect.poll(() => nodeX(page, a)).toBe(before);
});
