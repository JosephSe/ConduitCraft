import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { dropFile } from './helpers';

const read = (path: string) => readFileSync(new URL(`../tests/fixtures/${path}`, import.meta.url), 'utf8');

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
});

test('dropping docker-compose.yml draws the services, volumes and wires, and reports what it left out', async ({ page }) => {
  await dropFile(page, 'docker-compose.yml', read('compose/docker-compose.yml'));
  await expect(page.locator('.arch-node')).toHaveCount(8);
  await expect(page.locator('#toast-container')).toContainText('from Docker Compose');
  await expect(page.locator('.arch-node', { hasText: 'pgdata' })).toBeVisible();

  await page.getByRole('button', { name: 'See report' }).click();
  const report = page.locator('#import-report-dialog');
  await expect(report).toContainText('bind mount');
  await expect(report).toContainText('Environment variables, secrets and configs are not imported');
  // Secrets in the file's environment section never reach the page.
  expect(await page.content()).not.toContain('hunter2');
});

test('dropping an OpenAPI file draws a component per tag and a gate per server', async ({ page }) => {
  await dropFile(page, 'petstore.yaml', read('openapi/petstore.yaml'));
  await expect(page.locator('.arch-node')).toHaveCount(5);
  await expect(page.locator('#toast-container')).toContainText('from OpenAPI');
  await expect(page.locator('.arch-node', { hasText: 'pets' }).first()).toBeVisible();
});

test('a YAML file that is neither is refused with a plain message', async ({ page }) => {
  await dropFile(page, 'compose.yml', 'hello: world\n');
  await expect(page.locator('#toast-container')).toContainText('no "services" section');
  await expect(page.locator('.arch-node')).toHaveCount(0);
});
