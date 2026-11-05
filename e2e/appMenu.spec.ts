import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { openLumenRelay } from './helpers';

async function open(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await openLumenRelay(page);
  await expect(page.locator('.arch-node').first()).toBeVisible();
}

const button = (page: Page) => page.locator('#btn-app-menu');
const menu = (page: Page) => page.getByRole('menu', { name: 'Main menu' });

test('the menu button lists the actions that have no button of their own', async ({ page }) => {
  await open(page);
  await expect(button(page)).toHaveAttribute('aria-expanded', 'false');
  await button(page).click();
  await expect(button(page)).toHaveAttribute('aria-expanded', 'true');
  for (const name of ['Home', 'Save', 'Open File…', 'Export…', 'Find and Replace', 'Auto-Layout', 'Preferences', 'Keyboard Shortcuts']) {
    await expect(menu(page).getByText(name, { exact: true })).toBeVisible();
  }
});

test('choosing an item runs its action', async ({ page }) => {
  await open(page);
  await button(page).click();
  await menu(page).getByRole('menuitem', { name: 'Export…', exact: true }).click();
  await expect(menu(page)).toHaveCount(0);
  await expect(page.locator('#export-dialog')).toBeVisible();
});

test('Escape closes the menu and gives focus back to the button', async ({ page }) => {
  await open(page);
  await button(page).click();
  await expect(menu(page).getByRole('menuitem').first()).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menu(page).getByRole('menuitem').nth(1)).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu(page)).toHaveCount(0);
  await expect(button(page)).toBeFocused();
  await expect(button(page)).toHaveAttribute('aria-expanded', 'false');
});

test('clicking the button again closes the menu instead of reopening it', async ({ page }) => {
  await open(page);
  await button(page).click();
  await expect(menu(page)).toBeVisible();
  await button(page).click();
  await expect(menu(page)).toHaveCount(0);
});

test('every item can be reached on a short window', async ({ page }) => {
  await open(page);
  await page.setViewportSize({ width: 1024, height: 420 });
  await button(page).click();
  const last = menu(page).getByRole('menuitem').last();
  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeInViewport();
});

test('the menu works in the Traffic lens', async ({ page }) => {
  await open(page);
  await page.keyboard.press('2');
  await button(page).click();
  await expect(menu(page).getByText('Save', { exact: true })).toBeVisible();
});

test('the open menu has no axe violations', async ({ page }) => {
  await open(page);
  await button(page).click();
  const results = await new AxeBuilder({ page })
    .include('.topbar')
    .include('[role="menu"]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
});
