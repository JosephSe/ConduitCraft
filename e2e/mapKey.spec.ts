import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { openLumenRelay, runPaletteCommand } from './helpers';

test('Showcase View 1 shows the SW Key in layout order with 26x4 swatches and passes axe', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await runPaletteCommand(page, 'Load Showcase');
  await expect(page.locator('.arch-node').first()).toBeVisible({ timeout: 20_000 });

  const keyCard = page.locator('#legend-card');
  await expect(keyCard).toBeVisible();
  await expect(page.locator('#btn-legend-key')).toBeHidden();

  const labels = await keyCard.locator('.map-key-row .map-key-label').allTextContents();
  expect(labels.length).toBe(5);
  expect(new Set(labels).size).toBe(5);
  expect(labels).toContain('Fan requests');
  expect(labels).toContain('Seats & orders');

  const swatchBox = await keyCard.locator('.map-key-swatch').first().boundingBox();
  expect(swatchBox).not.toBeNull();
  expect(Math.round(swatchBox!.width)).toBe(26);
  expect(Math.round(swatchBox!.height)).toBe(4);

  const axe = await new AxeBuilder({ page })
    .include('#legend-card')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(axe.violations).toEqual([]);
});

test('hover and keyboard focus on a Key row dim non-matching wires to 13% and clear on leave/blur', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await openLumenRelay(page);
  await expect(page.locator('.conduit-group').first()).toBeVisible();

  const rows = page.locator('#legend-card-list .map-key-row[data-tone]');
  const count = await rows.count();
  expect(count).toBeGreaterThanOrEqual(2);

  const firstRow = rows.first();
  const firstTone = (await firstRow.getAttribute('data-tone'))!;
  const secondRow = rows.nth(1);
  const secondTone = (await secondRow.getAttribute('data-tone'))!;
  expect(secondTone).not.toBe(firstTone);

  await firstRow.hover();
  await expect(page.locator('#stage-world')).toHaveAttribute('data-key', firstTone);

  const wireOpacity = async (tone: string) =>
    page.locator(`.conduit-group[data-tone="${tone}"]`).first().evaluate((el) => getComputedStyle(el).opacity);

  await expect.poll(() => wireOpacity(firstTone)).toBe('1');
  await expect.poll(async () => Number(await wireOpacity(secondTone))).toBeCloseTo(0.13, 2);

  await page.mouse.move(400, 200);
  await expect(page.locator('#stage-world')).not.toHaveAttribute('data-key', /.+/);

  await secondRow.focus();
  await expect(page.locator('#stage-world')).toHaveAttribute('data-key', secondTone);
  await expect.poll(() => wireOpacity(secondTone)).toBe('1');
  await expect.poll(async () => Number(await wireOpacity(firstTone))).toBeCloseTo(0.13, 2);

  await page.locator('#canvas-viewport').click({ position: { x: 8, y: 8 } });
  await expect(page.locator('#stage-world')).not.toHaveAttribute('data-key', /.+/);
});

test('clicking a Key row renames the legend label in place as one undo step', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await openLumenRelay(page);

  const row = page.locator('#legend-card-list .map-key-row[data-tone]').first();
  const tone = (await row.getAttribute('data-tone'))!;
  const original = (await row.locator('.map-key-label').textContent())!.trim();

  await row.click();
  const input = page.locator('#legend-card-list .map-key-input');
  await expect(input).toBeFocused();
  await input.fill('Checkout API');
  await input.press('Enter');

  const updatedRow = page.locator(`#legend-card-list .map-key-row[data-tone="${tone}"]`);
  await expect(updatedRow).toHaveText('Checkout API');

  await page.locator('#canvas-viewport').click({ position: { x: 8, y: 8 } });
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator(`#legend-card-list .map-key-row[data-tone="${tone}"]`)).toHaveText(original);
});

test('empty canvas shows blank Key copy, and async-only tone shows a dashed swatch', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => localStorage.setItem('conduitcraft-first-run-seen', '1'));
  await page.goto('/');

  await expect(page.locator('#legend-card')).toBeVisible();
  await expect(page.locator('#legend-card-list .map-key-empty')).toHaveText('Lines you draw will be listed here.');

  await page.locator('#dock .dock-fav').nth(0).click();
  await page.mouse.click(420, 320);
  await page.locator('#dock .dock-fav').nth(1).click();
  await page.mouse.click(720, 320);
  await expect(page.locator('.arch-node')).toHaveCount(2);

  await page.keyboard.press('w');
  const updated = await page.locator('.arch-node').evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }),
  );
  await page.mouse.move(updated[0].x + updated[0].w / 2, updated[0].y + updated[0].h / 2);
  await page.mouse.down();
  await page.mouse.move(updated[1].x + updated[1].w / 2, updated[1].y + updated[1].h / 2, { steps: 8 });
  await page.mouse.up();

  await expect(page.locator('.conduit-group')).toHaveCount(1);
  await expect(page.locator('#legend-card-list .map-key-swatch')).toHaveCount(1);
  await expect(page.locator('#legend-card-list .map-key-swatch.is-dashed')).toHaveCount(0);

  // Select the wire by clicking its midpoint and switch it to async.
  const mid = await page.evaluate(() => {
    const path = document.querySelector<SVGPathElement>('.conduit-group .conduit-hit');
    const ctm = path?.getScreenCTM();
    if (!path || !ctm) return null;
    const p = path.getPointAtLength(path.getTotalLength() / 2);
    const pt = new DOMPoint(p.x, p.y).matrixTransform(ctm);
    return { x: pt.x, y: pt.y };
  });
  expect(mid).not.toBeNull();
  await page.keyboard.press('v');
  await page.mouse.click(mid!.x, mid!.y);
  await page.locator('#prop-edge-sync').selectOption('async');
  await expect(page.locator('#legend-card-list .map-key-swatch.is-dashed')).toHaveCount(1);
});

test('collapse state of the Key persists across reload', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await openLumenRelay(page);

  await expect(page.locator('#legend-card')).toBeVisible();
  await expect(page.locator('#btn-legend-key')).toBeHidden();

  await page.locator('#btn-key-collapse').click();
  await expect(page.locator('#legend-card')).toBeHidden();
  await expect(page.locator('#btn-legend-key')).toBeVisible();

  await page.reload();
  await openLumenRelay(page);
  await expect(page.locator('#legend-card')).toBeHidden();
  await expect(page.locator('#btn-legend-key')).toBeVisible();

  await page.locator('#btn-legend-key').click();
  await expect(page.locator('#legend-card')).toBeVisible();
  await expect(page.locator('#btn-legend-key')).toBeHidden();

  await page.reload();
  await openLumenRelay(page);
  await expect(page.locator('#legend-card')).toBeVisible();
});
