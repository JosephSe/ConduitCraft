import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { placeComponent } from './helpers';

async function open(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/');
}

async function addFromRail(page: Page, id: string, kind: string) {
  await placeComponent(page, id);
  const added = page.locator(`.arch-node[data-kind="${kind}"]`);
  await expect(added).toHaveCount(1);
  return added;
}

test('a Stream / Log from the list is a pipe with lanes, and Partitions changes the lanes', async ({ page }) => {
  await open(page);
  const stream = await addFromRail(page, 'stream', 'queue');
  await expect(stream).toHaveAttribute('data-shape', 'pipe');
  await expect(stream.locator('.micro-chip')).toHaveText('STREAM');
  await expect(stream.locator('.node-shape-lanes')).toHaveCount(1);
  await page.keyboard.press('1');
  await stream.locator('.node-select-hit').click();
  const partitions = page.locator('#prop-node-queue-partitions');
  await expect(partitions).toBeVisible();
  await partitions.fill('6');
  await partitions.press('Tab');
  const d = await stream.locator('.node-shape-lanes').getAttribute('d');
  expect((d ?? '').split('M').filter(Boolean)).toHaveLength(6);
  const results = await new AxeBuilder({ page }).include('#inspector-panel').withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
});

test('Run by someone else draws a component dashed with an external flag', async ({ page }) => {
  await open(page);
  const service = await addFromRail(page, 'service', 'service');
  await expect(service).not.toHaveAttribute('data-external', 'true');
  await page.keyboard.press('1');
  await service.locator('.node-select-hit').click();
  const box = page.locator('#prop-node-external');
  await expect(box).toBeVisible();
  await box.check();
  await expect(service).toHaveAttribute('data-external', 'true');
  await box.uncheck();
  await expect(service).not.toHaveAttribute('data-external', 'true');
});

test('Object Storage from the list is a store drawn as a bucket', async ({ page }) => {
  await open(page);
  const bucket = await addFromRail(page, 'object-store', 'store');
  await expect(bucket).toHaveAttribute('data-shape', 'cylinder');
  await expect(bucket).toHaveAttribute('data-bucket', 'true');
  await expect(bucket.locator('.node-shape-plate .cylinder-lid')).toHaveCount(1);
});
