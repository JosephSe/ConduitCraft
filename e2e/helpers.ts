import { expect, type Page } from '@playwright/test';

/** Run a command-palette action by typing part of its name.  */
export async function runPaletteCommand(page: Page, query: string): Promise<void> {
  await page.keyboard.press('ControlOrMeta+k');
  await page.locator('#cmd-palette-input').fill(query);
  await page.keyboard.press('Enter');
  await page.locator('#command-palette-dialog').waitFor({ state: 'hidden' });
}

/** Open the export dialog from the command palette (the top bar has no Export button). */
export async function openExportDialog(page: Page): Promise<void> {
  await runPaletteCommand(page, 'Export Diagram Modal');
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

/** Drop a file on the window the way the browser does: dragenter, dragover, then drop. */
export async function dropFile(page: Page, name: string, text: string): Promise<void> {
  await page.evaluate(
    ({ name, text }) => {
      const data = new DataTransfer();
      data.items.add(new File([text], name, { type: 'application/xml' }));
      for (const type of ['dragenter', 'dragover', 'drop']) {
        window.dispatchEvent(new DragEvent(type, { dataTransfer: data, bubbles: true, cancelable: true }));
      }
    },
    { name, text },
  );
}

/**
 * Put records straight into the `conduitcraft` database, the way an earlier visit would have left them, before the
 * app has started. It visits a static file on the same origin (so the app does not boot and no first run happens),
 * creates the stores the way the app does, and writes. The next `page.goto('/')` is then a returning visit.
 */
export async function seedStorage(
  page: Page,
  contents: { diagrams?: object[]; snapshots?: object[]; meta?: object[] },
): Promise<void> {
  await page.goto('/icon.svg');
  await page.evaluate(
    (data) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('conduitcraft', 1);
        open.onupgradeneeded = () => {
          for (const name of ['diagrams', 'snapshots', 'meta']) open.result.createObjectStore(name, { keyPath: 'id' });
        };
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction(['diagrams', 'snapshots', 'meta'], 'readwrite');
          for (const name of ['diagrams', 'snapshots', 'meta'] as const) {
            for (const record of data[name] ?? []) tx.objectStore(name).put(record);
          }
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    contents,
  );
}

/** Seed the autosave record: a returning visitor with this work saved. */
export async function seedAutosave(page: Page, doc: object): Promise<void> {
  const title = (doc as { title?: string }).title ?? 'Untitled';
  await seedStorage(page, { diagrams: [{ id: 'autosave', title, updatedAt: Date.now(), doc }] });
}
