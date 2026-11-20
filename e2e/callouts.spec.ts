import { expect, test, type Page } from '@playwright/test';
import { captureExports, clearSelection, dropFile, nextExport, openExportDialog, redo, undo } from './helpers';

// Callouts: a speech-bubble note attached to one component. It points at the component, follows it, and goes when
// the component goes.

const KIND = 'conduitcraft.blueprint';

const doc = {
  title: 'Callouts',
  nodes: [
    { id: 'api', kind: 'core', title: 'Payments API', subtitle: '', x: 400, y: 360, width: 242, height: 172 },
  ],
  edges: [],
  zones: [],
  notesCards: [
    {
      id: 'callout-1',
      title: 'Maintenance 12am–2am',
      code: '',
      x: 411,
      y: 304,
      items: [],
      variant: 'callout',
      anchorId: 'api',
      dx: 11,
      dy: -56,
      tone: 'time',
    },
  ],
  simulations: [],
};

async function openSeeded(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await dropFile(page, 'callouts.blueprint.json', JSON.stringify({ kind: KIND, version: 15, document: doc }));
  await expect(page.locator('.arch-node')).toHaveCount(1);
  // The callout styles load with the first callout: measure once they apply.
  await expect(page.locator('.blueprint-spec.is-callout')).toHaveCSS('border-radius', '10px');
  await clearSelection(page);
}

const callout = (page: Page) => page.locator('.blueprint-spec.is-callout');
const component = (page: Page) => page.locator('.arch-node[data-node="api"]');

test('a callout sits above its component with its tail pointing down', async ({ page }) => {
  await openSeeded(page);
  await expect(callout(page)).toBeVisible();
  await expect(callout(page)).toHaveAttribute('data-tail', 'bottom');
  await expect(callout(page)).toHaveAttribute('data-tone', 'time');
  await expect(callout(page)).toContainText('Maintenance 12am–2am');
  const bubble = (await callout(page).boundingBox())!;
  const node = (await component(page).boundingBox())!;
  expect(bubble.y + bubble.height).toBeLessThan(node.y);
});

test('dragging the component takes the callout along', async ({ page }) => {
  await openSeeded(page);
  const before = (await callout(page).boundingBox())!;
  const node = (await component(page).boundingBox())!;
  const scale = await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('.arch-node[data-node="api"]')!;
    return el.getBoundingClientRect().width / el.offsetWidth;
  });
  const cx = node.x + node.width / 2;
  const cy = node.y + node.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 40, cy, { steps: 4 });
  await page.mouse.move(cx + 120, cy, { steps: 6 });
  await page.mouse.up();
  const nodeAfter = (await component(page).boundingBox())!;
  const after = (await callout(page).boundingBox())!;
  const moved = nodeAfter.x - node.x;
  expect(moved).toBeGreaterThan(60 * scale);
  expect(Math.abs(after.x - before.x - moved)).toBeLessThanOrEqual(2);
});

test('deleting the component removes its callout, and undo brings both back', async ({ page }) => {
  await openSeeded(page);
  const before = (await callout(page).boundingBox())!;
  await component(page).click();
  await page.keyboard.press('Delete');
  await expect(page.locator('.arch-node')).toHaveCount(0);
  await expect(callout(page)).toHaveCount(0);
  await undo(page);
  await expect(page.locator('.arch-node')).toHaveCount(1);
  await expect(callout(page)).toHaveCount(1);
  const after = (await callout(page).boundingBox())!;
  expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(1);
});

test('Add callout from the right-click menu, type text, pick a tone', async ({ page }) => {
  await openSeeded(page);
  await component(page).locator('.node-select-hit').click({ button: 'right' });
  await page.getByRole('menuitem', { name: /Add callout/ }).click();
  await expect(callout(page)).toHaveCount(2);
  const input = page.getByRole('textbox', { name: 'Note title' });
  await expect(input).toBeFocused();
  await page.keyboard.type('Actor loses access at midnight');
  await page.keyboard.press('Enter');
  const added = callout(page).filter({ hasText: 'Actor loses access at midnight' });
  await expect(added).toHaveCount(1);
  await expect(added).toHaveAttribute('data-tone', 'info');
  // The new one stacks above the one already there.
  const first = (await callout(page).filter({ hasText: 'Maintenance' }).boundingBox())!;
  const second = (await added.boundingBox())!;
  expect(second.y + second.height).toBeLessThan(first.y);

  await page.locator('#prop-callout-tone').selectOption('time');
  await expect(added).toHaveAttribute('data-tone', 'time');
  await expect(added.locator('.callout-icon')).toHaveText('⏱');
  await expect(page.locator('#prop-callout-anchor')).toContainText('Payments API');
  await page.locator('#prop-callout-anchor').click();
  // The component's inspector replaces the callout's.
  await expect(page.locator('#prop-tab-look')).toBeVisible();
  await expect(page.locator('#prop-callout-tone')).toHaveCount(0);
});

