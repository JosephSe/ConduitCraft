import { expect, test } from '@playwright/test';
import { openLumenRelay, runPaletteCommand } from './helpers';

test('Traffic draws the flow as 14 x 7 capsules and Design does not', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('conduitcraft-home-shown', '1'));
  await page.goto('/');
  await runPaletteCommand(page, 'Load Showcase');
  await page.locator('.conduit-stream').first().waitFor({ state: 'attached', timeout: 20000 });
  const stream = page.locator('.conduit-stream').first();
  const width = () => stream.evaluate((el) => getComputedStyle(el).strokeWidth);
  expect(await width()).not.toBe('7px');
  await page.keyboard.press('2');
  await expect(page.locator('#workspace')).toHaveAttribute('data-lens', 'traffic');
  await expect.poll(width).toBe('7px');
  // One capsule per wire: a 7 px dash followed by a gap longer than the wire itself, running at the wire's own length.
  const dash = await stream.evaluate((el) => ({ array: getComputedStyle(el).strokeDasharray, len: Number((el as SVGElement).style.getPropertyValue('--cc-len')), name: getComputedStyle(el).animationName }));
  expect(dash.name).toContain('cc-capsule');
  expect(dash.len).toBeGreaterThan(20);
  const gap = Number(dash.array.split(/[, ]+/)[1].replace('px', ''));
  expect(gap).toBeGreaterThan(dash.len);
});

test('Traffic runs beads along the wires, and they come back after a trip to Design', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('conduitcraft-home-shown', '1'));
  await page.goto('/');
  await runPaletteCommand(page, 'Load Showcase');
  await page.locator('.conduit-stream').first().waitFor({ state: 'attached', timeout: 20000 });
  const beads = page.locator('.cc-bead');
  const corePos = () => page.locator('.cc-bead-core').first().evaluate((el) => `${el.getAttribute('cx')},${el.getAttribute('cy')}`);
  // Design is still from the first load (D8): no beads, and the flow is hidden.
  await expect(page.locator('#workspace')).toHaveAttribute('data-lens', 'design');
  await expect(beads).toHaveCount(0);
  const designOpacity = await page.locator('.conduit-group:not(.is-highlighted, .is-selected) .conduit-stream').first().evaluate((el) => getComputedStyle(el).opacity);
  expect(designOpacity).toBe('0');
  for (let trip = 0; trip < 2; trip += 1) {
    await page.keyboard.press('2');
    await expect(page.locator('#workspace')).toHaveAttribute('data-lens', 'traffic');
    await expect.poll(() => beads.count()).toBeGreaterThan(0);
    const before = await corePos();
    await expect.poll(corePos).not.toBe(before);
    await page.keyboard.press('1');
    await expect(page.locator('#workspace')).toHaveAttribute('data-lens', 'design');
    await expect(beads).toHaveCount(0);
  }
});

test('a failure spreads outward in order and a restore gives one emerald ring', async ({ page }) => {
  await page.goto('/');
  await openLumenRelay(page);
  await page.keyboard.press('2');
  await page.locator('.arch-node').nth(2).click({ button: 'right' });
  await page.getByRole('menuitem', { name: /Fail this component/ }).click();
  const risk = page.locator('.arch-node[data-chaos="at-risk"]').first();
  await expect(risk).toBeVisible();
  const lag = await risk.evaluate((el) => (el as HTMLElement).style.getPropertyValue('--cc-lag'));
  expect(parseInt(lag, 10)).toBeGreaterThanOrEqual(40);
  const failed = page.locator('.arch-node[data-chaos="failed"]').first();
  await failed.click({ button: 'right' });
  await page.getByRole('menuitem', { name: /Restore/ }).click();
  await expect(page.locator('.arch-node.is-restored')).toHaveCount(1);
  expect(await page.locator('.arch-node.is-restored .node-select-hit').first().evaluate((el) => getComputedStyle(el, '::after').animationName)).toBe('cc-restore');
  await expect(page.locator('.arch-node.is-restored')).toHaveCount(0, { timeout: 3000 });
});
