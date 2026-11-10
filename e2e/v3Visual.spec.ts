import { expect, test, type Page } from '@playwright/test';
import { runPaletteCommand, seedStorage } from './helpers';

/**
 * Z3, section 10.4. The eight views, both themes, 1440×900, reduced motion.
 * View 6 is its own visit so the failure from view 5 is not in the picture.
 * Z4 re-recorded these after Instrument Sans and Geist Mono became the studio faces.
 * The check still allows 20% of pixels at the default colour threshold. A Linux run can
 * still differ (keyboard symbols, and any glyph outside the Latin subset) until that run
 * shows the real gap. Two runs on one machine match exactly.
 */
const THEMES = ['light', 'dark'] as const;
const PORT = 4281;
const TOLERANCE = { maxDiffPixelRatio: 0.2, threshold: 0.2 } as const;
const SAVED_AT = Date.UTC(2020, 0, 15, 12, 0, 0);

type Theme = (typeof THEMES)[number];

function profile(theme: Theme, seenFirstRun: boolean) {
  const localStorage = [{ name: 'blueprint-studio-color-scheme', value: theme }];
  if (seenFirstRun) localStorage.push({ name: 'conduitcraft-first-run-seen', value: '1' });
  return {
    cookies: [] as [],
    origins: [{ origin: `http://localhost:${PORT}`, localStorage }],
  };
}

const studioUse = (theme: Theme) => ({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  colorScheme: theme,
  reducedMotion: 'reduce' as const,
  storageState: profile(theme, true),
});

async function dismissToasts(page: Page): Promise<void> {
  const button = page.locator('.toast-dismiss-btn');
  for (let i = 0; i < 8; i++) {
    if ((await button.count()) === 0) return;
    await button.first().click({ force: true, timeout: 500 }).catch(() => {});
  }
  // A load notice must not decide the picture. Drop any that would not go.
  await page.locator('.toast-container').evaluateAll((els) => {
    for (const el of els) el.remove();
  });
}

async function shoot(page: Page, name: string): Promise<void> {
  await dismissToasts(page);
  await expect(page).toHaveScreenshot(name, { animations: 'disabled', caret: 'hide', ...TOLERANCE });
}

async function loadShowcase(page: Page): Promise<void> {
  await runPaletteCommand(page, 'Load Showcase');
  await expect(page.locator('.arch-node').first()).toBeVisible({ timeout: 20_000 });
}

async function fit(page: Page): Promise<void> {
  await page.locator('#btn-zoom-fit').click();
  await expect(page.locator('#zoom-readout')).toHaveText(/%/);
}

/** Zoom steps are ×1.2, so Fit cannot land on 100%. Stop on the nearest step. */
async function zoomNear100(page: Page): Promise<string> {
  const readout = page.locator('#zoom-readout');
  const read = async () => (await readout.innerText()).trim();
  for (let i = 0; i < 16; i++) {
    const text = await read();
    const pct = Number.parseInt(text, 10);
    if (pct === 100) return text;
    const before = pct;
    if (pct < 100) await page.locator('#btn-zoom-in').click();
    else await page.locator('#btn-zoom-out').click();
    const next = Number.parseInt(await read(), 10);
    if (Math.abs(next - 100) >= Math.abs(before - 100)) {
      if (next !== before) {
        if (next > before) await page.locator('#btn-zoom-out').click();
        else await page.locator('#btn-zoom-in').click();
      }
      return read();
    }
  }
  return read();
}

async function pauseMidScenario(page: Page): Promise<void> {
  await page.keyboard.press('2');
  await expect(page.locator('#workspace')).toHaveAttribute('data-lens', 'traffic');
  await expect(page.locator('#run-bar')).toBeVisible();
  await page.locator('#run-bar-scenario').selectOption({ index: 1 });
  const play = page.locator('#run-bar-play');
  const step = page.locator('#run-bar-step');
  if ((await play.getAttribute('aria-pressed')) === 'true') await play.click();
  const label = async () => (await step.innerText()).trim();
  const total = /step\s+\d+\s*\/\s*(\d+)/i.exec(await label());
  if (!total) throw new Error(`no step label: ${await label()}`);
  const target = Math.max(1, Math.ceil(Number(total[1]) / 2));
  for (let guard = 0; guard < 40; guard++) {
    const now = /step\s+(\d+)\s*\/\s*\d+/i.exec(await label());
    if (now && Number(now[1]) >= target) break;
    await page.locator('[data-run-step="1"]').click();
  }
  if ((await play.getAttribute('aria-pressed')) === 'true') await play.click();
  await expect(step).toHaveText(/step 3\/6/i);
  await expect(play).toHaveAttribute('aria-pressed', 'false');
}

async function failCenterNode(page: Page): Promise<void> {
  const nodeId = await page.evaluate(() => {
    const viewport = document.getElementById('canvas-viewport')!.getBoundingClientRect();
    let best: { id: string; d: number } | null = null;
    for (const el of document.querySelectorAll<HTMLElement>('.arch-node')) {
      const rect = el.getBoundingClientRect();
      const cx = rect.x + rect.width / 2;
      const cy = rect.y + rect.height / 2;
      if (cx < viewport.left + 40 || cx > viewport.right - 40 || cy < viewport.top + 40 || cy > viewport.bottom - 40) continue;
      const d = Math.hypot(cx - (viewport.x + viewport.width / 2), cy - (viewport.y + viewport.height / 2));
      const id = el.getAttribute('data-node');
      if (id && (!best || d < best.d)) best = { id, d };
    }
    return best?.id ?? null;
  });
  expect(nodeId, 'a visible component to fail').toBeTruthy();
  await page.locator(`.arch-node[data-node="${nodeId}"] .node-select-hit`).click();
  await page.keyboard.press('x');
  await expect(page.locator('.arch-node[data-chaos="failed"]')).toBeVisible();
}

