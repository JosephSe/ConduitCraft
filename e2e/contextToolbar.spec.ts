import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function open(page: Page, query = '?ui=2') {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto(`/${query}`);
  await page.locator('#btn-empty-showcase').click();
  await expect(page.locator('.arch-node').first()).toBeVisible();
  // The showcase opens with a component selected; its toolbar can cover the first node, so start clean.
  await page.locator('#canvas-viewport').click({ position: { x: 4, y: 4 } });
}

const toolbar = (page: Page) => page.locator('.context-toolbar');
// A component that is fully on screen at the default zoom (the first one in the DOM sits half behind the rail).
const firstNode = (page: Page) => page.locator('.arch-node[data-node-id="night-desk"]');

test('classic layout never shows the contextual toolbar', async ({ page }) => {
  await open(page, '?ui=1');
  await firstNode(page).locator('.node-select-hit').click();
  await expect(toolbar(page)).toBeHidden();
});

test('selecting a component shows a toolbar just above it; clearing the selection hides it', async ({ page }) => {
  await open(page);
  await page.locator('#canvas-viewport').click({ position: { x: 4, y: 4 } }); // the showcase opens with a selection
  await expect(toolbar(page)).toBeHidden();
  await firstNode(page).locator('.node-select-hit').click();
  await expect(toolbar(page)).toBeVisible();
  for (const name of ['Rename', 'Duplicate', 'Lock', 'Wire', 'More actions']) {
    await expect(toolbar(page).getByRole('button', { name })).toBeVisible();
  }
  const bar = (await toolbar(page).boundingBox())!;
  const node = (await firstNode(page).boundingBox())!;
  expect(bar.y + bar.height, 'toolbar sits above the component').toBeLessThanOrEqual(node.y + 1);
  await page.keyboard.press('Escape');
  await expect(toolbar(page)).toBeHidden();
});

test('Duplicate from the toolbar adds a component', async ({ page }) => {
  await open(page);
  const before = await page.locator('.arch-node').count();
  await firstNode(page).locator('.node-select-hit').click();
  await toolbar(page).getByRole('button', { name: 'Duplicate' }).click();
  await expect(page.locator('.arch-node')).toHaveCount(before + 1);
});

test('Wire from the toolbar switches to the wire tool with this component as the source', async ({ page }) => {
  await open(page);
  await firstNode(page).locator('.node-select-hit').click();
  await toolbar(page).getByRole('button', { name: 'Wire' }).click();
  await expect(page.locator('#workspace')).toHaveAttribute('data-tool', 'connect');
});

test('More opens the full context menu', async ({ page }) => {
  await open(page);
  await firstNode(page).locator('.node-select-hit').click();
  await toolbar(page).getByRole('button', { name: 'More actions' }).click();
  await expect(page.locator('.context-menu')).toBeVisible();
});

test('the toolbar follows the component when it is dragged, and returns after the drop', async ({ page }) => {
  await open(page);
  const handle = firstNode(page).locator('.node-select-hit');
  await handle.click();
  const before = (await toolbar(page).boundingBox())!;
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 160, box.y + box.height / 2 + 80, { steps: 8 });
  await page.mouse.up();
  await expect(toolbar(page)).toBeVisible();
  const after = (await toolbar(page).boundingBox())!;
  expect(Math.abs(after.x - before.x) + Math.abs(after.y - before.y)).toBeGreaterThan(40);
});

test('a multi-selection offers Group', async ({ page }) => {
  await open(page);
  await page.locator('#canvas-viewport').click({ position: { x: 4, y: 4 } });
  await page.keyboard.press('ControlOrMeta+a');
  await expect(toolbar(page).getByRole('button', { name: 'Group' })).toBeVisible();
});

for (const scheme of ['light', 'dark'] as const) {
  test(`the toolbar has no axe violations (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await open(page);
    await firstNode(page).locator('.node-select-hit').click();
    await expect(toolbar(page)).toBeVisible();
    const results = await new AxeBuilder({ page }).include('.context-toolbar').analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
}
