import { expect, test, type Page } from '@playwright/test';

async function loadShowcase(page: Page): Promise<void> {
  await page.goto('/');
  await page.locator('#btn-empty-showcase').click();
  await expect(page.locator('.arch-node').first()).toBeVisible();
}

/** Number of undo steps, measured by walking back to the start and replaying forward (state is restored). */
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

/** Centre of a node's hit area in viewport coordinates, only if nothing else covers it. */
async function clickableCentre(page: Page, nodeId: string): Promise<{ x: number; y: number } | null> {
  return page.evaluate((id) => {
    const el = document.querySelector<HTMLElement>(`.arch-node[data-node="${id}"] .node-select-hit`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const x = r.x + r.width / 2;
    const y = r.y + r.height / 2;
    const top = document.elementFromPoint(x, y)?.closest('.arch-node')?.getAttribute('data-node');
    return top === id ? { x, y } : null;
  }, nodeId);
}

async function nodeIdsInDomOrder(page: Page): Promise<string[]> {
  return page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.arch-node')].map((el) => el.dataset.node!));
}

async function selectNode(page: Page, nodeId: string): Promise<void> {
  const centre = await clickableCentre(page, nodeId);
  expect(centre, `node ${nodeId} must be visible and uncovered`).not.toBeNull();
  await page.mouse.click(centre!.x, centre!.y);
  await expect(page.locator(`.arch-node[data-node="${nodeId}"] .node-select-hit`)).toHaveAttribute('aria-pressed', 'true');
}

test('z-order shortcuts only add an undo step when the order really changes', async ({ page }) => {
  await loadShowcase(page);
  const before = await undoDepth(page);

  // The last node in document order is already on the top layer, so "bring to front" is a no-op.
  const ids = await nodeIdsInDomOrder(page);
  const front = ids[ids.length - 1];
  await selectNode(page, front);
  await page.keyboard.press(']');
  await expect(page.locator('#toast-container')).toContainText('Already at the front');
  expect(await undoDepth(page), 'a no-op must not add an undo step').toBe(before);

  // Bringing a lower node to the front does change the order, and is undoable.
  let lower: string | null = null;
  for (const id of ids.slice(0, -1)) {
    if (await clickableCentre(page, id)) {
      lower = id;
      break;
    }
  }
  expect(lower, 'a lower node must be visible and uncovered').not.toBeNull();
  await selectNode(page, lower!);
  await page.keyboard.press(']');
  await expect(page.locator('#toast-container')).toContainText('Brought to front');
  const after = await nodeIdsInDomOrder(page);
  expect(after[after.length - 1]).toBe(lower!);
  expect(await undoDepth(page)).toBe(before + 1);
});

/** Two visible, uncovered nodes that are not already wired together. */
async function unconnectedPair(page: Page): Promise<[string, string]> {
  const pair = await page.evaluate(() => {
    const wired = new Set<string>();
    for (const g of document.querySelectorAll<SVGGElement>('.conduit-group')) {
      wired.add(`${g.dataset.from}|${g.dataset.to}`);
      wired.add(`${g.dataset.to}|${g.dataset.from}`);
    }
    const ok = (id: string) => {
      const el = document.querySelector<HTMLElement>(`.arch-node[data-node="${id}"] .node-select-hit`);
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('.arch-node');
      return top?.getAttribute('data-node') === id;
    };
    const ids = [...document.querySelectorAll<HTMLElement>('.arch-node')].map((el) => el.dataset.node!).filter(ok);
    for (const a of ids) for (const b of ids) if (a !== b && !wired.has(`${a}|${b}`)) return [a, b];
    return null;
  });
  expect(pair, 'the showcase must contain two unconnected visible nodes').not.toBeNull();
  return pair as [string, string];
}

const nodePosition = (page: Page, id: string) =>
  page.evaluate((nodeId) => {
    const el = document.querySelector<HTMLElement>(`.arch-node[data-node="${nodeId}"]`)!;
    return [el.style.getPropertyValue('--nx'), el.style.getPropertyValue('--ny')];
  }, id);

const wireCount = async (page: Page) =>
  Number(/(\d+)\s*WIRES?/.exec((await page.locator('#canvas-stats-pill').textContent()) ?? '')?.[1]);
const currentTool = (page: Page) => page.locator('#workspace').getAttribute('data-tool');
const enterConnectMode = (page: Page) =>
  page.locator('input[name="pointer-tool"][value="connect"]').evaluate((el: HTMLElement) => el.click());

test('dragging between two nodes in Connect mode creates a wire (control)', async ({ page }) => {
  await loadShowcase(page);
  const [a, b] = await unconnectedPair(page);
  const from = (await clickableCentre(page, a))!;
  const to = (await clickableCentre(page, b))!;
  const start = await wireCount(page);
  const positionBefore = await nodePosition(page, a);
  const depthBefore = await undoDepth(page);

  await enterConnectMode(page);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => wireCount(page)).toBe(start + 1);

  // Regression: wiring from a node's body used to also drag that node to the pointer.
  expect(await nodePosition(page, a), 'the source node must not move while wiring').toEqual(positionBefore);
  expect(await undoDepth(page), 'wiring adds exactly one undo step').toBe(depthBefore + 1);
});

