import { expect, test } from '@playwright/test';

test('a component takes an owner, tags and links, and the legend renames a colour', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/');
  await page.locator('#btn-empty-showcase').click();
  const node = page.locator('.arch-node').first();
  await expect(node).toBeVisible();
  await node.click();

  await page.locator('#prop-node-owner').fill('Payments team');
  await page.locator('#prop-node-tags').fill('pii, payments');

  await page.locator('#prop-node-link-add').click();
  await page.locator('input[aria-label="Link label"]').first().fill('Runbook');
  await page.locator('input[aria-label="Link address"]').first().fill('javascript:alert(1)');
  await expect(page.locator('.prop-link-open')).toHaveCount(0);
  await page.locator('input[aria-label="Link address"]').first().fill('https://example.com/runbook');
  const opener = page.locator('.prop-link-open').first();
  await expect(opener).toHaveAttribute('href', 'https://example.com/runbook');
  await expect(opener).toHaveAttribute('target', '_blank');
  await expect(opener).toHaveAttribute('rel', 'noopener noreferrer');

  // Selecting something else and coming back keeps what was typed.
  await page.locator('.arch-node').nth(1).click();
  await node.click();
  await expect(page.locator('#prop-node-owner')).toHaveValue('Payments team');
  await expect(page.locator('#prop-node-tags')).toHaveValue('pii, payments');
  await expect(page.locator('.prop-link-open').first()).toHaveText('Runbook');

  // Nothing selected: the document panel names the colours.
  await page.locator('#prop-node-owner').blur();
  await page.keyboard.press('Escape');
  // The new layout folds the panel away when nothing is selected; open it as a person would.
  const expand = page.locator('#btn-rail-expand-inspector');
  if (await expand.isVisible()) await expand.click();
  await page.locator('#prop-legend-rose').fill('PII');
  await page.locator('input[name="workspace-mode"][value="data"]').evaluate((el: HTMLElement) => el.click());
  await expect(page.locator('[data-tone-name="rose"]')).toHaveText('PII');
});

test('the Traffic toolbar colours by tag and filters by tag, and the legend card shows on the canvas', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/');
  await page.locator('#btn-empty-showcase').click();
  const nodes = page.locator('.arch-node');
  await expect(nodes.first()).toBeVisible();

  await nodes.first().click();
  await page.locator('#prop-node-tags').fill('pii');
  await page.locator('#prop-node-owner').blur();

  await page.locator('input[name="workspace-mode"][value="data"]').evaluate((el: HTMLElement) => el.click());
  // The classic layout has these in the Traffic toolbar; the new one has them in the run bar.
  const classic = (await page.locator('html').getAttribute('data-ui')) === '1';
  const scope = classic ? page.locator('#data-toolbar') : page.locator('#run-bar');
  const tagFilter = scope.locator('.js-tag-filter');
  const colourBy = scope.locator('.js-colour-by');
  await expect(tagFilter.locator('option[value="pii"]')).toHaveCount(1);

  await tagFilter.selectOption('pii');
  await expect(page.locator('.arch-node:not(.is-tag-dimmed)')).toHaveCount(1);
  await expect(page.locator('.arch-node.is-tag-dimmed').first()).toBeVisible();
  await tagFilter.selectOption('');
  await expect(page.locator('.arch-node.is-tag-dimmed')).toHaveCount(0);

  await colourBy.selectOption('tag');
  await expect(page.locator('#legend-card')).toBeVisible();
  await expect(page.locator('#legend-card-list')).toContainText('pii');
  await colourBy.selectOption('tone');
  await expect(page.locator('#legend-card')).toBeHidden();
});
