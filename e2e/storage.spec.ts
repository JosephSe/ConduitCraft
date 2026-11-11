import { expect, test, type Page } from '@playwright/test';
import { openLumenRelay, runPaletteCommand, seedStorage } from './helpers';

const doc = (title: string, nodes: number) => ({
  title,
  direction: 'LR',
  stageWidth: 1680,
  stageHeight: 920,
  brand: { name: '', accent: '', logo: '' },
  nodes: Array.from({ length: nodes }, (_, i) => ({
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
  })),
  edges: [],
  zones: [],
  notesCards: [],
  simulations: [],
});

/** Leave the document keys that releases before 2.1 wrote to localStorage, before the app starts. */
async function seedOldKeys(page: Page, values: Record<string, unknown>): Promise<void> {
  // These tests are not about Home, so it counts as already shown in this tab.
  await page.addInitScript(() => sessionStorage.setItem('conduitcraft-home-shown', '1'));
  await page.evaluate((entries) => {
    for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, JSON.stringify(value));
  }, values);
}

const movedMarker = { id: 'legacy-migrated', value: 1 };

/** Read a whole store of the `conduitcraft` database. */
const idbRecords = (page: Page, store: string) =>
  page.evaluate(
    (name) =>
      new Promise<Array<{ id: string; doc?: { nodes: unknown[] } }>>((resolve, reject) => {
        const open = indexedDB.open('conduitcraft');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const query = open.result.transaction(name).objectStore(name).getAll();
          query.onsuccess = () => {
            open.result.close();
            resolve(query.result);
          };
        };
      }),
    store,
  );

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
});

test('never loses work that 2.1 moved into the database, and clears the old copies', async ({ page }) => {
  const saved = { id: 'autosave', title: 'Kept', updatedAt: Date.now(), doc: doc('Kept', 2) };
  const snapshot = { id: 'snap-a', name: 'Before the move', timestamp: 1, nodeCount: 1, edgeCount: 0, doc: doc('Snap', 1) };
  await seedStorage(page, { diagrams: [saved], snapshots: [snapshot], meta: [movedMarker] });
  // 2.1 left its old copies behind; they hold different work, to show they are not read.
  await seedOldKeys(page, {
    'conduitcraft-autosave-v1': doc('Stale', 5),
    'blueprint-studio-autosave-v1': doc('Staler', 6),
    'conduitcraft-recovery-v1': doc('Scratch', 1),
    'conduitcraft-snapshots-v1': [snapshot],
  });
  await page.goto('/');
  await expect(page.locator('#restore-banner-text')).toContainText('2 components');
  await expect
    .poll(() => page.evaluate(() => Object.keys(localStorage).filter((k) => /-v1$/.test(k))))
    .toEqual([]);

  await page.locator('#btn-restore-open').click();
  await expect(page.locator('.arch-node')).toHaveCount(2);
  await runPaletteCommand(page, 'Snapshots');
  await expect(page.locator('#snapshots-dialog-body')).toContainText('Before the move');

  // And it is all still there on the next visit, from the database alone.
  await page.reload();
  await expect(page.locator('#restore-banner-text')).toContainText('2 components');
  expect((await idbRecords(page, 'snapshots')).map((r) => r.id)).toEqual(['snap-a']);
});

test('never destroys old copies that were never moved: they are left alone and not read', async ({ page }) => {
  await seedStorage(page, {});
  await seedOldKeys(page, { 'conduitcraft-autosave-v1': doc('Never moved', 2) });
  await page.goto('/');
  await expect(page.locator('#canvas-viewport')).toBeVisible();
  await expect(page.locator('#restore-banner-text')).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('conduitcraft-autosave-v1'))).not.toBeNull();
});

test('never loses an edit when the page is reloaded', { tag: '@quick' }, async ({ page }) => {
  await page.goto('/');
  await openLumenRelay(page);
  await expect(page.locator('#save-status-pill')).toHaveAttribute('data-status', 'saved');
  await expect.poll(async () => (await idbRecords(page, 'diagrams')).length).toBeGreaterThan(0);
  await page.reload();
  await expect(page.locator('#restore-banner-text')).toContainText('Previous session');
  await page.locator('#btn-restore-open').click();
  await expect(page.locator('.arch-node').first()).toBeVisible();
});

test('never loses work when IndexedDB is unavailable: it saves to localStorage and says so', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', { get: () => undefined });
  });
  await page.goto('/');
  await expect(page.locator('#toast-container')).toContainText('smaller browser store');
  await openLumenRelay(page);
  await expect(page.locator('#save-status-pill')).toHaveAttribute('data-status', 'saved');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('conduitcraft-diagram:autosave')))
    .not.toBeNull();
  await page.reload();
  await expect(page.locator('#restore-banner-text')).toContainText('Previous session');
});

test('never loses work silently: a full browser store shows a message and a Save to file button', async ({ page }) => {
  await page.goto('/');
  await openLumenRelay(page);
  await expect(page.locator('#save-status-pill')).toHaveAttribute('data-status', 'saved');
  await page.evaluate(() => {
    IDBObjectStore.prototype.put = function () {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    };
  });
  await page.locator('.arch-node').first().click();
  await page.keyboard.press('Delete');
  await expect(page.locator('#toast-container')).toContainText('Browser storage is full');
  await expect(page.locator('#toast-container')).toContainText('Save to file');
  await expect(page.locator('#save-status-pill')).toHaveAttribute('data-status', 'error');
});

test('never loses a snapshot silently: a full browser store says the snapshot was not saved', async ({ page }) => {
  await page.goto('/');
  await openLumenRelay(page);
  await page.evaluate(() => {
    IDBObjectStore.prototype.put = function () {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    };
  });
  await runPaletteCommand(page, 'Take Snapshot');
  await expect(page.locator('#toast-container')).toContainText('the snapshot was not saved');
});
