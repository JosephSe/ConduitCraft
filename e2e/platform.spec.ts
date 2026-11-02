import { expect, test, type Page } from '@playwright/test';

async function stubPlatform(page: Page, platform: string): Promise<void> {
  await page.addInitScript((value) => {
    Object.defineProperty(navigator, 'platform', { get: () => value });
  }, platform);
}

/** Every shortcut hint the UI renders: tooltips, menu hints, placeholders and the command palette. */
async function collectHints(page: Page): Promise<string[]> {
  await page.locator('#btn-open-palette').click();
  await expect(page.locator('.palette-item-shortcut').first()).toBeVisible();
  return page.evaluate(() => {
    const hints: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>('[data-tip], [placeholder], .menu-shortcut, .palette-item-shortcut')) {
      hints.push(el.getAttribute('data-tip') ?? '', el.getAttribute('placeholder') ?? '', el.classList.contains('menu-shortcut') || el.classList.contains('palette-item-shortcut') ? el.textContent ?? '' : '');
    }
    return hints.filter(Boolean);
  });
}

test('shows Ctrl/Shift instead of Mac glyphs on Windows', async ({ page }) => {
  await stubPlatform(page, 'Win32');
  await page.goto('/');
  const hints = await collectHints(page);
  expect(hints.length).toBeGreaterThan(10);
  expect(hints.filter((h) => /[⌘⇧⌥]/.test(h)), 'no Mac glyphs on a non-Mac platform').toEqual([]);
  expect(hints.some((h) => h.includes('Ctrl+Shift+S'))).toBe(true);
  expect(hints.some((h) => h.includes('Ctrl+Z'))).toBe(true);
});

test('keeps Mac glyphs on macOS', async ({ page }) => {
  await stubPlatform(page, 'MacIntel');
  await page.goto('/');
  const hints = await collectHints(page);
  expect(hints.some((h) => h.includes('⌘Z'))).toBe(true);
  expect(hints.some((h) => h.includes('⌘⇧S'))).toBe(true);
});
