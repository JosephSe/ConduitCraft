import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { dropFile, runPaletteCommand } from './helpers';

const compose = readFileSync(new URL('../tests/fixtures/compose/docker-compose.yml', import.meta.url), 'utf8');
const newer = compose.replace('postgres:16', 'postgres:17').replace('replicas: 3', 'replicas: 4');

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await dropFile(page, 'docker-compose.yml', compose);
  await expect(page.locator('.arch-node')).toHaveCount(8);
});

async function openWith(page: import('@playwright/test').Page, name: string, text: string) {
  await runPaletteCommand(page, 'Check for Drift');
  const dialog = page.locator('#drift-dialog');
  await expect(dialog).toBeVisible();
  await dialog.locator('#drift-file').setInputFiles({ name, mimeType: 'text/yaml', buffer: Buffer.from(text) });
  return dialog;
}

test('an unchanged file reports no drift', async ({ page }) => {
  const dialog = await openWith(page, 'docker-compose.yml', compose);
  await expect(dialog.locator('#drift-status')).toContainText('No drift');
  await expect(dialog.locator('.drift-row')).toHaveCount(0);
  await expect(dialog.locator('#drift-accept-all')).toBeDisabled();
});

test('a changed file lists what moved, outlines it on the canvas, and accepting is one undo step', async ({ page }) => {
  const dialog = await openWith(page, 'docker-compose.yml', newer);
  await expect(dialog.locator('.drift-row')).toHaveCount(2);
  await expect(dialog.locator('.drift-row', { hasText: 'Image changed from postgres:16 to postgres:17' })).toBeVisible();
  await expect(dialog.locator('.drift-row', { hasText: 'Running copies changed from 3 to 4' })).toBeVisible();
  await expect(page.locator('.arch-node[data-drift="changed"]')).toHaveCount(2);

  const db = dialog.locator('.drift-row', { hasText: 'postgres:17' });
  await db.getByRole('button', { name: /^Accept/ }).click();
  await expect(dialog.locator('.drift-row')).toHaveCount(1);
  await expect(page.locator('.arch-node[data-drift="changed"]')).toHaveCount(1);
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('.arch-node[data-drift]')).toHaveCount(0);
  await expect(page.locator('.arch-node', { hasText: 'postgres:17' })).toBeVisible();

  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('.arch-node', { hasText: 'postgres:16' })).toBeVisible();
});

test('ignore hides a difference and accept all takes the rest', async ({ page }) => {
  const dialog = await openWith(page, 'docker-compose.yml', newer);
  await dialog.locator('.drift-row', { hasText: 'Running copies' }).getByRole('button', { name: /^Ignore/ }).click();
  await expect(dialog.locator('.drift-row')).toHaveCount(1);
  await dialog.locator('#drift-accept-all').click();
  await expect(dialog.locator('.drift-row')).toHaveCount(0);
  await expect(dialog.locator('#drift-status')).toContainText('ignored');
});

test('a file that is not an importer source is refused in plain words', async ({ page }) => {
  const dialog = await openWith(page, 'notes.yml', 'hello: world\n');
  await expect(dialog.locator('#drift-status')).toContainText('is not a Docker Compose, Kubernetes, OpenAPI or AsyncAPI file');
  await expect(dialog.locator('.drift-row')).toHaveCount(0);
});

test('the dialog has no accessibility violations', async ({ page }) => {
  const dialog = await openWith(page, 'docker-compose.yml', newer);
  await expect(dialog.locator('.drift-row')).toHaveCount(2);
  // The dialog fades in; axe reads blended colours while that runs, so let every finite animation finish first.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  );
  const results = await new AxeBuilder({ page }).include('#drift-dialog').analyze();
  expect(results.violations).toEqual([]);
});
