import { expect, test } from '@playwright/test';
import { openExportDialog, openLumenRelay, runPaletteCommand } from './helpers';

// F-28: the app writes its own text alternative for every export.
test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

const clipboard = (page: import('@playwright/test').Page) => page.evaluate(() => navigator.clipboard.readText());

test('"Copy as text" puts the written outline on the clipboard', async ({ page }) => {
  await page.goto('/');
  await openLumenRelay(page);
  await runPaletteCommand(page, 'Copy as text');
  const text = await clipboard(page);
  expect(text).toContain('Main flows');
  expect(text).toMatch(/\n- .+ (calls|sends messages to) /);
  expect(text).not.toMatch(/undefined|\[object/);
});

test('the PNG export dialog has alt text you can copy', async ({ page }) => {
  await page.goto('/');
  await openLumenRelay(page);
  await openExportDialog(page);
  const alt = page.locator('#export-alt-text');
  await expect(alt).not.toHaveValue('');
  await page.locator('#btn-copy-alt-text').click();
  expect(await clipboard(page)).toBe(await alt.inputValue());
});
