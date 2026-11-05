import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { seedAutosave } from './helpers';

// A brand-new visitor: nothing remembered. The other specs start as a returning visitor.
test.use({
  storageState: {
    cookies: [],
    origins: [],
  },
});

test('a fresh profile sees a packet move in 3 s and a failure summary in 10 s', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/');
  await expect(page.locator('#first-run')).toBeVisible();
  await expect(page.locator('#first-run-line')).toHaveText('Watch a request travel through a real system.');
  await expect(page.locator('#workspace')).toHaveAttribute('data-lens', 'traffic');
  await expect(page.locator('#sim-packet')).toBeVisible({ timeout: 3_000 });

  await expect(page.locator('#chaos-summary')).toContainText('failed', { timeout: 10_000 });
  await expect(page.locator('.arch-node[data-chaos="failed"]')).toHaveCount(1);

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test('the three actions are within 3 Tab presses', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#first-run')).toBeVisible();
  const reached = new Set<string>();
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Tab');
    reached.add(await page.evaluate(() => document.activeElement?.id ?? ''));
  }
  expect([...reached]).toEqual(['first-run-blank', 'first-run-template', 'first-run-mermaid']);
});

test('Start blank leaves a one-line hint, in the Design lens', async ({ page }) => {
  await page.goto('/');
  await page.locator('#first-run-blank').click();
  await expect(page.locator('#first-run')).toBeHidden();
  await expect(page.locator('.arch-node')).toHaveCount(0);
  await expect(page.locator('#empty-stage-overlay')).toBeVisible();
  await expect(page.locator('#empty-stage-overlay button')).toHaveCount(0);
  await expect(page.locator('#workspace')).toHaveAttribute('data-lens', 'design');
  // The choice is remembered: a reload is not a first run.
  await page.reload();
  await expect(page.locator('#first-run')).toBeHidden();
});

test('Pick a template and Paste Mermaid open their dialogs', async ({ page }) => {
  await page.goto('/');
  await page.locator('#first-run-template').click();
  await expect(page.locator('#template-gallery-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.goto('/');
  await expect(page.locator('#first-run')).toBeHidden(); // already picked once
});

test('never loses work: an existing autosave means no first run', async ({ page }) => {
  await seedAutosave(page, {
    title: 'Mine',
    nodes: [{ id: 'a', kind: 'core', title: 'A', subtitle: '', x: 100, y: 100 }],
    edges: [],
    zones: [],
    notesCards: [],
    simulations: [],
  });
  await page.goto('/');
  await expect(page.locator('#canvas-viewport')).toBeVisible();
  await page.waitForTimeout(1_500);
  await expect(page.locator('#first-run')).toBeHidden();
  await expect(page.locator('#workspace')).toHaveAttribute('data-mode', 'design');
  await expect(page.locator('#restore-banner-text')).toContainText('1 component');
});

test('never loses work: a library entry with no autosave means no first run', async ({ page }) => {
  // Seed the database from a static page of the same origin, so it is in place before the app starts.
  await page.goto('/icon.svg');
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('conduitcraft', 1);
        open.onupgradeneeded = () => {
          for (const name of ['diagrams', 'snapshots', 'meta']) open.result.createObjectStore(name, { keyPath: 'id' });
        };
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction('diagrams', 'readwrite');
          tx.objectStore('diagrams').put({
            id: 'd-seeded',
            title: 'Library only',
            updatedAt: 1,
            doc: { title: 'Library only', nodes: [], edges: [], zones: [], notesCards: [], simulations: [] },
          });
          tx.oncomplete = () => {
            open.result.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
  await page.goto('/');
  await expect(page.locator('#canvas-viewport')).toBeVisible();
  await page.waitForTimeout(1_500);
  await expect(page.locator('#first-run')).toBeHidden();
  await expect(page.locator('#workspace')).toHaveAttribute('data-mode', 'design');
  expect(await page.evaluate(() => localStorage.getItem('conduitcraft-first-run-seen'))).toBeNull();
});

test('a share link means no first run', async ({ page }) => {
  await page.goto('/#s=notreal');
  await page.waitForTimeout(800);
  await expect(page.locator('#first-run')).toBeHidden();
});

test('reduced motion: nothing plays, the failed state shows at once', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('#chaos-summary')).toContainText('failed', { timeout: 3_000 });
  await expect(page.locator('#sim-packet')).toBeHidden();
});
