import { expect, test, type Page } from '@playwright/test';
import { openLumenRelay, runPaletteCommand, undo } from './helpers';

async function open(page: Page) {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/');
  await openLumenRelay(page);
  await expect(page.locator('.arch-node').first()).toBeVisible();
  await page.locator('#canvas-viewport').click({ position: { x: 4, y: 4 } });
}

const tool = (page: Page, name: string) => page.locator(`[data-rail-tool="${name}"]`);
const workspace = (page: Page) => page.locator('#workspace');
const stageTransform = (page: Page) => page.locator('#stage-world').evaluate((el) => (el as HTMLElement).style.transform);

test('Hand and Text are on the rail with their shortcuts', async ({ page }) => {
  await open(page);
  await expect(tool(page, 'hand')).toHaveAttribute('aria-label', 'Hand tool (H)');
  await expect(tool(page, 'text')).toHaveAttribute('aria-label', 'Text tool (T)');

  await page.keyboard.press('h');
  await expect(workspace(page)).toHaveAttribute('data-tool', 'hand');
  await expect(tool(page, 'hand')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('t');
  await expect(workspace(page)).toHaveAttribute('data-tool', 'text');
  await expect(tool(page, 'text')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('v');
  await expect(workspace(page)).toHaveAttribute('data-tool', 'select');
});

test('both tools are in the command palette', async ({ page }) => {
  await open(page);
  await runPaletteCommand(page, 'Hand Tool');
  await expect(workspace(page)).toHaveAttribute('data-tool', 'hand');
  await runPaletteCommand(page, 'Text Tool');
  await expect(workspace(page)).toHaveAttribute('data-tool', 'text');
});

test('the Hand tool pans with a plain drag, even starting on a component, and moves nothing', async ({ page }) => {
  await open(page);
  const nodeBefore = await page.locator('.arch-node').first().evaluate((el) => el.style.getPropertyValue('--nx'));
  await tool(page, 'hand').click();
  const box = (await page.locator('.arch-node .node-select-hit').first().boundingBox())!;
  const before = await stageTransform(page);

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 60, { steps: 8 });
  await page.mouse.up();

  expect(await stageTransform(page)).not.toBe(before);
  expect(await page.locator('.arch-node').first().evaluate((el) => el.style.getPropertyValue('--nx'))).toBe(nodeBefore);
});

test('the Text tool puts a label where you click, lets you type, and goes back to Select', { tag: '@quick' }, async ({ page }) => {
  await open(page);
  const cards = await page.locator('.blueprint-spec').count();
  await tool(page, 'text').click();
  await page.locator('#canvas-viewport').click({ position: { x: 900, y: 40 } });

  await expect(workspace(page)).toHaveAttribute('data-tool', 'select');
  await expect(page.locator('.blueprint-spec.is-text')).toHaveCount(1);
  await expect(page.locator('.blueprint-spec')).toHaveCount(cards + 1);

  await page.keyboard.type('Public internet');
  await page.keyboard.press('Enter');
  await expect(page.locator('.blueprint-spec.is-text .notes-title')).toHaveText('Public internet');

  const style = await page.locator('.blueprint-spec.is-text').evaluate((el) => {
    const s = getComputedStyle(el);
    return { bg: s.backgroundColor, border: s.borderTopColor };
  });
  expect(style.bg).toBe('rgba(0, 0, 0, 0)');
});

test('undo takes a new text label away again', async ({ page }) => {
  await open(page);
  await tool(page, 'text').click();
  await page.locator('#canvas-viewport').click({ position: { x: 900, y: 40 } });
  await page.keyboard.type('Edge of trust');
  await page.keyboard.press('Enter');
  await expect(page.locator('.blueprint-spec.is-text')).toHaveCount(1);

  // Undo steps back through the rename, then the placement.
  for (let i = 0; i < 3 && (await page.locator('.blueprint-spec.is-text').count()) > 0; i++) {
    await undo(page);
  }
  await expect(page.locator('.blueprint-spec.is-text')).toHaveCount(0);
});
