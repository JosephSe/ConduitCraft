import { writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { captureExports, nextExport, openExportDialog, openLumenRelay } from './helpers';

test('a scenario GIF is cropped to the components, not the whole stage', async ({ page }) => {
  await captureExports(page);
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/');
  await openLumenRelay(page);
  await expect(page.locator('.arch-node').first()).toBeVisible();

  // The stage is padded well beyond the components: wide, with room below them for notes and growth.
  const stage = await page.locator('#stage-world').evaluate((el) => ({
    width: (el as HTMLElement).offsetWidth,
    height: (el as HTMLElement).offsetHeight,
  }));

  await openExportDialog(page);
  await page.locator('#btn-export-gif').click();
  await page.locator('#gif-scenario-list .export-option-card').first().click();
  await expect.poll(async () => (await nextExport(page)).name, { timeout: 30_000 }).toMatch(/\.gif$/);

  const gif = await page.evaluate(async () => {
    const w = window as unknown as { __exports: { url: string }[]; __blobs: Map<string, Blob> };
    const { url } = w.__exports[w.__exports.length - 1];
    const bytes = new Uint8Array(await w.__blobs.get(url)!.arrayBuffer());
    return { width: bytes[6] | (bytes[7] << 8), height: bytes[8] | (bytes[9] << 8), bytes: Array.from(bytes) };
  });
  if (process.env.SAVE_GIF) writeFileSync(process.env.SAVE_GIF, Buffer.from(gif.bytes));

  // Before the crop the GIF had the stage's shape. Now the empty band below the components is gone, so it is
  // relatively wider, and it is never bigger than the stage.
  const stageAspect = stage.width / stage.height;
  const gifAspect = gif.width / gif.height;
  expect(gifAspect).toBeGreaterThan(stageAspect * 1.15);
  expect(gif.width).toBeLessThanOrEqual(Math.max(stage.width, 2048));
});
