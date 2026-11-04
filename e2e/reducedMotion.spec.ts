import { expect, test, type Page } from '@playwright/test';
import { clearSelection, openLumenRelay } from './helpers';

// A15. With "reduce motion" on, nothing on screen may animate. The states below are the ones that animate by
// default: a component marked live, a failure with at-risk callers, wiring targets, and a scenario that is playing.

/** Animations still running once every finite one has finished: CSS animations and transitions, not SMIL. */
async function running(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    await Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    );
    return document
      .getAnimations()
      .filter((a) => a.playState === 'running')
      .map((a) => {
        const target = (a.effect as KeyframeEffect | null)?.target as Element | null;
        const name = (a as CSSAnimation).animationName ?? (a as CSSTransition).transitionProperty ?? a.id;
        return `${name} on ${target?.tagName.toLowerCase()}${target?.id ? '#' + target.id : ''}.${target?.className?.toString().split(' ')[0] ?? ''}`;
      });
  });
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/');
  await openLumenRelay(page);
  await expect(page.locator('.arch-node').first()).toBeVisible();
});

test('reduced motion: a component marked live does not pulse', async ({ page }) => {
  await page.locator('.arch-node').first().click();
  await page.locator('#prop-node-status').selectOption('live');
  await expect(page.locator('.node-status-badge[data-status="live"]').first()).toBeVisible();
  await clearSelection(page);
  expect(await running(page)).toEqual([]);
});

test('reduced motion: failures, wiring targets and a playing scenario do not animate', async ({ page }) => {
  // Wiring: every other component's ports are targets.
  await page.locator('[data-rail-tool="connect"]').click();
  await expect(page.locator('#workspace')).toHaveAttribute('data-tool', 'connect');
  expect(await running(page), 'wiring targets').toEqual([]);
  await page.locator('[data-rail-tool="select"]').click();

  // Traffic: fail one component (its callers are at risk) while a scenario plays.
  await page.keyboard.press('2');
  await page.locator('.arch-node').first().click();
  await page.keyboard.press('x');
  await expect(page.locator('.arch-node[data-chaos="failed"]')).toHaveCount(1);
  expect(await running(page), 'a failure and its at-risk callers').toEqual([]);

  const select = page.locator('#run-bar-scenario');
  const first = await select.locator('option:not([value=""])').first().getAttribute('value');
  await select.selectOption(first!);
  await page.waitForTimeout(1_200); // the scenario plays by default
  expect(await running(page), 'a playing scenario').toEqual([]);
});

test('the live status dot never animates, even when motion is allowed', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.locator('.arch-node').first().click();
  await page.locator('#prop-node-status').selectOption('live');
  const dot = page.locator('.node-status-badge[data-status="live"] .status-dot').first();
  await expect(dot).toBeAttached();
  expect(await dot.evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
});
