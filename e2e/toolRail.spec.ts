import { expect, test, type Page } from '@playwright/test';
import { openLumenRelay } from './helpers';

/** The dock (6.4, 7.1, 7.2): tools, six favourite cut-outs, "All components". Design face. */
async function open(page: Page, query = '') {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto(`/${query}`);
  await openLumenRelay(page);
  await expect(page.locator('.arch-node').first()).toBeVisible();
}

const tool = (page: Page, name: string) => page.locator(`#dock [data-rail-tool="${name}"]`);
const favourite = (page: Page, id: string) => page.locator(`#dock .dock-fav[data-stencil-id="${id}"]`);
const nodes = (page: Page) => page.locator('.arch-node');

/** A spot on the sheet with nothing on it. */
async function emptySpot(page: Page): Promise<{ x: number; y: number }> {
  const box = (await page.locator('#canvas-viewport').boundingBox())!;
  return { x: box.x + box.width - 160, y: box.y + 140 };
}

test('the dock holds five tools, six favourites and All components, and the old rail is gone', { tag: '@quick' }, async ({ page }) => {
  await open(page);
  await expect(page.locator('#dock')).toBeVisible();
  await expect(page.locator('#dock [data-rail-tool]')).toHaveCount(5);
  await expect(page.locator('#dock .dock-fav')).toHaveCount(6);
  await expect(page.locator('#btn-all-components')).toBeVisible();
  await expect(page.locator('.rail-stencil-btn, #btn-rail-expand-palette')).toHaveCount(0);
  await expect(tool(page, 'select')).toHaveAttribute('aria-pressed', 'true');
  // The tray is not built until it is asked for.
  await expect(page.locator('#tray')).toHaveCount(0);
  await expect(page.locator('#palette-sidebar')).toHaveCount(0);
});

test('the defaults are Service, Data store, Message queue, Load balancer, Gateway and Actor, each named by its tooltip', async ({ page }) => {
  await open(page);
  const ids = await page.locator('#dock .dock-fav').evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.stencilId));
  expect(ids).toEqual(['service', 'store', 'queue', 'balancer', 'gate', 'actor']);
  await favourite(page, 'queue').hover();
  await expect(page.locator('.tooltip-layer[data-visible="true"]')).toContainText('Message Queue');
});

test('a saved list of favourites is what the dock shows, with unknown ids dropped', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('conduitcraft:dock-favourites', JSON.stringify(['cache', 'nope', 'client'])));
  await open(page);
  const ids = await page.locator('#dock .dock-fav').evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.stencilId));
  expect(ids.slice(0, 2)).toEqual(['cache', 'client']);
  expect(ids).toHaveLength(6);
});

test('clicking Wire switches the tool and the pressed state follows it', async ({ page }) => {
  await open(page);
  await tool(page, 'connect').click();
  await expect(page.locator('#workspace')).toHaveAttribute('data-tool', 'connect');
  await expect(tool(page, 'connect')).toHaveAttribute('aria-pressed', 'true');
  await expect(tool(page, 'select')).toHaveAttribute('aria-pressed', 'false');
});

