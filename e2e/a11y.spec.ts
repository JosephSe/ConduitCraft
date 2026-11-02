import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

type Scheme = 'light' | 'dark';

async function scan(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.map((n) => `${n.target.join(' ')} :: ${(n.any[0]?.message ?? n.failureSummary ?? '').split('\n')[0]}`),
  }));
}

for (const scheme of ['light', 'dark'] as Scheme[]) {
  test.describe(`accessibility (${scheme})`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
    });

    test('empty canvas has no axe violations', async ({ page }) => {
      await page.goto('/');
      await expect(page.locator('#empty-stage-overlay')).toBeVisible();
      const violations = await scan(page);
      console.log(`EMPTY/${scheme}`, JSON.stringify(violations, null, 1));
      expect(violations).toEqual([]);
    });

    test('loaded diagram has no axe violations', async ({ page }) => {
      await page.goto('/');
      await page.locator('#btn-empty-showcase').click();
      await expect(page.locator('.arch-node').first()).toBeVisible();
      const violations = await scan(page);
      console.log(`DIAGRAM/${scheme}`, JSON.stringify(violations, null, 1));
      expect(violations).toEqual([]);
    });
  });
}

test('a visible tooltip has no axe violations', async ({ page }) => {
  await page.goto('/');
  await page.locator('#btn-empty-showcase').click();
  await expect(page.locator('.arch-node').first()).toBeVisible();
  await page.locator('#btn-prop-delete').hover();
  await expect(page.locator('#tooltip-layer')).toHaveAttribute('role', 'tooltip');
  expect(await scan(page)).toEqual([]);
});
