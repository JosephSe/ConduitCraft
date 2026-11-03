import { expect, test } from '@playwright/test';

test('Classic layout in settings switches the interface and is remembered', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/?ui=2');
  await expect(page.locator('html')).toHaveAttribute('data-ui', '2');

  await page.locator('#btn-open-settings').evaluate((el: HTMLElement) => el.click());
  const toggle = page.locator('#chk-classic-layout');
  await expect(toggle).not.toBeChecked();
  await toggle.check();

  await expect(page.locator('html')).toHaveAttribute('data-ui', '1');
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-ui', '1');
  await page.locator('#btn-open-settings').evaluate((el: HTMLElement) => el.click());
  await expect(page.locator('#chk-classic-layout')).toBeChecked();
  await page.locator('#chk-classic-layout').uncheck();
  await expect(page.locator('html')).toHaveAttribute('data-ui', '2');
});
