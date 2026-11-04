import { expect, test, type Page } from '@playwright/test';
import { openLumenRelay } from './helpers';

async function layerBox(page: Page) {
  const box = await page.locator('#tooltip-layer').boundingBox();
  expect(box, 'the tooltip layer must be laid out').not.toBeNull();
  return box!;
}

function expectInsideViewport(box: { x: number; y: number; width: number; height: number }, page: Page) {
  const viewport = page.viewportSize()!;
  expect(box.x, 'left edge').toBeGreaterThanOrEqual(0);
  expect(box.y, 'top edge').toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, 'right edge').toBeLessThanOrEqual(viewport.width);
  expect(box.y + box.height, 'bottom edge').toBeLessThanOrEqual(viewport.height);
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await openLumenRelay(page);
  await expect(page.locator('.arch-node').first()).toBeVisible();
});

test('a tooltip on a far-right control stays inside the viewport', async ({ page }) => {
  await page.locator('#btn-prop-delete').hover();
  await expect(page.locator('#tooltip-layer')).toHaveAttribute('data-visible', 'true');
  await expect(page.locator('#tooltip-layer')).toContainText('Delete selection');
  expectInsideViewport(await layerBox(page), page);
});

test('the tooltip hides when the pointer leaves and on Escape', async ({ page }) => {
  const layer = page.locator('#tooltip-layer');
  await page.locator('#btn-prop-delete').hover();
  await expect(layer).toHaveAttribute('data-visible', 'true');
  await page.mouse.move(700, 400);
  await expect(layer).toHaveAttribute('data-visible', 'false');

  await page.locator('#btn-prop-delete').hover();
  await expect(layer).toHaveAttribute('data-visible', 'true');
  await page.keyboard.press('Escape');
  await expect(layer).toHaveAttribute('data-visible', 'false');
});

test('keyboard focus shows the tooltip too', async ({ page }) => {
  // Start from a known control: clicking "Load showcase" (which then disappears) would otherwise leave
  // the browser's sequential-focus starting point down in the canvas.
  await page.locator('#btn-focus-doc-title').focus();
  await page.keyboard.press('Tab');
  const layer = page.locator('#tooltip-layer');
  // Tab through controls until one with a tooltip receives visible focus.
  for (let i = 0; i < 15; i += 1) {
    if ((await layer.getAttribute('data-visible')) === 'true') break;
    await page.keyboard.press('Tab');
  }
  await expect(layer).toHaveAttribute('data-visible', 'true');
  const text = (await layer.textContent())?.trim();
  expect(text).toBeTruthy();
  expectInsideViewport(await layerBox(page), page);
});

test('the tooltip layer is exposed to assistive tech only while it shows something', async ({ page }) => {
  const layer = page.locator('#tooltip-layer');
  await expect(layer).toHaveCount(1);
  // Idle: hidden from the accessibility tree and not an (empty) tooltip role.
  await expect(layer).toHaveAttribute('aria-hidden', 'true');
  await expect(layer).not.toHaveAttribute('role', /.+/);

  await page.locator('#btn-prop-delete').hover();
  await expect(layer).toHaveAttribute('role', 'tooltip');
  await expect(layer).not.toHaveAttribute('aria-hidden', 'true');

  await page.mouse.move(700, 400);
  await expect(layer).toHaveAttribute('aria-hidden', 'true');
  // pointer-events:none keeps it from stealing hover from the control underneath.
  expect(await page.locator('#tooltip-layer').evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
});
