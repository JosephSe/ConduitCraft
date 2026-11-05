import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { clearSelection, openLumenRelay, runPaletteCommand } from './helpers';

const tabs = (page: Page) => page.locator('#page-tabs [role="tab"]');
const nodes = (page: Page) => page.locator('.arch-node');

/** The tab strip loads its menu code the first time the pointer reaches it. */
async function warmStrip(page: Page): Promise<void> {
  await page.locator('#page-tabs').hover();
  await page.waitForTimeout(300);
}

async function addPage(page: Page): Promise<void> {
  const before = await tabs(page).count();
  await page.locator('#page-add').click();
  await expect(tabs(page)).toHaveCount(before + 1);
}

test('the strip is always there, with one page called Page 1', async ({ page }) => {
  await page.goto('/');
  await openLumenRelay(page);
  await expect(page.locator('#page-tabs')).toHaveAttribute('role', 'tablist');
  await expect(tabs(page)).toHaveCount(1);
  await expect(tabs(page).first()).toHaveText('Page 1');
  await expect(tabs(page).first()).toHaveAttribute('aria-selected', 'true');
});

test('adding a page opens a blank one, and each page keeps its own components', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/');
  await openLumenRelay(page);
  const firstCount = await nodes(page).count();
  expect(firstCount).toBeGreaterThan(0);

  await addPage(page);
  await expect(tabs(page).nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(tabs(page).nth(1)).toHaveText('Page 2');
  await expect(nodes(page)).toHaveCount(0);

  await runPaletteCommand(page, 'Add Service / API Stencil');
  await expect(nodes(page)).toHaveCount(1);

  await tabs(page).first().click();
  await expect(nodes(page)).toHaveCount(firstCount);
  await tabs(page).nth(1).click();
  await expect(nodes(page)).toHaveCount(1);
});

test('Alt+PageDown and Alt+PageUp change page, and the change is announced', async ({ page }) => {
  await page.goto('/');
  await openLumenRelay(page);
  await addPage(page);
  await clearSelection(page);
  await page.keyboard.press('Alt+PageUp');
  await expect(tabs(page).first()).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#sr-announcer, [aria-live="polite"]').filter({ hasText: 'Page Page 1, 1 of 2' }).first()).toBeAttached();
  await page.keyboard.press('Alt+PageDown');
  await expect(tabs(page).nth(1)).toHaveAttribute('aria-selected', 'true');
  // It wraps around.
  await page.keyboard.press('Alt+PageDown');
  await expect(tabs(page).first()).toHaveAttribute('aria-selected', 'true');
});

test('arrow keys move between tabs, and only the open tab is a tab stop', async ({ page }) => {
  await page.goto('/');
  await openLumenRelay(page);
  await addPage(page);
  await addPage(page);
  await expect(tabs(page).nth(2)).toHaveAttribute('tabindex', '0');
  await expect(tabs(page).nth(0)).toHaveAttribute('tabindex', '-1');
  await tabs(page).nth(2).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(tabs(page).nth(1)).toBeFocused();
  await expect(tabs(page).nth(1)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Home');
  await expect(tabs(page).nth(0)).toBeFocused();
  await page.keyboard.press('End');
  await expect(tabs(page).nth(2)).toBeFocused();
});

test('double-click renames a page, and F2 does too', async ({ page }) => {
  await page.goto('/');
  await openLumenRelay(page);
  await addPage(page);
  await warmStrip(page);

  await tabs(page).nth(1).dblclick();
  const input = page.locator('.inline-edit-input');
  await expect(input).toBeVisible();
  await input.fill('Data layer');
  await page.keyboard.press('Enter');
  await expect(tabs(page).nth(1)).toHaveText('Data layer');

  await tabs(page).nth(0).focus();
  await page.keyboard.press('F2');
  await expect(input).toBeVisible();
  await input.fill('Overview');
  await page.keyboard.press('Enter');
  await expect(tabs(page).nth(0)).toHaveText('Overview');

  // One undo step each.
  await page.keyboard.press('ControlOrMeta+z');
  await expect(tabs(page).nth(0)).toHaveText('Page 1');
});

test('the menu moves, duplicates and deletes; delete has Undo and the last page cannot be deleted', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/');
  await openLumenRelay(page);
  const firstCount = await nodes(page).count();
  await addPage(page);
  await warmStrip(page);

  // Move the second page left: it becomes the first tab and keeps its (empty) content.
  await tabs(page).nth(1).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Move left' }).click();
  await expect(tabs(page).nth(0)).toHaveText('Page 2');
  await expect(tabs(page).nth(1)).toHaveText('Page 1');
  await expect(nodes(page)).toHaveCount(0);

  // Duplicate the page that holds Lumen Relay.
  await tabs(page).nth(1).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Duplicate' }).click();
  await expect(tabs(page)).toHaveCount(3);
  await expect(tabs(page).nth(2)).toHaveText('Page 1 copy');
  await expect(nodes(page)).toHaveCount(firstCount);

  // Delete the copy; a toast offers Undo.
  await tabs(page).nth(2).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await expect(tabs(page)).toHaveCount(2);
  await expect(page.locator('#toast-container')).toContainText('Deleted page "Page 1 copy"');
  await page.locator('#toast-container').getByRole('button', { name: 'Undo' }).last().click();
  await expect(tabs(page)).toHaveCount(3);
  await expect(tabs(page).nth(2)).toHaveText('Page 1 copy');

  // With one page left, Delete is not offered.
  for (const _ of [0, 1]) {
    await tabs(page).last().click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Delete' }).click();
  }
  await expect(tabs(page)).toHaveCount(1);
  await tabs(page).first().click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Delete' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await runPaletteCommand(page, 'Delete page');
  await expect(tabs(page)).toHaveCount(1);
  await expect(page.locator('#toast-container')).toContainText('at least one page');
});

