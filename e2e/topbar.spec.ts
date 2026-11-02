import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function open(page: Page, query = '?ui=2') {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto(`/${query}`);
  await page.locator('#btn-empty-showcase').click();
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

test('the classic top bar is still the default', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'chromium-ui2', 'this project opts in to the redesign');
  await open(page, '');
  await expect(page.locator('html')).toHaveAttribute('data-ui', '1');
  await expect(page.locator('#btn-open-export')).toBeVisible();
  await expect(page.locator('#btn-share')).toBeHidden();
});

test('?ui=2 shows a top bar with at most 8 controls, and remembers the choice', async ({ page }) => {
  await open(page);
  await expect(page.locator('html')).toHaveAttribute('data-ui', '2');
  const controls = await visibleControls(page);
  expect(controls.length, controls.join(', ')).toBeLessThanOrEqual(8);
  for (const id of ['btn-open-palette', 'btn-share', 'btn-focus-doc-title']) expect(controls).toContain(id);
  await expect(page.locator('#btn-open-export')).toBeHidden();

  // Reload without the parameter: the choice sticks until ?ui=1.
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-ui', '2');
  await page.goto('/?ui=1');
  await expect(page.locator('html')).toHaveAttribute('data-ui', '1');
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
