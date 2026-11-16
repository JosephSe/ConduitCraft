import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { openLumenRelay, runPaletteCommand, undo } from './helpers';

async function open(page: Page) {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/');
  await openLumenRelay(page);
  await expect(page.locator('.arch-node').first()).toBeVisible();
  await page.locator('#canvas-viewport').click({ position: { x: 4, y: 4 } });
}

const dialog = (page: Page) => page.locator('#find-replace-dialog');
const titles = (page: Page) => page.locator('.arch-node .node-title').allTextContents();

test('Cmd/Ctrl+Shift+F finds, and Replace all is one undo step', { tag: '@quick' }, async ({ page }) => {
  await open(page);
  const before = await titles(page);
  const word = before.find((t) => t.trim().length > 3)!.trim().split(/\s+/)[0];

  await page.keyboard.press('ControlOrMeta+Shift+f');
  await expect(dialog(page)).toBeVisible();
  await dialog(page).locator('#fr-find').fill(word);
  await expect(dialog(page).locator('#fr-status')).toContainText(/match/);
  expect(await dialog(page).locator('.find-replace-row').count()).toBeGreaterThan(0);

  await dialog(page).locator('#fr-replace').fill('Zzyzx');
  await dialog(page).getByRole('button', { name: 'Replace all' }).click();
  await expect(dialog(page).locator('#fr-status')).toContainText('Replaced');
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeHidden();

  const after = await titles(page);
  expect(after.some((t) => t.includes('Zzyzx'))).toBe(true);
  expect(after.some((t) => t.includes(word) && !t.includes('Zzyzx'))).toBe(false);

  await undo(page);
  expect(await titles(page)).toEqual(before);
});

test('the palette opens it too, and a query with no match says so', async ({ page }) => {
  await open(page);
  await runPaletteCommand(page, 'Find and Replace');
  await expect(dialog(page)).toBeVisible();
  await dialog(page).locator('#fr-find').fill('qqqqnotthere');
  await expect(dialog(page).locator('#fr-status')).toHaveText('No matches.');
  await expect(dialog(page).getByRole('button', { name: 'Replace all' })).toBeDisabled();
});

test('Select all matches selects them, and the shared Status field changes all in one undo step', async ({ page }) => {
  await open(page);
  await page.keyboard.press('ControlOrMeta+Shift+f');
  // Every title containing a vowel: enough components to make a multi-selection.
  await dialog(page).locator('#fr-find').fill('e');
  await dialog(page).getByRole('button', { name: 'Select all matches' }).click();
  await expect(dialog(page)).toBeHidden();

  const bulk = page.locator('.bulk-fields');
  await expect(bulk.getByLabel('Status')).toBeVisible();
  const statusOf = () => page.locator('.arch-node').evaluateAll((els) => els.map((el) => el.getAttribute('data-status')));
  const before = await statusOf();

  await bulk.getByLabel('Status').selectOption('deprecated');
  const changed = await statusOf();
  expect(changed).not.toEqual(before);
  expect(changed.filter((s) => s === 'deprecated').length).toBeGreaterThan(1);

  await undo(page);
  expect(await statusOf()).toEqual(before);
});

test('adding a tag to the selection tags every selected component', async ({ page }) => {
  await open(page);
  const hits = page.locator('.arch-node .node-select-hit');
  await hits.nth(0).click();
  await hits.nth(1).click({ modifiers: ['Shift'] });
  const bulk = page.locator('.bulk-fields');
  await bulk.getByLabel('Tag to add or remove').fill('pci');
  await bulk.getByRole('button', { name: 'Add' }).click();
  // The field empties only when the tag was added to something.
  await expect(bulk.getByLabel('Tag to add or remove')).toHaveValue('');
  await bulk.getByLabel('Tag to add or remove').fill('pci');
  await bulk.getByRole('button', { name: 'Add' }).click();
  await expect(bulk.getByLabel('Tag to add or remove')).toHaveValue('pci'); // already there: nothing changed
  await bulk.getByRole('button', { name: 'Remove' }).click();
  await expect(bulk.getByLabel('Tag to add or remove')).toHaveValue('');
  await undo(page);
});

test('the dialog has no axe violations', async ({ page }) => {
  await open(page);
  await page.keyboard.press('ControlOrMeta+Shift+f');
  await dialog(page).locator('#fr-find').fill('e');
  await expect(dialog(page).locator('.find-replace-row').first()).toBeVisible();
  const results = await new AxeBuilder({ page }).include('#find-replace-dialog').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
});
