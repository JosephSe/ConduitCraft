import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { placeComponent, runPaletteCommand, showInspectorTab } from './helpers';

const node = (page: Page, id: string) => page.locator(`.arch-node[data-node="${id}"]`);

async function openEventDriven(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/');
  await runPaletteCommand(page, 'Event-Driven Microservices');
  await expect(node(page, 'fulfilment-queue')).toBeVisible();
}

/** Drag a component by its body to a spot on the canvas. */
async function dragTo(page: Page, hit: Locator, x: number, y: number): Promise<void> {
  const box = (await hit.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, y, { steps: 10 });
  await page.mouse.up();
}

async function centre(hit: Locator): Promise<{ x: number; y: number }> {
  const box = (await hit.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test('a Message Queue from the rail draws as a pipe, and wires into and out of it are async', { tag: '@quick' }, async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/');

  await placeComponent(page, 'service');
  await expect(page.locator('.arch-node')).toHaveCount(1);
  await dragTo(page, page.locator('.arch-node .node-select-hit').first(), 360, 460);

  await placeComponent(page, 'queue');
  await expect(page.locator('.arch-node')).toHaveCount(2);
  await expect(page.locator('.arch-node[data-kind="queue"]')).toHaveAttribute('data-shape', 'pipe');
  await expect(page.locator('.arch-node[data-kind="queue"] [data-plate="pipe"]')).toHaveCount(1);
  await dragTo(page, page.locator('.arch-node[data-kind="queue"] .node-select-hit'), 760, 460);

  await placeComponent(page, 'service');
  await expect(page.locator('.arch-node')).toHaveCount(3);
  await dragTo(page, page.locator('.arch-node[data-kind="service"] .node-select-hit').last(), 1160, 460);

  const hits = page.locator('.arch-node .node-select-hit');
  const a = await centre(page.locator('.arch-node[data-kind="service"] .node-select-hit').first());
  const q = await centre(page.locator('.arch-node[data-kind="queue"] .node-select-hit'));
  const c = await centre(page.locator('.arch-node[data-kind="service"] .node-select-hit').last());
  expect(await hits.count()).toBe(3);

  await page.locator('[data-rail-tool="connect"]').first().evaluate((el: HTMLElement) => el.click());
  for (const [from, to] of [[a, q], [q, c]] as const) {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await page.mouse.up();
  }

  await expect(page.locator('.conduit-group')).toHaveCount(2);
  await expect(page.locator('.conduit-group[data-sync="async"]')).toHaveCount(2);
});

test('failing the consumer makes the queue buffer and leaves its producer alone', async ({ page }) => {
  await openEventDriven(page);
  await page.keyboard.press('2');
  await node(page, 'fulfilment-svc').locator('.node-select-hit').click();
  await page.keyboard.press('x');

  await expect(page.locator('#chaos-summary')).toContainText('1 buffering');
  await expect(node(page, 'fulfilment-queue')).toHaveAttribute('data-chaos', 'buffering');
  await expect(node(page, 'fulfilment-queue').locator('.chaos-badge')).toContainText('Buffering');
  await expect(node(page, 'event-stream')).not.toHaveAttribute('data-chaos', 'at-risk');
  await expect(node(page, 'order-svc')).not.toHaveAttribute('data-chaos', 'at-risk');
});

test('a looping run fills the pipe, and restoring the consumer drains it', async ({ page }) => {
  await openEventDriven(page);
  await page.keyboard.press('2');

  // The saved "Fulfilment down" scenario fails the consumer and plays the order.
  await page.locator('#run-bar-scenario').selectOption('sim-fulfilment-down');
  await expect(node(page, 'fulfilment-queue')).toHaveAttribute('data-chaos', 'buffering');
  await page.locator('#run-bar-loop').click();
  await expect(page.locator('#run-bar-loop')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#run-bar-speed').click(); // 2x
  if ((await page.locator('#run-bar-play').getAttribute('aria-pressed')) === 'false') {
    await page.locator('#run-bar-play').click();
  }

  const queue = node(page, 'fulfilment-queue');
  await expect(queue).toHaveAttribute('data-backlog', /^[2-9]$/, { timeout: 40_000 });
  const depth = Number(await queue.getAttribute('data-backlog'));
  await expect(queue.locator('.queue-count')).toHaveText(`${depth} / 50`);
  await expect(queue.locator('.queue-msg')).toHaveCount(Math.min(depth, 8));
  await expect(queue.locator('.node-select-hit')).toHaveAttribute('aria-label', new RegExp(`${depth}\\+? messages? waiting|messages waiting`));
  await expect(page.locator('#run-bar-step')).toContainText('held');

  // Stop the run, then restore the consumer with X: the queue drains.
  await page.locator('#run-bar-play').click();
  await node(page, 'fulfilment-svc').locator('.node-select-hit').click();
  await page.keyboard.press('x');
  await expect(queue).not.toHaveAttribute('data-backlog', /.*/, { timeout: 20_000 });
  await expect(page.locator('#a11y-live-announcer')).toContainText(/drained/);
});

test('the Queue group in the inspector has no axe violations', async ({ page }) => {
  await openEventDriven(page);
  await page.keyboard.press('1');
  await node(page, 'fulfilment-queue').locator('.node-select-hit').click();
  await showInspectorTab(page, 'behaviour');
  await expect(page.locator('#prop-node-queue-depth')).toBeVisible();
  await expect(page.locator('#prop-node-queue-depth')).toHaveValue('50');
  await expect(page.locator('#prop-node-queue-dlq')).toHaveValue('fulfilment-dlq');
  const results = await new AxeBuilder({ page })
    .include('#inspector-panel')
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
});

test('the inspector sets a queue limit and the card shows it', async ({ page }) => {
  await openEventDriven(page);
  await page.keyboard.press('1');
  await node(page, 'fulfilment-queue').locator('.node-select-hit').click();
  await showInspectorTab(page, 'behaviour');
  const depth = page.locator('#prop-node-queue-depth');
  await depth.fill('120');
  await depth.press('Tab');
  await expect(node(page, 'fulfilment-queue').locator('.node-footer-label')).toContainText('max 120');
});
