import AxeBuilder from '@axe-core/playwright';
import { clearSelection, openLumenRelay } from './helpers';
import { expect, test, type Page } from '@playwright/test';

const editor = (page: Page) => page.locator('.inline-edit-input');

async function loadShowcase(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await openLumenRelay(page);
  await expect(page.locator('.arch-node').first()).toBeVisible();
}

/** Number of undo steps, measured by walking back and replaying forward (state is restored afterwards). */
async function undoDepth(page: Page): Promise<number> {
  const undo = page.locator('#btn-undo');
  const redo = page.locator('#btn-redo');
  let depth = 0;
  while (await undo.isEnabled()) {
    await undo.click();
    depth += 1;
  }
  for (let i = 0; i < depth; i += 1) await redo.click();
  return depth;
}

/** A node whose title is visible and not covered by anything else, so a real double-click reaches it. */
async function renameableNode(page: Page): Promise<{ id: string; title: string }> {
  const found = await page.evaluate(() => {
    for (const el of document.querySelectorAll<HTMLElement>('.arch-node')) {
      const title = el.querySelector<HTMLElement>('.node-title');
      if (!title) continue;
      const r = title.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) continue;
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      if (hit?.closest('.arch-node') === el) return { id: el.dataset.node!, title: title.textContent!.trim() };
    }
    return null;
  });
  expect(found, 'a node with a visible, uncovered title').not.toBeNull();
  return found!;
}


/** The first element matching `selector` whose centre is not covered by something else (the palette, HUD, ...). */
async function uncovered(page: Page, selector: string): Promise<number> {
  const index = await page.evaluate((sel) => {
    const els = [...document.querySelectorAll<HTMLElement>(sel)];
    return els.findIndex((el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) return false;
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return hit === el || el.contains(hit);
    });
  }, selector);
  expect(index, `a visible, uncovered "${selector}"`).toBeGreaterThanOrEqual(0);
  return index;
}

const nodeTitle = (page: Page, id: string) => page.locator(`.arch-node[data-node="${id}"] .node-title`);

async function dblclickNode(page: Page, id: string): Promise<void> {
  await nodeTitle(page, id).dblclick();
}

test('double-clicking a component edits its name in place', async ({ page }) => {
  await loadShowcase(page);
  const { id, title } = await renameableNode(page);
  await dblclickNode(page, id);

  await expect(editor(page)).toBeVisible();
  await expect(editor(page)).toBeFocused();
  await expect(editor(page)).toHaveValue(title);
  await expect(editor(page)).toHaveAttribute('aria-label', 'Component name');

  await editor(page).fill('Renamed Service');
  await editor(page).press('Enter');
  await expect(editor(page)).toHaveCount(0);
  await expect(nodeTitle(page, id)).toHaveText('Renamed Service');
});

test('rename is one undo step, and undo and redo restore the name', async ({ page }) => {
  await loadShowcase(page);
  const { id, title } = await renameableNode(page);
  const before = await undoDepth(page);

  await dblclickNode(page, id);
  await editor(page).fill('Undo Me');
  await editor(page).press('Enter');
  await expect(nodeTitle(page, id)).toHaveText('Undo Me');

  await page.locator('#btn-undo').click();
  await expect(nodeTitle(page, id)).toHaveText(title);
  await page.locator('#btn-redo').click();
  await expect(nodeTitle(page, id)).toHaveText('Undo Me');
  expect(await undoDepth(page)).toBe(before + 1);
});

test('Escape, an unchanged value and an emptied name all leave the component alone, with no undo step', async ({ page }) => {
  await loadShowcase(page);
  const { id, title } = await renameableNode(page);
  const before = await undoDepth(page);

  await dblclickNode(page, id);
  await editor(page).fill('Never Saved');
  await editor(page).press('Escape');
  await expect(editor(page)).toHaveCount(0);
  await expect(nodeTitle(page, id)).toHaveText(title);

  await dblclickNode(page, id);
  await editor(page).press('Enter'); // unchanged
  await expect(nodeTitle(page, id)).toHaveText(title);

  await dblclickNode(page, id);
  await editor(page).fill('   '); // a component must keep a name
  await editor(page).press('Enter');
  await expect(nodeTitle(page, id)).toHaveText(title);

  expect(await undoDepth(page), 'cancelled edits must not add undo steps').toBe(before);
});

test('clicking elsewhere commits the edit', async ({ page }) => {
  await loadShowcase(page);
  const { id } = await renameableNode(page);
  await dblclickNode(page, id);
  await editor(page).fill('Committed By Blur');
  await page.locator('#doc-title-heading').click();
  await expect(editor(page)).toHaveCount(0);
  await expect(nodeTitle(page, id)).toHaveText('Committed By Blur');
});

test('typing in the editor does not trigger canvas shortcuts', async ({ page }) => {
  await loadShowcase(page);
  const { id } = await renameableNode(page);
  const nodes = await page.locator('.arch-node').count();

  await dblclickNode(page, id);
  // Backspace and Delete delete the selected component on the canvas, so they must stay inside the field.
  await editor(page).fill('abc');
  await editor(page).press('Backspace');
  await editor(page).press('Delete');
  await editor(page).press('ControlOrMeta+a');
  await editor(page).press('Backspace');
  await editor(page).press('Escape');

  await expect(page.locator('.arch-node')).toHaveCount(nodes);
  await expect(page.locator(`.arch-node[data-node="${id}"]`)).toHaveCount(1);
});

