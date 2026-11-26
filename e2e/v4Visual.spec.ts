import { expect, test, type Page } from '@playwright/test';
import { clearSelection, openExportDialog, runPaletteCommand, seedStorage } from './helpers';

/**
 * REDESIGN_PLAN_V4.md (GR1, section 10.4).
 * Ten views, both themes, 1440×900, reduced motion.
 * Views 1–10 capture the pre-4.0 baseline in `docs/v4/before/`; each 4.0 milestone re-records only the views it owns.
 */
const THEMES = ['light', 'dark'] as const;
const PORT = Number(process.env.E2E_PORT) || 4281;
const TOLERANCE = { maxDiffPixelRatio: process.platform === 'darwin' ? 0.001 : 0.2, threshold: 0.2 } as const;
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
  await clearSelection(page);
}

async function settleCanvas(page: Page): Promise<void> {
  let last = -1;
  await expect
    .poll(
      async () => {
        const width = await page.locator('#canvas-viewport').evaluate((el) => Math.round(el.getBoundingClientRect().width));
        const settled = width === last;
        last = width;
        return settled;
      },
      { timeout: 5_000, intervals: [200] },
    )
    .toBe(true);
}

async function fit(page: Page): Promise<void> {
  await settleCanvas(page);
  await page.locator('#btn-zoom-fit').click();
  await expect(page.locator('#zoom-readout')).toHaveText(/%/);
  let last = '';
  await expect
    .poll(
      async () => {
        const now = await page.locator('.stage-world').evaluate((el) => getComputedStyle(el).transform);
        const settled = now === last;
        last = now;
        return settled;
      },
      { timeout: 5_000, intervals: [200] },
    )
    .toBe(true);
}

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

async function settleBox(locator: ReturnType<Page['locator']>): Promise<void> {
  let last = -1;
  await expect
    .poll(
      async () => {
        const top = await locator.evaluate((el) => Math.round(el.getBoundingClientRect().top));
        const settled = top === last;
        last = top;
        return settled;
      },
      { timeout: 5_000, intervals: [150] },
    )
    .toBe(true);
}

