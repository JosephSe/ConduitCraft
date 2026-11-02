import type { Page } from '@playwright/test';

/** Run a command-palette action by typing part of its name. Works in both layouts. */
export async function runPaletteCommand(page: Page, query: string): Promise<void> {
  await page.keyboard.press('ControlOrMeta+k');
  await page.locator('#cmd-palette-input').fill(query);
  await page.keyboard.press('Enter');
  await page.locator('#command-palette-dialog').waitFor({ state: 'hidden' });
}

/** Open the export dialog: the header button in the classic layout, the palette in the redesign. */
export async function openExportDialog(page: Page): Promise<void> {
  const button = page.locator('#btn-open-export');
  if (await button.isVisible()) await button.click();
  else await runPaletteCommand(page, 'Export Diagram Modal');
}

/**
 * Click empty canvas so nothing is selected, then wait for the layout to settle. In the redesign that hides the
 * contextual toolbar and folds the inspector away; the panel width animates, and a click aimed at a wire while it
 * is still moving lands in the wrong place.
 */
export async function clearSelection(page: Page): Promise<void> {
  await page.locator('#canvas-viewport').click({ position: { x: 4, y: 4 } });
  // Only finite animations: the flowing-wire animation never ends.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  );
}
