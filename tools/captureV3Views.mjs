// Records the eight 3.0 views, light and dark: node tools/captureV3Views.mjs [outDir]
// Needs `pnpm build` first and Chromium. Defaults to docs/v3/after/. Same names as docs/v3/before/.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';

const PORT = 4291;
const OUT = process.argv[2] ?? new URL('../docs/v3/after/', import.meta.url).pathname;
await mkdir(OUT, { recursive: true });
const server = spawn('pnpm', ['exec', 'vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const base = `http://localhost:${PORT}`;
for (let i = 0; i < 50; i++) {
  try { if ((await fetch(base)).ok) break; } catch {}
  await new Promise((r) => setTimeout(r, 200));
}

const browser = await chromium.launch();
try {
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: scheme });
    let page = await ctx.newPage();
    const palette = async (query) => {
      await page.keyboard.press('ControlOrMeta+k');
      await page.locator('#cmd-palette-input').fill(query);
      await page.keyboard.press('Enter');
      await page.locator('#command-palette-dialog').waitFor({ state: 'hidden' });
    };
    const tidy = async () => {
      await page.evaluate(() => document.querySelectorAll('#toast-container > *').forEach((e) => e.remove()));
      await page.waitForTimeout(700);
    };
    const shot = async (name) => { await tidy(); await page.screenshot({ path: `${OUT}${name}-${scheme}.png` }); };
    const clear = () => page.locator('#canvas-viewport').click({ position: { x: 4, y: 4 } });

    // 07 first run: a fresh visit with nothing remembered.
    await page.goto(base);
    await page.waitForTimeout(800);
    await shot('07-first-run');

    // 08 home.
    await page.evaluate(() => sessionStorage.clear());
    await page.goto(base);
    await page.waitForTimeout(800);
    await shot('08-home');

    // The showcase, once the first-run and home screens are out of the way.
    await ctx.close();
    const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: scheme });
    await ctx2.addInitScript(() => {
      localStorage.setItem('conduitcraft-first-run-seen', '1');
      sessionStorage.setItem('conduitcraft-home-shown', '1');
    });
    page = await ctx2.newPage();
    await page.goto(base);
    await page.waitForTimeout(1500);
    await palette('Load Showcase');
    await page.locator('.conduit-stream').first().waitFor({ state: 'attached', timeout: 30000 }).catch(async (e) => { await page.screenshot({ path: '/private/tmp/claude-502/-Users-josephwork-Documents-antigravity-blueprint-studio/bc20bdee-daf9-4e98-98e0-e1bc2f85bfdb/scratchpad/fail.png' }); throw e; });
    await page.keyboard.press('1');
    await clear();
    await page.getByRole('button', { name: 'Fit', exact: true }).click();
    await shot('01-design-fit');

    await page.locator('#zoom-readout').click().catch(() => {});
    await page.keyboard.press('Escape');
    await page.keyboard.press('ControlOrMeta+1').catch(() => {});
    await page.locator('.arch-node').nth(3).click();
    await shot('02-design-100-selected');
    await shot('03-component-panel');

    await clear();
    await page.keyboard.press('2');
    await page.waitForTimeout(600);
    await shot('04-traffic-paused');

    await page.locator('.arch-node').nth(2).click({ button: 'right' });
    await page.getByRole('menuitem', { name: /Fail this component/ }).click();
    await page.locator('.arch-node[data-chaos="degraded"], .arch-node[data-chaos="failed"]').first().waitFor({ state: 'attached', timeout: 6000 }).catch(async (e) => { await page.screenshot({ path: '/private/tmp/claude-502/-Users-josephwork-Documents-antigravity-blueprint-studio/bc20bdee-daf9-4e98-98e0-e1bc2f85bfdb/scratchpad/fail2.png' }); console.log(await page.evaluate(() => [...document.querySelectorAll('.arch-node')].map((n) => n.dataset.chaos).join(','))); throw e; });
    await clear();
    await shot('05-traffic-failed');

    await page.locator('.arch-node[data-chaos="degraded"], .arch-node[data-chaos="failed"]').first().click({ button: 'right' });
    await page.getByRole('menuitem', { name: /Restore/ }).click();
    await page.keyboard.press('3');
    await shot('06-review');
    await ctx2.close();
  }
} finally {
  await browser.close();
  server.kill();
}
