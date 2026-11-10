import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { openLumenRelay } from './helpers';

async function open(page: Page, query = '') {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto(`/${query}`);
  await openLumenRelay(page);
  await expect(page.locator('.arch-node').first()).toBeVisible();
}

const workspace = (page: Page) => page.locator('#workspace');
const clearSelection = (page: Page) => page.locator('#canvas-viewport').click({ position: { x: 4, y: 4 } });

test('the inspector opens with a selection and folds away without one', async ({ page }) => {
  await open(page);
  await expect(workspace(page)).not.toHaveAttribute('data-inspector-collapsed', 'true'); // showcase opens selected
  await clearSelection(page);
  await expect(workspace(page)).toHaveAttribute('data-inspector-collapsed', 'true');
  await page.locator('.arch-node[data-node-id="night-desk"] .node-select-hit').click();
  await expect(workspace(page)).not.toHaveAttribute('data-inspector-collapsed', 'true');
  await expect(page.locator('#prop-form-container')).toBeVisible();
});

test('pinning keeps the inspector open with nothing selected, and the pin is remembered', async ({ page }) => {
  await open(page);
  await clearSelection(page);
  await expect(workspace(page)).toHaveAttribute('data-inspector-collapsed', 'true');
  // Pin lives in the inspector header, so open it first (as a user would with ]).
  await page.locator('.arch-node[data-node-id="night-desk"] .node-select-hit').click();
  await page.locator('#btn-pin-inspector').click();
  await expect(page.locator('#btn-pin-inspector')).toHaveAttribute('aria-pressed', 'true');
  await clearSelection(page);
  await expect(workspace(page)).not.toHaveAttribute('data-inspector-collapsed', 'true');

  await page.reload();
  await openLumenRelay(page);
  await expect(page.locator('#btn-pin-inspector')).toHaveAttribute('aria-pressed', 'true');
});

test('clicking the document title opens the document properties even when nothing is selected', async ({ page }) => {
  await open(page);
  await clearSelection(page);
  await expect(workspace(page)).toHaveAttribute('data-inspector-collapsed', 'true');
  await page.locator('#btn-focus-doc-title').click();
  await expect(workspace(page)).not.toHaveAttribute('data-inspector-collapsed', 'true');
  await expect(page.locator('#prop-doc-title')).toBeFocused();
});

test('the inspector does not auto-hide in Data View', async ({ page }) => {
  await open(page);
  await page.locator('input[name="workspace-mode"][value="data"]').evaluate((el: HTMLElement) => el.click());
  await clearSelection(page);
  await expect(workspace(page)).not.toHaveAttribute('data-inspector-collapsed', 'true');
});

test('the open inspector has no axe violations', async ({ page }) => {
  // The loaded-diagram scan already covers this panel in both themes. Dark is the tighter contrast.
  await page.emulateMedia({ colorScheme: 'dark' });
  await open(page);
  await clearSelection(page);
  await page.locator('.arch-node[data-node-id="night-desk"] .node-select-hit').click();
  const results = await new AxeBuilder({ page }).include('#inspector-panel').analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
});
