import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('Traffic lens: failing a component shows the blast radius, announces it, and restores', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/?ui=2');
  await page.locator('#btn-empty-showcase').click();
  await expect(page.locator('.arch-node').first()).toBeVisible();

  // Failing needs the Traffic lens.
  await page.locator('.arch-node').first().click();
  await page.keyboard.press('x');
  await expect(page.locator('[data-chaos="failed"]')).toHaveCount(0);

  await page.keyboard.press('2');
  await page.locator('.arch-node').first().click();
  await page.keyboard.press('x');

  await expect(page.locator('.arch-node[data-chaos="failed"]')).toHaveCount(1);
  const summary = page.locator('#chaos-summary');
  await expect(summary).toHaveText(/^1 failed · \d+ unreachable · \d+ rerouted$/);
  await expect(page.locator('#a11y-live-announcer')).toContainText(/failed\. \d+ components? unreachable/);

  // The list opens and a click selects the component.
  await summary.click();
  await expect(page.locator('.chaos-item').first()).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).include('#chaos-panel').analyze();
  expect(results.violations).toEqual([]);
  await page.locator('.chaos-item').first().click();
  await expect(page.locator('.arch-node .node-select-hit[aria-pressed="true"]')).toHaveCount(1);

  // Failures belong to the lens: back in Design nothing is painted, and in Traffic it is still there.
  await page.keyboard.press('1');
  await expect(page.locator('[data-chaos]')).toHaveCount(0);
  await expect(page.locator('#chaos-panel')).toBeHidden();
  await page.keyboard.press('2');
  await expect(page.locator('.arch-node[data-chaos="failed"]')).toHaveCount(1);

  await page.locator('#chaos-reset').click();
  await expect(page.locator('[data-chaos]')).toHaveCount(0);
  await expect(page.locator('#chaos-panel')).toBeHidden();
});

test('Alt + hover previews the blast radius without failing anything', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/?ui=2');
  await page.locator('#btn-empty-showcase').click();
  await page.keyboard.press('2');
  const node = page.locator('.arch-node').first();
  await node.hover();
  await page.keyboard.down('Alt');
  await expect(page.locator('.arch-node[data-chaos-preview="true"]').first()).toBeVisible();
  await expect(page.locator('#chaos-panel')).toBeHidden();
  await page.keyboard.up('Alt');
  await expect(page.locator('[data-chaos]')).toHaveCount(0);
});

test('the inspector sets replicas, so a failure degrades instead of failing', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/?ui=2');
  await page.locator('#btn-empty-showcase').click();
  const node = page.locator('.arch-node').first();
  await node.click();
  await page.locator('#prop-node-replicas').fill('3');
  await page.locator('#prop-node-replicas').press('Tab');
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('2');
  await node.click();
  await page.keyboard.press('x');
  await expect(page.locator('.arch-node[data-chaos="degraded"]')).toHaveCount(1);
  await expect(page.locator('.arch-node[data-chaos="failed"]')).toHaveCount(0);
});

test('right-click on a component in Traffic offers Fail this component', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/?ui=2');
  await page.locator('#btn-empty-showcase').click();
  await page.keyboard.press('2');
  await page.locator('.arch-node').nth(2).click({ button: 'right' });
  const item = page.getByRole('menuitem', { name: /Fail this component/ });
  await expect(item).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /Delete/ })).toHaveCount(0);
  await item.click();
  await expect(page.locator('.arch-node[data-chaos="failed"]')).toHaveCount(1);
  await expect(page.locator('#chaos-summary')).toBeVisible();

  // Right-clicking the failed component offers to bring it back.
  await page.locator('.arch-node[data-chaos="failed"]').click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: /Fail this component/ })).toHaveCount(0);
  await page.getByRole('menuitem', { name: /Restore this component/ }).click();
  await expect(page.locator('[data-chaos="failed"]')).toHaveCount(0);
});

test('wires into and out of a failed component stop flowing', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/?ui=2');
  await page.locator('#btn-empty-showcase').click();
  await page.keyboard.press('2');
  const node = page.locator('.arch-node').nth(2);
  const id = await node.getAttribute('data-node');
  const touching = page.locator(`.conduit-group[data-from="${id}"], .conduit-group[data-to="${id}"]`);
  expect(await touching.count()).toBeGreaterThan(0);
  const running = (loc: ReturnType<typeof page.locator>) =>
    loc.first().locator('.conduit-stream').evaluate((el) => getComputedStyle(el).animationName !== 'none');
  await node.click();
  await page.keyboard.press('x');
  for (let i = 0; i < (await touching.count()); i++) {
    const stream = touching.nth(i).locator('.conduit-stream');
    expect(await stream.evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
  }
  await page.keyboard.press('x');
  expect(await running(touching)).toBe(true);
});

test('only the failed component\'s own wires stop, and nothing stays dimmed once it is unselected', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/?ui=2');
  await page.locator('#btn-empty-showcase').click();
  await page.keyboard.press('2');
  const node = page.locator('.arch-node').nth(2);
  const id = (await node.getAttribute('data-node'))!;
  await node.click();
  await page.keyboard.press('x');
  await page.mouse.click(1000, 120);
  await expect(page.locator('.node-select-hit[aria-pressed="true"]')).toHaveCount(0);
  await page.waitForTimeout(1000); // the highlight fades out

  const state = await page.evaluate((failed) => {
    const flows = (g: Element) => getComputedStyle(g.querySelector('.conduit-stream')!).animationName !== 'none';
    const wires = [...document.querySelectorAll('.conduit-group[data-from]')];
    return {
      ownRunning: wires.filter((g) => [g.getAttribute('data-from'), g.getAttribute('data-to')].includes(failed) && flows(g)).length,
      othersStopped: wires.filter((g) => ![g.getAttribute('data-from'), g.getAttribute('data-to')].includes(failed) && g.getAttribute('data-animated') === 'true' && !flows(g)).length,
      dimmedNodes: [...document.querySelectorAll('.arch-node')].filter((n) => Number(getComputedStyle(n).opacity) < 1).length,
      dimmedWires: wires.filter((g) => Number(getComputedStyle(g).opacity) < 1).length,
    };
  }, id);
  expect(state).toEqual({ ownRunning: 0, othersStopped: 0, dimmedNodes: 0, dimmedWires: 0 });
});

test('a component that calls a failed one glows orange and pulses', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/?ui=2');
  await page.locator('#btn-empty-showcase').click();
  await page.keyboard.press('2');
  await page.locator('.arch-node').nth(2).click({ button: 'right' });
  await page.getByRole('menuitem', { name: /Fail this component/ }).click();
  const risk = page.locator('.arch-node[data-chaos="at-risk"]').first();
  await expect(risk).toBeVisible();
  await expect(risk.locator('.chaos-badge')).toHaveText(/Potential disruption/);
  const style = await risk.locator('.node-select-hit').evaluate((el) => getComputedStyle(el));
  expect(style.animationName).toBe('chaos-pulse');
  expect(style.borderColor).toBe('rgb(249, 115, 22)');
});
