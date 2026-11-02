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

test('lock, group and align commands record an undo step only when something changes', async ({ page }) => {
  await loadShowcase(page);
  await page.keyboard.press('Escape'); // nothing selected
  await expect(page.locator('.node-select-hit[aria-pressed="true"]')).toHaveCount(0);
  const before = await undoDepth(page);

  // Nothing to lock.
  await page.keyboard.press('ControlOrMeta+l');
  await expect(page.locator('#toast-container')).toContainText('Select a component to lock');
  expect(await undoDepth(page), 'locking nothing must not add an undo step').toBe(before);

  // Ungrouping a selection that is not grouped.
  await page.keyboard.press('ControlOrMeta+Shift+g');
  await expect(page.locator('#toast-container')).toContainText('No group to ungroup');
  expect(await undoDepth(page), 'ungrouping nothing must not add an undo step').toBe(before);

  // Aligning: the first click moves things, the second finds them already aligned. Measure only at the end,
  // because walking the undo stack clears the multi-selection that the Align buttons belong to.
  await page.keyboard.press('ControlOrMeta+a');
  const alignLeft = page.getByRole('button', { name: 'Align Left', exact: true });
  await expect(alignLeft).toBeVisible();
  await alignLeft.click();
  await alignLeft.click();
  expect(await undoDepth(page), 'two aligns add one undo step: the second changed nothing').toBe(before + 1);
});

/** A point of bare canvas at least `minGap` px from `from`, where a wire can be dropped to create a component. */
async function emptyCanvasPoint(page: Page, from: { x: number; y: number }, minGap = 120) {
  const point = await page.evaluate(
    ([fx, fy, gap]) => {
      const vp = document.getElementById('canvas-viewport')!.getBoundingClientRect();
      const blocked = '.arch-node, .blueprint-spec, .zone-banner, .conduit-group, .canvas-hud, button, input, a';
      for (let y = vp.top + 120; y < vp.bottom - 140; y += 30) {
        for (let x = vp.left + 40; x < vp.right - 40; x += 30) {
          if (Math.hypot(x - (fx as number), y - (fy as number)) < (gap as number)) continue;
          const el = document.elementFromPoint(x, y);
          if (el && document.getElementById('canvas-viewport')!.contains(el) && !el.closest(blocked)) return { x, y };
        }
      }
      return null;
    },
    [from.x, from.y, minGap] as const,
  );
  expect(point, 'a spot of bare canvas').not.toBeNull();
  return point!;
}

const nodeCount = (page: Page) => page.locator('.arch-node').count();

test('dropping a wire on empty canvas creates a connected component with its name ready to edit', async ({ page }) => {
  await loadShowcase(page);
  const [a] = await unconnectedPair(page);
  const from = (await clickableCentre(page, a))!;
  const to = await emptyCanvasPoint(page, from);
  const nodesBefore = await nodeCount(page);
  const wiresBefore = await wireCount(page);

  await enterConnectMode(page);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();

  await expect.poll(() => nodeCount(page)).toBe(nodesBefore + 1);
  expect(await wireCount(page)).toBe(wiresBefore + 1);
  // The new component's name is open for editing straight away.
  await expect(page.locator('.inline-edit-input')).toBeVisible();
  await expect(page.locator('.inline-edit-input')).toHaveAttribute('aria-label', 'Component name');
  await page.locator('.inline-edit-input').fill('Dropped Service');
  await page.locator('.inline-edit-input').press('Enter');
  await expect(page.locator('.arch-node .node-title', { hasText: 'Dropped Service' })).toHaveCount(1);

  // The new wire runs from the dragged component to the new one.
  const created = await page.evaluate(() => {
    const el = [...document.querySelectorAll<HTMLElement>('.arch-node')].find((n) => n.textContent?.includes('Dropped Service'))!;
    return el.dataset.node!;
  });
  await expect(page.locator(`.conduit-group[data-from="${a}"][data-to="${created}"]`)).toHaveCount(1);

  // Component + wire + rename: the creation is one undo step (the rename is its own), so two undos remove it all.
  await page.locator('#btn-undo').click();
  await page.locator('#btn-undo').click();
  await expect.poll(() => nodeCount(page)).toBe(nodesBefore);
  expect(await wireCount(page)).toBe(wiresBefore);
  await page.locator('#btn-redo').click();
  await page.locator('#btn-redo').click();
  await expect.poll(() => nodeCount(page)).toBe(nodesBefore + 1);
});