test('a callout dragged on its own keeps its new place through undo and redo', async ({ page }) => {
  await openSeeded(page);
  const node = (await component(page).boundingBox())!;
  const header = (await callout(page).locator('.blueprint-spec-header').boundingBox())!;
  await page.mouse.move(header.x + 20, header.y + header.height / 2);
  await page.mouse.down();
  await page.mouse.move(header.x + 120, header.y + 60, { steps: 5 });
  await page.mouse.move(node.x + node.width + 60, node.y + 60, { steps: 8 });
  await page.mouse.up();
  await expect(callout(page)).toHaveAttribute('data-tail', 'left');
  const dragged = (await callout(page).boundingBox())!;
  await undo(page);
  await expect(callout(page)).toHaveAttribute('data-tail', 'bottom');
  await redo(page);
  await expect(callout(page)).toHaveAttribute('data-tail', 'left');
  const back = (await callout(page).boundingBox())!;
  expect(Math.abs(back.x - dragged.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(back.y - dragged.y)).toBeLessThanOrEqual(1);
});

test('resizing a callout starts from its drawn width', async ({ page }) => {
  await openSeeded(page);
  await callout(page).click();
  const box = (await callout(page).boundingBox())!;
  const handle = (await callout(page).locator('.notes-resize-handle').boundingBox())!;
  const x = handle.x + handle.width / 2;
  const y = handle.y + handle.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 10, y, { steps: 3 });
  await page.mouse.move(x + 40, y, { steps: 4 });
  await page.mouse.up();
  const after = (await callout(page).boundingBox())!;
  // Snap to grid may round the width to a multiple of 16.
  expect(Math.abs(after.width - (box.width + 40))).toBeLessThanOrEqual(8);
});

test('dragging a component with its callout against the top edge keeps their offset', async ({ page }) => {
  await openSeeded(page);
  await component(page).click();
  await callout(page).click({ modifiers: ['Shift'] });
  const node = (await component(page).boundingBox())!;
  const before = node.y - (await callout(page).boundingBox())!.y;
  const cx = node.x + node.width / 2;
  const cy = node.y + node.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx, cy - 40, { steps: 4 });
  await page.mouse.move(cx, cy - 600, { steps: 10 });
  await page.mouse.up();
  const after = (await component(page).boundingBox())!.y - (await callout(page).boundingBox())!.y;
  expect(Math.abs(after - before)).toBeLessThanOrEqual(2);
});

/** The centre of the callout's tail on screen, from its ::after box. */
async function tailCentre(page: Page): Promise<{ x: number; y: number }> {
  return callout(page).evaluate((el) => {
    const box = el.getBoundingClientRect();
    const after = getComputedStyle(el, '::after');
    const scale = box.width / (el as HTMLElement).offsetWidth;
    const border = parseFloat(getComputedStyle(el).borderLeftWidth);
    return {
      x: box.left + (border + parseFloat(after.left) + 5) * scale,
      y: box.top + (border + parseFloat(after.top) + 5) * scale,
    };
  });
}

test('the tail points at the middle of the component wherever the bubble is moved', async ({ page }) => {
  await openSeeded(page);
  const node = (await component(page).boundingBox())!;
  const header = (await callout(page).locator('.blueprint-spec-header').boundingBox())!;
  // Slide the bubble 70 px right, still above the component.
  await page.mouse.move(header.x + 30, header.y + header.height / 2);
  await page.mouse.down();
  await page.mouse.move(header.x + 50, header.y + header.height / 2, { steps: 3 });
  await page.mouse.move(header.x + 100, header.y + header.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect(callout(page)).toHaveAttribute('data-tail', 'bottom');
  expect(Math.abs((await tailCentre(page)).x - (node.x + node.width / 2))).toBeLessThanOrEqual(3);

  // Then to the right of it, level with its middle: the tail is on the left side, at the component's middle.
  const h2 = (await callout(page).locator('.blueprint-spec-header').boundingBox())!;
  await page.mouse.move(h2.x + 30, h2.y + h2.height / 2);
  await page.mouse.down();
  await page.mouse.move(h2.x + 60, h2.y + 40, { steps: 3 });
  await page.mouse.move(node.x + node.width + 70, node.y + node.height / 2 + 6, { steps: 8 });
  await page.mouse.up();
  await expect(callout(page)).toHaveAttribute('data-tail', 'left');
  expect(Math.abs((await tailCentre(page)).y - (node.y + node.height / 2))).toBeLessThanOrEqual(3);
});

/** Export through the dialog and return the downloaded file as base64. */
async function exportBase64(page: Page, buttonId: string): Promise<string> {
  const before = await page.evaluate(() => (window as any).__exports.length as number);
  await openExportDialog(page);
  await page.locator(buttonId).click();
  await expect.poll(() => page.evaluate(() => (window as any).__exports.length)).toBeGreaterThan(before);
  return page.evaluate(async () => {
    const w = window as any;
    const { url } = w.__exports[w.__exports.length - 1];
    const bytes = new Uint8Array(await (w.__blobs.get(url) as Blob).arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  });
}

test('the callout shows in PNG, canvas SVG and HTML exports', async ({ page }) => {
  await captureExports(page);
  await openSeeded(page);

  const svg = Buffer.from(await exportBase64(page, '#btn-export-svg-clone'), 'base64').toString('utf8');
  expect(svg).toMatch(/class="blueprint-spec[^"]*is-callout/);
  expect(svg).toContain('Maintenance 12am–2am');

  const html = Buffer.from(await exportBase64(page, '#btn-export-html'), 'base64').toString('utf8');
  // The element itself, not the stylesheet rules for it.
  expect(html).toMatch(/<aside class="blueprint-spec is-callout"[^>]*data-tone="time"[^>]*data-tail="bottom"/);
  expect(html).toMatch(/<span class="callout-icon" aria-hidden="true">⏱<\/span><span class="notes-title">Maintenance 12am–2am<\/span>/);

  const png = await exportBase64(page, '#btn-export-png');
  // The time tone's violet border: nothing else in this diagram is violet.
  const violet = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, img.width, img.height);
    let n = 0;
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
      if (b > 140 && r > 60 && r < 140 && g < 70) n++;
    }
    return n;
  }, png);
  expect(violet).toBeGreaterThan(100);
});
