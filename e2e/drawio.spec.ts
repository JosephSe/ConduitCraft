import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { runPaletteCommand } from './helpers';

const fixture = (name: string) => readFileSync(new URL(`../tests/fixtures/drawio/${name}`, import.meta.url), 'utf8');

/** Drop a file on the window the way the browser does: dragenter, dragover, then drop. */
async function dropFile(page: Page, name: string, text: string): Promise<void> {
  await page.evaluate(
    ({ name, text }) => {
      const data = new DataTransfer();
      data.items.add(new File([text], name, { type: 'application/xml' }));
      for (const type of ['dragenter', 'dragover', 'drop']) {
        window.dispatchEvent(new DragEvent(type, { dataTransfer: data, bubbles: true, cancelable: true }));
      }
    },
    { name, text },
  );
}

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

test('a file with several pages asks, and "pages as levels" makes one overview', async ({ page }) => {
  await dropFile(page, 'shop.drawio', fixture('multipage.drawio'));
  const ask = page.locator('#drawio-pages-dialog');
  await expect(ask).toBeVisible();
  await ask.getByRole('button', { name: 'Pages as levels' }).click();
  await expect(ask).toBeHidden();
  await expect(page.locator('.arch-node')).toHaveCount(2);
  await expect(page.locator('.arch-node', { hasText: 'Billing' })).toBeVisible();
});

test('"one diagram per page" saves every page to Your diagrams and opens the first', async ({ page }) => {
  await dropFile(page, 'shop.drawio', fixture('multipage.drawio'));
  await page.locator('#drawio-pages-dialog').getByRole('button', { name: 'One diagram per page' }).click();
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
