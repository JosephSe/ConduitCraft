import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { clearSelection, openLumenRelay, runPaletteCommand } from './helpers';

const nodes = (page: Page) => page.locator('.arch-node');
const crumb = (page: Page) => page.locator('#btn-page-menu');
const crumbLabel = (page: Page) => page.locator('#btn-page-menu .nw-crumb-label');
const pageCrumb = (page: Page) => page.locator('#nw-breadcrumb [data-crumb="page"]');
const menuRows = (page: Page) => page.locator('#page-menu .page-menu-page');

async function openPagesMenu(page: Page): Promise<void> {
  if ((await page.locator('#page-menu').count()) === 0) {
    await crumb(page).click();
  }
  await expect(page.locator('#page-menu')).toBeVisible();
}

async function switchToPage(page: Page, index: number): Promise<void> {
  await openPagesMenu(page);
  await menuRows(page).nth(index).click();
  await expect(page.locator('#page-menu')).toHaveCount(0);
}

async function addPage(page: Page): Promise<void> {
  await openPagesMenu(page);
  await page.locator('#page-menu').getByRole('menuitem', { name: 'Add page' }).click();
  await expect(page.locator('#page-menu')).toHaveCount(0);
}

test('the breadcrumb shows Page 1, and its menu lists pages with Add', async ({ page }) => {
  await page.goto('/');
  await openLumenRelay(page);
  await expect(crumbLabel(page)).toHaveText('Page 1');
  await expect(crumb(page)).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('#page-strip')).toHaveCount(0);

  await openPagesMenu(page);
  await expect(menuRows(page)).toHaveCount(1);
  await expect(menuRows(page).first()).toContainText('Page 1');
  await expect(menuRows(page).first()).toHaveAttribute('aria-current', 'true');
  await page.keyboard.press('Escape');
  await expect(page.locator('#page-menu')).toHaveCount(0);
});

test('adding a page opens a blank one, and each page keeps its own components', { tag: '@quick' }, async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/');
  await openLumenRelay(page);
  const firstCount = await nodes(page).count();
  expect(firstCount).toBeGreaterThan(0);

  await addPage(page);
  await expect(crumbLabel(page)).toHaveText('Page 2');
  await expect(nodes(page)).toHaveCount(0);

  await runPaletteCommand(page, 'Add Service / API Stencil');
  await expect(nodes(page)).toHaveCount(1);

  await switchToPage(page, 0);
  await expect(crumbLabel(page)).toHaveText('Page 1');
  await expect(nodes(page)).toHaveCount(firstCount);
  await switchToPage(page, 1);
  await expect(nodes(page)).toHaveCount(1);
});

test('Alt+PageDown and Alt+PageUp change page, and the change is announced', async ({ page }) => {
  await page.goto('/');
  await openLumenRelay(page);
  await addPage(page);
  await clearSelection(page);
  await page.keyboard.press('Alt+PageUp');
  await expect(crumbLabel(page)).toHaveText('Page 1');
  await expect(page.locator('#sr-announcer, [aria-live="polite"]').filter({ hasText: 'Page Page 1, 1 of 2' }).first()).toBeAttached();
  await page.keyboard.press('Alt+PageDown');
  await expect(crumbLabel(page)).toHaveText('Page 2');
  // It wraps around.
  await page.keyboard.press('Alt+PageDown');
  await expect(crumbLabel(page)).toHaveText('Page 1');
});

