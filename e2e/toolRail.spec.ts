import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { openLumenRelay } from './helpers';

async function open(page: Page, query = '') {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto(`/${query}`);
  await openLumenRelay(page);
  await expect(page.locator('.arch-node').first()).toBeVisible();
}

const tool = (page: Page, name: string) => page.locator(`[data-rail-tool="${name}"]`);

test('starts with the component list folded into a rail that has Select and Wire tools', async ({ page }) => {
  await open(page);
  await expect(page.locator('#workspace')).toHaveAttribute('data-palette-collapsed', 'true');
  await expect(tool(page, 'select')).toHaveAttribute('aria-pressed', 'true');
  await expect(tool(page, 'connect')).toHaveAttribute('aria-pressed', 'false');
});

test('clicking Wire switches the tool and the pressed state follows it', async ({ page }) => {
  await open(page);
  await tool(page, 'connect').click();
  await expect(page.locator('#workspace')).toHaveAttribute('data-tool', 'connect');
  await expect(tool(page, 'connect')).toHaveAttribute('aria-pressed', 'true');
  await expect(tool(page, 'select')).toHaveAttribute('aria-pressed', 'false');
});

test('V and W switch tools, Z and N add a swimlane and a note, C opens the component list', async ({ page }) => {
  await open(page);
  await page.locator('#canvas-viewport').click({ position: { x: 4, y: 4 } });

  await page.keyboard.press('w');
  await expect(page.locator('#workspace')).toHaveAttribute('data-tool', 'connect');
  await expect(tool(page, 'connect')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('v');
  await expect(page.locator('#workspace')).toHaveAttribute('data-tool', 'select');

  const zones = await page.locator('.zone-banner').count();
  await page.keyboard.press('z');
  await expect(page.locator('.zone-banner')).toHaveCount(zones + 1);

  const notes = await page.locator('.blueprint-spec').count();
  await page.keyboard.press('n');
  await expect(page.locator('.blueprint-spec')).toHaveCount(notes + 1);

  await page.keyboard.press('c');
  await expect(page.locator('#workspace')).not.toHaveAttribute('data-palette-collapsed', 'true');
});

test('tool letters do nothing while typing', async ({ page }) => {
  await open(page);
  await page.locator('#btn-focus-doc-title').click();
  const field = page.locator('#prop-doc-title');
  await expect(field).toBeVisible();
  await field.focus();
  await page.keyboard.type('wvz');
  await expect(page.locator('#workspace')).toHaveAttribute('data-tool', 'select');
  await expect(field).toHaveValue(/wvz$/);
});

for (const scheme of ['light', 'dark'] as const) {
  test(`the rail has no axe violations (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await open(page);
    const results = await new AxeBuilder({ page })
      .include('#palette-sidebar')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
}

test('clicking a component on the collapsed rail adds exactly one', async ({ page }) => {
  await open(page);
  const before = await page.locator('.arch-node').count();
  await page.locator('.rail-stencil-btn[data-stencil-kind="service"]').click();
  await expect(page.locator('.arch-node')).toHaveCount(before + 1);
  await page.waitForTimeout(300);
  await expect(page.locator('.arch-node')).toHaveCount(before + 1);
});

test('all five tools stay visible and work with the palette expanded', async ({ page }) => {
  await open(page);
  await page.locator('#btn-rail-expand-palette').click();
  await expect(page.locator('#stencil-grid')).toBeVisible();
  for (const name of ['select', 'connect', 'hand', 'text', 'frame']) await expect(tool(page, name)).toBeVisible();
  await tool(page, 'frame').click();
  await expect(page.locator('#workspace')).toHaveAttribute('data-tool', 'frame');
  await expect(tool(page, 'frame')).toHaveAttribute('aria-pressed', 'true');
});

test('expanding the palette shows only the tools from the rail, not its component icons', async ({ page }) => {
  await open(page);
  await page.locator('#btn-rail-expand-palette').click();
  await expect(page.locator('.rail-stencil-btn').first()).toBeHidden();
  await expect(page.locator('#btn-rail-expand-palette')).toBeHidden();
});

test('the last rail buttons can be reached on a short window', async ({ page }) => {
  await open(page);
  await page.setViewportSize({ width: 1440, height: 700 });
  const note = page.locator('.rail-stencil-btn[data-stencil-kind="notes"]');
  await expect(note).not.toBeInViewport();
  // The mouse wheel, because Playwright's own click can scroll a box that a person could not.
  await page.locator('.rail-tool-btn[data-rail-tool="frame"]').hover();
  await page.mouse.wheel(0, 2000);
  await expect(note).toBeInViewport();
  const before = await page.locator('.blueprint-spec').count();
  await note.click();
  await expect(page.locator('.blueprint-spec')).toHaveCount(before + 1);
});

test('Stage Containers offers Frame and Text, and they pick the same tools as the rail', async ({ page }) => {
  await open(page);
  await page.locator('#btn-rail-expand-palette').click();
  await page.locator('#btn-add-frame').click();
  await expect(page.locator('#workspace')).toHaveAttribute('data-tool', 'frame');
  await expect(page.locator('#btn-add-frame')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#btn-add-text').click();
  await expect(page.locator('#workspace')).toHaveAttribute('data-tool', 'text');
  await expect(page.locator('#btn-add-frame')).toHaveAttribute('aria-pressed', 'false');
});