test('F2 renames the selected component from the keyboard and returns focus afterwards', async ({ page }) => {
  await loadShowcase(page);
  const { id } = await renameableNode(page);
  await nodeTitle(page, id).click(); // select it
  await expect(page.locator(`.arch-node[data-node="${id}"] .node-select-hit`)).toHaveAttribute('aria-pressed', 'true');

  await page.keyboard.press('F2');
  await expect(editor(page)).toBeVisible();
  await editor(page).fill('Via F2');
  await page.keyboard.press('Enter');
  await expect(nodeTitle(page, id)).toHaveText('Via F2');
  await expect(page.locator(`.arch-node[data-node="${id}"] .node-select-hit`)).toBeFocused();
});

test('F2 with nothing selected says what to select', async ({ page }) => {
  await loadShowcase(page);
  await page.keyboard.press('Escape');
  await page.keyboard.press('F2');
  await expect(page.locator('#toast-container')).toContainText('Select a component, swimlane, note or wire to rename');
  await expect(editor(page)).toHaveCount(0);
});

test('a locked component cannot be renamed', async ({ page }) => {
  await loadShowcase(page);
  const { id } = await renameableNode(page);
  await nodeTitle(page, id).click();
  await page.keyboard.press('ControlOrMeta+l');
  await expect(page.locator('#toast-container')).toContainText('Locked selection');

  await dblclickNode(page, id);
  await expect(page.locator('#toast-container')).toContainText('is locked');
  await expect(editor(page)).toHaveCount(0);
});

test('double-clicking in Connect mode does not open the editor', async ({ page }) => {
  await loadShowcase(page);
  const { id } = await renameableNode(page);
  await page.locator('[data-rail-tool="connect"]').first().evaluate((el: HTMLElement) => el.click());
  await nodeTitle(page, id).dblclick();
  await expect(editor(page)).toHaveCount(0);
});

test('a swimlane can be renamed by double-clicking its title', async ({ page }) => {
  await loadShowcase(page);
  const title = page.locator('.zone-banner .zone-title').nth(await uncovered(page, '.zone-banner .zone-title'));
  await title.dblclick();
  await expect(editor(page)).toHaveAttribute('aria-label', 'Swimlane name');
  await editor(page).fill('Edge Tier');
  await editor(page).press('Enter');
  await expect(title).toHaveText('Edge Tier');
});

test('a note can be renamed by double-clicking its title', async ({ page }) => {
  await loadShowcase(page);
  // The showcase opens with a component selected; in the redesign its toolbar floats over nearby wires.
  await clearSelection(page);
  const title = page.locator('.blueprint-spec .notes-title').nth(await uncovered(page, '.blueprint-spec .notes-title'));
  await title.dblclick();
  await expect(editor(page)).toHaveAttribute('aria-label', 'Note title');
  await editor(page).fill('Runbook');
  await editor(page).press('Enter');
  await expect(title).toHaveText('Runbook');
});

test('a wire label can be set and cleared by double-clicking the wire', async ({ page }) => {
  await loadShowcase(page);
  // The showcase opens with a component selected; in the redesign its toolbar floats over nearby wires.
  await clearSelection(page);
  // Find a wire with a clear spot a third of the way along (the middle of a selected wire holds its bend handle).
  const target = await page.evaluate(() => {
    for (const group of document.querySelectorAll<SVGGElement>('.conduit-group')) {
      const path = group.querySelector<SVGPathElement>('.conduit-hit');
      const ctm = path?.getScreenCTM();
      if (!path || !ctm) continue;
      const mid = path.getPointAtLength(path.getTotalLength() * 0.3);
      const pt = new DOMPoint(mid.x, mid.y).matrixTransform(ctm);
      if (pt.x < 0 || pt.y < 0 || pt.x > innerWidth || pt.y > innerHeight) continue;
      if (document.elementFromPoint(pt.x, pt.y)?.closest('.conduit-group') === group) {
        return { id: group.dataset.edgeId!, x: pt.x, y: pt.y };
      }
    }
    return null;
  });
  expect(target, 'a wire that can be double-clicked').not.toBeNull();
  const wire = page.locator(`.conduit-group[data-edge-id="${target!.id}"]`);

  await page.mouse.dblclick(target!.x, target!.y);
  await expect(editor(page)).toHaveAttribute('aria-label', 'Wire label');
  await editor(page).fill('mTLS stream');
  await editor(page).press('Enter');
  await expect(wire).toHaveAttribute('aria-label', /mTLS stream/);

  await page.mouse.dblclick(target!.x, target!.y);
  await expect(editor(page)).toHaveValue('mTLS stream');
  await editor(page).fill('');
  await editor(page).press('Enter');
  await expect(wire).not.toHaveAttribute('aria-label', /mTLS stream/);
});

test('the editor has no accessibility violations while open', async ({ page }) => {
  await loadShowcase(page);
  const { id } = await renameableNode(page);
  await dblclickNode(page, id);
  await expect(editor(page)).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
});

test('the shortcuts cheat-sheet lists F2', async ({ page }) => {
  await loadShowcase(page);
  await page.keyboard.press('?');
  await expect(page.locator('#shortcuts-dialog-body, .shortcuts-grid').first()).toContainText('F2');
});
