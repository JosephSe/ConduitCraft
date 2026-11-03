import { expect, test, type Page } from '@playwright/test';
import { openExportDialog } from './helpers';
import { runPaletteCommand } from './helpers';

test('a component opens as a level, edits stay inside it, and undo returns to it', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/?ui=2');
  await page.locator('#btn-empty-showcase').click();
  const nodes = page.locator('.arch-node');
  await expect(nodes.first()).toBeVisible();
  const rootCount = await nodes.count();
  const rootTitle = (await nodes.first().locator('.node-title').textContent()) ?? '';

  // Open the first component from its badge: an empty level, with a breadcrumb and no root components.
  await nodes.first().hover();
  await nodes.first().locator('.node-level-badge').click();
  await expect(page.locator('#level-breadcrumb')).toBeVisible();
  await expect(page.locator('#level-breadcrumb .level-crumb')).toHaveCount(2);
  await expect(page.locator('#level-breadcrumb .level-crumb').last()).toHaveText(rootTitle);
  await expect(nodes).toHaveCount(0);

  // Add a component inside, then go up with the keyboard.
  await runPaletteCommand(page, 'Add Service / API Stencil');
  await expect(nodes).toHaveCount(1);
  await page.keyboard.press('ControlOrMeta+ArrowUp');
  await expect(page.locator('#level-breadcrumb')).toBeHidden();
  await expect(nodes).toHaveCount(rootCount);
  await expect(nodes.first().locator('.node-level-badge')).toHaveAttribute('data-has-child', 'true');

  // The new component lives in the level, so reopening shows it.
  // Reopen with the shortcut, and Escape (nothing selected) goes back up.
  await nodes.first().locator('.node-select-hit').click();
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(page.locator('#level-breadcrumb')).toBeVisible();
  await expect(nodes).toHaveCount(1);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.locator('#level-breadcrumb')).toBeHidden();

  // Undo returns to the level the edit was made in.
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('#level-breadcrumb')).toBeVisible();
  await expect(nodes).toHaveCount(0);
});

const NESTED = `---
title: Shop
nodes:
  web:
    title: Web
    position: [60, 80]
  pay:
    title: Payments
    position: [360, 80]
    children:
      nodes:
        checkout:
          title: Checkout API
          position: [80, 80]
        ledger:
          title: Ledger Service
          kind: store
          position: [380, 80]
        audit:
          title: Audit Job
          position: [230, 260]
      edges:
        - from: checkout
          to: ledger
          label: writes
edges:
  - from: web
    to: pay
    label: POST /pay
---

\`\`\`mermaid
flowchart LR
  web --> pay
\`\`\`
`;

async function loadNested(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/?ui=2');
  await page.locator('#btn-empty-code').click();
  await page.locator('#code-sync-textarea').fill(NESTED);
  await page.locator('#btn-apply-code').click();
  await expect(page.locator('.arch-node')).toHaveCount(2);
}

test('search finds components in other levels and opens the level that holds them', async ({ page }) => {
  await loadNested(page);
  await expect(page.locator('.arch-node .node-level-badge[data-has-child="true"]')).toHaveCount(1);
  await page.keyboard.press('ControlOrMeta+f');
  await page.locator('#hud-search-input').fill('ledger');
  await expect(page.locator('#hud-search-count')).toContainText('in Payments');
  // Typing alone stays put; Enter opens the level and selects the match.
  await expect(page.locator('#level-breadcrumb')).toBeHidden();
  await page.locator('#hud-search-input').press('Enter');
  await expect(page.locator('#level-breadcrumb .level-crumb').last()).toHaveText('Payments');
  await expect(page.locator('.arch-node .node-select-hit[aria-pressed="true"]')).toHaveCount(1);
  // Both ports of the wire from Web show on the level.
  await expect(page.locator('.level-port')).toHaveCount(1);
  await expect(page.locator('.level-port')).toContainText('Web');
});

test('the Review lens covers nested levels and shows the path', async ({ page }) => {
  await loadNested(page);
  await page.keyboard.press('3');
  const nested = page.locator('.insight-item', { hasText: 'Payments:' });
  await expect(nested.first()).toBeVisible();
  await nested.first().click();
  await expect(page.locator('#level-breadcrumb .level-crumb').last()).toHaveText('Payments');
});

test('the HTML export keeps the drill-down', async ({ page, context }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __html?: Blob };
    const create = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (obj: Blob | MediaSource) => {
      if (obj instanceof Blob && obj.type.startsWith('text/html')) w.__html = obj;
      return create(obj);
    };
  });
  await loadNested(page);
  await openExportDialog(page);
  await page.locator('#btn-export-html').click();
  await expect.poll(() => page.evaluate(() => Boolean((window as unknown as { __html?: Blob }).__html))).toBe(true);
  const html = await page.evaluate(async () => (await (window as unknown as { __html: Blob }).__html.text()));
  const viewer = await context.newPage();
  await viewer.setContent(html);
  await expect(viewer.locator('.node-level-badge')).toHaveCount(1);
  await viewer.locator('.node-level-badge').click();
  await expect(viewer.locator('.level-crumb[aria-current="page"]')).toHaveText('Payments');
  await expect(viewer.locator('.arch-node')).toHaveCount(3);
  await viewer.locator('button.level-crumb').first().click();
  await expect(viewer.locator('.arch-node')).toHaveCount(2);
});
