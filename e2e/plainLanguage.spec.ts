import { clearSelection } from './helpers';
import { expect, test } from '@playwright/test';

test('a component form leads with Name, Description and Kind; the rest is under More details', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/');
  await page.locator('#btn-empty-showcase').click();
  await expect(page.locator('.arch-node[data-node-id="night-desk"]')).toBeVisible();

  const basics = page.locator('#prop-section-basics');
  await expect(basics.getByLabel('Name')).toBeVisible();
  await expect(basics.getByLabel('Description')).toBeVisible();
  await expect(basics.getByLabel('Kind')).toBeVisible();

  const more = page.locator('#prop-section-metadata');
  await expect(more.locator('summary')).toHaveText('More details');
  await more.locator('summary').click();
  for (const label of ['Subtitle (shown under the name)', 'Label above title', 'Badge']) {
    await expect(more.getByLabel(label, { exact: true })).toBeVisible();
  }
});

test('a wire is called a wire in its inspector', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/');
  await page.locator('#btn-empty-showcase').click();
  await expect(page.locator('.conduit-group').first()).toBeAttached();
  // The showcase opens with a component selected; in the redesign its toolbar floats over nearby wires.
  await clearSelection(page);
  await page.locator('.conduit-hit').first().click({ force: true });
  await expect(page.locator('#prop-panel-heading')).toHaveText('WIRE PROPERTIES');
});
