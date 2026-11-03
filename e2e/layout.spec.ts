import { expect, test, type Page } from '@playwright/test';
import { openLumenRelay } from './helpers';

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'laptop', width: 1024, height: 768 },
  { name: 'phone', width: 390, height: 844 },
];

/** Bottom-of-canvas elements that can be on screen together. */
const SELECTORS: Record<string, string> = {
  minimap: '.hud-minimap-card',
  status: '#hud-status-card',
  coach: '#hud-coach-card',
  search: '#hud-search-card',
  zoom: '.zoom-readout',
  toast: '.toast-item',
};

interface Box {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

async function visibleBoxes(page: Page): Promise<Box[]> {
  return page.evaluate((selectors) => {
    const out: { name: string; x: number; y: number; w: number; h: number }[] = [];
    for (const [name, selector] of Object.entries(selectors)) {
      for (const el of document.querySelectorAll<HTMLElement>(selector)) {
        // For the zoom readout use its whole control group, which is what the user sees.
        const target = name === 'zoom' ? (el.parentElement as HTMLElement) : el;
        const style = getComputedStyle(target);
        const r = target.getBoundingClientRect();
        if (style.display === 'none' || style.visibility === 'hidden' || r.width < 2 || r.height < 2) continue;
        out.push({ name, x: r.x, y: r.y, w: r.width, h: r.height });
      }
    }
    return out;
  }, SELECTORS);
}

function overlaps(a: Box, b: Box): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? Math.round(w * h) : 0;
}

for (const vp of VIEWPORTS) {
  test(`bottom canvas overlays do not collide (${vp.name} ${vp.width}x${vp.height})`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/');
    await openLumenRelay(page);
    await expect(page.locator('.arch-node').first()).toBeVisible();

    // Bring up everything that can share the bottom edge: a toast (z-order on a selected node) and node search.
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
    await page.keyboard.press(']');
    await expect(page.locator('.toast-item').first()).toBeVisible();
    await page.keyboard.press('ControlOrMeta+f');
    await expect(page.locator('#hud-search-card')).toBeVisible();

    const boxes = await visibleBoxes(page);
    const collisions: string[] = [];
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const area = overlaps(boxes[i], boxes[j]);
        if (area > 0) collisions.push(`${boxes[i].name} x ${boxes[j].name}: ${area}px²`);
      }
    }
    console.log(`${vp.name} boxes`, JSON.stringify(boxes.map((b) => `${b.name}@${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.w)}x${Math.round(b.h)}`)));
    expect(collisions, 'visible overlays must not overlap each other').toEqual([]);
  });
}
