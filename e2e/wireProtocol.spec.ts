import { expect, test } from '@playwright/test';

test('a wire takes a protocol and a call style from the inspector, and shows them on the canvas', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/');
  await page.locator('#btn-empty-showcase').click();
  await expect(page.locator('.arch-node').first()).toBeVisible();

  // Select the first wire through its chip, as a user clicking its label would.
  const group = page.locator('.conduit-group:has(.conduit-badge-hit)').first();
  await group.locator('.conduit-badge-hit').click({ force: true });
  const id = await group.getAttribute('data-from');
  const to = await group.getAttribute('data-to');
  const wire = page.locator(`.conduit-group[data-from="${id}"][data-to="${to}"]`).first();

  await page.locator('#prop-edge-protocol').selectOption('grpc');
  await expect(wire.locator('.route-pill-text').first()).toContainText('gRPC · ');

  await expect(wire).toHaveAttribute('data-sync', 'sync');
  await page.locator('#prop-edge-sync').selectOption('async');
  await expect(wire).toHaveAttribute('data-sync', 'async');

  await page.locator('#prop-edge-protocol').selectOption('');
  await expect(wire.locator('.route-pill-text').first()).not.toContainText('gRPC');
});
