import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function open(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/');
}

async function addFromRail(page: Page, id: string, kind: string) {
  const button = page.locator(`.rail-stencil-btn[data-stencil-id="${id}"]`);
  await expect(button).toBeVisible();
  await button.click();
  const added = page.locator(`.arch-node[data-kind="${kind}"]`);
  await expect(added).toHaveCount(1);
  return added;
}

test('a Cache from the rail shows its hit rate, and the Hit rate field changes the chip', async ({ page }) => {
  await open(page);
  const cache = await addFromRail(page, 'cache', 'cache');
  await expect(cache.locator('.micro-chip')).toHaveText('HIT 80%');
  await page.keyboard.press('1');
  await cache.locator('.node-select-hit').click();
  const rate = page.locator('#prop-node-cache-hitrate');
  await expect(rate).toBeVisible();
  await rate.fill('50');
  await rate.press('Tab');
  await expect(cache.locator('.micro-chip')).toHaveText('HIT 50%');
  const results = await new AxeBuilder({ page }).include('#inspector-panel').withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
});

test('a Rate Limiter from the rail shows 4/5, and Admit changes the chip', async ({ page }) => {
  await open(page);
  const limiter = await addFromRail(page, 'limiter', 'limiter');
  await expect(limiter.locator('.micro-chip')).toHaveText('4/5');
  await page.keyboard.press('1');
  await limiter.locator('.node-select-hit').click();
  const admit = page.locator('#prop-node-limiter-admit');
  await expect(admit).toBeVisible();
  await admit.fill('2');
  await admit.press('Tab');
  await expect(limiter.locator('.micro-chip')).toHaveText('2/5');
  await expect(page.locator('#prop-node-limiter-failopen')).toBeVisible();
  const results = await new AxeBuilder({ page }).include('#inspector-panel').withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
});

test('a Scheduler shows its timing, and failing the only scheduler fails it', async ({ page }) => {
  await open(page);
  const scheduler = await addFromRail(page, 'scheduler', 'scheduler');
  await page.keyboard.press('1');
  await scheduler.locator('.node-select-hit').click();
  const every = page.locator('#prop-node-schedule-every');
  await expect(every).toBeVisible();
  await every.fill('5m');
  await every.press('Tab');
  await expect(scheduler.locator('.micro-chip')).toHaveText('5m');

  await page.keyboard.press('2');
  await scheduler.locator('.node-select-hit').click();
  await page.keyboard.press('x');
  await expect(scheduler).toHaveAttribute('data-chaos', 'failed');
});
