import { expect, test } from '@playwright/test';
import { captureExports, openExportDialog, runPaletteCommand } from './helpers';

/** The text of the nth export download. */
async function exportText(page: import('@playwright/test').Page, count: number): Promise<string> {
  await expect.poll(() => page.evaluate(() => (window as any).__exports.length)).toBeGreaterThanOrEqual(count);
  return page.evaluate(async (n) => {
    const w = window as any;
    const { url } = w.__exports[n - 1];
    return await (w.__blobs.get(url) as Blob).text();
  }, count);
}

/** C6. At Fit the showcase reads like a map: every title is at least 11 px on screen, and exports carry the title block. */
test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('conduitcraft-home-shown', '1'));
});

test('at Fit every component and lane title renders at 11 px or more', async ({ page }) => {
  await page.goto('/');
  await runPaletteCommand(page, 'Load Showcase');
  await expect(page.locator('.arch-node').first()).toBeVisible({ timeout: 20_000 });
  await runPaletteCommand(page, 'Fit');
  const sizes = await page.evaluate(() => {
    const world = document.getElementById('stage-world') as HTMLElement;
    const zoom = Number(world.style.zoom || 1);
    return [...document.querySelectorAll<HTMLElement>('#stage-world .node-title, #stage-world .zone-title')]
      .filter((el) => el.getClientRects().length > 0 && (el.textContent ?? '').trim() !== '')
      .map((el) => ({ text: el.textContent, px: parseFloat(getComputedStyle(el).fontSize) * zoom }));
  });
  expect(sizes.length).toBeGreaterThan(3);
  for (const s of sizes) expect(s.px, s.text ?? '').toBeGreaterThanOrEqual(10.95);
});

for (const size of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }, { width: 1024, height: 700 }]) {
  test(`at Fit no component name or frame title is cut off at ${size.width} x ${size.height}`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto('/');
    await runPaletteCommand(page, 'Load Showcase');
    await expect(page.locator('.arch-node').first()).toBeVisible({ timeout: 20_000 });
    await runPaletteCommand(page, 'Fit');
    const cut = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('#stage-world .node-title, #stage-world .frame-title-bar')]
        .filter((el) => el.getClientRects().length > 0)
        .filter((el) => el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1)
        .map((el) => el.textContent),
    );
    expect(cut).toEqual([]);
  });
}

test('zoomed out, a wire label shows only on the wire you point at, at 10 px or more', async ({ page }) => {
  await page.goto('/');
  await runPaletteCommand(page, 'Load Showcase');
  await expect(page.locator('.arch-node').first()).toBeVisible({ timeout: 20_000 });
  await runPaletteCommand(page, 'Fit');
  await expect(page.locator('#stage-world')).toHaveAttribute('data-lod', 'low');
  await page.locator('#canvas-viewport').click({ position: { x: 4, y: 4 } });
  await expect(page.locator('.conduit-badge-hit:visible')).toHaveCount(0);
  // Click the middle of a labelled wire that nothing covers (the way selectWire does in e2e/interactions.spec.ts).
  const hit = await page.evaluate(() => {
    for (const group of document.querySelectorAll<SVGGElement>('.conduit-group')) {
      if (!group.querySelector('.conduit-badge-hit')) continue;
      const path = group.querySelector<SVGPathElement>('.conduit-hit');
      const ctm = path?.getScreenCTM();
      if (!path || !ctm) continue;
      const mid = path.getPointAtLength(path.getTotalLength() / 2);
      const pt = new DOMPoint(mid.x, mid.y).matrixTransform(ctm);
      if (document.elementFromPoint(pt.x, pt.y)?.closest('.conduit-group') === group) {
        return { id: group.dataset.edgeId!, x: pt.x, y: pt.y };
      }
    }
    return null;
  });
  expect(hit, 'a labelled wire with a clear midpoint').not.toBeNull();
  await page.mouse.click(hit!.x, hit!.y);
  const label = page.locator(`.conduit-group[data-edge-id="${hit!.id}"] .route-pill-text`);
  await expect(label).toBeVisible();
  const height = await label.evaluate((el) => el.getBoundingClientRect().height);
  expect(height).toBeGreaterThanOrEqual(10);
});

test('the "Always show wire labels" preference turns every label back on', async ({ page }) => {
  await page.goto('/');
  await runPaletteCommand(page, 'Load Showcase');
  await expect(page.locator('.arch-node').first()).toBeVisible({ timeout: 20_000 });
  await runPaletteCommand(page, 'Fit');
  await expect(page.locator('#stage-world')).toHaveAttribute('data-lod', 'low');
  await runPaletteCommand(page, 'Studio Preferences');
  await page.locator('#chk-always-wire-labels').check();
  await page.keyboard.press('Escape');
  expect(await page.locator('.conduit-badge-hit:visible').count()).toBeGreaterThan(10);
});

test('the SVG export carries the title block, and the dialog can turn it off', async ({ page }) => {
  await captureExports(page);
  await page.goto('/');
  await openExportDialog(page);
  await page.locator('#btn-export-svg').click();
  expect(await exportText(page, 1)).toContain('data-title-block="true"');
  await openExportDialog(page);
  await page.locator('#chk-export-title-block').uncheck();
  await page.locator('#btn-export-svg').click();
  expect(await exportText(page, 2)).not.toContain('data-title-block');
});
