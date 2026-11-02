import { expect, test } from '@playwright/test';

test('keys 1 and 2 switch lens in the redesigned interface and 3 does nothing yet', async ({ page }) => {
  await page.goto('/?ui=2');
  await page.locator('#stage-world').waitFor({ state: 'attached' });
  const mode = () => page.locator('#workspace').getAttribute('data-mode');
  expect(await mode()).toBe('design');
  await page.keyboard.press('2');
  await expect.poll(mode).toBe('data');
  await page.keyboard.press('3');
  expect(await mode()).toBe('data');
  await page.keyboard.press('1');
  await expect.poll(mode).toBe('design');
});

test('lens keys are inert in the classic interface', async ({ page }) => {
  await page.goto('/?ui=1');
  await page.locator('#stage-world').waitFor({ state: 'attached' });
  await page.keyboard.press('2');
  expect(await page.locator('#workspace').getAttribute('data-mode')).toBe('design');
});