test('a short slip, Escape, or dropping on another component does not create a component', async ({ page }) => {
  await loadShowcase(page);
  const [a, b] = await unconnectedPair(page);
  const from = (await clickableCentre(page, a))!;
  const onB = (await clickableCentre(page, b))!;
  const far = await emptyCanvasPoint(page, from);
  const nodesBefore = await nodeCount(page);
  await enterConnectMode(page);

  // A tiny drag that ends on bare canvas is a slip, not a request for a component.
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 10, from.y + 6, { steps: 3 });
  await page.mouse.up();
  expect(await nodeCount(page)).toBe(nodesBefore);

  // Escape during a long drag cancels it.
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(far.x, far.y, { steps: 8 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  expect(await nodeCount(page)).toBe(nodesBefore);
  await expect(page.locator('.inline-edit-input')).toHaveCount(0);

  // Dropping on another component wires to it rather than creating a new one.
  const wires = await wireCount(page);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(onB.x, onB.y, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => wireCount(page)).toBe(wires + 1);
  expect(await nodeCount(page)).toBe(nodesBefore);
});

/** Select a wire by clicking its midpoint (one that is not covered by a component), and return its identity. */
async function selectWire(page: Page): Promise<{ id: string; from: string; to: string }> {
  const target = await page.evaluate(() => {
    for (const group of document.querySelectorAll<SVGGElement>('.conduit-group')) {
      const path = group.querySelector<SVGPathElement>('.conduit-hit');
      const ctm = path?.getScreenCTM();
      if (!path || !ctm) continue;
      const mid = path.getPointAtLength(path.getTotalLength() / 2);
      const pt = new DOMPoint(mid.x, mid.y).matrixTransform(ctm);
      if (pt.x < 0 || pt.y < 0 || pt.x > innerWidth || pt.y > innerHeight) continue;
      if (document.elementFromPoint(pt.x, pt.y)?.closest('.conduit-group') === group) {
        return { id: group.dataset.edgeId!, from: group.dataset.from!, to: group.dataset.to!, x: pt.x, y: pt.y };
      }
    }
    return null;
  });
  expect(target, 'a wire that can be clicked').not.toBeNull();
  await page.mouse.click(target!.x, target!.y);
  await expect(page.locator(`.conduit-group[data-edge-id="${target!.id}"]`)).toHaveClass(/is-selected/);
  return { id: target!.id, from: target!.from, to: target!.to };
}

async function handleCentre(page: Page, edgeId: string, end: 'from' | 'to') {
  const box = await page.locator(`#wire-handles-svg .conduit-endpoint-handle[data-edge-id="${edgeId}"][data-end="${end}"]`).boundingBox();
  expect(box, `the ${end} handle`).not.toBeNull();
  return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
}

/** A clickable component that is neither of the wire's own ends. */
async function otherNode(page: Page, exclude: string[]): Promise<string> {
  for (const id of await nodeIdsInDomOrder(page)) {
    if (!exclude.includes(id) && (await clickableCentre(page, id))) return id;
  }
  throw new Error('no other clickable node');
}

test('dragging a wire end onto another component re-attaches it, as one undo step', async ({ page }) => {
  await loadShowcase(page);
  const wire = await selectWire(page);
  const newTarget = await otherNode(page, [wire.from, wire.to]);
  const group = page.locator(`.conduit-group[data-edge-id="${wire.id}"]`);
  const wiresBefore = await wireCount(page);

  const handle = await handleCentre(page, wire.id, 'to');
  const drop = (await clickableCentre(page, newTarget))!;
  await page.mouse.move(handle.x, handle.y);
  await page.mouse.down();
  await page.mouse.move((handle.x + drop.x) / 2, (handle.y + drop.y) / 2, { steps: 6 });
  await expect(page.locator('#workspace')).toHaveAttribute('data-wiring', 'true');
  await page.mouse.move(drop.x, drop.y, { steps: 6 });
  await page.mouse.up();

  await expect(group).toHaveAttribute('data-to', newTarget);
  await expect(group).toHaveAttribute('data-from', wire.from);
  expect(await wireCount(page), 'no wire is added or removed').toBe(wiresBefore);
  await expect(page.locator('#toast-container')).toContainText('Wire reconnected');

  await page.locator('#btn-undo').click();
  await expect(group).toHaveAttribute('data-to', wire.to);
  await page.locator('#btn-redo').click();
  await expect(group).toHaveAttribute('data-to', newTarget);
});

test('the source end can be dragged too', async ({ page }) => {
  await loadShowcase(page);
  const wire = await selectWire(page);
  const newSource = await otherNode(page, [wire.from, wire.to]);
  const group = page.locator(`.conduit-group[data-edge-id="${wire.id}"]`);

  const handle = await handleCentre(page, wire.id, 'from');
  const drop = (await clickableCentre(page, newSource))!;
  await page.mouse.move(handle.x, handle.y);
  await page.mouse.down();
  await page.mouse.move(drop.x, drop.y, { steps: 10 });
  await page.mouse.up();

  await expect(group).toHaveAttribute('data-from', newSource);
  await expect(group).toHaveAttribute('data-to', wire.to);
});

test('dropping a wire end on bare canvas, or pressing Escape, leaves the wire alone', async ({ page }) => {
  await loadShowcase(page);
  const wire = await selectWire(page);
  const group = page.locator(`.conduit-group[data-edge-id="${wire.id}"]`);
  const handle = await handleCentre(page, wire.id, 'to');
  const bare = await emptyCanvasPoint(page, handle);
  const before = await undoDepth(page);

  // Select the wire again (walking the undo stack in undoDepth cleared the selection).
  await selectWire(page);
  const start = await handleCentre(page, wire.id, 'to');
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(bare.x, bare.y, { steps: 8 });
  await page.mouse.up();
  await expect(group).toHaveAttribute('data-to', wire.to);

  await selectWire(page);
  const again = await handleCentre(page, wire.id, 'to');
  const other = (await clickableCentre(page, await otherNode(page, [wire.from, wire.to])))!;
  await page.mouse.move(again.x, again.y);
  await page.mouse.down();
  await page.mouse.move(other.x, other.y, { steps: 8 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(group).toHaveAttribute('data-to', wire.to);
  await expect(page.locator('#workspace')).not.toHaveAttribute('data-wiring', 'true');
  expect(await undoDepth(page), 'cancelled drags add no undo steps').toBe(before);
});

test('a wire end cannot be dropped onto the component at its other end', async ({ page }) => {
  await loadShowcase(page);
  const wire = await selectWire(page);
  const group = page.locator(`.conduit-group[data-edge-id="${wire.id}"]`);
  const handle = await handleCentre(page, wire.id, 'to');
  const onSource = (await clickableCentre(page, wire.from))!;

  await page.mouse.move(handle.x, handle.y);
  await page.mouse.down();
  await page.mouse.move(onSource.x, onSource.y, { steps: 8 });
  await page.mouse.up();

  await expect(page.locator('#toast-container')).toContainText("can't connect a component to itself");
  await expect(group).toHaveAttribute('data-to', wire.to);
});

test('endpoint handles appear only on the selected wire', async ({ page }) => {
  await loadShowcase(page);
  await expect(page.locator('.conduit-endpoint-handle')).toHaveCount(0);
  const wire = await selectWire(page);
  await expect(page.locator(`#wire-handles-svg .conduit-endpoint-handle[data-edge-id="${wire.id}"]`)).toHaveCount(2);
  await expect(page.locator('.conduit-endpoint-handle')).toHaveCount(2);
  // The showcase is framed zoomed out, where a fixed-size handle would be a couple of pixels wide.
  const size = await page.locator('.conduit-endpoint-handle').first().boundingBox();
  expect(size!.width, 'handles stay easy to grab when zoomed out').toBeGreaterThanOrEqual(12);
  await page.keyboard.press('Escape');
  await expect(page.locator('.conduit-endpoint-handle')).toHaveCount(0);
});

test('the wire inspector can re-attach either end without a mouse', async ({ page }) => {
  await loadShowcase(page);
  const wire = await selectWire(page);
  const newTarget = await otherNode(page, [wire.from, wire.to]);
  const group = page.locator(`.conduit-group[data-edge-id="${wire.id}"]`);

  await expect(page.locator('#prop-edge-from')).toHaveValue(wire.from);
  await expect(page.locator('#prop-edge-to')).toHaveValue(wire.to);

  await page.locator('#prop-edge-to').selectOption(newTarget);
  await expect(group).toHaveAttribute('data-to', newTarget);
  await expect(page.locator('#prop-edge-to')).toHaveValue(newTarget);

  // Choosing the component at the other end is refused, and the selector goes back.
  await page.locator('#prop-edge-to').selectOption(wire.from);
  await expect(page.locator('#toast-container')).toContainText("can't connect a component to itself");
  await expect(group).toHaveAttribute('data-to', newTarget);
  await expect(page.locator('#prop-edge-to')).toHaveValue(newTarget);

  await page.locator('#btn-undo').click();
  await expect(group).toHaveAttribute('data-to', wire.to);
});
