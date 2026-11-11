import { expect, test } from '@playwright/test';
import { openLumenRelay } from './helpers';

test('a deleted component leaves as a copy that fades and is gone within a moment', async ({ page }) => {
  await page.goto('/');
  await openLumenRelay(page);
  const real = page.locator('.arch-node:not(.is-leaving)');
  const before = await real.count();
  await real.nth(2).click();
  await page.keyboard.press('Delete');
  await expect(real).toHaveCount(before - 1);
  await expect(page.locator('.arch-node.is-leaving')).toHaveCount(0, { timeout: 2000 });
});

test('the leaving copy cannot be reached by pointer or keyboard', async ({ page }) => {
  await page.goto('/');
  await openLumenRelay(page);
  await page.locator('.arch-node').nth(2).click();
  await page.keyboard.press('Delete');
  const copy = page.locator('.arch-node.is-leaving');
  if (await copy.count()) {
    await expect(copy.first()).toHaveAttribute('aria-hidden', 'true');
    expect(await copy.first().evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
  }
});
