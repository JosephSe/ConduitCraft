import { expect, test, type Page } from '@playwright/test';
import { openLumenRelay, undo } from './helpers';

async function open(page: Page) {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/');
  await openLumenRelay(page);
  await expect(page.locator('.arch-node').first()).toBeVisible();
}

async function selectThree(page: Page) {
  const hits = page.locator('.arch-node .node-select-hit');
  await hits.nth(0).click();
  await hits.nth(1).click({ modifiers: ['Shift'] });
  await hits.nth(2).click({ modifiers: ['Shift'] });
}

test('Colour on the toolbar recolours three selected components in one undo step', async ({ page }) => {
  await open(page);
  await selectThree(page);
  const toolbar = page.locator('.context-toolbar');
  await expect(toolbar.locator('[data-picker="colour"]')).toBeVisible();
  const first3 = page.locator('.arch-node').filter({ has: page.locator('.node-select-hit') });
  const accentOf = (i: number) => first3.nth(i).getAttribute('data-accent');
  const before = [await accentOf(0), await accentOf(1), await accentOf(2)];

  await toolbar.locator('[data-picker="colour"]').click();
  await page.getByRole('menuitemradio', { name: /Exception/ }).click();
  await expect(page.locator('.appearance-popover')).toHaveCount(0);

  for (const i of [0, 1, 2]) await expect(first3.nth(i)).toHaveAttribute('data-accent', 'rose');

  await undo(page);
  for (const i of [0, 1, 2]) await expect(first3.nth(i)).toHaveAttribute('data-accent', before[i]!);
});

test('Kind and Shape open pickers, and Escape closes one', async ({ page }) => {
  await open(page);
  await page.locator('.arch-node .node-select-hit').first().click();
  const toolbar = page.locator('.context-toolbar');
  await toolbar.locator('[data-picker="shape"]').click();
  await expect(page.getByRole('menuitemradio', { name: 'Hexagon' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.appearance-popover')).toHaveCount(0);

  await toolbar.locator('[data-picker="kind"]').click();
  await expect(page.locator('.appearance-popover [role="menuitemradio"]').first()).toBeVisible();
});
