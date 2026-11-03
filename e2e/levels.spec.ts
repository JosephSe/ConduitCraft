import { expect, test, type Page } from '@playwright/test';
import { openExportDialog, openLumenRelay, runPaletteCommand } from './helpers';

test('a component opens as a level, edits stay inside it, and undo returns to it', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/?ui=2');
  await openLumenRelay(page);
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
  await runPaletteCommand(page, 'Mermaid Import');
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

const node = (page: Page, title: string) => page.locator('.arch-node', { hasText: title });

test('failing a component fails everything inside it, announces it once, and nothing leaks upward', async ({ page }) => {
  await loadNested(page);
  await page.keyboard.press('2');
  await node(page, 'Payments').locator('.node-select-hit').click();
  await page.keyboard.press('x');
  await expect(node(page, 'Payments')).toHaveAttribute('data-chaos', 'failed');

  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(page.locator('#level-breadcrumb .level-crumb').last()).toHaveText('Payments');
  await expect(page.locator('.arch-node')).toHaveCount(3);
  await expect(page.locator('.arch-node[data-chaos="failed"]')).toHaveCount(3);
  await expect(page.locator('#a11y-live-announcer')).toContainText('Inside Payments, which has failed');
  await expect(page.locator('#chaos-summary')).toHaveText(/^3 failed/);

  // Going back up keeps the failure where it was set.
  await page.keyboard.press('ControlOrMeta+ArrowUp');
  await expect(node(page, 'Payments')).toHaveAttribute('data-chaos', 'failed');
  await expect(node(page, 'Web')).not.toHaveAttribute('data-chaos', 'failed');
});

test('failing a component inside a level does not fail its parent', async ({ page }) => {
  await loadNested(page);
  await page.keyboard.press('2');
  await node(page, 'Payments').locator('.node-select-hit').click();
  await page.keyboard.press('ControlOrMeta+Enter');
  await node(page, 'Ledger Service').locator('.node-select-hit').click();
  await page.keyboard.press('x');
  await expect(node(page, 'Ledger Service')).toHaveAttribute('data-chaos', 'failed');
  await expect(page.locator('.arch-node[data-chaos="failed"]')).toHaveCount(1);

  await page.keyboard.press('ControlOrMeta+ArrowUp');
  await expect(page.locator('.arch-node[data-chaos="failed"]')).toHaveCount(0);
  // The failure is still there when the level is reopened.
  await node(page, 'Payments').locator('.node-select-hit').click();
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(node(page, 'Ledger Service')).toHaveAttribute('data-chaos', 'failed');
});

test('a boundary port is cut off when the component outside has failed', async ({ page }) => {
  await loadNested(page);
  await page.keyboard.press('2');
  await node(page, 'Web').locator('.node-select-hit').click();
  await page.keyboard.press('x');
  await node(page, 'Payments').locator('.node-select-hit').click();
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(page.locator('.level-port')).toHaveAttribute('data-cut-off', 'true');
  await expect(page.locator('.level-port')).toHaveAttribute('aria-label', /cut off because it has failed/);
  await expect(page.locator('.arch-node[data-chaos="failed"]')).toHaveCount(0);

  // Restoring Web puts the port back.
  await page.keyboard.press('ControlOrMeta+ArrowUp');
  await node(page, 'Web').locator('.node-select-hit').click();
  await page.keyboard.press('x');
  await node(page, 'Payments').locator('.node-select-hit').click();
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(page.locator('.level-port')).not.toHaveAttribute('data-cut-off', 'true');
});

const SUBGRAPH = 'flowchart LR\n  subgraph checkout ["Checkout API"]\n    Gateway --> Charge\n  end\n  User --> Gateway';

async function importSubgraph(page: Page, mode: 'Swimlanes' | 'Levels'): Promise<void> {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/?ui=2');
  await runPaletteCommand(page, 'Mermaid Import');
  await page.locator('#code-sync-textarea').fill(SUBGRAPH);
  await page.locator('.subgraph-mode .segmented-label', { hasText: mode }).click();
  await page.locator('#btn-apply-code').click();
}

test('subgraphs import as swimlanes by default', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/?ui=2');
  await runPaletteCommand(page, 'Mermaid Import');
  await expect(page.locator('input[name="subgraph-mode"][value="swimlanes"]')).toBeChecked();
  await importSubgraph(page, 'Swimlanes');
  await expect(page.locator('.arch-node')).toHaveCount(3);
  await expect(page.locator('.node-level-badge[data-has-child="true"]')).toHaveCount(0);
});

test('"Subgraphs as: Levels" imports a subgraph as a component that opens into a level', async ({ page }) => {
  await importSubgraph(page, 'Levels');
  await expect(page.locator('.arch-node')).toHaveCount(2);
  const group = node(page, 'Checkout API');
  await expect(group.locator('.node-level-badge')).toHaveAttribute('data-has-child', 'true');
  await group.locator('.node-select-hit').click();
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(page.locator('#level-breadcrumb')).toBeVisible();
  await expect(page.locator('.arch-node')).toHaveCount(2);
  await expect(node(page, 'Charge')).toBeVisible();
  await expect(page.locator('.level-port')).toHaveCount(1);
});
