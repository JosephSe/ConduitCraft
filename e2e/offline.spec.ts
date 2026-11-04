import { expect, test } from '@playwright/test';
import { captureExports, nextExport, openExportDialog, openLumenRelay } from './helpers';

// A13. The award checklist says the app works fully offline after the first visit. This runs the production build
// (vite preview): the service worker precaches every built chunk, including the lazy ones.
test('works offline after the first visit: template, simulation, PNG and GIF export, save', async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name === 'chromium', 'the run bar is part of the redesign; offline support is the same in both layouts');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));

  // The worker skips localhost unless the page opts in (see registerServiceWorker).
  await page.addInitScript(() => {
    try {
      localStorage.setItem('conduitcraft-sw-localhost', '1');
    } catch {
      // storage blocked
    }
  });
  await captureExports(page);
  // A fake save target, so Save writes without the native file picker (which a test cannot drive).
  await page.addInitScript(() => {
    const w = window as unknown as { __saved: string[]; showSaveFilePicker: unknown };
    w.__saved = [];
    w.showSaveFilePicker = async (options: { suggestedName: string }) => ({
      name: options.suggestedName,
      createWritable: async () => ({
        write: async (content: string) => void w.__saved.push(String(content)),
        close: async () => undefined,
      }),
    });
  });

  // First visit, online: the worker installs and takes control.
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { message: 'the worker controls the page' })
    .toBe(true);

  // Offline: reload from the cache.
  await context.setOffline(true);
  await page.reload();
  await expect(page).toHaveTitle(/ConduitCraft/);

  // A template: its chunk is lazy.
  await openLumenRelay(page);
  await expect(page.locator('.arch-node').first()).toBeVisible();

  // A simulation.
  await page.keyboard.press('2');
  const select = page.locator('#run-bar-scenario');
  const first = await select.locator('option:not([value=""])').first().getAttribute('value');
  expect(first, 'the template has a scenario').toBeTruthy();
  await select.selectOption(first!);
  await expect(page.locator('#run-bar-step')).toHaveText(/step \d+\/\d+/);

  // PNG, then GIF (a lazy chunk plus a worker).
  await openExportDialog(page);
  await page.locator('#btn-export-png').click();
  const png = await nextExport(page);
  expect(png.name).toMatch(/\.png$/);
  expect(png.head.slice(1, 4)).toBe('PNG');

  await openExportDialog(page);
  await page.locator('#btn-export-gif').click();
  await page.locator('#btn-gif-whole').click();
  await expect.poll(async () => (await nextExport(page)).name, { timeout: 30_000 }).toMatch(/\.gif$/);
  const gifFile = await nextExport(page);
  expect(gifFile.head).toMatch(/^GIF8[79]a$/);
  expect(gifFile.last).toBe(0x3b);

  // Save a file.
  await page.keyboard.press('ControlOrMeta+s');
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __saved: string[] }).__saved.length), { message: 'a saved file' })
    .toBeGreaterThan(0);
  const saved = await page.evaluate(() => (window as unknown as { __saved: string[] }).__saved[0]);
  expect(saved.length).toBeGreaterThan(100);
  expect(() => JSON.parse(saved)).not.toThrow();

  expect(errors).toEqual([]);
});
