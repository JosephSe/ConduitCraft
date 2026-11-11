import { expect, test } from '@playwright/test';
import { clearSelection, openLumenRelay } from './helpers';

// Presentation mode is a lazy chunk (its keys are bound when it loads), so this guards the hand-off.
test('P starts the tour, the arrow keys step it, and Esc ends it', { tag: '@quick' }, async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/');
  await openLumenRelay(page);
  await clearSelection(page);
  await page.keyboard.press('p');
  await expect(page.locator('body')).toHaveAttribute('data-presenting', 'true');
  const caption = page.locator('.presentation-bar, #presentation-bar').first();
  await expect(caption).toBeVisible();
  const before = await caption.textContent();
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => caption.textContent()).not.toBe(before);
  await page.keyboard.press('Escape');
  await expect(page.locator('body')).not.toHaveAttribute('data-presenting', 'true');
  // The same key starts it again once the chunk is loaded.
  await page.keyboard.press('p');
  await expect(page.locator('body')).toHaveAttribute('data-presenting', 'true');
  await page.keyboard.press('p');
  await expect(page.locator('body')).not.toHaveAttribute('data-presenting', 'true');
});
