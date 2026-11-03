// Re-records the README pictures from the running app: node tools/captureReadmeMedia.mjs
// Needs `pnpm build` first and Chromium (`pnpm exec playwright install chromium`). Writes into docs/images/.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

const PORT = 4290;
const OUT = new URL('../docs/images/', import.meta.url).pathname;
const server = spawn('pnpm', ['exec', 'vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const base = `http://localhost:${PORT}`;
for (let i = 0; i < 50; i++) {
  try { if ((await fetch(base)).ok) break; } catch {}
  await new Promise((r) => setTimeout(r, 200));
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
await ctx.addInitScript(() => localStorage.setItem('conduitcraft-first-run-seen', '1'));
const page = await ctx.newPage();

async function palette(query) {
  await page.keyboard.press('ControlOrMeta+k');
  await page.locator('#cmd-palette-input').fill(query);
  await page.keyboard.press('Enter');
  await page.locator('#command-palette-dialog').waitFor({ state: 'hidden' });
}
async function gif(file, choose) {
  await palette('Export Diagram Modal');
  await page.locator('#btn-export-gif').click();
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 120_000 }), choose()]);
  await download.saveAs(OUT + file);
}

await page.goto(`${base}/?ui=2`);
await palette('Lumen Relay');
await page.locator('.arch-node').first().waitFor();
// Tidy the frame: no toast, no first-use tip, whole diagram in view.
async function tidy() {
  await page.evaluate(() => document.querySelectorAll('#toast-container > *').forEach((e) => e.remove()));
  await page.getByRole('button', { name: 'Fit', exact: true }).click();
  await page.waitForTimeout(700);
}

// Design lens picture.
await page.keyboard.press('1');
await tidy();
await page.screenshot({ path: OUT + 'design-canvas.png' });

// Traffic lens with a failed component: the ripple.
await page.keyboard.press('2');
const failedNode = page.locator('.arch-node').nth(3);
await failedNode.click();
await page.keyboard.press('x');
await page.locator('.arch-node[data-chaos="failed"]').first().waitFor();
await page.locator('#canvas-viewport').click({ position: { x: 4, y: 4 } });
await tidy();
await page.screenshot({ path: OUT + 'traffic-failure.png' });
await gif('lumen-relay-failure.gif', () => page.locator('#btn-gif-view').click());

// Review lens picture (failure cleared).
await page.locator('#chaos-reset').click();
await page.keyboard.press('3');
await page.waitForTimeout(600);
await page.screenshot({ path: OUT + 'review-lens.png' });

await browser.close();
server.kill();
