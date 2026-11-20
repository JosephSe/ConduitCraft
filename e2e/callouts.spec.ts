import { expect, test, type Page } from '@playwright/test';
import { clearSelection, dropFile, undo } from './helpers';

// Callouts: a speech-bubble note attached to one component. It points at the component, follows it, and goes when
// the component goes.

const KIND = 'conduitcraft.blueprint';

const doc = {
  title: 'Callouts',
  nodes: [
    { id: 'api', kind: 'core', title: 'Payments API', subtitle: '', x: 400, y: 360, width: 242, height: 172 },
  ],
  edges: [],
  zones: [],
  notesCards: [
    {
      id: 'callout-1',
      title: 'Maintenance 12am–2am',
      code: '',
      x: 411,
      y: 304,
      items: [],
      variant: 'callout',
      anchorId: 'api',
      dx: 11,
      dy: -56,
      tone: 'time',
    },
  ],
  simulations: [],
};

async function openSeeded(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await dropFile(page, 'callouts.blueprint.json', JSON.stringify({ kind: KIND, version: 15, document: doc }));
  await expect(page.locator('.arch-node')).toHaveCount(1);
  await clearSelection(page);
}

const callout = (page: Page) => page.locator('.blueprint-spec.is-callout');
const component = (page: Page) => page.locator('.arch-node[data-node="api"]');

test('a callout sits above its component with its tail pointing down', async ({ page }) => {
  await openSeeded(page);
  await expect(callout(page)).toBeVisible();
  await expect(callout(page)).toHaveAttribute('data-tail', 'bottom');
  await expect(callout(page)).toHaveAttribute('data-tone', 'time');
  await expect(callout(page)).toContainText('Maintenance 12am–2am');
  const bubble = (await callout(page).boundingBox())!;
  const node = (await component(page).boundingBox())!;
  expect(bubble.y + bubble.height).toBeLessThan(node.y);
});

test('dragging the component takes the callout along', async ({ page }) => {
  await openSeeded(page);
  const before = (await callout(page).boundingBox())!;
  const node = (await component(page).boundingBox())!;
  const scale = await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('.arch-node[data-node="api"]')!;
    return el.getBoundingClientRect().width / el.offsetWidth;
  });
  const cx = node.x + node.width / 2;
  const cy = node.y + node.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 40, cy, { steps: 4 });
  await page.mouse.move(cx + 120, cy, { steps: 6 });
  await page.mouse.up();
  const nodeAfter = (await component(page).boundingBox())!;
  const after = (await callout(page).boundingBox())!;
  const moved = nodeAfter.x - node.x;
  expect(moved).toBeGreaterThan(60 * scale);
  expect(Math.abs(after.x - before.x - moved)).toBeLessThanOrEqual(2);
});

test('deleting the component removes its callout, and undo brings both back', async ({ page }) => {
  await openSeeded(page);
  const before = (await callout(page).boundingBox())!;
  await component(page).click();
  await page.keyboard.press('Delete');
  await expect(page.locator('.arch-node')).toHaveCount(0);
  await expect(callout(page)).toHaveCount(0);
  await undo(page);
  await expect(page.locator('.arch-node')).toHaveCount(1);
  await expect(callout(page)).toHaveCount(1);
  const after = (await callout(page).boundingBox())!;
  expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(1);
});

test('Add callout from the right-click menu, type text, pick a tone', async ({ page }) => {
  await openSeeded(page);
  await component(page).locator('.node-select-hit').click({ button: 'right' });
  await page.getByRole('menuitem', { name: /Add callout/ }).click();
  await expect(callout(page)).toHaveCount(2);
  const input = page.getByRole('textbox', { name: 'Note title' });
  await expect(input).toBeFocused();
  await page.keyboard.type('Actor loses access at midnight');
  await page.keyboard.press('Enter');
  const added = callout(page).filter({ hasText: 'Actor loses access at midnight' });
  await expect(added).toHaveCount(1);
  await expect(added).toHaveAttribute('data-tone', 'info');
  // The new one stacks above the one already there.
  const first = (await callout(page).filter({ hasText: 'Maintenance' }).boundingBox())!;
  const second = (await added.boundingBox())!;
  expect(second.y + second.height).toBeLessThan(first.y);

  await page.locator('#prop-callout-tone').selectOption('time');
  await expect(added).toHaveAttribute('data-tone', 'time');
  await expect(added.locator('.callout-icon')).toHaveText('⏱');
  await expect(page.locator('#prop-callout-anchor')).toContainText('Payments API');
  await page.locator('#prop-callout-anchor').click();
  // The component's inspector replaces the callout's.
  await expect(page.locator('#prop-tab-look')).toBeVisible();
  await expect(page.locator('#prop-callout-tone')).toHaveCount(0);
});
