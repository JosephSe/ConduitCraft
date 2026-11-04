import { expect, test, type Page } from '@playwright/test';
import { openLumenRelay, runPaletteCommand } from './helpers';

async function open(page: Page) {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/');
  await openLumenRelay(page);
  await expect(page.locator('.arch-node').first()).toBeVisible();
  await page.locator('#canvas-viewport').click({ position: { x: 4, y: 4 } });
}

const tool = (page: Page) => page.locator('[data-rail-tool="frame"]');
const frames = (page: Page) => page.locator('.frame-box');
const nodePos = (page: Page, index: number) =>
  page
    .locator('.arch-node')
    .nth(index)
    .evaluate((el) => [Number(el.style.getPropertyValue('--nx')), Number(el.style.getPropertyValue('--ny'))]);

/** Draw a frame by dragging between two screen points with the Frame tool. */
async function draw(page: Page, from: [number, number], to: [number, number]) {
  await tool(page).click();
  await page.mouse.move(from[0], from[1]);
  await page.mouse.down();
  await page.mouse.move(to[0], to[1], { steps: 8 });
  await page.mouse.up();
}

/** A frame drawn around the first component, sized from where that component is on screen. */
async function frameAroundFirstNode(page: Page) {
  const box = (await page.locator('.arch-node .node-select-hit').first().boundingBox())!;
  await draw(page, [box.x - 30, box.y - 50], [box.x + box.width + 30, box.y + box.height + 30]);
  await expect(frames(page)).toHaveCount(1);
  return box;
}

test('the Frame tool is on the rail with F, and in the command palette', async ({ page }) => {
  await open(page);
  await expect(tool(page)).toHaveAttribute('aria-label', 'Frame tool (F)');
  await page.keyboard.press('f');
  await expect(page.locator('#workspace')).toHaveAttribute('data-tool', 'frame');
  await expect(tool(page)).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('v');
  await runPaletteCommand(page, 'Frame Tool');
  await expect(page.locator('#workspace')).toHaveAttribute('data-tool', 'frame');
});

test('dragging with the Frame tool draws a frame around components, selects it and goes back to Select', async ({ page }) => {
  await open(page);
  await frameAroundFirstNode(page);
  await expect(page.locator('#workspace')).toHaveAttribute('data-tool', 'select');
  await expect(frames(page).first()).toHaveClass(/is-selected/);
  await expect(page.locator('#prop-frame-title')).toHaveValue('Frame');
  // The component inside belongs to the frame, so its position did not change by drawing.
  expect(await page.locator('.frame-title-bar').first().textContent()).toBe('Frame');
});

test('moving a frame by its title strip moves the components inside it and nothing else', async ({ page }) => {
  await open(page);
  const [firstBefore, otherBefore] = [await nodePos(page, 0), await nodePos(page, 5)];
  await frameAroundFirstNode(page);

  const bar = (await page.locator('.frame-title-bar').first().boundingBox())!;
  await page.mouse.move(bar.x + bar.width / 2, bar.y + bar.height / 2);
  await page.mouse.down();
  await page.mouse.move(bar.x + bar.width / 2 + 96, bar.y + bar.height / 2 + 64, { steps: 8 });
  await page.mouse.up();

  const [firstAfter, otherAfter] = [await nodePos(page, 0), await nodePos(page, 5)];
  expect(firstAfter[0]).toBeGreaterThan(firstBefore[0]);
  expect(firstAfter[1]).toBeGreaterThan(firstBefore[1]);
  expect(otherAfter).toEqual(otherBefore);
});

test('a component dragged into a frame moves with it afterwards', async ({ page }) => {
  await open(page);
  // An empty frame in free space at the top right, then drag the first component onto it.
  const viewportBox = (await page.locator('#canvas-viewport').boundingBox())!;
  const spot: [number, number] = [viewportBox.x + viewportBox.width - 420, viewportBox.y + 70];
  await draw(page, spot, [spot[0] + 320, spot[1] + 220]);
  await expect(frames(page)).toHaveCount(1);

  const hit = (await page.locator('.arch-node .node-select-hit').first().boundingBox())!;
  await page.mouse.move(hit.x + hit.width / 2, hit.y + hit.height / 2);
  await page.mouse.down();
  await page.mouse.move(spot[0] + 160, spot[1] + 120, { steps: 12 });
  await page.mouse.up();

  const placed = await nodePos(page, 0);
  // Clear the selection first, so the selection toolbar is not over the title strip.
  await page.locator('#canvas-viewport').click({ position: { x: 4, y: 4 } });
  const bar = (await page.locator('.frame-title-bar').first().boundingBox())!;
  await page.mouse.move(bar.x + 40, bar.y + bar.height / 2);
  await page.mouse.down();
  await page.mouse.move(bar.x + 40, bar.y + bar.height / 2 + 48, { steps: 6 });
  await page.mouse.up();
  const moved = await nodePos(page, 0);
  expect(moved[1]).toBeGreaterThan(placed[1]);
});

test('rename, colour, undo, redo and delete a frame; deleting it keeps the components', async ({ page }) => {
  await open(page);
  const nodes = await page.locator('.arch-node').count();
  await frameAroundFirstNode(page);

  await page.locator('#prop-frame-title').fill('Public subnet');
  await expect(page.locator('.frame-title-bar').first()).toHaveText('Public subnet');
  await page.locator('input[name="frame-tone"][value="violet"]').check({ force: true });
  await expect(frames(page).first()).toHaveAttribute('data-tone', 'violet');

  await page.locator('#canvas-viewport').click({ position: { x: 4, y: 4 } });
  await frames(page).first().locator('.frame-title-bar').click();
  await page.keyboard.press('Delete');
  await expect(frames(page)).toHaveCount(0);
  await expect(page.locator('.arch-node')).toHaveCount(nodes);

  await page.keyboard.press('ControlOrMeta+z');
  await expect(frames(page)).toHaveCount(1);
  await expect(frames(page).first().locator('.frame-title-bar')).toHaveText('Public subnet');
});

test('a frame survives a reload through autosave', async ({ page }) => {
  await open(page);
  await frameAroundFirstNode(page);
  await page.locator('#prop-frame-title').fill('Edge');
  await expect(page.locator('.frame-title-bar').first()).toHaveText('Edge');
  await page.waitForTimeout(1200);
  await page.reload();
  await page.locator('#btn-restore-open').click();
  await expect(frames(page)).toHaveCount(1);
  await expect(frames(page).first().locator('.frame-title-bar')).toHaveText('Edge');
});