test('arrow keys navigate the page menu and Escape returns focus to the breadcrumb', async ({ page }) => {
  await page.goto('/');
  await openLumenRelay(page);
  await addPage(page);
  await addPage(page);

  await openPagesMenu(page);
  await expect(menuRows(page)).toHaveCount(3);
  await expect(menuRows(page).nth(2)).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(menuRows(page).nth(1)).toBeFocused();
  await page.keyboard.press('Home');
  await expect(menuRows(page).nth(0)).toBeFocused();
  await page.keyboard.press('End');
  await expect(page.locator('#page-menu [role="menuitem"]').last()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#page-menu')).toHaveCount(0);
  await expect(crumb(page)).toBeFocused();
});

test('double-click renames the active page crumb, and F2 does too', async ({ page }) => {
  await page.goto('/');
  await openLumenRelay(page);
  await addPage(page);
  await page.locator('#nw-breadcrumb').hover();
  await page.waitForTimeout(200);

  await pageCrumb(page).dblclick();
  const input = page.locator('.inline-edit-input');
  await expect(input).toBeVisible();
  await input.fill('Data layer');
  await page.keyboard.press('Enter');
  await expect(crumbLabel(page)).toHaveText('Data layer');

  await switchToPage(page, 0);
  await crumb(page).focus();
  await page.keyboard.press('F2');
  await expect(input).toBeVisible();
  await input.fill('Overview');
  await page.keyboard.press('Enter');
  await expect(crumbLabel(page)).toHaveText('Overview');

  // One undo step.
  await page.keyboard.press('ControlOrMeta+z');
  await expect(crumbLabel(page)).toHaveText('Page 1');
});

test('the menu moves, duplicates and deletes; delete has Undo and the last page cannot be deleted', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/');
  await openLumenRelay(page);
  const firstCount = await nodes(page).count();
  await addPage(page);

  // Move Page 2 up: it becomes the first page and keeps its empty content.
  await openPagesMenu(page);
  await page.locator('#page-menu').getByRole('menuitem', { name: 'Move up' }).click();
  await expect(crumbLabel(page)).toHaveText('Page 2');
  await expect(nodes(page)).toHaveCount(0);

  // Switch to Page 1 (now index 1) and duplicate it.
  await switchToPage(page, 1);
  await expect(crumbLabel(page)).toHaveText('Page 1');
  await openPagesMenu(page);
  await page.locator('#page-menu').getByRole('menuitem', { name: 'Duplicate page' }).click();
  await expect(crumbLabel(page)).toHaveText('Page 1 copy');
  await expect(nodes(page)).toHaveCount(firstCount);

  // Delete the copy; a toast offers Undo.
  await openPagesMenu(page);
  await page.locator('#page-menu').getByRole('menuitem', { name: 'Delete page' }).click();
  await expect(page.locator('#toast-container')).toContainText('Deleted page "Page 1 copy"');
  await page.locator('#toast-container').getByRole('button', { name: 'Undo' }).last().click();
  await expect(crumbLabel(page)).toHaveText('Page 1 copy');

  // Remove two pages down to one; Delete is not offered on the last page.
  for (const _ of [0, 1]) {
    await openPagesMenu(page);
    await page.locator('#page-menu').getByRole('menuitem', { name: 'Delete page' }).click();
  }
  await openPagesMenu(page);
  await expect(menuRows(page)).toHaveCount(1);
  await expect(page.locator('#page-menu').getByRole('menuitem', { name: 'Delete page' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await runPaletteCommand(page, 'Delete page');
  await expect(page.locator('#toast-container')).toContainText('at least one page');
});

test('pages reorder by dragging inside the page menu', async ({ page }) => {
  await page.goto('/');
  await openLumenRelay(page);
  await addPage(page);
  await openPagesMenu(page);
  await expect(menuRows(page)).toHaveCount(2);
  await menuRows(page).nth(1).dragTo(menuRows(page).nth(0));
  await expect(menuRows(page).nth(0)).toContainText('Page 2');
  await expect(menuRows(page).nth(1)).toContainText('Page 1');
});

test('undoing a change made on another page opens that page first', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/');
  await openLumenRelay(page);
  await addPage(page);
  await runPaletteCommand(page, 'Add Service / API Stencil');
  await expect(nodes(page)).toHaveCount(1);

  await switchToPage(page, 0);
  await clearSelection(page);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(crumbLabel(page)).toHaveText('Page 2');
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
  await switchToPage(page, 0);
  await expect(page.locator('#zoom-readout')).toHaveText(zoom ?? '');
  await expect(page.locator('.node-select-hit[aria-pressed="true"]')).toHaveCount(0);
});

test('a page file survives a reload and the Blueprint file', async ({ page }) => {
  await page.goto('/');
  await openLumenRelay(page);
  await addPage(page);
  await runPaletteCommand(page, 'Add Service / API Stencil');
  await pageCrumb(page).dblclick();
  await page.locator('.inline-edit-input').fill('Extras');
  await page.keyboard.press('Enter');
  await expect(crumbLabel(page)).toHaveText('Extras');
  // Autosave runs after a short pause.
  await expect(page.locator('#save-status-pill')).toHaveAttribute('data-status', 'saved');
  await page.reload();
  await page.locator('#btn-restore-open').click();
  await openPagesMenu(page);
  await expect(menuRows(page)).toHaveCount(2);
  await expect(menuRows(page).nth(1)).toContainText('Extras');
  await menuRows(page).nth(1).click();
  await expect(nodes(page)).toHaveCount(1);
});

test('a component on the second page still opens as a level inside the NW breadcrumb', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/');
  await openLumenRelay(page);
  await addPage(page);
  await runPaletteCommand(page, 'Add Service / API Stencil');
  await nodes(page).first().locator('.node-select-hit').click();
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(page.locator('#nw-breadcrumb')).toHaveAttribute('data-nested', 'true');
  await expect(page.locator('#nw-breadcrumb .level-crumb')).toHaveCount(2);
  await runPaletteCommand(page, 'Add Service / API Stencil');
  await expect(nodes(page)).toHaveCount(1);
  await page.keyboard.press('ControlOrMeta+ArrowUp');
  await expect(page.locator('#nw-breadcrumb')).not.toHaveAttribute('data-nested', 'true');
  await expect(nodes(page)).toHaveCount(1);
  await expect(nodes(page).first().locator('.node-level-badge')).toHaveAttribute('data-has-child', 'true');
  // The first page is untouched.
  await switchToPage(page, 0);
  await expect(nodes(page).first().locator('.node-level-badge')).not.toHaveAttribute('data-has-child', 'true');
});

test('three pages and the page menu have no axe violations', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await openLumenRelay(page);
  await addPage(page);
  await addPage(page);
  await clearSelection(page);
  await openPagesMenu(page);
  const results = await new AxeBuilder({ page })
    .include('#doc-brand-cluster')
    .include('#page-menu')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
});

