import { expect, test } from '@playwright/test';
import { captureExports, openExportDialog, runPaletteCommand } from './helpers';

/** The text of the nth export download. */
async function exportText(page: import('@playwright/test').Page, count: number): Promise<string> {
  await expect.poll(() => page.evaluate(() => (window as any).__exports.length)).toBeGreaterThanOrEqual(count);
  return page.evaluate(async (n) => {
    const w = window as any;
    const { url } = w.__exports[n - 1];
    return await (w.__blobs.get(url) as Blob).text();
  }, count);
}

/** C6. At Fit the showcase reads like a map: every title is at least 11 px on screen, and exports carry the title block. */
test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('conduitcraft-home-shown', '1'));
});

test('at Fit every component and lane title renders at 11 px or more', async ({ page }) => {
  await page.goto('/');
  await runPaletteCommand(page, 'Load Showcase');
  await expect(page.locator('.arch-node').first()).toBeVisible({ timeout: 20_000 });
  await runPaletteCommand(page, 'Fit');
  const sizes = await page.evaluate(() => {
    const world = document.getElementById('stage-world') as HTMLElement;
    const zoom = Number(world.style.zoom || 1);
    return [...document.querySelectorAll<HTMLElement>('#stage-world .node-title, #stage-world .zone-title')]
      .filter((el) => el.getClientRects().length > 0 && (el.textContent ?? '').trim() !== '')
      .map((el) => ({ text: el.textContent, px: parseFloat(getComputedStyle(el).fontSize) * zoom }));
  });
  expect(sizes.length).toBeGreaterThan(3);
  for (const s of sizes) expect(s.px, s.text ?? '').toBeGreaterThanOrEqual(10.95);
});

test('the SVG export carries the title block, and the dialog can turn it off', async ({ page }) => {
  await captureExports(page);
  await page.goto('/');
  await openExportDialog(page);
  await page.locator('#btn-export-svg').click();
  expect(await exportText(page, 1)).toContain('data-title-block="true"');
  await openExportDialog(page);
  await page.locator('#chk-export-title-block').uncheck();
  await page.locator('#btn-export-svg').click();
  expect(await exportText(page, 2)).not.toContain('data-title-block');
});
