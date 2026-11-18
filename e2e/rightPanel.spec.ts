import { expect, test, type Page } from '@playwright/test';
import { openLumenRelay, runPaletteCommand } from './helpers';

async function open(page: Page) {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/');
  await openLumenRelay(page);
  await expect(page.locator('.arch-node').first()).toBeVisible();
}

const inspector = (page: Page) => page.locator('#inspector-panel');
const clearSelection = (page: Page) => page.locator('#canvas-viewport').click({ position: { x: 4, y: 4 } });
const pickLens = (page: Page, value: 'design' | 'data' | 'review') =>
  page.locator(`input[name="workspace-mode"][value="${value}"]`).evaluate((el: HTMLElement) => el.click());

test('the right panel shows in Traffic after leaving Design with nothing selected', async ({ page }) => {
  await open(page);
  await clearSelection(page);
  await expect(inspector(page)).toBeHidden(); // Design folds the inspector away without a selection
  await pickLens(page, 'data');
  await expect(page.locator('#workspace')).toHaveAttribute('data-lens', 'traffic');
  await expect(inspector(page)).toBeVisible();
  await expect(page.locator('#data-inspector-pane')).toBeVisible();
});

test('the right panel shows in Review after leaving Design with nothing selected', async ({ page }) => {
  await open(page);
  await clearSelection(page);
  await pickLens(page, 'review');
  await expect(page.locator('#workspace')).toHaveAttribute('data-lens', 'review');
  await expect(inspector(page)).toBeVisible();
});

test('} and the right-panel button always show or hide the right panel in Traffic', async ({ page }) => {
  await open(page);
  await pickLens(page, 'data');
  await expect(page.locator('#workspace')).toHaveAttribute('data-lens', 'traffic');
  // Collapse the inspector the other way, so the right panel is hidden without the panel toggle.
  await runPaletteCommand(page, 'Toggle Properties Inspector');
  await expect(inspector(page)).toBeHidden();

  const button = page.locator('#btn-toggle-right-panel');
  await expect(button).toHaveAttribute('aria-label', 'Show right panel');
  await page.keyboard.press('}');
  await expect(inspector(page)).toBeVisible();
  await expect(button).toHaveAttribute('aria-label', 'Hide right panel');
  await page.keyboard.press('}');
  await expect(inspector(page)).toBeHidden();

  await button.click();
  await expect(inspector(page)).toBeVisible();
  await button.click();
  await expect(inspector(page)).toBeHidden();
  await button.click();
  await expect(inspector(page)).toBeVisible();
});

test('} shows the right panel in Design when nothing is selected', async ({ page }) => {
  await open(page);
  await clearSelection(page);
  await expect(inspector(page)).toBeHidden();
  await page.keyboard.press('}');
  await expect(inspector(page)).toBeVisible();
  await page.keyboard.press('}');
  await expect(inspector(page)).toBeHidden();
});
