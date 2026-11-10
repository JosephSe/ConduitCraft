import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { seedStorage } from './helpers';

const node = (i: number) => ({
  id: `n${i}`,
  kind: 'service',
  accent: 'blue',
  icon: 'code',
  title: `Part ${i + 1}`,
  subtitle: 'Request Processor',
  eyebrow: 'SERVICE',
  footerLeft: 'REST / gRPC',
  chip: 'API',
  zoneLabel: 'ARCHITECTURE STAGE',
  interfaceLabel: 'REST / gRPC mTLS',
  summary: 'A part.',
  metrics: [],
  code: '{}',
  x: 100 + i * 260,
  y: 120,
  width: 222,
  height: 142,
});
const doc = (title: string, nodes: number) => ({
  title,
  direction: 'LR',
  stageWidth: 1680,
  stageHeight: 920,
  brand: { name: '', accent: '', logo: '' },
  nodes: Array.from({ length: nodes }, (_, i) => node(i)),
  edges: [],
  zones: [],
  notesCards: [],
  simulations: [],
});

/** Leave an autosave in the database, so the visit is a returning one. */
async function seedAutosave(page: Page, title: string, nodes: number): Promise<void> {
  await seedStorage(page, { diagrams: [{ id: 'autosave', title, updatedAt: Date.now(), doc: doc(title, nodes) }] });
}

const home = (page: Page) => page.locator('#home-dialog');

test('a returning visitor lands on Home with their diagram in Recent, and opens it from there', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedAutosave(page, 'Payments', 2);
  await page.goto('/');
  await expect(home(page)).toBeVisible();
  const card = page.locator('[data-home-open]', { hasText: 'Payments' });
  await expect(card).toBeVisible();
  await card.click();
  await expect(home(page)).toBeHidden();
  await expect(page.locator('.arch-node')).toHaveCount(2);

  // A reload in the same tab goes straight back to the canvas, with the usual offer to restore the session.
  await page.reload();
  await expect(page.locator('#btn-restore-open')).toBeVisible();
  await expect(home(page)).toBeHidden();
});

for (const size of [
  { width: 1440, height: 900 },
  { width: 1024, height: 700 },
  { width: 768, height: 600 },
  { width: 390, height: 800 },
]) {
  test(`Home fits a ${size.width}x${size.height} window with no sideways scroll`, async ({ page }) => {
    await page.setViewportSize(size);
    await seedAutosave(page, 'Payments', 2);
    await page.goto('/');
    await expect(home(page)).toBeVisible();
    await expect(page.locator('button.btn[data-home-new]')).toBeVisible();
    const fit = await page.evaluate(() => {
      const dialog = document.querySelector<HTMLElement>('#home-dialog')!;
      const body = document.querySelector<HTMLElement>('#home-dialog-body')!;
      const box = dialog.getBoundingClientRect();
      return {
        dialogScrolls: dialog.scrollWidth > dialog.clientWidth,
        bodyScrolls: body.scrollWidth > body.clientWidth,
        left: box.left,
        right: box.right,
        viewport: window.innerWidth,
      };
    });
    expect(fit.dialogScrolls).toBe(false);
    expect(fit.bodyScrolls).toBe(false);
    expect(fit.left).toBeGreaterThanOrEqual(0);
    expect(fit.right).toBeLessThanOrEqual(fit.viewport);
  });
}

test('a visitor with nothing saved, or a share link, does not get Home at boot', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#empty-stage-overlay')).toBeVisible();
  await expect(home(page)).toBeHidden();
});

