import { expect, test, type Page } from '@playwright/test';
import { clearSelection, openLumenRelay } from './helpers';

async function open(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await openLumenRelay(page);
  await expect(page.locator('.arch-node').first()).toBeVisible();
}

const selectNode = (page: Page) => page.locator('.arch-node[data-node-id="night-desk"] .node-select-hit').click();
const box = async (page: Page, selector: string) => {
  const b = await page.locator(selector).first().boundingBox();
  if (!b) throw new Error(`${selector} has no box`);
  return b;
};
const overlaps = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test('the card floats over the sheet and clears both islands', { tag: '@quick' }, async ({ page }) => {
  await open(page);
  await selectNode(page);
  await expect(page.locator('#inspector-panel')).toBeVisible();
  const view = await box(page, '#canvas-viewport');
  const work = await box(page, '#workspace');
  expect(view.width).toBe(work.width);
  const card = await box(page, '#inspector-panel');
  expect(overlaps(card, await box(page, '.slot-ne'))).toBe(false);
  expect(overlaps(card, await box(page, '.slot-se'))).toBe(false);
});

test('closed means gone: no card and no vertical word', { tag: '@quick' }, async ({ page }) => {
  await open(page);
  await clearSelection(page);
  await expect(page.locator('#inspector-panel')).toBeHidden();
  await expect(page.locator('.rail-vertical-label')).toHaveCount(0);
});

// Step 3 makes the wire body compact
test.fixme('the card is as tall as its content', async ({ page }) => {
  await open(page);
  await clearSelection(page);
  await page.locator('.conduit-hit').first().click({ force: true });
  await expect(page.locator('#prop-panel-heading')).toHaveText('Wire properties');
  const card = await box(page, '#inspector-panel');
  expect(card.height).toBeLessThan(900 * 0.7);
});

test('the header edits the name', { tag: '@quick' }, async ({ page }) => {
  await open(page);
  await selectNode(page);
  await page.locator('#prop-node-title').fill('Renamed');
  await expect(page.locator('.arch-node[data-node-id="night-desk"]')).toContainText('Renamed');
});

test('every selection type shows the header, and its name field edits', async ({ page }) => {
  await open(page);
  const head = page.locator('#prop-form-container .prop-head');

  await clearSelection(page);
  await page.locator('#btn-focus-doc-title').click();
  await expect(head.locator('.prop-head-kind')).toHaveText('Document');
  await page.locator('#prop-doc-title').fill('Renamed document');
  await expect(page.locator('#prop-doc-title')).toHaveValue('Renamed document');

  await clearSelection(page);
  await page.locator('.conduit-hit').first().click({ force: true });
  await expect(head.locator('.prop-head-kind')).toHaveText('Wire');
  await expect(page.locator('#prop-edge-label')).toHaveAttribute('placeholder', 'Unlabelled wire');
  await page.locator('#prop-edge-label').fill('Renamed wire');
  await expect(page.locator('#prop-edge-label')).toHaveValue('Renamed wire');

  const hits = page.locator('.arch-node .node-select-hit');
  await hits.nth(0).click();
  await hits.nth(1).click({ modifiers: ['Shift'] });
  await expect(head.locator('.prop-head-kind')).toHaveText('Selection');
  await expect(page.locator('#prop-panel-heading')).toHaveText(/^Selection \(/);
});

test('the kind is changed from the header', async ({ page }) => {
  await open(page);
  await selectNode(page);
  const kind = page.locator('#prop-node-kind');
  const before = await kind.inputValue();
  const next = await kind
    .locator('option')
    .evaluateAll((os, cur) => (os as HTMLOptionElement[]).find((o) => o.value !== cur)!.value, before);
  await kind.selectOption(next);
  await expect(page.locator('#prop-node-kind')).toHaveValue(next);
  await expect(page.locator('.prop-head-kind-text')).not.toBeEmpty();
});

test('the More popover opens, closes on Escape, and returns focus', { tag: '@quick' }, async ({ page }) => {
  await open(page);
  await selectNode(page);
  await page.locator('#btn-prop-more').click();
  await expect(page.locator('#btn-prop-delete')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#btn-prop-delete')).toBeHidden();
  await expect(page.locator('#btn-prop-more')).toBeFocused();
});

test('uses the display face for the header name and preserves the V3 cut-out tile (DK6)', { tag: '@quick' }, async ({ page }) => {
  await open(page);
  await selectNode(page);
  await expect(page.locator('.prop-head-art svg')).toBeVisible();
  const styles = await page.locator('.prop-head-name').evaluate((el) => {
    const cs = getComputedStyle(el);
    return { fontFamily: cs.fontFamily, fontWeight: cs.fontWeight };
  });
  expect(styles.fontFamily).toContain('Bricolage Grotesque');
  expect(styles.fontWeight).toBe('700');
});
