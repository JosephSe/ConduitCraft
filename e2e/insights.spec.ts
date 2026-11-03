import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('Review lens lists insights, selects the target on click, and mutes a rule', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/?ui=2');
  await page.locator('#btn-empty-showcase').click();
  await expect(page.locator('.arch-node').first()).toBeVisible();

  // Nothing review-related shows in the other lenses.
  await expect(page.locator('#insights-panel')).toBeHidden();
  await expect(page.locator('.insight-badge')).toHaveCount(0);

  await page.keyboard.press('3');
  await expect(page.locator('#workspace')).toHaveAttribute('data-lens', 'review');
  const panel = page.locator('#insights-panel');
  await expect(panel).toBeVisible();
  await expect(page.locator('#insight-count')).toBeVisible();
  await expect(page.locator('#run-bar')).toBeHidden();
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).include('#insights-panel').analyze();
  expect(results.violations).toEqual([]);

  // Clicking an issue selects its target.
  const item = page.locator('.insight-item[data-type="node"]').first();
  await expect(item).toBeVisible();
  await expect(page.locator('.insight-badge').first()).toBeVisible();
  await item.click();
  await expect(page.locator('.arch-node .node-select-hit[aria-pressed="true"]')).toHaveCount(1);

  // Muting a rule removes its issues, and showing it again brings them back.
  const group = page.locator('.insight-group').first();
  const rule = await group.getAttribute('data-rule');
  await group.locator('.insight-mute').click();
  await expect(page.locator(`.insight-group[data-rule="${rule}"] .insight-item`)).toHaveCount(0);
  await page.locator(`.insight-group[data-rule="${rule}"] .insight-mute`).click();
  await expect(page.locator(`.insight-group[data-rule="${rule}"] .insight-item`).first()).toBeVisible();

  // Back in Design the panel and badges are gone.
  await page.keyboard.press('1');
  await expect(panel).toBeHidden();
  await expect(page.locator('.insight-badge')).toHaveCount(0);
});