// ---------------------------------------------------------------------------------------------------------------
// Pages everywhere else (P1b)
// ---------------------------------------------------------------------------------------------------------------
const mod = process.platform === 'darwin' ? 'Meta' : 'Control';

test('the outline lists the pages and opens one', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/');
  await openLumenRelay(page);
  await addPage(page);
  await switchToPage(page, 0);
  await runPaletteCommand(page, 'Toggle Text Outline');
  const rows = page.locator('#outline-tree .outline-row[data-kind="page"]');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('open');
  await rows.nth(1).click();
  await expect(crumbLabel(page)).toHaveText('Page 2');
  await expect(rows.nth(1)).toContainText('open');
});

test('Review counts the other pages and jumps to one', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/');
  await openLumenRelay(page);
  await addPage(page);
  // The new page gets an unconnected component, which the Review rules flag.
  await runPaletteCommand(page, 'Add Service / API Stencil');
  await runPaletteCommand(page, 'Add Service / API Stencil');
  await switchToPage(page, 0);
  await clearSelection(page);
  await page.keyboard.press('3');
  const jump = page.locator('#insights-body .insight-page-jump');
  await expect(jump).toHaveCount(1);
  await expect(jump).toContainText('Page 2');
  await expect(page.locator('#insights-heading')).toContainText('on this page');
  await jump.click();
  await expect(crumbLabel(page)).toHaveText('Page 2');
});

test('find and replace can search every page', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/');
  await openLumenRelay(page);
  await addPage(page);
  await runPaletteCommand(page, 'Add Service / API Stencil');
  await switchToPage(page, 0);
  await clearSelection(page);
  await page.keyboard.press('ControlOrMeta+Shift+f');
  const dialog = page.locator('#find-replace-dialog');
  await expect(dialog.locator('#fr-pages-scope')).toBeVisible();
  await dialog.locator('#fr-find').fill('Service API 1');
  await expect(dialog.locator('#fr-status')).toContainText('No matches');
  await dialog.getByLabel('All pages').check();
  await expect(dialog.locator('#fr-status')).toContainText(/match/);
  await expect(dialog.locator('.find-replace-where').first()).toContainText('Page 2');
  await dialog.locator('#fr-replace').fill('Billing API');
  await dialog.getByRole('button', { name: 'Replace all' }).click();
  await expect(dialog.locator('#fr-status')).toContainText('Replaced');
  await page.keyboard.press('Escape');
  await switchToPage(page, 1);
  await expect(page.locator('.arch-node .node-title', { hasText: 'Billing API' })).toBeVisible();
  // One undo step puts it back.
  await clearSelection(page);
  await page.keyboard.press('ControlOrMeta+z');
  // Undo goes back to the page where Replace all was run; the change it undoes is on page 2.
  await expect(crumbLabel(page)).toHaveText('Page 1');
  await switchToPage(page, 1);
  await expect(page.locator('.arch-node .node-title', { hasText: 'Service API 1' })).toBeVisible();
});

test('the export dialog offers every page as a zip only when there are several', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/');
  await openLumenRelay(page);
  await runPaletteCommand(page, 'Export Diagram Modal');
  await expect(page.locator('#btn-export-svg-pages')).toBeHidden();
  await page.keyboard.press('Escape');
  await addPage(page);
  await runPaletteCommand(page, 'Export Diagram Modal');
  await expect(page.locator('#btn-export-svg-pages')).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#btn-export-svg-pages').click()]);
  expect(download.suggestedFilename()).toMatch(/-pages\.zip$/);
});

test('components copied on one page paste onto another', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/');
  await openLumenRelay(page);
  const hits = page.locator('.arch-node .node-select-hit');
  await hits.nth(0).click();
  await hits.nth(1).click({ modifiers: ['Shift'] });
  await page.keyboard.press(`${mod}+c`);
  await page.keyboard.press('Escape');
  await expect(page.locator('.context-toolbar')).toBeHidden();
  await addPage(page);
  await expect(nodes(page)).toHaveCount(0);
  await page.locator('#canvas-viewport').click({ position: { x: 4, y: 4 } });
  await page.keyboard.press(`${mod}+v`);
  await expect(nodes(page)).toHaveCount(2);
  // The first page is unchanged.
  await switchToPage(page, 0);
  expect(await nodes(page).count()).toBeGreaterThan(2);
});
