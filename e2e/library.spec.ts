import { expect, test, type Page } from '@playwright/test';
import { captureExports, nextExport, runPaletteCommand } from './helpers';

const node = (i: number) => ({
  id: `n${i}`,
  kind: 'service',
  accent: 'blue',
  icon: 'code',
  title: `Part ${i + 1}`,
  subtitle: 'Request Processor',
  eyebrow: 'SERVICE',
  footerLeft: 'REST / gRPC',
  chip: 'API',
  zoneLabel: 'ARCHITECTURE STAGE',
  interfaceLabel: 'REST / gRPC mTLS',
  summary: 'A part.',
  metrics: [],
  code: '{}',
  x: 100 + i * 260,
  y: 120,
  width: 222,
  height: 142,
});
const doc = (title: string, nodes: number) => ({
  title,
  direction: 'LR',
  stageWidth: 1680,
  stageHeight: 920,
  brand: { name: '', accent: '', logo: '' },
  nodes: Array.from({ length: nodes }, (_, i) => node(i)),
  edges: [],
  zones: [],
  notesCards: [],
  simulations: [],
});

/** Leave an older release's autosave in localStorage, once per tab. */
async function seedAutosave(page: Page, title: string, nodes: number): Promise<void> {
  await page.addInitScript(
    ({ value }) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('conduitcraft-autosave-v1', JSON.stringify(value));
    },
    { value: doc(title, nodes) },
  );
}

const diagrams = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<Array<{ id: string; title: string; thumbnail?: string; doc: { nodes: unknown[] } }>>((resolve, reject) => {
        const open = indexedDB.open('conduitcraft');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const query = open.result.transaction('diagrams').objectStore('diagrams').getAll();
          query.onsuccess = () => {
            open.result.close();
            resolve(query.result);
          };
        };
      }),
  );

const rowFor = (page: Page, title: string) => page.locator('.library-row', { hasText: title });

async function openLibrary(page: Page): Promise<void> {
  await runPaletteCommand(page, 'Your Diagrams');
  await expect(page.locator('#library-dialog')).toBeVisible();
}

async function openFromLibrary(page: Page, title: string): Promise<void> {
  await openLibrary(page);
  await rowFor(page, title).getByRole('button', { name: 'Open', exact: true }).click();
  await expect(page.locator('#library-dialog')).toBeHidden();
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
});

test('never loses a diagram when you switch to another and back', async ({ page }) => {
  await seedAutosave(page, 'First', 2);
  await page.goto('/');
  await page.locator('#btn-restore-open').click();
  await expect(page.locator('.arch-node')).toHaveCount(2);

  // A second diagram, started beside the first.
  await runPaletteCommand(page, 'New Diagram');
  await expect(page.locator('.arch-node')).toHaveCount(0);
  await runPaletteCommand(page, 'Add Service');
  await expect(page.locator('.arch-node')).toHaveCount(1);
  await expect(page.locator('#save-status-pill')).toHaveAttribute('data-status', 'saved');
  await expect.poll(async () => (await diagrams(page)).length).toBe(2);

  // The old autosave is the first library entry and is untouched.
  await openFromLibrary(page, 'First');
  await expect(page.locator('.arch-node')).toHaveCount(2);

  // Edit it, go back, and both are as they were left.
  await runPaletteCommand(page, 'Add Service');
  await expect(page.locator('.arch-node')).toHaveCount(3);
  await openFromLibrary(page, 'Untitled Architecture');
  await expect(page.locator('.arch-node')).toHaveCount(1);
  await openFromLibrary(page, 'First');
  await expect(page.locator('.arch-node')).toHaveCount(3);

  // Switching does not carry undo across: it can't put one diagram's steps into another.
  await expect(page.locator('#btn-undo')).toBeDisabled();

  // Both are still there after a reload, and the one that was open is offered back.
  await expect(page.locator('#save-status-pill')).toHaveAttribute('data-status', 'saved');
  await page.reload();
  await expect(page.locator('#restore-banner-text')).toContainText('3 components');
  const saved = await diagrams(page);
  expect(saved.map((r) => r.doc.nodes.length).sort()).toEqual([1, 3]);
});

