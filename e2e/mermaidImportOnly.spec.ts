import { expect, test } from '@playwright/test';
import { openExportDialog, runPaletteCommand } from './helpers';

// D8: Mermaid is import only. A file opened from .mmd is read, and saving never writes it.
test('never loses an opened .mmd file', async ({ page }) => {
  await page.addInitScript(() => {
    const log = { originalWrites: 0, savePickerName: '', savedName: '', savedText: '' };
    (window as unknown as { __files: typeof log }).__files = log;
    const source = 'flowchart LR\n  Web[Web] --> Api[Api]\n  Api --> Db[(Orders)]\n';
    const writable = (onWrite: (text: string) => void) => ({
      write: async (data: unknown) => onWrite(String(data)),
      close: async () => {},
    });
    const original = {
      kind: 'file',
      name: 'topology.mmd',
      getFile: async () => new File([source], 'topology.mmd'),
      createWritable: async () =>
        writable(() => {
          log.originalWrites += 1;
        }),
    };
    Object.assign(window, {
      showOpenFilePicker: async () => [original],
      showSaveFilePicker: async (options: { suggestedName: string }) => {
        log.savePickerName = options.suggestedName;
        return {
          kind: 'file',
          name: options.suggestedName,
          getFile: async () => new File([log.savedText], options.suggestedName),
          createWritable: async () =>
            writable((text) => {
              log.savedName = options.suggestedName;
              log.savedText = text;
            }),
        };
      },
    });
  });

  await page.goto('/');
  await runPaletteCommand(page, 'Open File from Disk');
  const nodes = page.locator('.arch-node');
  await expect(nodes).toHaveCount(3);

  // Edit, then save with the shortcut.
  await runPaletteCommand(page, 'Add Service / API Stencil');
  await expect(nodes).toHaveCount(4);
  await page.keyboard.press('ControlOrMeta+s');

  await expect(page.locator('#toast-container')).toContainText('topology.mmd is unchanged');
  const files = await page.evaluate(() => (window as unknown as { __files: Record<string, unknown> }).__files);
  expect(files.originalWrites).toBe(0);
  expect(files.savePickerName).toBe('topology.md');
  expect(files.savedName).toBe('topology.md');
  expect(String(files.savedText)).toMatch(/^---\n/);
  expect(String(files.savedText)).toContain('```mermaid');

  // Saving again writes the Blueprint file it now has open, and still never the .mmd.
  await page.keyboard.press('ControlOrMeta+s');
  await expect(page.locator('#toast-container')).toContainText('Saved topology.md');
  expect(await page.evaluate(() => (window as unknown as { __files: { originalWrites: number } }).__files.originalWrites)).toBe(0);
});

test('the export dialog and the Blueprint file dialog offer no Mermaid output', async ({ page }) => {
  await page.goto('/');
  await openExportDialog(page);
  await expect(page.locator('#export-dialog')).toBeVisible();
  await expect(page.locator('#export-dialog')).not.toContainText('.mmd');
  await page.keyboard.press('Escape');

  await runPaletteCommand(page, 'paste mermaid');
  await expect(page.locator('#code-dialog')).toBeVisible();
  await expect(page.locator('#code-dialog-title')).toHaveText('Blueprint File');
  await expect(page.locator('input[name="code-format"]')).toHaveCount(0);
  await expect(page.locator('#code-sync-textarea')).toHaveValue(/^---\n/);
});