test('Escape backs out of a wire drag, then Connect mode', async ({ page }) => {
  await loadShowcase(page);
  const [a, b] = await unconnectedPair(page);
  const from = (await clickableCentre(page, a))!;
  const to = (await clickableCentre(page, b))!;

  await enterConnectMode(page);
  await expect.poll(() => currentTool(page)).toBe('connect');
  const start = await wireCount(page);

  // Escape during the drag cancels it: releasing over the target must not create a wire.
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 8 });
  await expect(page.locator('#workspace')).toHaveAttribute('data-wiring', 'true');
  await page.keyboard.press('Escape');
  await expect(page.locator('#workspace')).not.toHaveAttribute('data-wiring', 'true');
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
  expect(await wireCount(page), 'the cancelled drag must not create a wire').toBe(start);
  expect(await currentTool(page), 'the first Escape only cancels the drag').toBe('connect');

  // A second Escape leaves Connect mode.
  await page.keyboard.press('Escape');
  await expect.poll(() => currentTool(page)).toBe('select');
});

test('a cancelled wire drag does not break the next one', async ({ page }) => {
  await loadShowcase(page);
  const [a, b] = await unconnectedPair(page);
  const from = (await clickableCentre(page, a))!;
  const to = (await clickableCentre(page, b))!;
  const start = await wireCount(page);
  const positionBefore = await nodePosition(page, a);

  await enterConnectMode(page);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 8 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  expect(await wireCount(page)).toBe(start);
  expect(await nodePosition(page, a), 'cancelling must leave the node where it was').toEqual(positionBefore);

  // Still in Connect mode after the cancel, so a normal drag must now connect the nodes.
  expect(await currentTool(page)).toBe('connect');
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => wireCount(page)).toBe(start + 1);
});

test('align buttons have clean labels', async ({ page }) => {
  await loadShowcase(page);
  await page.keyboard.press('ControlOrMeta+a');
  const buttons = page.locator('button.btn-compact', { hasText: /^Align / });
  await expect(buttons.first()).toBeVisible();
  const labels = await buttons.allTextContents();
  expect(labels).toEqual(expect.arrayContaining(['Align Left', 'Align Center', 'Align Top', 'Align Middle']));
  expect(labels.join('|')).not.toMatch(/\b(left|center|top|middle) Align/);
});

test('Data View inspector shows the real diagram title, not the HTML placeholder', async ({ page }) => {
  await loadShowcase(page);
  const title = (await page.locator('#doc-title-heading').textContent())?.trim();
  expect(title).toBeTruthy();
  expect(title).not.toBe('Untitled Architecture');

  // Data View starts on a node; deselecting it shows the whole-diagram overview with the real title.
  await page.locator('input[name="workspace-mode"][value="data"]').evaluate((el: HTMLElement) => el.click());
  await expect(page.locator('#data-inspector-pane')).toBeVisible();
  await page.locator('#canvas-viewport').click({ position: { x: 6, y: 6 } });
  await expect(page.locator('#insp-badge, .inspector-badge').first()).toContainText('SYSTEM OVERVIEW');
  await expect(page.locator('#insp-title')).toHaveText(title!);
});
