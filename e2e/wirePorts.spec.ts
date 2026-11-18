import { expect, test, type Page } from '@playwright/test';
import { seedStorage } from './helpers';

const node = (id: string, kind: string, title: string, x: number, y: number, width: number, height: number) => ({
  id,
  kind,
  accent: 'blue',
  icon: kind === 'actor' ? 'user' : 'code',
  title,
  subtitle: '',
  eyebrow: 'SERVICE',
  footerLeft: '',
  chip: '',
  zoneLabel: '',
  interfaceLabel: '',
  summary: '',
  metrics: [],
  code: '{}',
  x,
  y,
  width,
  height,
});

const wire = (id: string, from: string, to: string, label: string) => ({
  id,
  from,
  to,
  sourcePort: 'top',
  targetPort: 'top',
  tone: 'blue',
  route: 'auto',
  label,
  animated: false,
});

/** A file passes through a person: one wire into the top of the actor and one out of it, both drawn port to port. */
async function loadRelay(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.addInitScript(() => sessionStorage.setItem('conduitcraft-home-shown', '1'));
  const doc = {
    title: 'Relay through a person',
    direction: 'LR',
    stageWidth: 1400,
    stageHeight: 600,
    brand: { name: '', accent: '', logo: '' },
    nodes: [
      node('folder', 'service', 'Secure folder', 80, 190, 240, 170),
      node('colleague', 'actor', 'colleague', 520, 190, 148, 142),
      node('tool', 'service', 'H', 860, 190, 240, 170),
    ],
    edges: [wire('in', 'folder', 'colleague', 'download the file'), wire('out', 'colleague', 'tool', 'uploads')],
    zones: [],
    notesCards: [],
    simulations: [],
  };
  await seedStorage(page, { diagrams: [{ id: 'autosave', title: doc.title, updatedAt: Date.now(), doc }] });
  await page.goto('/');
  await page.locator('#btn-restore-open').click();
  await expect(page.locator('.conduit-group')).toHaveCount(2);
}

/** The world point where a wire's drawn rail starts or ends. */
const railEnd = (page: Page, edgeId: string, end: 'start' | 'end') =>
  page.evaluate(
    ([id, which]) => {
      const rail = document.querySelector<SVGPathElement>(`.conduit-group[data-edge-id="${id}"] .conduit-rail`)!;
      const p = rail.getPointAtLength(which === 'start' ? 0 : rail.getTotalLength());
      return { x: p.x, y: p.y, d: rail.getAttribute('d')! };
    },
    [edgeId, end] as const,
  );

test('wires into and out of the same side of an actor meet it apart, on one line', async ({ page }) => {
  await loadRelay(page);
  const arriving = await railEnd(page, 'in', 'end');
  const leaving = await railEnd(page, 'out', 'start');

  // The incoming wire lands left of the outgoing one, with room between them for its arrowhead.
  expect(leaving.x - arriving.x).toBeGreaterThanOrEqual(12);

  // Both loops run across at the same height, rather than one stepped above the other.
  const runY = (d: string) => Number(d.match(/Q \S+ (-?\d+(?:\.\d+)?)/)![1]);
  expect(runY(arriving.d)).toBe(runY(leaving.d));
});