test('V and W switch tools, Z and N add a swimlane and a note, C opens the component list', async ({ page }) => {
  await open(page);
  await page.locator('#canvas-viewport').click({ position: { x: 4, y: 4 } });

  await page.keyboard.press('w');
  await expect(page.locator('#workspace')).toHaveAttribute('data-tool', 'connect');
  await expect(tool(page, 'connect')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('v');
  await expect(page.locator('#workspace')).toHaveAttribute('data-tool', 'select');

  const zones = await page.locator('.zone-banner').count();
  await page.keyboard.press('z');
  await expect(page.locator('.zone-banner')).toHaveCount(zones + 1);

  const notes = await page.locator('.blueprint-spec').count();
  await page.keyboard.press('n');
  await expect(page.locator('.blueprint-spec')).toHaveCount(notes + 1);

  await page.keyboard.press('c');
  await expect(page.locator('#tray')).toBeVisible();
  await expect(page.locator('#btn-all-components')).toHaveAttribute('aria-expanded', 'true');
});

test('tool letters do nothing while typing', async ({ page }) => {
  await open(page);
  await page.locator('#btn-focus-doc-title').click();
  const field = page.locator('#prop-doc-title');
  await expect(field).toBeVisible();
  await field.focus();
  await page.keyboard.type('wvz');
  await expect(page.locator('#workspace')).toHaveAttribute('data-tool', 'select');
  await expect(field).toHaveValue(/wvz$/);
});

test('every tool, favourite and the All components button can be reached with Tab', async ({ page }) => {
  await open(page);
  await tool(page, 'select').focus();
  const seen: string[] = [];
  for (let i = 0; i < 12; i += 1) {
    seen.push(await page.evaluate(() => (document.activeElement as HTMLElement).dataset.railTool ?? (document.activeElement as HTMLElement).dataset.stencilId ?? document.activeElement!.id));
    await page.keyboard.press('Tab');
  }
  expect(seen).toEqual(['select', 'connect', 'hand', 'text', 'frame', 'service', 'store', 'queue', 'balancer', 'gate', 'actor', 'btn-all-components']);
});

test('Enter on a favourite places exactly one at the centre of the view', async ({ page }) => {
  await open(page);
  const before = await nodes(page).count();
  await favourite(page, 'service').focus();
  await page.keyboard.press('Enter');
  await expect(nodes(page)).toHaveCount(before + 1);
  await page.waitForTimeout(300);
  await expect(nodes(page)).toHaveCount(before + 1);
});

test('click arms a favourite, and the next click on the sheet places it there', { tag: '@quick' }, async ({ page }) => {
  await open(page);
  const before = await nodes(page).count();
  await favourite(page, 'queue').click();
  await expect(favourite(page, 'queue')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#workspace')).toHaveAttribute('data-armed', 'queue');
  await expect(page.locator('.stencil-drag-ghost')).toHaveCount(1);
  await expect(nodes(page)).toHaveCount(before);

  const spot = await emptySpot(page);
  await page.mouse.click(spot.x, spot.y);
  await expect(nodes(page)).toHaveCount(before + 1);
  const placed = page.locator('.arch-node[data-kind="queue"]').last();
  const box = (await placed.boundingBox())!;
  expect(Math.abs(box.x + box.width / 2 - spot.x)).toBeLessThan(40);
  expect(Math.abs(box.y + box.height / 2 - spot.y)).toBeLessThan(40);
  // One placement, then it is put away.
  await expect(page.locator('#workspace')).not.toHaveAttribute('data-armed', /.*/);
  await expect(page.locator('.stencil-drag-ghost')).toHaveCount(0);
  await expect(favourite(page, 'queue')).toHaveAttribute('aria-pressed', 'false');
});

test('Shift keeps placing, and Esc puts the component back', async ({ page }) => {
  await open(page);
  const before = await nodes(page).count();
  await favourite(page, 'store').click();
  const spot = await emptySpot(page);
  await page.keyboard.down('Shift');
  await page.mouse.click(spot.x, spot.y);
  await page.mouse.click(spot.x, spot.y + 150);
  await page.keyboard.up('Shift');
  await expect(nodes(page)).toHaveCount(before + 2);
  await expect(page.locator('#workspace')).toHaveAttribute('data-armed', 'store');

  await page.keyboard.press('Escape');
  await expect(page.locator('#workspace')).not.toHaveAttribute('data-armed', /.*/);
  await expect(page.locator('.stencil-drag-ghost')).toHaveCount(0);
  await expect(nodes(page)).toHaveCount(before + 2);
});

test('choosing a tool, or clicking the armed favourite again, puts the component back', async ({ page }) => {
  await open(page);
  await favourite(page, 'actor').click();
  await expect(page.locator('#workspace')).toHaveAttribute('data-armed', 'actor');
  await favourite(page, 'actor').click();
  await expect(page.locator('#workspace')).not.toHaveAttribute('data-armed', /.*/);

  await favourite(page, 'actor').click();
  await tool(page, 'hand').click();
  await expect(page.locator('#workspace')).not.toHaveAttribute('data-armed', /.*/);
});

test('dragging a favourite onto the sheet places it under the pointer and leaves an empty outline behind', async ({ page }) => {
  await open(page);
  const before = await nodes(page).count();
  const from = (await favourite(page, 'balancer').boundingBox())!;
  const spot = await emptySpot(page);
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(spot.x, spot.y, { steps: 10 });
  await expect(favourite(page, 'balancer')).toHaveClass(/is-empty/);
  await page.mouse.up();
  await expect(nodes(page)).toHaveCount(before + 1);
  await expect(favourite(page, 'balancer')).not.toHaveClass(/is-empty/);
  const placed = (await page.locator('.arch-node[data-kind="balancer"]').last().boundingBox())!;
  expect(Math.abs(placed.x + placed.width / 2 - spot.x)).toBeLessThan(40);
});

test('the dock is one island with three faces: the lens picks which one shows', async ({ page }) => {
  await open(page);
  const face = (name: string) => page.locator(`#dock [data-face="${name}"]`);
  await expect(page.locator('#dock')).toBeVisible();
  await expect(face('design')).toBeVisible();
  await page.keyboard.press('2');
  await expect(page.locator('#dock')).toBeVisible();
  await expect(face('traffic')).toBeVisible();
  await expect(face('design')).toBeHidden();
  await page.keyboard.press('3');
  await expect(face('review')).toBeVisible();
  await expect(face('traffic')).toBeHidden();
  await page.keyboard.press('1');
  await expect(face('design')).toBeVisible();
  await expect(face('review')).toBeHidden();
});


