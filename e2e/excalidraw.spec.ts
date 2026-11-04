import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { dropFile } from './helpers';

const scene = readFileSync(new URL('../tests/fixtures/excalidraw/scene.excalidraw', import.meta.url), 'utf8');

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
});

test('dropping an .excalidraw file imports it as a new diagram, with a report of what was skipped', async ({ page }) => {
  await dropFile(page, 'orders.excalidraw', scene);
  await expect(page.locator('.arch-node')).toHaveCount(4);
  await expect(page.locator('#toast-container')).toContainText('Imported 4 components and 2 wires from Excalidraw');
  await expect(page.locator('.arch-node', { hasText: 'Orders DB' })).toBeVisible();

  await page.getByRole('button', { name: 'See report' }).click();
  const report = page.locator('#import-report-dialog');
  await expect(report).toBeVisible();
  await expect(report).toContainText('not attached to a shape at both ends');
  await expect(report).toContainText('freehand stroke');
});

test('an Excalidraw scene saved with a .json name is still recognised', async ({ page }) => {
  await dropFile(page, 'scene.json', scene);
  await expect(page.locator('.arch-node')).toHaveCount(4);
});

test('JSON that is not an Excalidraw scene is refused with a plain message', async ({ page }) => {
  await dropFile(page, 'wrong.excalidraw', '{"hello":"world"}');
  await expect(page.locator('#toast-container')).toContainText('not an Excalidraw scene');
  await expect(page.locator('.arch-node')).toHaveCount(0);
});
