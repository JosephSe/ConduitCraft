import { expect, test, type Page } from '@playwright/test';
import { runPaletteCommand } from './helpers';

/**
 * Z4. Instrument Sans and Geist Mono are self-hosted. View 1 is the showcase
 * at Fit. The title is measured while the font files are held, then again
 * after they load. Tabular figures are checked in the browser, not only in the file.
 */
test.use({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  reducedMotion: 'reduce',
});

async function hideHome(page: Page): Promise<void> {
  await page.addInitScript(() => {
    sessionStorage.setItem('conduitcraft-home-shown', '1');
  });
}

test('Instrument Sans tabular figures are wider than proportional ones', async ({ page }) => {
  await hideHome(page);
  await page.goto('/');
  const widths = await page.evaluate(async () => {
    await document.fonts.load('400 100px "Instrument Sans"');
    await document.fonts.ready;
    const measure = (numeric: string) => {
      const el = document.createElement('span');
      el.textContent = '111111';
      el.style.fontFamily = '"Instrument Sans"';
      el.style.fontSize = '100px';
      el.style.fontWeight = '400';
      el.style.fontVariantNumeric = numeric;
      el.style.position = 'absolute';
      el.style.whiteSpace = 'pre';
      document.body.appendChild(el);
      const width = el.getBoundingClientRect().width;
      el.remove();
      return width;
    };
    return {
      tabular: measure('tabular-nums'),
      proportional: measure('proportional-nums'),
      loaded: document.fonts.check('400 16px "Instrument Sans"'),
    };
  });
  expect(widths.loaded).toBe(true);
  // "1" is a narrow proportional figure. Tabular figures share one width.
  expect(widths.tabular).toBeGreaterThan(widths.proportional + 5);
});

test('view 1 does not jump when the webfonts swap in', async ({ page }) => {
  // A held font file keeps the load event pending, so wait only for the document.
  test.setTimeout(60_000);
  let releaseFonts = () => {};
  const gate = new Promise<void>((resolve) => {
    releaseFonts = resolve;
  });
  await page.route('**/*.woff2', async (route) => {
    await gate;
    await route.continue();
  });
  await hideHome(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await runPaletteCommand(page, 'Load Showcase');
  await expect(page.locator('.arch-node').first()).toBeVisible({ timeout: 20_000 });
  await page.locator('#btn-zoom-fit').click();
  const heading = page.locator('#doc-title-heading');
  await expect(heading).toHaveText(/Marquee/);
  await expect.poll(() => page.evaluate(() => document.fonts.check('700 16px "Instrument Sans"'))).toBe(false);

  const before = await measureTitle(page);
  releaseFonts();
  await expect.poll(() => page.evaluate(() => document.fonts.check('700 16px "Instrument Sans"'))).toBe(true);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve(undefined)));
  }));
  const after = await measureTitle(page);
  expect(Math.abs(after.probe.width - before.probe.width)).toBeLessThan(2);
  expect(Math.abs(after.probe.height - before.probe.height)).toBeLessThan(2);
  expect(Math.abs(after.heading.width - before.heading.width)).toBeLessThan(2);
  expect(Math.abs(after.heading.height - before.heading.height)).toBeLessThan(2);
});

async function measureTitle(page: Page) {
  return page.evaluate(() => {
    const heading = document.getElementById('doc-title-heading');
    if (!heading) throw new Error('missing title');
    const cs = getComputedStyle(heading);
    const probe = document.createElement('span');
    probe.textContent = heading.textContent;
    probe.style.position = 'absolute';
    probe.style.left = '0';
    probe.style.top = '0';
    probe.style.visibility = 'hidden';
    probe.style.whiteSpace = 'pre';
    probe.style.fontFamily = cs.fontFamily;
    probe.style.fontSize = cs.fontSize;
    probe.style.fontWeight = cs.fontWeight;
    probe.style.letterSpacing = cs.letterSpacing;
    probe.style.lineHeight = cs.lineHeight;
    document.body.appendChild(probe);
    const rect = probe.getBoundingClientRect();
    const box = heading.getBoundingClientRect();
    probe.remove();
    return {
      probe: { width: rect.width, height: rect.height },
      heading: { width: box.width, height: box.height },
    };
  });
}
