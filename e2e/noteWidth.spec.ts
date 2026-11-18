import { expect, test, type Page } from '@playwright/test';
import { openLumenRelay, undo } from './helpers';

async function open(page: Page) {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/');
  await openLumenRelay(page);
  await expect(page.locator('.arch-node').first()).toBeVisible();
}

const note = (page: Page) => page.locator('.blueprint-spec[data-notes-id="notes-read"]');

async function size(page: Page) {
  const box = await note(page).boundingBox();
  if (!box) throw new Error('note not on screen');
  return box;
}

async function dragEdge(page: Page, dx: number) {
  const handle = note(page).locator('.notes-resize-handle');
  const box = await handle.boundingBox();
  if (!box) throw new Error('no resize handle');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y, { steps: 4 });
  await page.mouse.move(x + dx, y, { steps: 4 });
  await page.mouse.up();
}

test('dragging a note edge changes its width, and its height follows the content', async ({ page }) => {
  await open(page);
  await note(page).scrollIntoViewIfNeeded();
  const before = await size(page);

  await dragEdge(page, -before.width * 0.45);
  const narrow = await size(page);
  expect(narrow.width).toBeLessThan(before.width - 40);
  expect(narrow.height).toBeGreaterThan(before.height + 10); // the items wrap onto more lines

  // The inspector shows the stored width, in canvas pixels.
  const width = page.locator('#prop-notes-width');
  await expect(width).toBeVisible();
  const stored = Number(await width.inputValue());
  expect(stored).toBeGreaterThanOrEqual(200);
  expect(stored).toBeLessThan(404);

  await dragEdge(page, narrow.width * 0.9);
  const wide = await size(page);
  expect(wide.width).toBeGreaterThan(narrow.width + 40);
  expect(wide.height).toBeLessThan(narrow.height); // and fewer lines again

  // One undo step per drag.
  expect(await undo(page)).toBe(true);
  await expect.poll(async () => Math.round((await size(page)).width)).toBe(Math.round(narrow.width));
});

test('the Width field resizes a note and an empty field restores the default', async ({ page }) => {
  await open(page);
  await note(page).scrollIntoViewIfNeeded();
  const before = await size(page);
  await note(page).locator('.blueprint-spec-header').click();
  const width = page.locator('#prop-notes-width');
  await width.fill('640');
  await width.press('Enter');
  await expect.poll(async () => (await size(page)).width).toBeGreaterThan(before.width * 1.4);

  await width.fill('');
  await width.press('Enter');
  await expect.poll(async () => Math.round((await size(page)).width)).toBe(Math.round(before.width));
});

test('a note cannot be dragged narrower than the minimum', async ({ page }) => {
  await open(page);
  await note(page).scrollIntoViewIfNeeded();
  await dragEdge(page, -2000);
  await expect(page.locator('#prop-notes-width')).toHaveValue('200');
});
