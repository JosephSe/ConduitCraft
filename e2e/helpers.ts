import { expect, type Page } from '@playwright/test';

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

/** Load the Lumen Relay example. The empty canvas has no buttons for it any more, so go through the palette. */
export async function openLumenRelay(page: Page): Promise<void> {
  await runPaletteCommand(page, 'Lumen Relay');
}

/**
 * Record the blob behind every export download. Asserting on what the app produced (rather than on the
 * browser's saved file) tests the exporters directly and does not depend on the browser's download handling.
 */
export async function captureExports(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as {
      __blobs: Map<string, Blob>;
      __exports: { name: string; url: string }[];
    };
    w.__blobs = new Map();
    w.__exports = [];
    const create = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (obj: Blob | MediaSource) => {
      const url = create(obj);
      if (obj instanceof Blob) w.__blobs.set(url, obj);
      return url;
    };
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      if (this.download && this.href.startsWith('blob:')) {
        w.__exports.push({ name: this.download, url: this.href });
      }
      return click.call(this);
    };
  });
}

export async function nextExport(page: Page) {
  await expect
    .poll(() => page.evaluate(() => (window as any).__exports.length), { message: 'an export download' })
    .toBeGreaterThan(0);
  return page.evaluate(async () => {
    const w = window as any;
    const { name, url } = w.__exports[w.__exports.length - 1];
    const blob: Blob = w.__blobs.get(url);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return {
      name: name as string,
      size: bytes.length,
      head: String.fromCharCode(...bytes.subarray(0, 6)),
      last: bytes[bytes.length - 1],
      text: blob.type.startsWith('text/') ? new TextDecoder().decode(bytes) : '',
    };
  });
}
