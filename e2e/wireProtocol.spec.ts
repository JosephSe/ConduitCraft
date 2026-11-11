import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openLumenRelay } from './helpers';

/** Select the first labelled wire by clicking the middle of its line. Zoomed out its label is hidden until the wire is pointed at, so the label cannot be the click target. */
async function selectLabelledWire(page: Page): Promise<{ from: string; to: string }> {
  const hit = await page.evaluate(() => {
    for (const group of document.querySelectorAll<SVGGElement>('.conduit-group')) {
      if (!group.querySelector('.conduit-badge-hit')) continue;
      const path = group.querySelector<SVGPathElement>('.conduit-hit');
      const ctm = path?.getScreenCTM();
      if (!path || !ctm) continue;
      const mid = path.getPointAtLength(path.getTotalLength() / 2);
      const pt = new DOMPoint(mid.x, mid.y).matrixTransform(ctm);
      if (document.elementFromPoint(pt.x, pt.y)?.closest('.conduit-group') === group) {
        return { from: group.dataset.from!, to: group.dataset.to!, x: pt.x, y: pt.y };
      }
    }
    return null;
  });
  expect(hit, 'a labelled wire with a clear midpoint').not.toBeNull();
  await page.mouse.click(hit!.x, hit!.y);
  return { from: hit!.from, to: hit!.to };
}

test('a wire takes a protocol and a call style from the inspector, and shows them on the canvas', { tag: '@quick' }, async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/');
  await openLumenRelay(page);
  await expect(page.locator('.arch-node').first()).toBeVisible();

  // Select the first labelled wire by its line (zoomed out its label waits for the pointer).
  const { from: id, to } = await selectLabelledWire(page);
  const wire = page.locator(`.conduit-group[data-from="${id}"][data-to="${to}"]`).first();

  await page.locator('#prop-edge-protocol').selectOption('grpc');
  await expect(wire.locator('.route-pill-text').first()).toContainText('gRPC · ');

  await expect(wire).toHaveAttribute('data-sync', 'sync');
  await page.locator('#prop-edge-sync').selectOption('async');
  await expect(wire).toHaveAttribute('data-sync', 'async');

  await page.locator('#prop-edge-protocol').selectOption('');
  await expect(wire.locator('.route-pill-text').first()).not.toContainText('gRPC');
});

test('a wire\'s latency changes how fast its dashes flow', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/');
  await openLumenRelay(page);
  await expect(page.locator('.arch-node').first()).toBeVisible();

  const { from: id, to } = await selectLabelledWire(page);
  const wire = page.locator(`.conduit-group[data-from="${id}"][data-to="${to}"]`).first();
  const duration = () =>
    wire.locator('.conduit-stream').first().evaluate((el) => getComputedStyle(el).animationDuration);

  await page.locator('#prop-edge-latency').fill('50');
  await expect.poll(duration).toBe('1.35s');
  await page.locator('#prop-edge-latency').fill('250');
  await expect.poll(duration).toBe('2.7s');
  await page.locator('#prop-edge-latency').fill('');
  await expect.poll(duration).toBe('1.35s');
});
