import { expect, test } from '@playwright/test';
import { runPaletteCommand } from './helpers';

test('Traffic draws the flow as 14 x 7 capsules and Design does not', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('conduitcraft-home-shown', '1'));
  await page.goto('/');
  await runPaletteCommand(page, 'Load Showcase');
  await page.locator('.conduit-stream').first().waitFor({ state: 'attached', timeout: 20000 });
  const stream = page.locator('.conduit-stream').first();
  const width = () => stream.evaluate((el) => getComputedStyle(el).strokeWidth);
  expect(await width()).not.toBe('7px');
  await page.keyboard.press('2');
  await expect(page.locator('#workspace')).toHaveAttribute('data-lens', 'traffic');
  await expect.poll(width).toBe('7px');
  expect(await stream.evaluate((el) => getComputedStyle(el).strokeDasharray)).toMatch(/^7(px)?[, ]+29/);
});
