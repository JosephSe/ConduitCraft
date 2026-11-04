import { expect, test, type Page } from '@playwright/test';
import { openLumenRelay, runPaletteCommand } from './helpers';

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

/** Put values in localStorage once per tab, the way an older release would have left them. */
async function seedLegacy(page: Page, values: Record<string, unknown>): Promise<void> {
  await page.addInitScript((entries) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, JSON.stringify(value));
  }, values);
}

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

test('never loses an autosave left in localStorage by an older release', async ({ page }) => {
  await seedLegacy(page, { 'conduitcraft-autosave-v1': doc('Kept', 2) });
  await page.goto('/');
  await expect(page.locator('#restore-banner-text')).toContainText('2 components');
  await expect.poll(async () => (await idbRecords(page, 'diagrams')).map((r) => r.id)).toContain('autosave');
  // The old copy is left in place, read-only.
  expect(await page.evaluate(() => localStorage.getItem('conduitcraft-autosave-v1'))).not.toBeNull();

  await page.locator('#btn-restore-open').click();
  await expect(page.locator('.arch-node')).toHaveCount(2);

  // And it is still there on the next visit, now from the database alone.
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('#restore-banner-text')).toContainText('2 components');
});

test('never loses the oldest autosave key, the recovery copy or the snapshots', async ({ page }) => {
  const snapshot = { id: 'snap-a', name: 'Before the move', timestamp: 1, nodeCount: 1, edgeCount: 0, doc: doc('Snap', 1) };
  await seedLegacy(page, {
    'blueprint-studio-autosave-v1': doc('Oldest', 3),
    'conduitcraft-recovery-v1': doc('Scratch', 1),
    'conduitcraft-snapshots-v1': [snapshot],
  });
  await page.goto('/');
  await expect(page.locator('#restore-banner-text')).toContainText('3 components');
  await expect.poll(async () => (await idbRecords(page, 'diagrams')).map((r) => r.id).sort()).toEqual(['autosave', 'recovery']);
  expect((await idbRecords(page, 'snapshots')).map((r) => r.id)).toEqual(['snap-a']);

  await runPaletteCommand(page, 'Snapshots');
  await expect(page.locator('#snapshots-dialog-body')).toContainText('Before the move');
});

test('never loses an edit when the page is reloaded', async ({ page }) => {
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
    .poll(() => page.evaluate(() => localStorage.getItem('conduitcraft-autosave-v1')))
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
