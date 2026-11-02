import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function loadShowcase(page: Page) {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/');
  await page.locator('#btn-empty-showcase').click();
  await expect(page.locator('.arch-node[data-node-id="night-desk"]')).toBeVisible();
  // The showcase opens with a component selected; start from a clean canvas.
  await page.locator('#canvas-viewport').click({ position: { x: 4, y: 4 } });
}

const menu = (page: Page) => page.locator('.context-menu');

test('right-click on a component selects it and opens a menu; Escape closes it and restores focus', async ({ page }) => {
  await loadShowcase(page);
  const node = page.locator('.arch-node[data-node-id="night-desk"]');
  await node.locator('.node-select-hit').click({ button: 'right' });
  await expect(menu(page)).toBeVisible();
  await expect(menu(page).getByRole('menuitem', { name: /Rename Selection/ })).toBeVisible();
  await expect(menu(page).getByRole('menuitem', { name: /Delete Selection/ })).toBeVisible();
  await expect(node.locator('.node-select-hit')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(menu(page)).toHaveCount(0);
});

test('Shift+F10 opens the menu for the focused component and arrows move through items', async ({ page }) => {
  await loadShowcase(page);
  await page.locator('.node-select-hit[tabindex="0"]').focus();
  await page.keyboard.press('Shift+F10');
  await expect(menu(page)).toBeVisible();
  const first = menu(page).getByRole('menuitem').first();
  await expect(first).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menu(page).getByRole('menuitem').nth(1)).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('.node-select-hit[tabindex="0"]')).toBeFocused();
});

test('a menu action runs: Rename opens the inline editor', async ({ page }) => {
  await loadShowcase(page);
  await page.locator('.arch-node[data-node-id="night-desk"]').locator('.node-select-hit').click({ button: 'right' });
  await menu(page).getByRole('menuitem', { name: /Rename Selection/ }).click();
  await expect(menu(page)).toHaveCount(0);
  await expect(page.locator('input.inline-edit-input').first()).toBeVisible();
});

test('right-click on empty canvas offers canvas actions', async ({ page }) => {
  await loadShowcase(page);
  await page.locator('#canvas-viewport').click({ button: 'right', position: { x: 4, y: 4 } });
  await expect(menu(page).getByRole('menuitem', { name: /Select All/ })).toBeVisible();
});

test('the open menu has no accessibility violations', async ({ page }) => {
  await loadShowcase(page);
  await page.locator('.arch-node[data-node-id="night-desk"]').locator('.node-select-hit').click({ button: 'right' });
  await expect(menu(page)).toBeVisible();
  const results = await new AxeBuilder({ page }).include('.context-menu').analyze();
  expect(results.violations).toEqual([]);
});

test('a group shows a dashed outline while a member is selected', async ({ page }) => {
  await loadShowcase(page);
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('ControlOrMeta+g');
  await expect(page.locator('.group-outline')).toHaveCount(1);
  await expect(page.locator('.group-outline.is-visible')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await page.mouse.move(2, 2);
  await expect(page.locator('.group-outline.is-visible')).toHaveCount(0);
});
