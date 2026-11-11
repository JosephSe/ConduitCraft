import { captureExports, nextExport, openExportDialog, openLumenRelay, undo } from './helpers';
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

async function loadShowcase(page: Page): Promise<void> {
  await page.goto('/');
  await openLumenRelay(page);
  await expect(page.locator('.arch-node').first()).toBeVisible();
}

test('boots to an empty canvas with no errors', { tag: '@quick' }, async ({ page, errors }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/ConduitCraft/);
  await expect(page.locator('#empty-stage-overlay')).toBeVisible();
  await expect(page.locator('.arch-node')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('loads the showcase diagram with nodes and wires', { tag: '@quick' }, async ({ page }) => {
  await loadShowcase(page);
  expect(await page.locator('.arch-node').count()).toBeGreaterThan(3);
  await expect(page.locator('#canvas-stats-pill')).toContainText(/nodes?/);
  await expect(page.locator('#canvas-stats-pill')).toContainText(/wires?/);
});

test('dragging a node moves it and undo puts it back', { tag: '@quick' }, async ({ page }) => {
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

  await undo(page);
  await expect.poll(position).toEqual(before);
});

test('exports an animated GIF (worker + lazy chunk)', async ({ page }) => {
  await captureExports(page);
  await loadShowcase(page);
  await openExportDialog(page);
  await page.locator('#btn-export-gif').click();
  await page.locator('#btn-gif-whole').click();

  const file = await nextExport(page);
  expect(file.name).toMatch(/\.gif$/);
  expect(file.head).toMatch(/^GIF8[79]a$/);
  expect(file.size).toBeGreaterThan(1000);
  // GIF trailer byte: the encoder finished and the worker returned the whole file.
  expect(file.last).toBe(0x3b);
});

test('exports a standalone HTML file that contains the diagram', { tag: '@quick' }, async ({ page }) => {
  await captureExports(page);
  await loadShowcase(page);
  const firstTitle = (await page.locator('.arch-node .node-title').first().textContent())?.trim();
  expect(firstTitle).toBeTruthy();

  await openExportDialog(page);
  await page.locator('#btn-export-html').click();

  const file = await nextExport(page);
  expect(file.name).toMatch(/\.html$/);
  expect(file.text.toLowerCase()).toContain('<!doctype html');
  expect(file.text).toContain(firstTitle!);
});
