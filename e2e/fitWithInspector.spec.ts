import { expect, test } from '@playwright/test';
import { runPaletteCommand } from './helpers';

test('Fit with the properties panel open keeps the whole showcase inside the viewport', { tag: '@quick' }, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => sessionStorage.setItem('conduitcraft-home-shown', '1'));
  await page.goto('/');
  await page.waitForTimeout(1500);
  await runPaletteCommand(page, 'Load Showcase');
  await page.locator('.conduit-stream').first().waitFor({ state: 'attached', timeout: 20000 });
  await page.locator('.arch-node').nth(2).click();
  await expect(page.locator('#prop-tab-look')).toBeVisible();
  await page.getByRole('button', { name: 'Fit', exact: true }).click();
  await page.waitForTimeout(700);
  const gap = await page.evaluate(() => {
    const view = document.querySelector('#canvas-viewport')!.getBoundingClientRect();
    const zones = [...document.querySelectorAll('.arch-node, .zone, [data-zone-id]')].map((el) => el.getBoundingClientRect());
    const left = Math.min(...zones.map((r) => r.left));
    const right = Math.max(...zones.map((r) => r.right));
    return { left: left - view.left, right: view.right - right };
  });
  expect(gap.left).toBeGreaterThanOrEqual(0);
  expect(gap.right).toBeGreaterThanOrEqual(0);
});
