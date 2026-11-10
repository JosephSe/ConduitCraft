import AxeBuilder from '@axe-core/playwright';
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
  await page.mouse.move(bar.x + 12, bar.y + bar.height / 2);
  await page.mouse.down();
  await page.mouse.move(bar.x + 12, bar.y + bar.height / 2 + 48, { steps: 6 });
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
  // The inspector slides in; a click aimed at the colour while it moves can land beside it.
  await page.evaluate(() =>
    Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => undefined))),
  );
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

// ---------------------------------------------------------------------------------------------------------------
// Frames, part 2 (D1b)
// ---------------------------------------------------------------------------------------------------------------
async function selectFirstTwo(page: Page) {
  const hits = page.locator('.arch-node .node-select-hit');
  await hits.nth(0).click();
  await hits.nth(1).click({ modifiers: ['Shift'] });
}

test('Group into Frame draws a frame around the selected components', async ({ page }) => {
  await open(page);
  await selectFirstTwo(page);
  await runPaletteCommand(page, 'Group into Frame');
  await expect(frames(page)).toHaveCount(1);
  await expect(frames(page).first()).toHaveClass(/is-selected/);
  // Both components sit inside the new frame's box.
  const frameBox = (await frames(page).first().boundingBox())!;
  for (const i of [0, 1]) {
    const box = (await page.locator('.arch-node').nth(i).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(frameBox.x);
    expect(box.x + box.width).toBeLessThanOrEqual(frameBox.x + frameBox.width + 1);
  }
  await page.keyboard.press('ControlOrMeta+z');
  await expect(frames(page)).toHaveCount(0);
});

test('a frame can be locked and duplicated with what is in it', async ({ page }) => {
  await open(page);
  await selectFirstTwo(page);
  await runPaletteCommand(page, 'Group into Frame');
  const before = await page.locator('.arch-node').count();
  await page.keyboard.press('ControlOrMeta+l');
  await expect(frames(page).first()).toHaveClass(/is-locked/);
  // A locked frame does not move when its title strip is dragged.
  const pos = await nodePos(page, 0);
  const bar = (await page.locator('.frame-title-bar').first().boundingBox())!;
  await page.mouse.move(bar.x + 10, bar.y + bar.height / 2);
  await page.mouse.down();
  await page.mouse.move(bar.x + 90, bar.y + bar.height / 2 + 40, { steps: 6 });
  await page.mouse.up();
  expect(await nodePos(page, 0)).toEqual(pos);
  await expect(frames(page).first()).toHaveClass(/is-selected/);
  await page.keyboard.press('ControlOrMeta+l');
  await expect(frames(page).first()).not.toHaveClass(/is-locked/);

  await page.keyboard.press('ControlOrMeta+d');
  await expect(frames(page)).toHaveCount(2);
  await expect(page.locator('.arch-node')).toHaveCount(before + 2);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(frames(page)).toHaveCount(1);
});

test('the outline lists frames, selects one, and Alt+Arrow moves it with what it holds', async ({ page }) => {
  await open(page);
  await selectFirstTwo(page);
  await runPaletteCommand(page, 'Group into Frame');
  await page.locator('#canvas-viewport').click({ position: { x: 4, y: 4 } });
  await runPaletteCommand(page, 'Toggle Text Outline');
  const row = page.locator('#outline-tree .outline-row[data-kind="frame"]');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('Frame Group, holds');
  await row.click();
  await expect(frames(page).first()).toHaveClass(/is-selected/);
  const before = await nodePos(page, 0);
  await page.keyboard.press('Alt+ArrowRight');
  await expect.poll(async () => (await nodePos(page, 0))[0]).toBe(before[0] + 16);
  await page.keyboard.press('Alt+Shift+ArrowDown');
  await expect.poll(async () => (await nodePos(page, 0))[1]).toBe(before[1] + 4);
});

test('"Subgraphs as: Frames" imports nested subgraphs as nested frames', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/');
  await runPaletteCommand(page, 'Mermaid Import');
  await page
    .locator('#code-sync-textarea')
    .fill('flowchart LR\n  subgraph cloud ["Cloud"]\n    subgraph vpc ["VPC"]\n      api --> db\n    end\n    cdn\n  end\n  user --> cdn\n  cdn --> api');
  await page.locator('.subgraph-mode .segmented-label', { hasText: 'Frames' }).click();
  await page.locator('#btn-apply-code').click();
  await expect(frames(page)).toHaveCount(2);
  await expect(page.locator('.frame-title-bar', { hasText: 'Cloud' })).toBeVisible();
  await expect(page.locator('.frame-title-bar', { hasText: 'VPC' })).toBeVisible();
  await expect(page.locator('.zone-banner')).toHaveCount(0);
});

for (const scheme of ['light', 'dark'] as const) {
  test(`a diagram with frames, locked and not, has no axe violations (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await open(page);
    await selectFirstTwo(page);
    await runPaletteCommand(page, 'Group into Frame');
    await page.keyboard.press('ControlOrMeta+l');
    await page.locator('#canvas-viewport').click({ position: { x: 4, y: 4 } });
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });
}
