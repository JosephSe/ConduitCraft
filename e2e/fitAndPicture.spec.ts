import { expect, test, type Page } from '@playwright/test';
import { captureExports, clearSelection, nextExport, openExportDialog, openLumenRelay } from './helpers';

async function open(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await openLumenRelay(page);
  await expect(page.locator('.arch-node').first()).toBeVisible();
}

const stageSize = (page: Page) =>
  page.locator('#stage-world').evaluate((el) => ({
    width: (el as HTMLElement).offsetWidth,
    height: (el as HTMLElement).offsetHeight,
  }));

test('a PNG export is cropped to the diagram, without the empty stage to its right and below', async ({ page }) => {
  await captureExports(page);
  await open(page);
  const stage = await stageSize(page);

  await openExportDialog(page);
  await page.locator('#export-png-scale').selectOption('1');
  await page.locator('#btn-export-png').click();
  await expect.poll(async () => (await nextExport(page)).name, { timeout: 30_000 }).toMatch(/\.png$/);

  const png = await page.evaluate(async () => {
    const w = window as unknown as { __exports: { url: string }[]; __blobs: Map<string, Blob> };
    const { url } = w.__exports[w.__exports.length - 1];
    const view = new DataView(await w.__blobs.get(url)!.arrayBuffer());
    return { width: view.getUint32(16), height: view.getUint32(20) }; // IHDR
  });
  // Lumen Relay ends about 140 px before the stage's right edge and 120 px before its bottom.
  expect(png.width).toBeLessThan(stage.width - 60);
  expect(png.height).toBeLessThan(stage.height - 60);
  expect(png.width).toBeGreaterThan(stage.width * 0.8);
});

test('Fit shows the whole diagram, centred, clear of the bottom toolbar', async ({ page }) => {
  await open(page);
  await page.locator('input[name="workspace-mode"][value="design"]').evaluate((el: HTMLElement) => el.click());
  await clearSelection(page);
  await page.getByRole('button', { name: 'Fit', exact: true }).click();
  await page.waitForTimeout(500);

  const layout = await page.evaluate(() => {
    const view = document.querySelector('#canvas-viewport')!.getBoundingClientRect();
    const dockTop = document.querySelector('#dock')!.getBoundingClientRect().top;
    const items = [...document.querySelectorAll('.arch-node .node-select-hit, .blueprint-spec')].map((el) =>
      el.getBoundingClientRect(),
    );
    return {
      view: { left: view.left, right: view.right, top: view.top },
      dockTop,
      left: Math.min(...items.map((r) => r.left)),
      right: Math.max(...items.map((r) => r.right)),
      top: Math.min(...items.map((r) => r.top)),
      bottom: Math.max(...items.map((r) => r.bottom)),
    };
  });
  // Every component and note is on screen and above the dock.
  expect(layout.left).toBeGreaterThanOrEqual(layout.view.left);
  expect(layout.right).toBeLessThanOrEqual(layout.view.right);
  expect(layout.top).toBeGreaterThanOrEqual(layout.view.top);
  expect(layout.bottom).toBeLessThanOrEqual(layout.dockTop);
  // Centred left to right: framing the padded stage left a wider gap on the right than on the left.
  const gapLeft = layout.left - layout.view.left;
  const gapRight = layout.view.right - layout.right;
  expect(Math.abs(gapLeft - gapRight)).toBeLessThan(40);
});
