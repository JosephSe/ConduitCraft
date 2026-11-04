import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { dropFile } from './helpers';

const read = (path: string) => readFileSync(new URL(`../tests/fixtures/${path}`, import.meta.url), 'utf8');

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
});

test('dropping an OpenTelemetry file on an empty canvas makes a service map, with a report of what was skipped', async ({ page }) => {
  await dropFile(page, 'traces.json', read('traces/otlp.json'));
  await expect(page.locator('.arch-node')).toHaveCount(8);
  await expect(page.locator('#toast-container')).toContainText('from traces');
  await expect(page.locator('.arch-node', { hasText: 'orders.created' })).toBeVisible();

  await page.getByRole('button', { name: 'See report' }).click();
  const report = page.locator('#import-report-dialog');
  await expect(report).toContainText('parent that is not in the file');
  await expect(report).toContainText('database span');
});

test('a Jaeger export imports too', async ({ page }) => {
  await dropFile(page, 'jaeger.json', read('traces/jaeger.json'));
  await expect(page.locator('.arch-node')).toHaveCount(2);
});

test('with a diagram open it asks, and "Update this diagram" keeps it and adds the numbers', async ({ page }) => {
  await dropFile(page, 'traces.json', read('traces/otlp.json'));
  await expect(page.locator('.arch-node')).toHaveCount(8);

  await dropFile(page, 'traces.json', read('traces/otlp.json'));
  const ask = page.locator('#trace-mode-dialog');
  await expect(ask).toBeVisible();
  await ask.getByRole('button', { name: 'Update this diagram' }).click();
  await expect(ask).toBeHidden();
  await expect(page.locator('#toast-container')).toContainText('Updated 8 components and 5 wires from traces; added 0 components and 0 wires');
  await expect(page.locator('.arch-node')).toHaveCount(8);
});

test('"New diagram" leaves the open one in the library, and cancelling imports nothing', async ({ page }) => {
  await dropFile(page, 'traces.json', read('traces/jaeger.json'));
  await expect(page.locator('.arch-node')).toHaveCount(2);

  await dropFile(page, 'traces.json', read('traces/otlp.json'));
  await page.locator('#trace-mode-dialog').getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('.arch-node')).toHaveCount(2);

  await dropFile(page, 'traces.json', read('traces/otlp.json'));
  await page.locator('#trace-mode-dialog').getByRole('button', { name: 'New diagram' }).click();
  await expect(page.locator('.arch-node')).toHaveCount(8);
});

test('JSON that is not a trace export is read as a Blueprint file as before', async ({ page }) => {
  await dropFile(page, 'wrong.json', '{"hello":"world"}');
  await expect(page.locator('#toast-container')).toContainText(/Blueprint|not/i);
  await expect(page.locator('.arch-node')).toHaveCount(0);
});
