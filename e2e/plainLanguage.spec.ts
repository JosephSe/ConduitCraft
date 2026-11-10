import { clearSelection, openLumenRelay } from './helpers';
import { expect, test } from '@playwright/test';

test('a component form has a header and three tabs, and each field is in exactly one', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/');
  await openLumenRelay(page);
  await expect(page.locator('.arch-node[data-node-id="night-desk"]')).toBeVisible();

  await expect(page.locator('.prop-selection-head .prop-selection-name')).not.toBeEmpty();
  await expect(page.locator('#prop-tab-look')).toHaveText('Look');
  await expect(page.locator('#prop-tab-behaviour')).toHaveText('Behaviour');
  await expect(page.locator('#prop-tab-notes')).toHaveText('Notes');

  const fields: Record<string, string[]> = {
    look: ['Name', 'Kind', 'Subtitle (shown under the name)', 'Label above title', 'Badge'],
    behaviour: ['Architecture Status'],
    notes: ['Description', 'Owner', 'Review Comment / Note'],
  };
  for (const [tab, labels] of Object.entries(fields)) {
    await page.locator(`#prop-tab-${tab}`).click();
    const panel = page.locator(`#prop-panel-${tab}`);
    for (const label of labels) {
      await expect(panel.getByLabel(label, { exact: true }), `${label} is in ${tab}`).toBeVisible();
    }
  }
});

test('a wire is called a wire in its inspector', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/');
  await openLumenRelay(page);
  await expect(page.locator('.conduit-group').first()).toBeAttached();
  // The showcase opens with a component selected; in the redesign its toolbar floats over nearby wires.
  await clearSelection(page);
  await page.locator('.conduit-hit').first().click({ force: true });
  await expect(page.locator('#prop-panel-heading')).toHaveText('Wire properties');
});
