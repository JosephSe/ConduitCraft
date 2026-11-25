import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { seedAutosave } from './helpers';

const node = (id: string, title: string, x: number) => ({
  id,
  kind: 'service',
  accent: 'blue',
  icon: 'code',
  title,
  subtitle: 'Request Processor',
  eyebrow: 'SERVICE',
  footerLeft: 'REST / gRPC',
  chip: 'API',
  zoneLabel: 'ARCHITECTURE STAGE',
  interfaceLabel: 'REST / gRPC mTLS',
  summary: 'A part.',
  metrics: [],
  code: '{}',
  x,
  y: 200,
  width: 222,
  height: 142,
});

/** Two components joined by two labelled wires: the wires run side by side in lanes. */
const parallelWires = {
  title: 'Parallel wires',
  direction: 'LR',
  stageWidth: 1680,
  stageHeight: 920,
  brand: { name: '', accent: '', logo: '' },
  nodes: [node('a', 'Web UI', 120), node('b', 'Platform', 640)],
  edges: [
    { id: 'e1', from: 'a', to: 'b', sourcePort: 'right', targetPort: 'left', tone: 'emerald', route: 'auto', label: 'W/L CRUD operations', animated: true },
    { id: 'e2', from: 'a', to: 'b', sourcePort: 'right', targetPort: 'left', tone: 'violet', route: 'auto', label: 'W/L Search', animated: true },
  ],
  zones: [],
  notesCards: [],
  simulations: [],
};

/** Screen centre of a wire's label, and the screen y of its drawn rail under that centre. */
async function labelAndWire(page: Page, edgeId: string) {
  return page.evaluate((id) => {
    const g = document.querySelector<SVGGElement>(`.conduit-group[data-edge-id="${id}"]`)!;
    const pill = document.querySelector(`#wire-labels-svg .conduit-badge-hit[data-edge-id="${id}"] .route-pill-bg`)!.getBoundingClientRect();
    const rail = g.querySelector<SVGPathElement>('.conduit-rail')!;
    const box = rail.getBoundingClientRect();
    return { x: pill.x + pill.width / 2, y: pill.y + pill.height / 2, h: pill.height, wireY: box.y + box.height / 2 };
  }, edgeId);
}

test('labels of parallel wires sit on their own wires, and a label can be dragged anywhere', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await seedAutosave(page, parallelWires);
  await page.goto('/');
  await page.locator('[data-home-open]', { hasText: 'Parallel wires' }).click();
  await expect(page.locator('#home-dialog')).toBeHidden();
  await expect(page.locator('#wire-labels-svg .conduit-badge-hit[data-edge-id="e2"] .route-pill-bg')).toBeVisible();

  // Each wire passes through its own label (not beside it, as when the lane offset was left off the label).
  for (const id of ['e1', 'e2']) {
    const { y, h, wireY } = await labelAndWire(page, id);
    expect(Math.abs(y - wireY), `${id}: wire runs through its label`).toBeLessThan(h / 2);
  }

  // Drag the second label up and to the right; it lands where it was dropped.
  const before = await labelAndWire(page, 'e2');
  await page.mouse.move(before.x, before.y);
  await page.mouse.down();
  await page.mouse.move(before.x + 30, before.y - 40, { steps: 6 });
  await page.mouse.move(before.x + 60, before.y - 80, { steps: 6 });
  await page.mouse.up();
  const after = await labelAndWire(page, 'e2');
  expect(after.x - before.x).toBeCloseTo(60, -1);
  expect(after.y - before.y).toBeCloseTo(-80, -1);
  await expect(page.getByRole('button', { name: 'Reset label position' })).toBeVisible();

  // The inspector puts it back on its wire.
  await page.getByRole('button', { name: 'Reset label position' }).click();
  const reset = await labelAndWire(page, 'e2');
  expect(Math.abs(reset.y - reset.wireY)).toBeLessThan(reset.h / 2);
  await expect(page.getByRole('button', { name: 'Reset label position' })).toHaveCount(0);
});

test('wire labels sit above components and short-gap labels stay quiet until hovered (V4 MP7)', async ({ page }) => {
  const tightDoc = {
    ...parallelWires,
    title: 'Tight gap labels',
    nodes: [node('a', 'Service A', 120), node('b', 'Service B', 392)],
    edges: [
      { id: 'e1', from: 'a', to: 'b', sourcePort: 'right', targetPort: 'left', tone: 'blue', route: 'auto', label: 'A very descriptive pill label', animated: true },
    ],
  };
  await page.setViewportSize({ width: 1400, height: 900 });
  await seedAutosave(page, tightDoc);
  await page.goto('/');
  await page.locator('[data-home-open]', { hasText: 'Tight gap labels' }).click();
  await expect(page.locator('#home-dialog')).toBeHidden();

  const stack = await page.evaluate(() => {
    const labels = document.getElementById('wire-labels-svg')!;
    const nodes = document.getElementById('nodes-layer')!;
    const rawNodesZ = getComputedStyle(nodes).zIndex;
    return {
      labelsAfterNodes: Boolean(nodes.compareDocumentPosition(labels) & Node.DOCUMENT_POSITION_FOLLOWING),
      labelsZ: Number(getComputedStyle(labels).zIndex || 0),
      nodesZ: rawNodesZ === 'auto' ? 0 : Number(rawNodesZ),
    };
  });
  expect(stack.labelsAfterNodes).toBe(true);
  expect(stack.labelsZ).toBeGreaterThan(stack.nodesZ);

  const badge = page.locator('#wire-labels-svg .conduit-badge-hit[data-edge-id="e1"]');
  await expect(badge).toHaveAttribute('data-fits', '0');
  await expect(badge).toBeHidden();

  // Hovering the wire midpoint reveals the label above the adjacent cards without clipping.
  const pt = await page.evaluate(() => {
    const path = document.querySelector<SVGPathElement>('.conduit-group[data-edge-id="e1"] .conduit-hit')!;
    const m = path.getPointAtLength(path.getTotalLength() / 2);
    const p = new DOMPoint(m.x, m.y).matrixTransform(path.getScreenCTM()!);
    return { x: p.x, y: p.y };
  });
  await page.mouse.move(pt.x, pt.y);
  await expect(badge).toBeVisible();
});
