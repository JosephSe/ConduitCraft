import { expect, test } from '@playwright/test';
import { runPaletteCommand } from './helpers';

test('a component opens as a level, edits stay inside it, and undo returns to it', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/?ui=2');
  await page.locator('#btn-empty-showcase').click();
  const nodes = page.locator('.arch-node');
  await expect(nodes.first()).toBeVisible();
  const rootCount = await nodes.count();
  const rootTitle = (await nodes.first().locator('.node-title').textContent()) ?? '';

  // Open the first component from its badge: an empty level, with a breadcrumb and no root components.
  await nodes.first().hover();
  await nodes.first().locator('.node-level-badge').click();
  await expect(page.locator('#level-breadcrumb')).toBeVisible();
  await expect(page.locator('#level-breadcrumb .level-crumb')).toHaveCount(2);
  await expect(page.locator('#level-breadcrumb .level-crumb').last()).toHaveText(rootTitle);
  await expect(nodes).toHaveCount(0);

  // Add a component inside, then go up with the keyboard.
  await runPaletteCommand(page, 'Add Service / API Stencil');
  await expect(nodes).toHaveCount(1);
  await page.keyboard.press('ControlOrMeta+ArrowUp');
  await expect(page.locator('#level-breadcrumb')).toBeHidden();
  await expect(nodes).toHaveCount(rootCount);
  await expect(nodes.first().locator('.node-level-badge')).toHaveAttribute('data-has-child', 'true');

  // The new component lives in the level, so reopening shows it.
  // Reopen with the shortcut, and Escape (nothing selected) goes back up.
  await nodes.first().locator('.node-select-hit').click();
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(page.locator('#level-breadcrumb')).toBeVisible();
  await expect(nodes).toHaveCount(1);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.locator('#level-breadcrumb')).toBeHidden();

  // Undo returns to the level the edit was made in.
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('#level-breadcrumb')).toBeVisible();
  await expect(nodes).toHaveCount(0);
});
