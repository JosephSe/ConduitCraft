import { expect, test, type Page } from '@playwright/test';

async function loadShowcase(page: Page) {
  await page.goto('/');
  await page.locator('#btn-empty-showcase').click();
  await expect(page.locator('.arch-node').first()).toBeVisible();
}

const focusedNodeId = (page: Page) =>
  page.evaluate(() => document.activeElement?.closest('.arch-node')?.getAttribute('data-node-id') ?? null);

test('the canvas has one component tab stop, plus the wires of that component', async ({ page }) => {
  await loadShowcase(page);
  // The observer that re-applies tabindex after a render runs asynchronously, so poll instead of reading once.
  await expect(page.locator('.node-select-hit[tabindex="0"]')).toHaveCount(1);
  await expect(page.locator('.node-drag-handle[tabindex="0"], .node-port[tabindex="0"]')).toHaveCount(0);
  await expect
    .poll(async () => {
      const attached = await page.locator('.node-select-hit[tabindex="0"]').evaluate((el) => {
        const id = el.closest('.arch-node')!.getAttribute('data-node-id');
        return document.querySelectorAll(`.conduit-group[data-from="${id}"], .conduit-group[data-to="${id}"]`).length;
      });
      return (await page.locator('.conduit-group[tabindex="0"]').count()) === attached;
    })
    .toBe(true);
});

test('arrow keys move focus between components and Escape returns to the canvas', async ({ page }) => {
  await loadShowcase(page);
  await page.locator('.node-select-hit[tabindex="0"]').focus();
  const startId = await focusedNodeId(page);
  let moved = false;
  for (const key of ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp']) {
    await page.keyboard.press(key);
    const id = await focusedNodeId(page);
    if (id && id !== startId) {
      moved = true;
      await expect(page.locator(`#node-${id} .node-select-hit`)).toHaveAttribute('tabindex', '0');
      break;
    }
  }
  expect(moved).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('#canvas-viewport')).toBeFocused();
});
