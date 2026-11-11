import { expect, test, type Page } from '@playwright/test';
import { openExportDialog, openLumenRelay } from './helpers';

// A16. Exports, embeds and shared links must look as good as the studio. These tests export Lumen Relay as SVG,
// standalone HTML and an animated GIF, draw each file in a clean page and compare it with a committed baseline, so a
// change to the export look fails here. Baselines were compared with the canvas by eye when they were first taken.
//
// Baselines are shared by every platform (see `snapshotPathTemplate` in playwright.config.ts) and compared with a
// tolerance, because text is drawn with the system fonts: it differs a little between macOS and the Linux CI.
// Colour, layout, missing or moved components and a changed stroke all stay well above that tolerance.
//
// Diagram styles (F-18, queue item F4) do not exist yet, so the one style is `studio`. When F4 lands, add each
// style here and take a baseline for it.
const STYLES = ['studio'] as const;
const SCHEMES = ['light', 'dark'] as const;
const TOLERANCE = { maxDiffPixelRatio: 0.03, threshold: 0.05 } as const;

/**
 * Keep the blob behind every export download, so the test can read the file the app produced instead of the
 * browser's saved copy. (smoke.spec.ts has the same capture; it is kept here so each spec stands alone.)
 */
async function captureExports(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __blobs: Map<string, Blob>; __exports: { name: string; url: string }[] };
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
      if (this.download && this.href.startsWith('blob:')) w.__exports.push({ name: this.download, url: this.href });
      return click.call(this);
    };
  });
}

/** The export download number `count` (1 for the first) as base64 bytes, once it has happened. */
async function exportBase64(page: Page, count: number): Promise<string> {
  await expect
    .poll(() => page.evaluate(() => (window as any).__exports.length), { message: `export download ${count}` })
    .toBeGreaterThanOrEqual(count);
  return page.evaluate(async (count) => {
    const w = window as any;
    const { url } = w.__exports[count - 1];
    const bytes = new Uint8Array(await (w.__blobs.get(url) as Blob).arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  }, count);
}

let exported = 0;
async function exportAs(page: Page, buttonId: string, afterClick?: () => Promise<void>): Promise<string> {
  await openExportDialog(page);
  await page.locator(buttonId).click();
  if (afterClick) await afterClick();
  return exportBase64(page, ++exported);
}

for (const style of STYLES) {
  for (const scheme of SCHEMES) {
    test(`export look: ${style}, ${scheme}: SVG, standalone HTML and GIF first frame`, async ({ browser }) => {
      const context = await browser.newContext({
        colorScheme: scheme,
        reducedMotion: 'reduce',
        viewport: { width: 1600, height: 900 },
        storageState: {
          cookies: [],
          origins: [
            {
              origin: 'http://localhost:4281',
              localStorage: [
                { name: 'conduitcraft-ui', value: '2' },
                { name: 'conduitcraft-first-run-seen', value: '1' },
              ],
            },
          ],
        },
        acceptDownloads: true,
      });
      const page = await context.newPage();
      exported = 0;
      await captureExports(page);
      await page.goto('http://localhost:4281/');
      await openLumenRelay(page);
      await expect(page.locator('.arch-node').first()).toBeVisible();

      const svg = Buffer.from(await exportAs(page, '#btn-export-svg'), 'base64').toString('utf8');
      expect(svg).toContain('<svg');
      const html = Buffer.from(await exportAs(page, '#btn-export-html'), 'base64').toString('utf8');
      expect(html.toLowerCase()).toContain('<!doctype html');
      const gif = await exportAs(page, '#btn-export-gif', () => page.locator('#btn-gif-whole').click());

      // Each file is drawn in a fresh page, as a reader of the export would see it.
      const view = await context.newPage();
      await view.setViewportSize({ width: 1280, height: 800 });

      await view.setContent(`<!doctype html><style>svg{display:block;width:1280px;height:auto}</style><body style="margin:0;background:#fff">${svg.replace(/^<\?xml[^>]*\?>\s*/, '')}</body>`);
      await expect(view.locator('svg').first()).toBeVisible();
      await expect(view.locator('svg').first()).toHaveScreenshot(`${style}-${scheme}-svg.png`, { animations: 'disabled', ...TOLERANCE });

      await view.setContent(html);
      await expect(view.locator('body')).toBeVisible();
      await view.evaluate(() => document.fonts.ready.then(() => undefined));
      await expect(view).toHaveScreenshot(`${style}-${scheme}-html.png`, { animations: 'disabled', ...TOLERANCE });

      // The first frame of the GIF, decoded and drawn still, so the animation cannot change the picture.
      await view.setContent('<!doctype html><body style="margin:0;background:#fff"><canvas id="frame"></canvas></body>');
      await view.evaluate(async (base64) => {
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/gif' }));
        const canvas = document.getElementById('frame') as HTMLCanvasElement;
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
      }, gif);
      await expect(view.locator('#frame')).toHaveScreenshot(`${style}-${scheme}-gif-first-frame.png`, { ...TOLERANCE });

      await context.close();
    });
  }
}

// Diagram styles (Y1, Y2): the SVG and the standalone HTML carry the style the diagram was drawn in.
for (const style of ['blueprint', 'print', 'sketch'] as const) {
  test(`export look: ${style}: SVG and standalone HTML`, async ({ browser }) => {
    const context = await browser.newContext({
      colorScheme: 'light',
      reducedMotion: 'reduce',
      viewport: { width: 1600, height: 900 },
      storageState: {
        cookies: [],
        origins: [
          {
            origin: 'http://localhost:4281',
            localStorage: [
              { name: 'conduitcraft-ui', value: '2' },
              { name: 'conduitcraft-first-run-seen', value: '1' },
            ],
          },
        ],
      },
      acceptDownloads: true,
    });
    const page = await context.newPage();
    exported = 0;
    await captureExports(page);
    await page.goto('http://localhost:4281/');
    await openLumenRelay(page);
    await page.locator('#zoom-readout').click();
    await page.locator('#view-style').selectOption(style);
    await page.keyboard.press('Escape');

    const svg = Buffer.from(await exportAs(page, '#btn-export-svg'), 'base64').toString('utf8');
    const html = Buffer.from(await exportAs(page, '#btn-export-html'), 'base64').toString('utf8');
    expect(html).toContain(`data-style="${style}"`);

    const view = await context.newPage();
    await view.setViewportSize({ width: 1280, height: 800 });
    await view.setContent(`<!doctype html><style>svg{display:block;width:1280px;height:auto}</style><body style="margin:0;background:#fff">${svg.replace(/^<\?xml[^>]*\?>\s*/, '')}</body>`);
    await expect(view.locator('svg').first()).toHaveScreenshot(`${style}-light-svg.png`, { animations: 'disabled', ...TOLERANCE });
    await view.setContent(html);
    await view.evaluate(() => document.fonts.ready.then(() => undefined));
    await expect(view).toHaveScreenshot(`${style}-light-html.png`, { animations: 'disabled', ...TOLERANCE });
    await context.close();
  });
}
