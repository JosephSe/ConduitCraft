import { expect, test, type Page } from '@playwright/test';
import { openLumenRelay, seedStorage, undo } from './helpers';

async function load(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/');
  await openLumenRelay(page);
  await expect(page.locator('.arch-node').first()).toBeVisible();
}

interface Pick {
  a: string;
  b: string;
  /** Screen pixels to drag A so its left edge ends 3 world pixels to the right of B's. */
  dx: number;
  from: { x: number; y: number };
  bX: number;
}

/** Two components far enough apart in x to drag between, and where the first can be grabbed. */
async function pick(page: Page): Promise<Pick> {
  const result = await page.evaluate(() => {
    const els = [...document.querySelectorAll<HTMLElement>('.arch-node')];
    const info = els.map((el) => {
      const hit = el.querySelector<HTMLElement>('.node-select-hit');
      const r = hit?.getBoundingClientRect();
      const x = r ? r.x + r.width / 2 : 0;
      const y = r ? r.y + r.height / 2 : 0;
      const top = document.elementFromPoint(x, y)?.closest('.arch-node') === el;
      return {
        id: el.dataset.node!,
        nx: Number(el.style.getPropertyValue('--nx')),
        scale: el.getBoundingClientRect().width / el.offsetWidth,
        x,
        y,
        grabbable: top && !!r && r.width > 0,
      };
    });
    for (const a of info) {
      if (!a.grabbable) continue;
      for (const b of info) {
        if (a === b || Math.abs(b.nx - a.nx) < 80) continue;
        return { a: a.id, b: b.id, dx: (b.nx + 3 - a.nx) * a.scale, from: { x: a.x, y: a.y }, bX: b.nx };
      }
    }
    return null;
  });
  if (!result) throw new Error('no pair of components to drag between');
  return result;
}

const nodeX = (page: Page, id: string) =>
  page.evaluate((nid) => Number(document.querySelector<HTMLElement>(`.arch-node[data-node="${nid}"]`)!.style.getPropertyValue('--nx')), id);

const guideLines = (page: Page) => page.locator('#guides-g line.guide-line');

test('dragging a component near another snaps its edge to it and draws a guide', { tag: '@quick' }, async ({ page }) => {
  await load(page);
  const { a, bX, dx, from } = await pick(page);

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y, { steps: 10 });
  await expect.poll(() => guideLines(page).count()).toBeGreaterThan(0);
  await page.mouse.up();

  await expect.poll(() => nodeX(page, a)).toBe(bX);
  await expect(page.locator('#guides-g > *')).toHaveCount(0);
});

test('holding Ctrl while dragging draws no guides', async ({ page }) => {
  await load(page);
  const { dx, from } = await pick(page);

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.keyboard.down('Control');
  await page.mouse.move(from.x + dx, from.y, { steps: 10 });
  await expect(guideLines(page)).toHaveCount(0);
  await page.keyboard.up('Control');
  await page.mouse.up();
});

test('holding Alt while dragging shows distances in px', async ({ page }) => {
  await load(page);
  const { dx, from } = await pick(page);

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.keyboard.down('Alt');
  await page.mouse.move(from.x + dx, from.y + 2, { steps: 10 });
  const labels = page.locator('#guides-g text.guide-label');
  await expect(page.locator('#guides-g .guide-distance').first()).toBeAttached();
  await expect(labels.first()).toContainText('px');
  await page.keyboard.up('Alt');
  await page.mouse.up();
  await expect(page.locator('#guides-g > *')).toHaveCount(0);
});

test('a snapped drag is still one undo step', async ({ page }) => {
  await load(page);
  const { a, dx, from } = await pick(page);
  const before = await nodeX(page, a);

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y, { steps: 10 });
  await page.mouse.up();
  expect(await nodeX(page, a)).not.toBe(before);

  await undo(page);
  await expect.poll(() => nodeX(page, a)).toBe(before);
});

/**
 * One swimlane (x 100 to 700, centre 400) holding two components of different sizes, placed so that no edge of one is
 * near a line of the other: only centres can line up.
 */
const laneNode = (id: string, x: number, y: number, width: number, height: number) => ({
  id,
  kind: 'service',
  accent: 'blue',
  icon: 'code',
  title: id,
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
  y,
  width,
  height,
});

async function loadLane(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.addInitScript(() => sessionStorage.setItem('conduitcraft-home-shown', '1'));
  const doc = {
    title: 'Lane guides',
    direction: 'LR',
    stageWidth: 1200,
    stageHeight: 700,
    brand: { name: '', accent: '', logo: '' },
    nodes: [laneNode('Mover', 150, 300, 222, 142), laneNode('Sibling', 560, 120, 120, 96)],
    edges: [],
    zones: [{ id: 'lane', number: '01', title: 'Lane', subtitle: '', x: 100, width: 600 }],
    notesCards: [],
    simulations: [],
  };
  await seedStorage(page, { diagrams: [{ id: 'autosave', title: doc.title, updatedAt: Date.now(), doc }] });
  await page.goto('/');
  await page.locator('#btn-restore-open').click();
  await expect(page.locator('.arch-node[data-node="Mover"]')).toBeVisible();
  await expect(page.locator('.zone-banner')).toHaveCount(1);
}

/** Drag the mover by world units, holding the button down, and return the guide lines drawn at that point. */
async function dragMover(page: Page, worldDx: number, worldDy: number): Promise<string[]> {
  const grab = await page.evaluate(() => {
    const host = document.querySelector<HTMLElement>('.arch-node[data-node="Mover"]')!;
    const hit = host.querySelector<HTMLElement>('.node-select-hit')!.getBoundingClientRect();
    return { x: hit.x + hit.width / 2, y: hit.y + hit.height / 2, scale: host.getBoundingClientRect().width / host.offsetWidth };
  });
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  await page.mouse.move(grab.x + worldDx * grab.scale, grab.y + worldDy * grab.scale, { steps: 12 });
  await expect.poll(() => guideLines(page).count()).toBeGreaterThan(0);
  return page.evaluate(() =>
    [...document.querySelectorAll('#guides-g line.guide-line')].map((l) =>
      l.getAttribute('x1') === l.getAttribute('x2') ? `x=${l.getAttribute('x1')}` : `y=${l.getAttribute('y1')}`,
    ),
  );
}

const nodeY = (page: Page, id: string) =>
  page.evaluate((nid) => Number(document.querySelector<HTMLElement>(`.arch-node[data-node="${nid}"]`)!.style.getPropertyValue('--ny')), id);

test('dragging a component near the middle of its swimlane snaps its centre there and draws a guide', async ({ page }) => {
  await loadLane(page);
  // The mover's centre goes from 261 to 403: three short of the lane centre, 400.
  const lines = await dragMover(page, 142, 0);
  expect(lines).toContain('x=400');
  await page.mouse.up();
  await expect.poll(() => nodeX(page, 'Mover')).toBe(400 - 111);
  await expect(page.locator('#guides-g > *')).toHaveCount(0);
});

test('dragging a component in a swimlane lines its centre up with a sibling on both axes', async ({ page }) => {
  await loadLane(page);
  // The sibling's centre is (620, 168). Aim the mover's centre at (618, 170).
  const lines = await dragMover(page, 618 - 261, 170 - 371);
  expect(lines).toEqual(expect.arrayContaining(['x=620', 'y=168']));
  await page.mouse.up();
  await expect.poll(() => nodeX(page, 'Mover')).toBe(620 - 111);
  expect(await nodeY(page, 'Mover')).toBe(168 - 71);
});