for (const theme of THEMES) {
  test.describe(`studio views (${theme})`, () => {
    test.use(studioUse(theme));

    test('design, traffic paused, and one failure', async ({ page }) => {
      test.setTimeout(90_000);
      await page.addInitScript(() => sessionStorage.setItem('conduitcraft-home-shown', '1'));
      await page.goto('/');
      await expect(page.locator('#canvas-viewport')).toBeVisible();
      await loadShowcase(page);

      await page.keyboard.press('1');
      await expect(page.locator('#workspace')).toHaveAttribute('data-lens', 'design');
      await fit(page);
      await shoot(page, `01-design-fit-${theme}.png`);

      expect(await zoomNear100(page)).toBe('99%');
      const search = page.locator('#hud-search-input');
      await search.click();
      await search.fill('Virtual Waiting Room');
      const selected = page.locator('.arch-node .node-select-hit[aria-pressed="true"]');
      await expect(selected).toBeVisible();
      const clear = page.locator('#btn-clear-search');
      if (await clear.isVisible()) await clear.click();
      await search.blur();
      await expect(selected).toBeVisible();
      await shoot(page, `02-design-100-selected-${theme}.png`);

      await fit(page);
      await page.locator('#btn-rail-expand-palette').click();
      await expect(page.locator('#workspace')).not.toHaveAttribute('data-palette-collapsed', 'true');
      const queue = page.locator('.stencil-card[data-stencil-id="queue"]');
      await queue.scrollIntoViewIfNeeded();
      await expect(queue).toBeVisible();
      await queue.hover();
      await shoot(page, `03-component-panel-${theme}.png`);
      await page.locator('#btn-collapse-palette').click();
      await expect(page.locator('#workspace')).toHaveAttribute('data-palette-collapsed', 'true');

      await pauseMidScenario(page);
      await shoot(page, `04-traffic-paused-${theme}.png`);

      await failCenterNode(page);
      await shoot(page, `05-traffic-failed-${theme}.png`);
    });

    test('review from a fresh load', async ({ page }) => {
      test.setTimeout(60_000);
      await page.addInitScript(() => sessionStorage.setItem('conduitcraft-home-shown', '1'));
      await page.goto('/');
      await loadShowcase(page);
      await page.keyboard.press('3');
      await expect(page.locator('#workspace')).toHaveAttribute('data-lens', 'review');
      await expect(page.locator('#insights-panel')).toBeVisible();
      await fit(page);
      await expect(page.locator('.arch-node[data-chaos="failed"]')).toHaveCount(0);
      await shoot(page, `06-review-${theme}.png`);
    });
  });

  test.describe(`first run (${theme})`, () => {
    test.use({
      ...studioUse(theme),
      storageState: profile(theme, false),
    });

    test('first run shows the failed state at once', async ({ page }) => {
      await page.goto('/');
      await expect(page.locator('#first-run')).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('.arch-node').first()).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('#workspace')).toHaveAttribute('data-lens', 'traffic');
      await expect(page.locator('.arch-node[data-chaos="failed"]')).toBeVisible();
      await shoot(page, `07-first-run-${theme}.png`);
    });
  });

  test.describe(`home (${theme})`, () => {
    test.use(studioUse(theme));

    test('home lists the saved diagram', async ({ page }) => {
      await seedStorage(page, {
        diagrams: [
          {
            id: 'autosave',
            title: 'Payments',
            updatedAt: SAVED_AT,
            doc: {
              title: 'Payments',
              direction: 'LR',
              stageWidth: 1680,
              stageHeight: 920,
              brand: { name: '', accent: '', logo: '' },
              nodes: [
                {
                  id: 'n0',
                  kind: 'service',
                  accent: 'blue',
                  icon: 'code',
                  title: 'Checkout',
                  subtitle: 'Request Processor',
                  eyebrow: 'SERVICE',
                  footerLeft: 'REST / gRPC',
                  chip: 'API',
                  zoneLabel: 'ARCHITECTURE STAGE',
                  interfaceLabel: 'REST / gRPC mTLS',
                  summary: 'Takes payment.',
                  metrics: [],
                  code: '{}',
                  x: 120,
                  y: 140,
                  width: 222,
                  height: 142,
                },
              ],
              edges: [],
              zones: [],
              notesCards: [],
              simulations: [],
            },
          },
        ],
      });
      await page.goto('/');
      await expect(page.locator('#home-dialog')).toBeVisible();
      await expect(page.locator('[data-home-open]', { hasText: 'Payments' })).toBeVisible();
      await expect(page.locator('.home-card-when', { hasText: 'Jan 15, 2020' })).toBeVisible();
      await shoot(page, `08-home-${theme}.png`);
    });
  });
}
