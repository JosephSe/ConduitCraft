import { expect, test } from '@playwright/test';
import { openLumenRelay, runPaletteCommand } from './helpers';

test('the template gallery fills its previews once the lazy template chunks load', async ({ page }) => {
  await page.goto('/');
  await runPaletteCommand(page, 'Starter Templates');
  const frames = page.locator('.template-card:not(.template-card-blank) .template-preview-frame');
  await expect(frames).toHaveCount(7);
  for (let i = 0; i < 7; i++) await expect(frames.nth(i).locator('svg')).toBeVisible();
});

test('template JSON is not in the entry bundle: nothing is requested until a template is needed', async ({ page }) => {
  const templateRequests: string[] = [];
  page.on('request', (req) => {
    if (/\.blueprint-[\w-]+\.js/.test(req.url())) templateRequests.push(req.url());
  });
  await page.goto('/');
  await expect(page.locator('#empty-stage-overlay')).toBeVisible();
  expect(templateRequests).toEqual([]);

  await openLumenRelay(page);
  await expect(page.locator('.arch-node').first()).toBeVisible();
  expect(templateRequests.length).toBe(1);
  expect(templateRequests[0]).toContain('lumen-relay');
});
