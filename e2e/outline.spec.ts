import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { clearSelection, openLumenRelay, runPaletteCommand } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/');
  await openLumenRelay(page);
  await expect(page.locator('.arch-node').first()).toBeVisible();
});

test('passes axe with the outline open in all four lenses', async ({ page }) => {
  await runPaletteCommand(page, 'Toggle Text Outline');
  const panel = page.locator('#outline-panel');
  await expect(panel).toBeVisible();
  for (const key of ['1', '2', '3', '4']) {
    await page.locator('#canvas-viewport').focus();
    await page.keyboard.press(key);
    await expect(panel).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).include('#outline-panel').analyze();
    expect(results.violations).toEqual([]);
  }
});

test('reaches a component by keyboard alone and selects it', async ({ page }) => {
  await clearSelection(page);
  await runPaletteCommand(page, 'Toggle Text Outline');
  const tree = page.locator('#outline-tree');
  // The tree is one tab stop, and opening it puts focus on that row.
  await expect(tree.locator('[role="treeitem"][tabindex="0"]')).toHaveCount(1);
  await expect(tree.locator('[role="treeitem"]:focus')).toHaveCount(1);
  await expect(page.locator('.arch-node .node-select-hit[aria-pressed="true"]')).toHaveCount(0);

  // Down to the first component (swimlane rows start open), then Enter selects it.
  await page.keyboard.press('ArrowDown');
  const row = tree.locator('[role="treeitem"]:focus');
  await expect(row).toHaveAttribute('data-kind', 'component');
  const title = ((await row.locator('.outline-label').textContent()) ?? '').split(',')[0];
  await page.keyboard.press('Enter');
  await expect(page.locator('.arch-node .node-select-hit[aria-pressed="true"]')).toHaveCount(1);
  await expect(page.locator('.arch-node:has(.node-select-hit[aria-pressed="true"]) .node-title')).toHaveText(title);

  // Right opens the component's wires; Left closes them again.
  await page.keyboard.press('ArrowRight');
  await expect(tree.locator('[role="treeitem"]:focus')).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('ArrowLeft');
  await expect(tree.locator('[role="treeitem"]:focus')).toHaveAttribute('aria-expanded', 'false');

  // Escape closes the panel.
  await page.keyboard.press('Escape');
  await expect(page.locator('#outline-panel')).toBeHidden();
});

test('a level row opens that level with Enter', async ({ page }) => {
  const nodes = page.locator('.arch-node');
  const parentTitle = ((await nodes.first().locator('.node-title').textContent()) ?? '').trim();
  await nodes.first().hover();
  await nodes.first().locator('.node-level-badge').click();
  await runPaletteCommand(page, 'Add Service / API Stencil');
  await page.keyboard.press('ControlOrMeta+ArrowUp');
  await expect(page.locator('#level-breadcrumb')).toBeHidden();

  await runPaletteCommand(page, 'Toggle Text Outline');
  const tree = page.locator('#outline-tree');
  // Open the component that holds the level, then step to its level row.
  await tree.locator('[role="treeitem"][data-kind="component"]', { hasText: parentTitle }).first().focus();
  await page.keyboard.press('ArrowRight');
  const level = tree.locator('[role="treeitem"][data-kind="level"]').first();
  await expect(level).toHaveCount(1);
  await level.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#level-breadcrumb')).toBeVisible();
});
