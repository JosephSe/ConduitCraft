import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { dropFile, runPaletteCommand } from './helpers';

const fixture = (name: string) => readFileSync(new URL(`../tests/fixtures/drawio/${name}`, import.meta.url), 'utf8');

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
});

test('dropping a .drawio file on the canvas imports it as a new diagram, with a report of what was skipped', async ({ page }) => {
  await dropFile(page, 'orders.drawio', fixture('plain.drawio'));
  await expect(page.locator('.arch-node')).toHaveCount(4);
  await expect(page.locator('#toast-container')).toContainText('Imported 4 components and 3 wires from draw.io');
  await expect(page.locator('.arch-node', { hasText: 'Orders DB' })).toBeVisible();

  await page.getByRole('button', { name: 'See report' }).click();
  const report = page.locator('#import-report-dialog');
  await expect(report).toBeVisible();
  await expect(report).toContainText('not attached to a shape at both ends');
});

test('a compressed page imports the same way', async ({ page }) => {
  await dropFile(page, 'jobs.drawio', fixture('compressed.drawio'));
  await expect(page.locator('.arch-node')).toHaveCount(3);
});

test('a file with several pages asks, and "pages as tabs" opens one diagram with a tab per page', async ({ page }) => {
  await dropFile(page, 'shop.drawio', fixture('multipage.drawio'));
  const ask = page.locator('#drawio-pages-dialog');
  await expect(ask).toBeVisible();
  await expect(ask.getByRole('button', { name: 'One diagram, pages as tabs' })).toBeFocused();
  await ask.getByRole('button', { name: 'One diagram, pages as tabs' }).click();
  await expect(ask).toBeHidden();
  const tabs = page.locator('#page-tabs [role="tab"]');
  await expect(tabs).toHaveCount(2);
  await expect(tabs.nth(0)).toHaveText('Overview');
  await expect(tabs.nth(1)).toHaveText('Billing');
  await expect(page.locator('.arch-node')).toHaveCount(2);
  await tabs.nth(1).click();
  await expect(page.locator('.arch-node')).toHaveCount(3);
  await expect(page.locator('.arch-node', { hasText: /Invoices|Billing/ }).first()).toBeVisible();
});

test('"one diagram per page" saves every page to Your diagrams and opens the first', async ({ page }) => {
  await dropFile(page, 'shop.drawio', fixture('multipage.drawio'));
  await page.locator('#drawio-pages-dialog').getByRole('button', { name: 'One diagram per page', exact: true }).click();
  await expect(page.locator('.arch-node')).toHaveCount(2);
  await runPaletteCommand(page, 'Your Diagrams');
  await expect(page.locator('.library-row', { hasText: 'Billing' })).toBeVisible();
  await expect(page.locator('.library-row', { hasText: 'Overview' })).toBeVisible();
});

test('cancelling the page question imports nothing', async ({ page }) => {
  await dropFile(page, 'shop.drawio', fixture('multipage.drawio'));
  await page.locator('#drawio-pages-dialog').getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('.arch-node')).toHaveCount(0);
});

test('XML that is not draw.io is refused with a plain message', async ({ page }) => {
  await dropFile(page, 'broken.drawio', '<mxfile><diagram name="x">');
  await expect(page.locator('#toast-container')).toContainText(/not valid XML/);
  await expect(page.locator('.arch-node')).toHaveCount(0);
});