async function pauseAtScenarioStep(page: Page, targetStep = 8): Promise<void> {
  await page.keyboard.press('2');
  await expect(page.locator('#workspace')).toHaveAttribute('data-lens', 'traffic');
  await expect(page.locator('#run-bar')).toBeVisible();

  const select = page.locator('#run-bar-scenario');
  const buyValue = await select.evaluate((el: HTMLSelectElement) => {
    const match = Array.from(el.options).find((o) => /buy two tickets/i.test(o.text));
    return match ? match.value : el.options[1]?.value ?? '';
  });
  expect(buyValue, 'a scenario option to select').toBeTruthy();
  await select.selectOption(buyValue);

  const play = page.locator('#run-bar-play');
  const step = page.locator('#run-bar-step');
  if ((await play.getAttribute('aria-pressed')) === 'true') await play.click();
  const label = async () => (await step.innerText()).trim();
  const totalMatch = /step\s+\d+\s*\/\s*(\d+)/i.exec(await label());
  if (!totalMatch) throw new Error(`no step label: ${await label()}`);
  const total = Number(totalMatch[1]);
  const goal = Math.min(targetStep, total);

  for (let guard = 0; guard < 40; guard++) {
    const now = /step\s+(\d+)\s*\/\s*\d+/i.exec(await label());
    if (now && Number(now[1]) >= goal) break;
    await page.locator('[data-run-step="1"]').click();
  }
  if ((await play.getAttribute('aria-pressed')) === 'true') await play.click();
  await expect(step).toHaveText(new RegExp(`step\\s+${goal}\\/${total}`, 'i'));
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
  test.describe(`v4 baseline views (${theme})`, () => {
    test.use(studioUse(theme));

    test('design, composer baselines, traffic, failure, and share', async ({ page }) => {
      test.setTimeout(120_000);
      await page.addInitScript(() => sessionStorage.setItem('conduitcraft-home-shown', '1'));
      await page.goto('/');
      await expect(page.locator('#canvas-viewport')).toBeVisible();
      await loadShowcase(page);

      // View 1: Showcase, Design, Fit
      await page.keyboard.press('1');
      await expect(page.locator('#workspace')).toHaveAttribute('data-lens', 'design');
      await fit(page);
      await shoot(page, `01-design-fit-${theme}.png`);

      // View 2: Showcase, Design, ~100%, one component selected, properties card open
      expect(await zoomNear100(page)).toBe('107%');
      const search = page.locator('#hud-search-input');
      await page.keyboard.press('ControlOrMeta+f');
      await search.fill('Virtual Waiting Room');
      const selected = page.locator('.arch-node .node-select-hit[aria-pressed="true"]');
      await expect(selected).toBeVisible();
      const clear = page.locator('#btn-clear-search');
      if (await clear.isVisible()) await clear.click();
      await search.blur();
      await expect(selected).toBeVisible();
      await expect(page.locator('#inspector-panel')).toBeVisible();
      await shoot(page, `02-design-100-selected-${theme}.png`);

      // View 3: Composer open on "redis"
      await clearSelection(page);
      await fit(page);
      await page.locator('#btn-all-components').click();
      await expect(page.locator('#composer')).toBeVisible();
      const composerInput = page.locator('#composer-input');
      await expect(composerInput).toBeVisible();
      await composerInput.fill('redis');
      const firstMatch = page.locator('#composer .composer-item:not([hidden])').first();
      await expect(firstMatch).toBeVisible();
      await settleBox(firstMatch);
      await firstMatch.hover();
      await shoot(page, `03-composer-component-${theme}.png`);
      await page.keyboard.press('Escape');
      await expect(page.locator('#composer')).toBeHidden();

      // View 4: Command surface open on "gateway" (pre-4.0 palette baseline; CP3 switches to composer chain)
      await page.keyboard.press('ControlOrMeta+k');
      const palette = page.locator('#command-palette-dialog');
      await expect(palette).toBeVisible();
      await page.locator('#cmd-palette-input').fill('gateway');
      await expect(page.locator('#cmd-palette-results > *').first()).toBeVisible();
      await settleBox(palette);
      await shoot(page, `04-composer-chain-${theme}.png`);
      await page.keyboard.press('Escape');
      await expect(palette).toBeHidden();

      // View 9: Share / Export sheet (Design, Fit)
      await openExportDialog(page);
      await expect(page.locator('#export-dialog')).toBeVisible();
      await expect(page.locator('#share-link-box')).toBeVisible();
      await expect(page.locator('#share-link-input')).not.toHaveValue('');
      await settleBox(page.locator('#export-dialog'));
      await shoot(page, `09-share-${theme}.png`);
      await page.keyboard.press('Escape');
      await expect(page.locator('#export-dialog')).toBeHidden();

      // View 5: Showcase, Traffic, paused on step 8
      await pauseAtScenarioStep(page, 8);
      await shoot(page, `05-traffic-paused-${theme}.png`);

      // View 6: Showcase, Traffic, one component failed
      await failCenterNode(page);
      await shoot(page, `06-traffic-failed-${theme}.png`);
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
      await clearSelection(page);
      await expect(page.locator('.arch-node .node-select-hit[aria-pressed="true"]')).toHaveCount(0);
      await fit(page);
      await shoot(page, `07-review-${theme}.png`);
    });
  });

  test.describe(`v4 baseline first run (${theme})`, () => {
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
      let last = '';
      await expect
        .poll(
          async () => {
            const now = await page.evaluate(
              () => `${document.getElementById('canvas-viewport')!.getBoundingClientRect().width}|${document.getElementById('zoom-readout')!.textContent}`,
            );
            const settled = now === last;
            last = now;
            return settled;
          },
          { timeout: 5_000, intervals: [400] },
        )
        .toBe(true);
      await page.locator('#btn-zoom-fit').click();
      last = '';
      await expect
        .poll(
          async () => {
            const now = await page.evaluate(() => document.getElementById('zoom-readout')!.textContent ?? '');
            const settled = now === last;
            last = now;
            return settled;
          },
          { timeout: 5_000, intervals: [400] },
        )
        .toBe(true);
      await shoot(page, `08-first-run-${theme}.png`);
    });
  });

  test.describe(`v4 baseline home (${theme})`, () => {
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
      await shoot(page, `10-home-${theme}.png`);
    });
  });
}
