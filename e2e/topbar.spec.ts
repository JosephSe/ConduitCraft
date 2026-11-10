import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { clearSelection, openLumenRelay } from './helpers';

async function open(page: Page, query = '') {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto(`/${query}`);
  await openLumenRelay(page);
  await expect(page.locator('.arch-node').first()).toBeVisible();
}

const visibleControls = (page: Page) =>
  page.evaluate(() => {
    const header = document.querySelector('.topbar')!;
    const hit = header.querySelectorAll<HTMLElement>('button, input:not([type="file"]), a[href], select');
    return Array.from(hit)
      .filter((el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden')
      .filter((el) => !el.classList.contains('visually-hidden') || el instanceof HTMLInputElement)
      .map((el) => el.id || el.getAttribute('name') || el.tagName);
  });

test('the top bar shows at most 9 controls', async ({ page }) => {
  await open(page);
  const controls = await visibleControls(page);
  expect(controls.length, controls.join(', ')).toBeLessThanOrEqual(9);
  for (const id of ['btn-open-palette', 'btn-share', 'btn-focus-doc-title', 'btn-app-menu']) expect(controls).toContain(id);
  await expect(page.locator('#btn-open-export')).toHaveCount(0);
});

test('controls removed from the top bar are still one palette search away', async ({ page }) => {
  await open(page);
  const entries: Array<[string, RegExp]> = [
    ['export', /Export/i],
    ['snapshots', /Snapshots/i],
    ['settings', /Settings/i],
    ['shortcuts', /Shortcuts/i],
    ['connect', /Connect Tool/i],
    ['import', /Import File/i],
    ['pause', /Pause/i],
  ];
  for (const [query, title] of entries) {
    await page.keyboard.press('ControlOrMeta+k');
    await page.locator('#cmd-palette-input').fill(query);
    await expect(page.locator('#cmd-palette-results')).toContainText(title);
    await page.keyboard.press('Escape');
  }
});

test('a palette action reaches a hidden control: Connect Tool switches the pointer tool', async ({ page }) => {
  await open(page);
  await page.keyboard.press('ControlOrMeta+k');
  await page.locator('#cmd-palette-input').fill('connect tool');
  await page.keyboard.press('Enter');
  await expect(page.locator('#workspace')).toHaveAttribute('data-tool', 'connect');
});

test('Share is in the top bar and copies a link', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await open(page);
  await page.locator('#btn-share').click();
  await expect(page.locator('#toast-container')).toContainText(/link/i);
});

for (const scheme of ['light', 'dark'] as const) {
  test(`the redesigned top bar has no axe violations (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await open(page);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
}

/**
 * The rule (A14, V1 section 10): at 1280 px, with a diagram open and nothing selected, no region of the screen outside
 * the canvas has more than 8 always-visible controls. A region is the top bar, the tool rail, the SE zoom island, a side
 * panel, or one labelled group of the run bar. The screen as a whole has far more than 8 (see the logged totals), so the
 * rule is per region: each region is something the eye takes in at once.
 *
 * Not counted, and why: component stencils in the rail (the component library as a strip, a list of things to place, not
 * actions; the palette lists the same items), findings in the Review panel (a list of content), the inspector's property
 * fields (they belong to the selected component, and the inspector is folded when nothing is selected), toasts (they come
 * and go) and anything inside the canvas. Every other visible control must belong to a region, so new chrome cannot
 * slip past the count.
 */
const REGIONS: Array<[name: string, selector: string]> = [
  ['top bar', '.topbar'],
  ['tool rail', '#palette-sidebar'],
  ['zoom (SE)', '.hud-zoom-card'],
  ['find box', '#hud-search-card'],
  ['inspector', '#inspector-panel'],
  ['run bar: playback', '#run-bar [role="group"][aria-label="Playback"]'],
  ['run bar: view', '#run-bar [role="group"][aria-label="View"]'],
  ['failure summary', '#chaos-panel'],
  ['review panel', '#insights-panel'],
  ['text outline', '#outline-panel'],
  ['page strip', '#page-strip'],
];
const NOT_COUNTED = '.rail-stencil-btn, .insight-item, #toast-container, #canvas-stage, .arch-node';

const countByRegion = (page: Page) =>
  page.evaluate(
    ([regions, notCounted]) => {
      const counts: Record<string, string[]> = {};
      const orphans: string[] = [];
      const all = document.querySelectorAll<HTMLElement>('button, a[href], select, input:not([type="file"]), textarea');
      for (const el of all) {
        if (el.getClientRects().length === 0 || getComputedStyle(el).visibility === 'hidden') continue;
        if (el.closest('[hidden], [inert], dialog:not([open])') || el.matches(notCounted) || el.closest(notCounted)) continue;
        const label = el.id || el.getAttribute('aria-label') || el.className;
        const region = (regions as Array<[string, string]>).find(([, selector]) => el.closest(selector));
        if (region) (counts[region[0]] ??= []).push(label);
        else orphans.push(label);
      }
      return { counts, orphans };
    },
    [REGIONS, NOT_COUNTED] as const,
  );

for (const [lens, key] of [['Design', '1'], ['Traffic', '2'], ['Review', '3']] as const) {
  test(`${lens} lens at 1280 px: no region has more than 8 always-visible controls`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await openLumenRelay(page);
    await clearSelection(page);
    await page.keyboard.press(key);
    await page.waitForTimeout(300); // the lens panels slide in

    const { counts, orphans } = await countByRegion(page);
    expect(orphans, 'every visible control outside the canvas belongs to a counted region').toEqual([]);
    const total = Object.values(counts).reduce((sum, list) => sum + list.length, 0);
    console.log(`${lens}: ${total} counted controls`, JSON.stringify(Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, v.length]))));
    for (const [name, list] of Object.entries(counts)) {
      // The top bar is allowed one more: its menu holds every action that has no button of its own.
      expect(list.length, `${name}: ${list.join(', ')}`).toBeLessThanOrEqual(name === 'top bar' ? 9 : 8);
    }
  });
}

test('a saved Classic layout preference is dropped once, with a notice', async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('conduitcraft-ui', '1');
    }
  });
  await page.goto('/?ui=1');
  await expect(page.locator('#toast-container')).toContainText('The old layout has been retired');
  expect(await page.evaluate(() => localStorage.getItem('conduitcraft-ui'))).toBeNull();
  // The new layout is what shows, whatever the URL says.
  await expect(page.locator('#btn-share')).toBeVisible();
  await page.reload();
  await expect(page.locator('#toast-container')).not.toContainText('The old layout has been retired');
});