test('never loses a diagram to a delete: Undo brings it back, and rename and duplicate keep the rest', async ({ page }) => {
  await seedAutosave(page, 'Keeper', 2);
  await page.goto('/');
  await page.locator('#btn-restore-open').click();
  await runPaletteCommand(page, 'New Diagram');
  await runPaletteCommand(page, 'Add Service');
  await expect(page.locator('#save-status-pill')).toHaveAttribute('data-status', 'saved');
  await expect.poll(async () => (await diagrams(page)).length).toBe(2);

  // Rename the other diagram from the library.
  await openLibrary(page);
  await rowFor(page, 'Untitled Architecture').getByRole('button', { name: 'Rename' }).click();
  await page.locator('.library-rename-input').fill('Billing');
  await page.keyboard.press('Enter');
  await expect(rowFor(page, 'Billing')).toBeVisible();
  await expect(page.locator('#doc-title-heading')).toHaveText('Billing');

  // Duplicate Keeper.
  await rowFor(page, 'Keeper').getByRole('button', { name: 'Duplicate' }).click();
  await expect(rowFor(page, 'Keeper copy')).toBeVisible();
  await expect.poll(async () => (await diagrams(page)).length).toBe(3);

  // Delete it, then undo within the 10 seconds.
  await rowFor(page, 'Keeper copy').getByRole('button', { name: 'Delete' }).click();
  await expect(rowFor(page, 'Keeper copy')).toHaveCount(0);
  await expect.poll(async () => (await diagrams(page)).length).toBe(2);
  await page.locator('#btn-library-undo').click();
  await expect(rowFor(page, 'Keeper copy')).toBeVisible();
  await expect.poll(async () => (await diagrams(page)).map((r) => r.title).sort()).toEqual(['Billing', 'Keeper', 'Keeper copy']);

  // Deleting the open diagram opens another one; nothing else is lost.
  await rowFor(page, 'Billing').getByRole('button', { name: 'Delete' }).click();
  await expect(page.locator('#doc-title-heading')).not.toHaveText('Billing');
  await expect.poll(async () => (await diagrams(page)).map((r) => r.title).sort()).toEqual(['Keeper', 'Keeper copy']);
  await page.locator('#btn-library-undo').click();
  await expect(page.locator('#doc-title-heading')).toHaveText('Billing');
  await expect(page.locator('.arch-node')).toHaveCount(1);
});

test('never loses a diagram from the zip: Export all holds every one', async ({ page }) => {
  await captureExports(page);
  await seedAutosave(page, 'Alpha', 2);
  await page.goto('/');
  await page.locator('#btn-restore-open').click();
  await runPaletteCommand(page, 'New Diagram');
  await runPaletteCommand(page, 'Add Service');
  await expect(page.locator('#save-status-pill')).toHaveAttribute('data-status', 'saved');
  await expect.poll(async () => (await diagrams(page)).length).toBe(2);

  await runPaletteCommand(page, 'Export All Diagrams');
  const zip = await nextExport(page);
  expect(zip.name).toBe('conduitcraft-diagrams.zip');
  expect(zip.head.startsWith('PK')).toBe(true);
  // Two stored files, and the names are readable in the archive.
  const names = await page.evaluate(async () => {
    const w = window as unknown as { __exports: { url: string }[]; __blobs: Map<string, Blob> };
    const blob = w.__blobs.get(w.__exports[w.__exports.length - 1].url)!;
    return new TextDecoder().decode(new Uint8Array(await blob.arrayBuffer())).match(/[a-z0-9-]+\.blueprint\.json/g);
  });
  expect(new Set(names)).toEqual(new Set(['alpha.blueprint.json', 'untitled-architecture.blueprint.json']));
});

test('never loses the picture: a thumbnail appears in the library after a save', async ({ page }) => {
  await seedAutosave(page, 'Pictured', 2);
  await page.goto('/');
  await page.locator('#btn-restore-open').click();
  await runPaletteCommand(page, 'Add Service');
  await expect.poll(async () => (await diagrams(page))[0]?.thumbnail?.startsWith('data:image/') ?? false, { timeout: 15_000 }).toBe(true);
  await openLibrary(page);
  await expect(rowFor(page, 'Pictured').locator('img.library-thumb')).toBeVisible();
});
