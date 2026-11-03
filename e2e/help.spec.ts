import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { clearSelection, openLumenRelay, runPaletteCommand } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/?ui=2');
  await openLumenRelay(page);
  await expect(page.locator('.arch-node').first()).toBeVisible();
});

const popover = (page: Page) => page.locator('#help-popover');

/** Reach the button by keyboard alone, open it with Enter, check the popover, close it with Esc. */
async function checkHelpButton(page: Page, button: Locator, title: RegExp): Promise<void> {
  await button.focus();
  await expect(button).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(popover(page)).toBeVisible();
  await expect(popover(page)).toBeFocused();
  await expect(popover(page).locator('h2')).toHaveText(title);
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  const link = popover(page).locator('a');
  await expect(link).toHaveAttribute('href', /github\.com\/.+\/docs\/guide\.md#[a-z-]+$/);
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).include('#help-popover').analyze();
  expect(results.violations).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(popover(page)).toBeHidden();
  await expect(button).toBeFocused();
  await expect(button).toHaveAttribute('aria-expanded', 'false');
}

test('every inspector section has a ? that works from the keyboard and closes with Esc', async ({ page }) => {
  await page.locator('.arch-node').first().click();
  const sections = page.locator('#prop-form-container .prop-section-wrap > .help-btn');
  await expect(sections).toHaveCount(5);
  await checkHelpButton(page, sections.first(), /Component fields/);
  for (let i = 1; i < 5; i += 1) await checkHelpButton(page, sections.nth(i), /./);
});

test('wire fields, routing and the legend each have a ?', async ({ page }) => {
  await page.locator('.conduit-group').first().locator('.conduit-hit, .conduit-stream').first().click({ force: true });
  await expect(page.locator('#prop-edge-label')).toBeVisible();
  await checkHelpButton(page, page.locator('#prop-form-container [data-help="wire-fields"]'), /Wire fields/);
  await checkHelpButton(page, page.locator('#prop-form-container [data-help="routing"]'), /Routing styles/);
  await clearSelection(page);
  // With nothing selected the inspector stays collapsed until it is asked for.
  const legend = page.locator('#prop-form-container [data-help="legend"]');
  if (!(await legend.isVisible())) await runPaletteCommand(page, 'Toggle Properties Inspector');
  await checkHelpButton(page, legend, /Legend and tags/);
});

test('the run bar, failure summary and Review panel each have a ?', async ({ page }) => {
  await page.keyboard.press('2');
  await checkHelpButton(page, page.locator('#run-bar .help-btn'), /Traffic and scenarios/);

  await page.locator('.arch-node').first().click();
  await page.keyboard.press('x');
  await expect(page.locator('#chaos-panel')).toBeVisible();
  await checkHelpButton(page, page.locator('#chaos-panel .help-btn'), /Failing components/);

  await page.keyboard.press('3');
  await expect(page.locator('#insights-panel')).toBeVisible();
  await checkHelpButton(page, page.locator('#insights-panel .help-btn'), /Review and insights/);
});

test('"help: routing styles" in the palette opens the same text', async ({ page }) => {
  await runPaletteCommand(page, 'help: routing styles');
  await expect(popover(page)).toBeVisible();
  await expect(popover(page).locator('h2')).toHaveText('Routing styles');
  await page.keyboard.press('Escape');
  await expect(popover(page)).toBeHidden();
});

test('a click elsewhere closes the popover', async ({ page }) => {
  await runPaletteCommand(page, 'help: lenses');
  await expect(popover(page)).toBeVisible();
  await page.locator('#canvas-viewport').click({ position: { x: 5, y: 5 } });
  await expect(popover(page)).toBeHidden();
});
