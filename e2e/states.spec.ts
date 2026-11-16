import { expect, test } from '@playwright/test';
import { openLumenRelay } from './helpers';

/** C3, section 8.5: a state is a ring, the light and a word. Colour never stands alone. */
test('a failed component and the callers it puts at risk each say so in words', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/');
  await openLumenRelay(page);
  await page.keyboard.press('2');
  await page.locator('.arch-node').nth(2).click({ button: 'right' });
  await page.getByRole('menuitem', { name: /Fail this component/ }).click();

  const failed = page.locator('.arch-node[data-chaos="failed"]').first();
  await expect(failed.locator('.chaos-badge')).toHaveText('Failed');
  await expect(failed.locator('.chaos-badge')).toBeVisible();

  const risk = page.locator('.arch-node[data-chaos="at-risk"]').first();
  await expect(risk.locator('.chaos-badge')).toHaveText('Potential disruption');
  await expect(risk.locator('.chaos-badge')).toBeVisible();
});

test('the state words are plain text with no icon glyphs', async ({ page }) => {
  await page.goto('/');
  await openLumenRelay(page);
  await page.keyboard.press('2');
  await page.locator('.arch-node').nth(2).click({ button: 'right' });
  await page.getByRole('menuitem', { name: /Fail this component/ }).click();
  for (const text of await page.locator('.chaos-badge').allTextContents()) expect(text).toMatch(/^[A-Za-z ]+$/);
});
