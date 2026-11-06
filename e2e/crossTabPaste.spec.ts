import { expect, test, type Page } from '@playwright/test';
import { openLumenRelay, runPaletteCommand } from './helpers';

const mod = process.platform === 'darwin' ? 'Meta' : 'Control';

async function open(page: Page) {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/');
  await openLumenRelay(page);
  await expect(page.locator('.arch-node').first()).toBeVisible();
}

const nodeCount = (page: Page) => page.locator('.arch-node').count();

test('copying two connected components in one tab pastes them, wire and all, in another', async ({ context }) => {
  const a = await context.newPage();
  await open(a);
  const hits = a.locator('.arch-node .node-select-hit');
  await hits.nth(0).click();
  await hits.nth(1).click({ modifiers: ['Shift'] });
  await a.keyboard.press(`${mod}+c`);

  // The second tab opens the same example, so every pasted id already exists there.
  const b = await context.newPage();
  await b.setViewportSize({ width: 1600, height: 900 });
  await b.goto('/');
  await expect(b.locator('#home-dialog')).toBeVisible();
  await b.keyboard.press('Escape');
  await expect(b.locator('#home-dialog')).toBeHidden();
  await b.bringToFront();
  await openLumenRelay(b);
  await expect(b.locator('.arch-node').first()).toBeVisible();
  const before = await nodeCount(b);
  await b.locator('#canvas-viewport').click({ position: { x: 4, y: 4 } });
  await b.keyboard.press(`${mod}+v`);
  await expect.poll(() => nodeCount(b)).toBe(before + 2);
  // Nothing in b was overwritten: every id is still unique.
  const ids = await b.locator('.arch-node').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.node));
  expect(new Set(ids).size).toBe(ids.length);
});

test('pasting plain text changes nothing', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await open(page);
  await page.evaluate(() => navigator.clipboard.writeText('just some words'));
  const before = await nodeCount(page);
  await page.locator('#canvas-viewport').click({ position: { x: 4, y: 4 } });
  await page.keyboard.press(`${mod}+v`);
  expect(await nodeCount(page)).toBe(before);
});

test('pasting broken component text changes nothing and says why', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await open(page);
  await page.evaluate(() => navigator.clipboard.writeText('{"conduitcraft": 1, "nodes": ['));
  const before = await nodeCount(page);
  await page.locator('#canvas-viewport').click({ position: { x: 4, y: 4 } });
  await page.keyboard.press(`${mod}+v`);
  await expect(page.getByText(/damaged and cannot be pasted/).first()).toBeVisible();
  expect(await nodeCount(page)).toBe(before);
});

test('copy and paste still work in one tab when the system clipboard is unavailable', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
  });
  const before = await nodeCount(page);
  await page.locator('.arch-node .node-select-hit').first().click();
  await page.keyboard.press(`${mod}+c`);
  await page.keyboard.press(`${mod}+v`);
  await expect.poll(() => nodeCount(page)).toBe(before + 1);
});

test('copying a swimlane in one tab pastes it in another', async ({ context }) => {
  const a = await context.newPage();
  await open(a);
  await a.locator('.zone-banner').first().click({ position: { x: 6, y: 6 } });
  await a.keyboard.press(`${mod}+c`);

  const b = await context.newPage();
  await b.setViewportSize({ width: 1600, height: 900 });
  await b.goto('/');
  await expect(b.locator('#home-dialog')).toBeVisible();
  await b.keyboard.press('Escape');
  await b.bringToFront();
  await openLumenRelay(b);
  const before = await b.locator('.zone-banner').count();
  await b.locator('#canvas-viewport').click({ position: { x: 4, y: 4 } });
  await b.keyboard.press(`${mod}+v`);
  await expect.poll(() => b.locator('.zone-banner').count()).toBe(before + 1);
});

test('Select All then copy carries everything, frames and pictures included, to another tab', async ({ context }) => {
  const a = await context.newPage();
  await a.setViewportSize({ width: 1600, height: 900 });
  await a.goto('/');
  await a.keyboard.press('Escape');
  await runPaletteCommand(a, 'Load Showcase');
  await expect(a.locator('.arch-node').first()).toBeVisible();
  const total = async (page: Page) => ({
    nodes: await page.locator('.arch-node').count(),
    zones: await page.locator('.zone-banner').count(),
    notes: await page.locator('.blueprint-spec').count(),
    frames: await page.locator('.frame-box').count(),
    wires: await page.locator('.conduit-group').count(),
  });
  const original = await total(a);
  expect(original.frames).toBeGreaterThan(0);
  await a.locator('#canvas-viewport').click({ position: { x: 4, y: 4 } });
  await a.keyboard.press(`${mod}+a`);
  await expect(a.locator('.node-select-hit[aria-pressed="true"]')).toHaveCount(original.nodes);
  await a.keyboard.press(`${mod}+c`);
  await expect(a.getByText(/Copied \d+ items to clipboard$/).first()).toBeVisible();

  const b = await context.newPage();
  await b.setViewportSize({ width: 1600, height: 900 });
  await b.goto('/');
  await b.keyboard.press('Escape');
  await b.bringToFront();
  await b.locator('#canvas-viewport').click({ position: { x: 4, y: 4 } });
  await b.keyboard.press(`${mod}+v`);
  await expect.poll(() => total(b)).toEqual(original);
});
