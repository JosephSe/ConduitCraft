import { expect, test as base, type Page } from '@playwright/test';

/** Every test fails on uncaught page errors or console errors, so silent breakage is caught too. */
const test = base.extend<{ errors: string[] }>({
  errors: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
    });
    await use(errors);
    expect(errors, 'the page must not log errors').toEqual([]);
  },
});

/**
 * Record the blob behind every export download. Asserting on what the app produced (rather than on the
 * browser's saved file) tests the exporters directly and does not depend on the browser's download handling.
 */
async function captureExports(page: Page): Promise<void> {
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

async function nextExport(page: Page) {
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

async function loadShowcase(page: Page): Promise<void> {
  await page.goto('/');
  await page.locator('#btn-empty-showcase').click();
  await expect(page.locator('.arch-node').first()).toBeVisible();
}

test('boots to an empty canvas with no errors', async ({ page, errors }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/ConduitCraft/);
  await expect(page.locator('#empty-stage-overlay')).toBeVisible();
  await expect(page.locator('.arch-node')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('loads the showcase diagram with nodes and wires', async ({ page }) => {
  await loadShowcase(page);
  expect(await page.locator('.arch-node').count()).toBeGreaterThan(3);
  await expect(page.locator('#canvas-stats-pill')).toContainText(/NODES?/);
  await expect(page.locator('#canvas-stats-pill')).toContainText(/WIRES?/);
});

test('dragging a node moves it and undo puts it back', async ({ page }) => {
  await loadShowcase(page);

  // Pick the node nearest the middle of the canvas so nothing (sidebar, HUD) can sit on top of it.
  const nodeId = await page.evaluate(() => {
    const vp = document.getElementById('canvas-viewport')!.getBoundingClientRect();
    const cx = vp.x + vp.width / 2;
    const cy = vp.y + vp.height / 2;
    let best: { id: string; d: number } | null = null;
    for (const el of document.querySelectorAll<HTMLElement>('.arch-node')) {
      const r = el.getBoundingClientRect();
      const d = Math.hypot(r.x + r.width / 2 - cx, r.y + r.height / 2 - cy);
      if (!best || d < best.d) best = { id: el.dataset.node!, d };
    }
    return best!.id;
  });

  const node = page.locator(`.arch-node[data-node="${nodeId}"]`);
  const position = () =>
    node.evaluate((el) => [
      (el as HTMLElement).style.getPropertyValue('--nx'),
      (el as HTMLElement).style.getPropertyValue('--ny'),
    ]);

  const before = await position();
  const box = await node.locator('.node-select-hit').boundingBox();
  expect(box, 'node must be laid out').not.toBeNull();
  const x = box!.x + box!.width / 2;
  const y = box!.y + box!.height / 2;

  const overNode = await page.evaluate(
    ([px, py, id]) =>
      document.elementFromPoint(px as number, py as number)?.closest('.arch-node')?.getAttribute('data-node') === id,
    [x, y, nodeId] as const,
  );
  expect(overNode, 'the pointer must be over the node being dragged').toBe(true);

  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 60, y + 40, { steps: 12 });
  await page.mouse.move(x + 140, y + 80, { steps: 12 });
  await page.mouse.up();

  expect(await position()).not.toEqual(before);

  await page.locator('#btn-undo').click();
  await expect.poll(position).toEqual(before);
});

test('exports an animated GIF (worker + lazy chunk)', async ({ page }) => {
  await captureExports(page);
  await loadShowcase(page);
  await page.locator('#btn-open-export').click();
  await page.locator('#btn-export-gif').click();
  await page.locator('#btn-gif-whole').click();

  const file = await nextExport(page);
  expect(file.name).toMatch(/\.gif$/);
  expect(file.head).toMatch(/^GIF8[79]a$/);
  expect(file.size).toBeGreaterThan(1000);
  // GIF trailer byte: the encoder finished and the worker returned the whole file.
  expect(file.last).toBe(0x3b);
});

test('exports a standalone HTML file that contains the diagram', async ({ page }) => {
  await captureExports(page);
  await loadShowcase(page);
  const firstTitle = (await page.locator('.arch-node .node-title').first().textContent())?.trim();
  expect(firstTitle).toBeTruthy();

  await page.locator('#btn-open-export').click();
  await page.locator('#btn-export-html').click();

  const file = await nextExport(page);
  expect(file.name).toMatch(/\.html$/);
  expect(file.text.toLowerCase()).toContain('<!doctype html');
  expect(file.text).toContain(firstTitle!);
});