test('Ctrl/Cmd+O opens Home, search narrows Recent, and New starts a blank diagram', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedAutosave(page, 'Payments', 1);
  await page.goto('/');
  await expect(home(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(home(page)).toBeHidden();

  await page.keyboard.press('ControlOrMeta+o');
  await expect(home(page)).toBeVisible();
  await page.locator('#home-search').fill('zzz');
  await expect(page.locator('#home-recent-note')).toContainText('No diagrams match');
  await expect(page.locator('[data-home-open]')).toHaveCount(0);
  await page.locator('#home-search').fill('pay');
  await expect(page.locator('[data-home-open]')).toHaveCount(1);

  await page.locator('[data-home-card][data-home-new]').click();
  await expect(home(page)).toBeHidden();
  await expect(page.locator('.arch-node')).toHaveCount(0);
});

test('the Recent grid works with the arrow keys', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedAutosave(page, 'Payments', 1);
  await page.goto('/');
  await expect(home(page)).toBeVisible();
  const cards = page.locator('#home-recent [data-home-card]');
  await expect(cards).toHaveCount(2);
  await cards.first().focus();
  await page.keyboard.press('ArrowRight');
  await expect(cards.nth(1)).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(cards.first()).toBeFocused();
  await page.keyboard.press('End');
  await expect(cards.nth(1)).toBeFocused();
  await page.keyboard.press('Home');
  await expect(cards.first()).toBeFocused();
});

test('a template on Home opens as a new diagram and leaves the saved one in the library', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedAutosave(page, 'Payments', 2);
  await page.goto('/');
  await expect(home(page)).toBeVisible();
  await page.locator('#home-templates [data-template-id="cicd-pipeline"] .btn-use-template').click();
  await expect(home(page)).toBeHidden();
  await expect(page.locator('.arch-node')).toHaveCount(13);

  await page.keyboard.press('ControlOrMeta+o');
  await expect(page.locator('[data-home-open]', { hasText: 'Payments' })).toBeVisible();
});

test('Home warns when the browser storage is more than 80% full', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedAutosave(page, 'Payments', 1);
  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, 'estimate', {
      configurable: true,
      value: async () => ({ usage: 90, quota: 100 }),
    });
  });
  await page.goto('/');
  await expect(page.locator('#home-storage')).toContainText('90% full');
});

test('Home stays quiet when storage has room', async ({ page }) => {
  await seedAutosave(page, 'Payments', 1);
  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, 'estimate', {
      configurable: true,
      value: async () => ({ usage: 10, quota: 100 }),
    });
  });
  await page.goto('/');
  await expect(home(page)).toBeVisible();
  await expect(page.locator('#home-storage')).toBeHidden();
});

for (const width of [375, 1440]) {
  test(`Home has no axe violations at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await seedAutosave(page, 'Payments', 1);
    await page.goto('/');
    await expect(home(page)).toBeVisible();
    await expect(page.locator('#home-templates .template-preview-frame svg').first()).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });
}

test('with reduced motion, nothing on Home animates', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedAutosave(page, 'Payments', 1);
  await page.goto('/');
  await expect(home(page)).toBeVisible();
  await page.locator('#home-recent [data-home-card]').first().hover();
  const running = await page.evaluate(async () => {
    await Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    );
    return document
      .getAnimations()
      .filter((a) => a.playState === 'running' && !(a.effect as KeyframeEffect | null)?.target?.closest?.('svg'))
      .map((a) => (a as CSSAnimation).animationName ?? (a as CSSTransition).transitionProperty ?? a.id);
  });
  expect(running).toEqual([]);
});

test('Import infrastructure… opens the file picker and imports a Compose file', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedAutosave(page, 'Payments', 1);
  await page.goto('/');
  await expect(home(page)).toBeVisible();
  const link = page.getByRole('button', { name: 'Import infrastructure…' });
  await expect(link).toBeVisible();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), link.click()]);
  await chooser.setFiles({
    name: 'docker-compose.yml',
    mimeType: 'text/yaml',
    buffer: Buffer.from('services:\n  web:\n    image: nginx\n    depends_on: [api]\n  api:\n    image: node:20\n'),
  });
  await expect(page.locator('.arch-node')).toHaveCount(2);
  await expect(home(page)).toBeHidden();
});
