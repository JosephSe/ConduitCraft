import { expect, test, type Page } from '@playwright/test';
import { openLumenRelay } from './helpers';

/**
 * 6.1: everything over the sheet sits in a named slot, so no two islands may overlap. Islands are the `[data-island]`
 * elements (NW, N, NE in the top bar; the minimap, pages, run bar, failure summary and zoom in the bottom slots), the
 * hint line and toasts. Popovers (the find box) anchor to a slot and are not islands.
 */
const VIEWPORTS = [
  { width: 800, height: 600 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
];
const LENSES = [
  { key: '1', name: 'design' },
  { key: '2', name: 'traffic' },
  { key: '3', name: 'review' },
] as const;

interface Box {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

async function islandBoxes(page: Page): Promise<Box[]> {
  return page.evaluate(() => {
    const out: Box[] = [];
    const add = (name: string, el: Element) => {
      const style = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (style.display === 'none' || style.visibility === 'hidden' || r.width < 2 || r.height < 2) return;
      out.push({ name, x: r.x, y: r.y, w: r.width, h: r.height });
    };
    for (const el of document.querySelectorAll('[data-island]')) {
      add(el.id || el.className.toString().split(' ')[0] || el.tagName.toLowerCase(), el);
    }
    // The hint line's text, not its whole slot width.
    for (const el of document.querySelectorAll('.hint-line')) {
      const range = document.createRange();
      range.selectNodeContents(el);
      const r = range.getBoundingClientRect();
      if (r.width > 1) out.push({ name: 'hint', x: r.x, y: r.y, w: r.width, h: r.height });
    }
    for (const el of document.querySelectorAll('.toast-item')) add('toast', el);
    return out;
  });
}

function overlap(a: Box, b: Box): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0.5 && h > 0.5 ? Math.round(w * h) : 0;
}

async function expectNoCollisions(page: Page, label: string): Promise<void> {
  const boxes = await islandBoxes(page);
  expect(boxes.length, `${label}: islands found`).toBeGreaterThan(5);
  const collisions: string[] = [];
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const area = overlap(boxes[i], boxes[j]);
      if (area > 0) collisions.push(`${boxes[i].name} x ${boxes[j].name}: ${area}px²`);
    }
  }
  expect(collisions, `${label}: islands must not overlap`).toEqual([]);
}

async function selectFirstNode(page: Page): Promise<void> {
  const centre = await page.evaluate(() => {
    for (const el of document.querySelectorAll<HTMLElement>('.arch-node .node-select-hit')) {
      const r = el.getBoundingClientRect();
      const x = r.x + r.width / 2;
      const y = r.y + r.height / 2;
      if (document.elementFromPoint(x, y)?.closest('.arch-node') === el.closest('.arch-node')) return { x, y };
    }
    return null;
  });
  expect(centre, 'a clickable node').not.toBeNull();
  await page.mouse.click(centre!.x, centre!.y);
}

for (const vp of VIEWPORTS) {
  test.describe(`islands do not collide at ${vp.width}x${vp.height}`, () => {
    for (const lens of LENSES) {
      test(`${lens.name} lens, with a selection and a toast`, async ({ page }) => {
        await page.setViewportSize(vp);
        await page.goto('/');
        await openLumenRelay(page);
        await expect(page.locator('.arch-node').first()).toBeVisible();

        await expectNoCollisions(page, 'nothing selected');

        await selectFirstNode(page);
        await page.keyboard.press(']');
        await expect(page.locator('.toast-item').first()).toBeVisible();
        await page.keyboard.press(lens.key);
        await expect(page.locator('#workspace')).toHaveAttribute('data-mode', lens.name === 'design' ? 'design' : 'data');
        if (lens.name === 'review') await expect(page.locator('#workspace')).toHaveAttribute('data-lens', 'review');
        if (lens.name === 'traffic') {
          await expect(page.locator('#run-bar')).toBeVisible();
          // Fail the selected component so the failure summary is on screen too.
          // The selection's toolbar would cover the node, so let go of it first.
          await page.keyboard.press('Escape');
          await page.locator('#btn-zoom-fit').click();
          await expect(page.locator('#zoom-readout')).not.toHaveText('');
          await selectFirstNode(page);
          await page.keyboard.press('x');
          await expect(page.locator('#chaos-panel')).toBeVisible();
          // And open its list, the tallest it gets.
          await page.locator('#chaos-summary').click();
          await expect(page.locator('.chaos-item').first()).toBeVisible();
        }
        await expectNoCollisions(page, `${lens.name}, selection, toast`);
      });
    }

    test('the find box is a popover: closed until Cmd/Ctrl+F, closed again by Escape', async ({ page }) => {
      await page.setViewportSize(vp);
      await page.goto('/');
      await openLumenRelay(page);
      await expect(page.locator('#hud-search-card')).toBeHidden();
      await page.keyboard.press('ControlOrMeta+f');
      await expect(page.locator('#hud-search-card')).toBeVisible();
      await expect(page.locator('#hud-search-input')).toBeFocused();
      // It sits above the SE island, inside the sheet.
      const [card, zoom] = await Promise.all([
        page.locator('#hud-search-card').boundingBox(),
        page.locator('.hud-zoom-card').boundingBox(),
      ]);
      expect(card!.y + card!.height).toBeLessThanOrEqual(zoom!.y);
      expect(card!.x + card!.width).toBeLessThanOrEqual(vp.width);
      await page.keyboard.press('Escape');
      await expect(page.locator('#hud-search-card')).toBeHidden();
    });
  });
}

test('the top bar is three slots and the bottom has one hint line', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await openLumenRelay(page);
  for (const slot of ['.slot-nw', '.slot-n', '.slot-ne']) await expect(page.locator(slot)).toBeVisible();
  await expect(page.locator('.hint-line')).toHaveCount(1);
  await expect(page.locator('.hint-line')).toHaveAttribute('role', 'status');
  // The status and coach cards are gone.
  await expect(page.locator('#hud-status-card, #hud-coach-card')).toHaveCount(0);
});
