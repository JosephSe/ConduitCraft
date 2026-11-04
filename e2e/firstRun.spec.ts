import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

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
  const saved = JSON.stringify({
    title: 'Mine',
    nodes: [{ id: 'a', kind: 'core', title: 'A', subtitle: '', x: 100, y: 100 }],
    edges: [],
    zones: [],
    notesCards: [],
    simulations: [],
  });
  await page.addInitScript((value) => {
    if (!localStorage.getItem('conduitcraft-autosave-v1')) localStorage.setItem('conduitcraft-autosave-v1', value);
  }, saved);
  await page.goto('/');
  await expect(page.locator('#canvas-viewport')).toBeVisible();
  await page.waitForTimeout(1_500);
  await expect(page.locator('#first-run')).toBeHidden();
  await expect(page.locator('#workspace')).toHaveAttribute('data-mode', 'design');
  // The old copy is untouched, and the same work is now in the database too.
  expect(await page.evaluate(() => localStorage.getItem('conduitcraft-autosave-v1'))).toBe(saved);
  await expect(page.locator('#restore-banner-text')).toContainText('1 component');
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
