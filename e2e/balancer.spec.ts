import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { placeComponent, runPaletteCommand } from './helpers';

const node = (page: Page, id: string) => page.locator(`.arch-node[data-node="${id}"]`);

async function openThreeTier(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/');
  await runPaletteCommand(page, 'Three-Tier Web');
  await expect(node(page, 'alb')).toBeVisible();
}

test('a Load Balancer from the rail draws as a trapezoid with its own icon and chip', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/');
  await placeComponent(page, 'balancer');
  const added = page.locator('.arch-node[data-kind="balancer"]');
  await expect(added).toHaveCount(1);
  await expect(added).toHaveAttribute('data-shape', 'trapezoid');
  await expect(added.locator('.node-shape-plate polygon')).toHaveCount(1);
  await expect(added.locator('.micro-chip')).toHaveText('RR');
});

test('the example load balancer is a trapezoid, and failing one of its targets keeps traffic flowing', async ({ page }) => {
  await openThreeTier(page);
  await expect(node(page, 'alb')).toHaveAttribute('data-shape', 'trapezoid');

  await page.keyboard.press('2');
  await node(page, 'app-a').locator('.node-select-hit').click();
  await page.keyboard.press('x');

  await expect(node(page, 'app-a')).toHaveAttribute('data-chaos', 'failed');
  await expect(node(page, 'app-b')).toHaveAttribute('data-chaos', 'rerouted');
  await expect(node(page, 'alb')).not.toHaveAttribute('data-chaos', 'at-risk');
  await expect(node(page, 'cdn')).not.toHaveAttribute('data-chaos', 'at-risk');
});

test('failing both targets puts the balancer at risk', async ({ page }) => {
  await openThreeTier(page);
  await page.keyboard.press('2');
  await node(page, 'app-a').locator('.node-select-hit').click();
  await page.keyboard.press('x');
  await node(page, 'app-b').locator('.node-select-hit').click();
  await page.keyboard.press('x');
  await expect(node(page, 'alb')).toHaveAttribute('data-chaos', 'at-risk');
});

test('a scenario with one target failed is sent to the other and does not stop', async ({ page }) => {
  await openThreeTier(page);
  await page.keyboard.press('2');
  await node(page, 'app-b').locator('.node-select-hit').click();
  await page.keyboard.press('x');
  await expect(node(page, 'app-b')).toHaveAttribute('data-chaos', 'failed');

  await page.locator('#run-bar-scenario').selectOption('sim-checkout');
  await expect(page.locator('#a11y-live-announcer')).toContainText(/sent traffic to App Server · AZ-a instead of App Server · AZ-b/);
  await expect(node(page, 'app-a')).toHaveAttribute('data-sim-active', 'true');
  await expect(node(page, 'app-b')).not.toHaveAttribute('data-sim-active', 'true');
});

test('the Strategy field in the inspector changes the chip, and has no axe violations', async ({ page }) => {
  await openThreeTier(page);
  await page.keyboard.press('1');
  await node(page, 'alb').locator('.node-select-hit').click();
  const strategy = page.locator('#prop-node-balancer-strategy');
  await expect(strategy).toBeVisible();
  await expect(strategy).toHaveValue('least-connections');
  await strategy.selectOption('hash');
  await expect(node(page, 'alb').locator('.micro-chip')).toHaveText('HASH');
  const results = await new AxeBuilder({ page }).include('#inspector-panel').withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
});
