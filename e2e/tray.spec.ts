import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { openLumenRelay } from './helpers';

/** The component tray (7.3), shelf half: groups, keyboard grid, place with Enter, drag out, drag to the dock, close. */
async function open(page: Page) {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/');
  await openLumenRelay(page);
  await expect(page.locator('.arch-node').first()).toBeVisible();
}

const tray = (page: Page) => page.locator('#tray');
const item = (page: Page, id: string) => page.locator(`#tray .tray-item[data-stencil-id="${id}"]`);
const nodes = (page: Page) => page.locator('.arch-node');
const focusedId = (page: Page) => page.evaluate(() => (document.activeElement as HTMLElement).dataset.stencilId);

async function emptySpot(page: Page): Promise<{ x: number; y: number }> {
  const box = (await page.locator('#canvas-viewport').boundingBox())!;
  return { x: box.x + box.width - 160, y: box.y + 140 };
}

test('All components and C open the tray; it holds six groups and every component', async ({ page }) => {
  await open(page);
  await expect(tray(page)).toHaveCount(0);
  await page.locator('#btn-all-components').click();
  await expect(tray(page)).toBeVisible();
  await expect(page.locator('#btn-all-components')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#tray .tray-group')).toHaveCount(6);
  const labels = await page.locator('#tray .tray-label').allTextContents();
  expect(labels).toEqual(['Entry points', 'Traffic control', 'Compute', 'Messaging', 'Data', 'Structure']);
  const ids = await page.locator('#tray .tray-item').evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.stencilId));
  expect(ids).toEqual(['actor', 'client', 'scheduler', 'balancer', 'gate', 'limiter', 'service', 'core', 'cache', 'queue', 'stream', 'bus', 'store', 'object-store', 'zone', 'frame', 'notes', 'text']);
  // Each shows its own outline.
  await expect(page.locator('#tray .tray-item .cutout')).toHaveCount(18);
  // The hint line steps aside while the tray is open, and the sheet stays live.
  await expect(page.locator('.hint-line')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(tray(page)).toBeHidden();
  await expect(page.locator('.hint-line')).toBeVisible();

  await page.locator('#canvas-viewport').click({ position: { x: 4, y: 4 } });
  await page.keyboard.press('c');
  await expect(tray(page)).toBeVisible();
});

test('it opens on the first component, and arrow keys move through the shelf as one grid', async ({ page }) => {
  await open(page);
  await page.locator('#btn-all-components').click();
  await expect(tray(page)).toBeVisible();
  expect(await focusedId(page)).toBe('actor');
  await page.keyboard.press('ArrowDown');
  expect(await focusedId(page)).toBe('client');
  await page.keyboard.press('ArrowRight');
  expect(await focusedId(page)).toBe('gate');
  await page.keyboard.press('ArrowRight');
  expect(await focusedId(page)).toBe('core');
  await page.keyboard.press('ArrowUp');
  expect(await focusedId(page)).toBe('service');
  await page.keyboard.press('ArrowLeft');
  expect(await focusedId(page)).toBe('balancer');
  await page.keyboard.press('End');
  expect(await focusedId(page)).toBe('text');
  await page.keyboard.press('Home');
  expect(await focusedId(page)).toBe('actor');
  // One tab stop for the whole shelf.
  const stops = await page.locator('#tray .tray-item').evaluateAll((els) => els.filter((el) => (el as HTMLElement).tabIndex === 0).length);
  expect(stops).toBe(1);
});

test('Enter places the highlighted component at the centre and closes the tray, focus returning to the dock', async ({ page }) => {
  await open(page);
  const before = await nodes(page).count();
  await page.locator('#btn-all-components').click();
  await expect(tray(page)).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  expect(await focusedId(page)).toBe('scheduler');
  await page.keyboard.press('Enter');
  await expect(nodes(page)).toHaveCount(before + 1);
  await expect(tray(page)).toBeHidden();
  await expect(page.locator('#btn-all-components')).toBeFocused();
  await expect(page.locator('.arch-node[data-kind="scheduler"]')).toHaveCount(1);
});

