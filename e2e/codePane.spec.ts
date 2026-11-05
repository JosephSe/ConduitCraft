import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { clearSelection, openLumenRelay, runPaletteCommand } from './helpers';

const pane = (page: Page) => page.locator('#code-pane');
const area = (page: Page) => page.locator('#code-area');

async function open(page: Page) {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/');
  await openLumenRelay(page);
  await expect(page.locator('.arch-node').first()).toBeVisible();
  await clearSelection(page);
  await page.keyboard.press('ControlOrMeta+/');
  await expect(pane(page)).toBeVisible();
}

test('Cmd/Ctrl+/ shows the Blueprint file beside the canvas and hides it again', async ({ page }) => {
  await open(page);
  await expect(area(page)).toHaveValue(/title: Lumen Relay/);
  await expect(page.locator('#code-gutter')).toContainText('1');
  await expect(page.locator('#code-status')).toContainText('In step with the canvas');
  // The canvas gives way to the pane instead of hiding behind it.
  const viewport = (await page.locator('#canvas-viewport').boundingBox())!;
  const paneBox = (await pane(page).boundingBox())!;
  expect(viewport.x + viewport.width).toBeLessThanOrEqual(paneBox.x + 1);
  // The same keys close it from inside the text.
  await page.keyboard.press('ControlOrMeta+/');
  await expect(pane(page)).toBeHidden();
  await runPaletteCommand(page, 'Toggle Code Pane');
  await expect(pane(page)).toBeVisible();
});

test('typing updates the canvas after a pause, as one undo step', async ({ page }) => {
  await open(page);
  const text = await area(page).inputValue();
  await area(page).fill(text.replace('title: Lumen Relay', 'title: Lumen Relay Two'));
  await expect(page.locator('#doc-title-heading')).toHaveText('Lumen Relay Two');
  await expect(page.locator('#code-status')).toContainText('In step with the canvas');
  await clearSelection(page);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('#doc-title-heading')).toHaveText('Lumen Relay');
  await expect(area(page)).toHaveValue(/title: Lumen Relay\n/);
});

test('text that does not read keeps the last good canvas, marks the line, and never throws the text away', async ({ page }) => {
  await open(page);
  const nodesBefore = await page.locator('.arch-node').count();
  const text = await area(page).inputValue();
  const broken = text.replace('title: Lumen Relay', 'title: [unclosed');
  await area(page).fill(broken);
  await expect(page.locator('#code-status')).toContainText(/problem/);
  await expect(page.locator('#code-diagnostics .code-diagnostic').first()).toBeVisible();
  await expect(page.locator('#code-gutter .is-bad').first()).toBeVisible();
  await expect(page.locator('.arch-node')).toHaveCount(nodesBefore);
  await expect(page.locator('#doc-title-heading')).toHaveText('Lumen Relay');
  await expect(area(page)).toHaveValue(broken);

  // A canvas edit does not overwrite the text that has problems.
  await runPaletteCommand(page, 'Add Service / API Stencil');
  await expect(page.locator('.arch-node')).toHaveCount(nodesBefore + 1);
  await expect(area(page)).toHaveValue(broken);
  await expect(page.locator('#code-status')).toContainText('Reset');

  // Fixing it applies it; Reset takes the canvas version.
  await area(page).fill(text);
  await expect(page.locator('#code-status')).toContainText(/In step|Applied/);
  await area(page).fill(broken);
  await expect(page.locator('#code-status')).toContainText(/problem/);
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(area(page)).toHaveValue(/title: Lumen Relay/);
});

test('edits made on the canvas flow into the text', async ({ page }) => {
  await open(page);
  const count = async () => ((await area(page).inputValue()).match(/position:/g) ?? []).length;
  const before = await count();
  await runPaletteCommand(page, 'Add Service / API Stencil');
  await expect.poll(count).toBe(before + 1);
});

test('Mermaid typed into the pane is converted once to the Blueprint file', async ({ page }) => {
  await open(page);
  await area(page).fill('flowchart LR\n  a[Alpha] --> b[Beta]');
  await expect(page.locator('.arch-node')).toHaveCount(2);
  await expect(area(page)).toHaveValue(/^---/);
  await expect(page.locator('#toast-container')).toContainText('Converted the Mermaid');
});

test('typing on the second page leaves you on the second page', async ({ page }) => {
  await open(page);
  await page.locator('#page-add').click();
  await expect(page.locator('#page-tabs [role="tab"]')).toHaveCount(2);
  await expect(area(page)).toHaveValue(/pages:/);
  const text = await area(page).inputValue();
  await area(page).fill(text.replace('title: Lumen Relay', 'title: Lumen Pages'));
  await expect(page.locator('#doc-title-heading')).toHaveText('Lumen Pages');
  await expect(page.locator('#page-tabs [role="tab"]').nth(1)).toHaveAttribute('aria-selected', 'true');
});

test('selecting on the canvas highlights its lines, and the cursor in a block selects that component', async ({ page }) => {
  await open(page);
  await expect(page.locator('#code-highlight')).toBeHidden();
  await page.locator('.arch-node', { hasText: 'Night Desk' }).locator('.node-select-hit').click();
  const band = page.locator('#code-highlight');
  await expect(band).toBeVisible();
  const lineHeight = await area(page).evaluate((el) => parseFloat(getComputedStyle(el).lineHeight));
  const height = (await band.boundingBox())!.height;
  expect(height).toBeGreaterThan(lineHeight * 5); // a component's block is many lines
  // The band sits on the right component: the title line of the block is inside it.
  const where = await area(page).evaluate((el: HTMLTextAreaElement) => {
    const lines = el.value.split('\n');
    const i = lines.findIndex((l) => l.includes('title: Night Desk'));
    const lh = parseFloat(getComputedStyle(el).lineHeight);
    return { line: i, top: parseFloat(getComputedStyle(el).paddingTop) + i * lh - el.scrollTop };
  });
  const bandBox = (await band.boundingBox())!;
  const areaBox = (await area(page).boundingBox())!;
  expect(areaBox.y + where.top).toBeGreaterThanOrEqual(bandBox.y - 1);
  expect(areaBox.y + where.top).toBeLessThanOrEqual(bandBox.y + bandBox.height);

  // Cursor into another component's block selects that component.
  await area(page).evaluate((el: HTMLTextAreaElement) => {
    const at = el.value.indexOf('title: Fog Archive');
    el.focus();
    el.setSelectionRange(at, at);
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await expect(page.locator('.arch-node', { hasText: 'Fog Archive' }).locator('.node-select-hit')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.arch-node', { hasText: 'Night Desk' }).locator('.node-select-hit')).toHaveAttribute('aria-pressed', 'false');
  // The text did not jump: the cursor is still where it was put.
  expect(await area(page).evaluate((el: HTMLTextAreaElement) => el.value.slice(el.selectionStart, el.selectionStart + 18))).toBe('title: Fog Archive');
});

test('the pane has no axe violations, light and dark, with and without problems', async ({ page }) => {
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await open(page);
    const text = await area(page).inputValue();
    await area(page).fill(text.replace('title: Lumen Relay', 'title: [unclosed'));
    await expect(page.locator('#code-status')).toContainText(/problem/);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).include('#code-pane').analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  }
});
