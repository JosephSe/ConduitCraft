import { expect, test, type Page } from '@playwright/test';
import { openLumenRelay, runPaletteCommand } from './helpers';

/** Where every component sits, read from the layout variables the stage positions them with. */
async function positions(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => {
    const out: Record<string, string> = {};
    for (const el of document.querySelectorAll<HTMLElement>('.arch-node')) {
      out[el.dataset.nodeId ?? ''] = `${el.style.getPropertyValue('--nx')},${el.style.getPropertyValue('--ny')}`;
    }
    return out;
  });
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await openLumenRelay(page);
  await expect(page.locator('.arch-node').first()).toBeVisible();
});

test('the layered layout loads on first use, moves components, and is one undo step', { tag: '@quick' }, async ({ page }) => {
  const elkRequests: string[] = [];
  page.on('request', (r) => {
    if (/elkArrange/.test(r.url())) elkRequests.push(r.url());
  });
  expect(elkRequests, 'the ELK chunk is not fetched until asked for').toHaveLength(0);

  const before = await positions(page);
  await runPaletteCommand(page, 'Layered (ELK)');
  await expect(page.locator('.toast-item', { hasText: 'in layers' })).toBeVisible();
  expect(elkRequests.length).toBeGreaterThan(0);

  const after = await positions(page);
  expect(after).not.toEqual(before);
  expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());

  // One undo step puts every component back.
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => positions(page)).toEqual(before);
});

test('arranging twice in a row says it is already arranged', async ({ page }) => {
  await runPaletteCommand(page, 'Layered (ELK)');
  await expect(page.locator('.toast-item', { hasText: 'in layers' })).toBeVisible();
  await runPaletteCommand(page, 'Layered (ELK)');
  await expect(page.locator('.toast-item', { hasText: 'Already arranged this way' })).toBeVisible();
});