test('tabs reorder by dragging', async ({ page }) => {
  await page.goto('/');
  await openLumenRelay(page);
  await addPage(page);
  await warmStrip(page);
  await tabs(page).nth(1).dragTo(tabs(page).nth(0));
  await expect(tabs(page).nth(0)).toHaveText('Page 2');
  await expect(tabs(page).nth(1)).toHaveText('Page 1');
});

test('undoing a change made on another page opens that page first', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/');
  await openLumenRelay(page);
  await addPage(page);
  await runPaletteCommand(page, 'Add Service / API Stencil');
  await expect(nodes(page)).toHaveCount(1);

  await tabs(page).first().click();
  await expect(tabs(page).first()).toHaveAttribute('aria-selected', 'true');
  await clearSelection(page);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(tabs(page).nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(nodes(page)).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(nodes(page)).toHaveCount(1);
});

test('switching clears the selection and keeps each page\'s zoom', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/');
  await openLumenRelay(page);
  await nodes(page).first().locator('.node-select-hit').click();
  await expect(page.locator('.node-select-hit[aria-pressed="true"]')).toHaveCount(1);
  await page.locator('#btn-zoom-in').click();
  await page.locator('#btn-zoom-in').click();
  const zoom = await page.locator('#zoom-readout').textContent();

  await addPage(page);
  await expect(page.locator('#zoom-readout')).not.toHaveText(zoom ?? '');
  await tabs(page).first().click();
  await expect(page.locator('#zoom-readout')).toHaveText(zoom ?? '');
  await expect(page.locator('.node-select-hit[aria-pressed="true"]')).toHaveCount(0);
});

test('a page file survives a reload and the Blueprint file', async ({ page }) => {
  await page.goto('/');
  await openLumenRelay(page);
  await addPage(page);
  await runPaletteCommand(page, 'Add Service / API Stencil');
  await warmStrip(page);
  await tabs(page).nth(1).dblclick();
  await page.locator('.inline-edit-input').fill('Extras');
  await page.keyboard.press('Enter');
  await expect(tabs(page).nth(1)).toHaveText('Extras');
  // Autosave runs after a short pause.
  await expect(page.locator('#save-status-pill')).toHaveAttribute('data-status', 'saved');
  await page.reload();
  await page.locator('#btn-restore-open').click();
  await expect(tabs(page)).toHaveCount(2);
  await expect(tabs(page).nth(1)).toHaveText('Extras');
  await tabs(page).nth(1).click();
  await expect(nodes(page)).toHaveCount(1);
});

test('a component on the second page still opens as a level', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/');
  await openLumenRelay(page);
  await addPage(page);
  await runPaletteCommand(page, 'Add Service / API Stencil');
  await nodes(page).first().locator('.node-select-hit').click();
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(page.locator('#level-breadcrumb')).toBeVisible();
  await runPaletteCommand(page, 'Add Service / API Stencil');
  await expect(nodes(page)).toHaveCount(1);
  await page.keyboard.press('ControlOrMeta+ArrowUp');
  await expect(page.locator('#level-breadcrumb')).toBeHidden();
  await expect(nodes(page)).toHaveCount(1);
  await expect(nodes(page).first().locator('.node-level-badge')).toHaveAttribute('data-has-child', 'true');
  // The first page is untouched.
  await tabs(page).first().click();
  await expect(nodes(page).first().locator('.node-level-badge')).not.toHaveAttribute('data-has-child', 'true');
});

for (const scheme of ['light', 'dark'] as const) {
  test(`three pages have no axe violations (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/');
    await openLumenRelay(page);
    await addPage(page);
    await addPage(page);
    await clearSelection(page);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });
}
