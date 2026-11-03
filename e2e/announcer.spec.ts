import { expect, test } from '@playwright/test';
import { openLumenRelay } from './helpers';

test('toasts are spoken through the one announcer, and no other live region wraps them', async ({ page }) => {
  await page.goto('/');
  await openLumenRelay(page);
  await expect(page.locator('.arch-node').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('F2');

  const message = 'Select a component, swimlane, note or wire to rename';
  await expect(page.locator('#toast-container')).toContainText(message);
  await expect(page.locator('#a11y-live-announcer')).toContainText(message);
  await expect(page.locator('#toast-container')).not.toHaveAttribute('aria-live', /.*/);
  await expect(page.locator('#toast-container .toast-item[role]')).toHaveCount(0);
});
