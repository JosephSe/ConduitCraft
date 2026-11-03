import { expect, test, type Page } from '@playwright/test';

async function open(page: Page, query: string) {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto(`/${query}`);
  await page.locator('#btn-empty-showcase').click();
  await expect(page.locator('.arch-node').first()).toBeVisible();
}

test('?ui=2: the run bar appears in the Traffic lens and drives a scenario', async ({ page }) => {
  await open(page, '?ui=2');
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

test('the classic interface has no run bar', async ({ page }) => {
  await open(page, '?ui=1');
  await page.locator('input[name="workspace-mode"][value="data"]').evaluate((el: HTMLElement) => el.click());
  await expect(page.locator('#run-bar')).toBeHidden();
});
