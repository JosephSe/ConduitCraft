import { expect, test } from '@playwright/test';
import { openLumenRelay } from './helpers';

test('the view popover picks a diagram style; the sheet follows (Y1)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await openLumenRelay(page);
  await page.locator('#zoom-readout').click();
  const style = page.locator('#view-style');
  await expect(style).toBeVisible();
  await expect(page.locator('#workspace')).not.toHaveAttribute('data-style', /.+/);

  await style.selectOption('blueprint');
  await expect(page.locator('#workspace')).toHaveAttribute('data-style', 'blueprint');
  const sheet = () => page.locator('#stage-world').evaluate((el) => getComputedStyle(el).getPropertyValue('--cc-sheet').trim());
  expect(await sheet()).toBe('#0b3a6b');

  await style.selectOption('print');
  await expect(page.locator('#workspace')).toHaveAttribute('data-style', 'print');
  expect(await sheet()).toBe('#fff');

  await style.selectOption('sketch');
  await expect(page.locator('#workspace')).toHaveAttribute('data-style', 'sketch');
  expect(await sheet()).toBe('#fffdf8');
  expect(await page.locator('#stage-world .node-select-hit').first().evaluate((el) => getComputedStyle(el).filter)).toContain('cc-rough');

  await style.selectOption('');
  await expect(page.locator('#workspace')).not.toHaveAttribute('data-style', /.+/);
});

test('Print keeps wire labels on in Review; the other styles hide them (Y1)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await openLumenRelay(page);
  const badge = page.locator('#stage-world .conduit-badge-hit').first();
  await page.locator('#workspace').evaluate((el) => el.setAttribute('data-lens', 'review'));
  await page.locator('#workspace').evaluate((el) => el.setAttribute('data-style', 'print'));
  expect(await badge.evaluate((el) => getComputedStyle(el).display)).not.toBe('none');
  await page.locator('#workspace').evaluate((el) => el.setAttribute('data-style', 'blueprint'));
  expect(await badge.evaluate((el) => getComputedStyle(el).display)).toBe('none');
});