test('Esc closes the tray and hands focus back to the button that opened it', async ({ page }) => {
  await open(page);
  await page.locator('#btn-all-components').focus();
  await page.keyboard.press('Enter');
  await expect(tray(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(tray(page)).toBeHidden();
  await expect(page.locator('#btn-all-components')).toBeFocused();
});

test('a press on the sheet closes the tray', async ({ page }) => {
  await open(page);
  await page.locator('#btn-all-components').click();
  const spot = await emptySpot(page);
  await page.mouse.click(spot.x, spot.y);
  await expect(tray(page)).toBeHidden();
});

test('a click carries the component to the sheet and the next click places it there', async ({ page }) => {
  await open(page);
  const before = await nodes(page).count();
  await page.locator('#btn-all-components').click();
  await item(page, 'cache').click();
  await expect(tray(page)).toBeHidden();
  await expect(page.locator('#workspace')).toHaveAttribute('data-armed', 'cache');
  const spot = await emptySpot(page);
  await page.mouse.click(spot.x, spot.y);
  await expect(nodes(page)).toHaveCount(before + 1);
  await expect(page.locator('.arch-node[data-kind="cache"]')).toHaveCount(1);
});

test('dragging a component out of the tray places it where it is dropped and closes the tray', async ({ page }) => {
  await open(page);
  const before = await nodes(page).count();
  await page.locator('#btn-all-components').click();
  const from = (await item(page, 'limiter').boundingBox())!;
  const spot = await emptySpot(page);
  await page.mouse.move(from.x + 20, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(spot.x, spot.y, { steps: 12 });
  await expect(item(page, 'limiter').locator('.cut')).toHaveClass(/is-empty/);
  await page.mouse.up();
  await expect(nodes(page)).toHaveCount(before + 1);
  await expect(tray(page)).toBeHidden();
  const placed = (await page.locator('.arch-node[data-kind="limiter"]').boundingBox())!;
  expect(Math.abs(placed.x + placed.width / 2 - spot.x)).toBeLessThan(60);
});

test('dragging a component onto a dock slot replaces that favourite, and it is kept', async ({ page }) => {
  await open(page);
  const before = await nodes(page).count();
  await page.locator('#btn-all-components').click();
  const from = (await item(page, 'cache').boundingBox())!;
  const slot = (await page.locator('#dock .dock-fav').nth(1).boundingBox())!;
  await page.mouse.move(from.x + 20, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(slot.x + slot.width / 2, slot.y + slot.height / 2, { steps: 12 });
  await page.mouse.up();
  // Nothing was placed on the sheet.
  await expect(nodes(page)).toHaveCount(before);
  const ids = () => page.locator('#dock .dock-fav').evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.stencilId));
  expect(await ids()).toEqual(['service', 'cache', 'queue', 'balancer', 'gate', 'actor']);
  await page.reload();
  await openLumenRelay(page);
  expect(await ids()).toEqual(['service', 'cache', 'queue', 'balancer', 'gate', 'actor']);
});

test('the Structure group runs its own action: swimlane, frame, note and text', async ({ page }) => {
  await open(page);
  const zones = await page.locator('.zone-banner').count();
  await page.locator('#btn-all-components').click();
  await item(page, 'zone').click();
  await expect(page.locator('.zone-banner')).toHaveCount(zones + 1);
  await expect(tray(page)).toBeHidden();

  const notes = await page.locator('.blueprint-spec').count();
  await page.locator('#btn-all-components').click();
  await item(page, 'notes').click();
  await expect(page.locator('.blueprint-spec')).toHaveCount(notes + 1);

  await page.locator('#btn-all-components').click();
  await item(page, 'frame').click();
  await expect(page.locator('#workspace')).toHaveAttribute('data-tool', 'frame');
  await page.locator('#btn-all-components').click();
  await item(page, 'text').click();
  await expect(page.locator('#workspace')).toHaveAttribute('data-tool', 'text');
});

test('the tray goes away with the Design lens', async ({ page }) => {
  await open(page);
  await page.locator('#btn-all-components').click();
  await expect(tray(page)).toBeVisible();
  await page.keyboard.press('2');
  await expect(tray(page)).toBeHidden();
});

for (const scheme of ['light', 'dark'] as const) {
  test(`the tray has no axe violations (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await open(page);
    await page.locator('#btn-all-components').click();
    await expect(tray(page)).toBeVisible();
    await page.waitForTimeout(300);
    const results = await new AxeBuilder({ page }).include('#tray').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
}

test('the tray fits above the dock on a short window, and scrolls inside itself', async ({ page }) => {
  await open(page);
  await page.setViewportSize({ width: 1024, height: 520 });
  // Keyboard, not a click: on a window this short the selection's toolbar can float over other controls.
  await page.locator('#btn-all-components').focus();
  await page.keyboard.press('Enter');
  await expect(tray(page)).toBeVisible();
  const [box, dock] = await Promise.all([tray(page).boundingBox(), page.locator('#dock').boundingBox()]);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(dock!.y);
});
