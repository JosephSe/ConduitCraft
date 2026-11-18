import { expect, test, type Page } from '@playwright/test';
import { openLumenRelay } from './helpers';

async function open(page: Page, query = '') {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto(`/${query}`);
  await openLumenRelay(page);
  await expect(page.locator('.arch-node').first()).toBeVisible();
}

test('the run bar appears in the Traffic lens and drives a scenario', { tag: '@quick' }, async ({ page }) => {
  await open(page);
  const bar = page.locator('#run-bar');
  await expect(bar).toBeHidden();
  await page.keyboard.press('2');
  await expect(bar).toBeVisible();

  const select = page.locator('#run-bar-scenario');
  const first = await select.locator('option:not([value=""])').first().getAttribute('value');
  expect(first, 'the showcase has a scenario').toBeTruthy();
  await select.selectOption(first!);

  await expect(page.locator('#run-bar-step')).toHaveText(/step \d+\/\d+/);
  await page.locator('#run-bar-play').click(); // pause
  await expect(page.locator('#run-bar-play')).toHaveAttribute('aria-pressed', 'false');
  const before = await page.locator('#run-bar-scrubber').inputValue();
  await page.locator('[data-run-step="1"]').click();
  await expect(page.locator('#run-bar-scrubber')).not.toHaveValue(before);

  await page.keyboard.press('1');
  await expect(bar).toBeHidden();
});


for (const [key, lens] of [['1', 'Design'], ['3', 'Review']] as const) {
  test(`leaving Traffic for ${lens} takes the hop label and highlights off the canvas`, async ({ page }) => {
    await open(page);
    await page.keyboard.press('2');
    const select = page.locator('#run-bar-scenario');
    const first = await select.locator('option:not([value=""])').first().getAttribute('value');
    await select.selectOption(first!);
    const packet = page.locator('#sim-packet');
    await expect(packet).toBeVisible();

    await page.keyboard.press(key);
    await expect(packet).toBeHidden();
    await expect(page.locator('.arch-node[data-sim-active="true"]')).toHaveCount(0);

    // Coming back to Traffic starts clean: no run is loaded.
    await page.keyboard.press('2');
    await expect(packet).toBeHidden();
    await expect(page.locator('#run-bar-step')).toHaveText(/no run|held/);
  });
}
