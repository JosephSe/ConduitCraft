import { expect, test, type Page } from '@playwright/test';
import { captureExports, nextExport, openLumenRelay, runPaletteCommand, seedStorage } from './helpers';

// B5. The Share dialog says plainly what a link does, offers to leave images out (with both sizes), and puts the
// file first when the link is too long.

const node = {
  id: 'n0',
  kind: 'service',
  accent: 'blue',
  icon: 'code',
  title: 'Part 1',
  subtitle: 'Request Processor',
  eyebrow: 'SERVICE',
  footerLeft: 'REST / gRPC',
  chip: 'API',
  zoneLabel: 'ARCHITECTURE STAGE',
  interfaceLabel: 'REST / gRPC mTLS',
  summary: 'A part.',
  metrics: [],
  code: '{}',
  x: 100,
  y: 120,
  width: 222,
  height: 142,
};

/** A diagram with one custom icon whose bytes do not compress, so its link is well over the 8 KB warning. */
async function seedHeavyDiagram(page: Page): Promise<void> {
  // Home is not what these tests are about.
  await page.addInitScript(() => sessionStorage.setItem('conduitcraft-home-shown', '1'));
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let seed = 12345;
  let noise = '';
  for (let i = 0; i < 24_000; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    noise += alphabet[seed % alphabet.length];
  }
  const doc = {
    title: 'Heavy',
    direction: 'LR',
    stageWidth: 1680,
    stageHeight: 920,
    brand: { name: '', accent: '', logo: '' },
    nodes: [{ ...node, iconImage: `data:image/png;base64,${noise}` }],
    edges: [],
    zones: [],
    notesCards: [],
    simulations: [],
  };
  await seedStorage(page, { diagrams: [{ id: 'autosave', title: 'Heavy', updatedAt: Date.now(), doc }] });
}

const openShare = async (page: Page) => {
  await runPaletteCommand(page, 'Export Diagram Modal');
  await expect(page.locator('#share-link-box')).toBeVisible();
};

test('the Share dialog says who can see the link and that nothing is uploaded', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await openLumenRelay(page);
  await openShare(page);
  await expect(page.locator('.share-link-desc')).toHaveText('Anyone with this link can see the whole diagram. Nothing is uploaded.');
  // Lumen Relay has small custom icons: the option and both sizes show, and the link is short enough to stay primary.
  await expect(page.locator('#share-link-options')).toBeVisible();
  await expect(page.locator('#share-image-sizes')).toContainText(/With images \d+\.\d KB, without \d+\.\d KB/);
  await expect(page.locator('#share-link-size')).not.toContainText('Download the file instead');
  await expect(page.locator('#btn-share-download-file')).toBeVisible();
  await expect(page.locator('#btn-share-download-file')).not.toHaveClass(/\bsolid\b/);
});

test('a link made heavy by images shows both sizes, makes the file the main action, and shrinks without images', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedHeavyDiagram(page);
  await page.goto('/');
  await page.locator('#btn-restore-open').click();
  await expect(page.locator('.arch-node')).toHaveCount(1);
  await openShare(page);

  await expect(page.locator('#share-link-options')).toBeVisible();
  await expect(page.locator('#share-link-size')).toContainText('Download the file instead');
  await expect(page.locator('#share-image-sizes')).toContainText(/With images \d+\.\d KB, without \d+\.\d KB/);
  await expect(page.locator('#btn-share-download-file')).toHaveClass(/\bsolid\b/);
  await expect(page.locator('#btn-copy-share-link')).not.toHaveClass(/\bsolid\b/);
  const heavy = await page.locator('#share-link-input').inputValue();

  await page.locator('#chk-share-omit-images').check();
  await expect(page.locator('#share-link-size')).not.toContainText('Download the file instead');
  await expect(page.locator('#btn-copy-share-link')).toHaveClass(/\bsolid\b/);
  await expect(page.locator('#btn-share-download-file')).not.toHaveClass(/\bsolid\b/);
  const light = await page.locator('#share-link-input').inputValue();
  expect(light.length).toBeLessThan(heavy.length / 4);
});

test('"Download file instead" saves the Blueprint file', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await captureExports(page);
  await seedHeavyDiagram(page);
  await page.goto('/');
  await page.locator('#btn-restore-open').click();
  await expect(page.locator('.arch-node')).toHaveCount(1);
  await openShare(page);
  await page.locator('#btn-share-download-file').click();
  const file = await nextExport(page);
  expect(file.name).toMatch(/\.blueprint\.json$/);
  // The whole diagram, image included, not the link's trimmed copy.
  expect(file.head.startsWith('{')).toBe(true);
  expect(file.size).toBeGreaterThan(24_000);
});

test('the top-bar Share opens the dialog instead of copying a link that is too long', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedHeavyDiagram(page);
  await page.goto('/');
  await page.locator('#btn-restore-open').click();
  await expect(page.locator('.arch-node')).toHaveCount(1);
  await page.locator('#btn-share').click();
  await expect(page.locator('#share-link-box')).toBeVisible();
  await expect(page.locator('#toast-container')).toContainText('too long for many apps');
});
