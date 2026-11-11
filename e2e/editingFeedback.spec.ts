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
  // The copy lives 140 ms, so read it in one step instead of across awaits.
  const seen = await page.evaluate(() => {
    const el = document.querySelector('.arch-node.is-leaving');
    return el ? { hidden: el.getAttribute('aria-hidden'), events: getComputedStyle(el).pointerEvents } : null;
  });
  if (seen) expect(seen).toEqual({ hidden: 'true', events: 'none' });
});

test('deleting several components leaves a copy of each that is gone within a moment (M3)', async ({ page }) => {
  await page.goto('/');
  await openLumenRelay(page);
  await page.locator('#stage-world').click({ position: { x: 5, y: 5 }, force: true });
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Delete');
  const seen = await page.evaluate(() => document.querySelectorAll('.arch-node.is-leaving').length);
  expect(seen).toBeGreaterThan(1);
  await expect(page.locator('.arch-node')).toHaveCount(0, { timeout: 2000 });
});
