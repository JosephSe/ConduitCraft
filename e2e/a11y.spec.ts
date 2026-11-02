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

for (const [scheme, expected] of [
  ['light', 'rgb(255, 255, 255)'],
  ['dark', 'rgb(11, 18, 32)'],
] as const) {
  test(`primary button text colour follows the theme (${scheme})`, async ({ page }) => {
    // Axe can't evaluate text on a gradient, so assert the computed colour directly.
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/');
    const color = await page.locator('#btn-open-export').evaluate((el) => getComputedStyle(el).color);
    expect(color).toBe(expected);
  });
}

for (const scheme of ['light', 'dark'] as Scheme[]) {
  test(`wide layout, where toolbar text labels are visible, has no axe violations (${scheme})`, async ({ page }) => {
    // The toolbar hides its text labels at narrower widths, so label-in-name problems only show up here.
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/');
    await page.locator('#btn-empty-showcase').click();
    await expect(page.locator('.arch-node').first()).toBeVisible();
    await expect(page.locator('#btn-open-palette .btn-text-responsive')).toBeVisible();
    expect(await scan(page)).toEqual([]);
  });
}
