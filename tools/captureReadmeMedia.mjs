// Re-records the README pictures and the showcase walkthrough pictures (docs/showcase.md) from the running app:
//   node tools/captureReadmeMedia.mjs            both sets
//   node tools/captureReadmeMedia.mjs readme     only the README pictures
//   node tools/captureReadmeMedia.mjs showcase   only the showcase-*.jpg pictures
// Needs `pnpm build` first and Chromium (`pnpm exec playwright install chromium`). Writes into docs/images/.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

const only = process.argv[2];
if (only && only !== 'readme' && only !== 'showcase') throw new Error(`Unknown set "${only}": use readme or showcase.`);
const want = (set) => !only || only === set;
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
  await page.waitForTimeout(300);
  await page.keyboard.press('Enter');
  await page.locator('#command-palette-dialog').waitFor({ state: 'hidden' });
}
async function gif(file, choose) {
  await palette('Export Diagram Modal');
  await page.locator('#btn-export-gif').click();
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 120_000 }), choose()]);
  await download.saveAs(OUT + file);
}

async function loadShowcase() {
  await page.goto(`${base}/?ui=2`);
  await palette('Load Showcase');
  await page.locator('.arch-node').first().waitFor();
}
// Clear the selection.
async function deselect() {
  await page.keyboard.press('Escape');
}
// Tidy the frame: no toast, no first-use tip, whole diagram in view.
async function tidy() {
  await page.evaluate(() => {
    document.querySelectorAll('#toast-container > *').forEach((e) => e.remove());
    // Focusing a component scrolls its container; Fit sets the transform but leaves that scroll behind.
    document.querySelectorAll('*').forEach((e) => {
      if (e.scrollTop || e.scrollLeft) { e.scrollTop = 0; e.scrollLeft = 0; }
    });
  });
  await page.getByRole('button', { name: 'Fit', exact: true }).click();
  await page.waitForTimeout(1500);
}

if (want('readme')) {
  await loadShowcase();

  // Design lens picture.
  await page.keyboard.press('1');
  await deselect();
  await tidy();
  await page.screenshot({ path: OUT + 'design-canvas.png' });

  // Traffic lens with a failed component: the ripple.
  await page.keyboard.press('2');
  const failedNode = page.locator('.arch-node', { hasText: 'Ticket Database' });
  await failedNode.click();
  await page.keyboard.press('x');
  await page.locator('.arch-node[data-chaos="failed"]').first().waitFor();
  await deselect();
  await tidy();
  await page.screenshot({ path: OUT + 'traffic-failure.png' });
  await gif('traffic-failure.gif', () => page.locator('#btn-gif-view').click());

  // Review lens picture (failure cleared).
  await page.locator('#chaos-reset').click();
  await page.keyboard.press('3');
  await page.waitForTimeout(600);
  await tidy();
  await page.screenshot({ path: OUT + 'review-lens.png' });

  // Design lens with a callout on a component.
  await page.keyboard.press('1');
  const orchestrator = page.locator('.arch-node', { hasText: 'Payment Orchestrator' });
  await orchestrator.locator('.node-select-hit').click();
  await palette('Add callout');
  await page.locator('.blueprint-spec.is-callout').waitFor();
  await page.keyboard.type('PSP maintenance Sun 02:00 to 03:00 UTC');
  await page.keyboard.press('Enter');
  await page.locator('#prop-callout-tone').selectOption('time');
  await deselect();
  await tidy();
  // Close in on the component so the callout can be read.
  await orchestrator.locator('.node-select-hit').click();
  await palette('Fit Selection');
  await page.waitForTimeout(800);
  for (let i = 0; i < 3; i++) await page.locator('#btn-zoom-out').click();
  await deselect();
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    document.querySelectorAll('#toast-container > *').forEach((e) => e.remove());
    (document.activeElement)?.blur();
  });
  await page.screenshot({ path: OUT + 'design-callout.png' });
}

if (want('showcase')) {
  const shot = (name) => page.screenshot({ path: OUT + name, type: 'jpeg', quality: 85 });
  const node = (title) => page.locator('.arch-node', { hasText: title });
  /** Close the side panel so the whole diagram shows (or open it, for the step trace), then fit the diagram. */
  async function frame({ panel = false } = {}) {
    const close = page.getByRole('button', { name: /^Close properties/ });
    if (!panel && (await close.isVisible())) {
      await page.keyboard.press(']');
      await close.waitFor({ state: 'hidden' });
    }
    const toggle = page.locator('#btn-toggle-right-panel');
    const hidden = (await toggle.getAttribute('aria-pressed')) === 'true';
    if (panel === hidden) await toggle.click();
    await tidy();
  }
  /** Loads a scenario in the run bar, pauses it and jumps to one step. */
  async function runTo(scenarioId, step) {
    await page.locator('#run-bar-scenario').selectOption(scenarioId);
    const play = page.locator('#run-bar-play');
    if ((await play.getAttribute('aria-pressed')) === 'true') await play.click();
    const label = page.locator('#run-bar-step');
    const current = async () => Number(/step\s+(\d+)/i.exec(await label.innerText())?.[1] ?? 0);
    for (let guard = 0; guard < 40 && (await current()) !== step; guard++) {
      await page.locator(`[data-run-step="${(await current()) < step ? 1 : -1}"]`).click();
      await page.waitForTimeout(150);
    }
    await page.waitForTimeout(1200);
  }
  /** A clean start: no run loaded, nothing failed, the trace panel closed. */
  async function restart(lens) {
    await loadShowcase();
    await page.keyboard.press(lens);
    await page.waitForTimeout(400);
  }

  await loadShowcase();

  // The whole on-sale system in the Design lens.
  await page.keyboard.press('1');
  await deselect();
  await frame();
  await shot('showcase-design.jpg');

  // Buying two tickets, paused on the payment step.
  await page.keyboard.press('2');
  await frame({ panel: true });
  await runTo('sim-buy', 12);
  await page.getByRole('tab', { name: 'Live Trace' }).click();
  await shot('showcase-traffic-buy.jpg');

  // Card Processor A has failed; the charge reroutes to Processor B.
  await restart('2');
  await frame({ panel: true });
  await runTo('sim-psp', 5);
  await page.getByRole('tab', { name: 'Live Trace' }).click();
  await shot('showcase-traffic-psp.jpg');

  // The dashboard has failed; the order stream buffers its events.
  await restart('2');
  await node('Promoter Dashboard').locator('.node-select-hit').click();
  await page.keyboard.press('x');
  await page.locator('.arch-node[data-chaos="failed"]').first().waitFor();
  await deselect();
  await frame();
  await shot('showcase-traffic-dashboard.jpg');

  // The Review lens listing the three warnings.
  await restart('3');
  await page.waitForTimeout(600);
  await frame();
  await shot('showcase-review.jpg');

  // Inside Seat Inventory.
  await page.keyboard.press('1');
  await node('Seat Inventory').locator('.node-level-badge').click();
  await page.locator('#level-breadcrumb').waitFor();
  await frame();
  await page.locator('#level-breadcrumb').waitFor();
  await shot('showcase-level-seats.jpg');
  await page.keyboard.press('ControlOrMeta+ArrowUp');
  await page.locator('#level-breadcrumb').waitFor({ state: 'hidden' });

  // The tour page.
  await page.locator('#page-tabs [role="tab"]').last().click();
  await page.waitForTimeout(600);
  await deselect();
  await frame();
  await shot('showcase-page-tour.jpg');

  // First run, as a brand-new visitor sees it: the rush plays, then the Ticket Database fails.
  const fresh = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const first = await fresh.newPage();
  await first.goto(`${base}/?ui=2`);
  await first.locator('#first-run').waitFor();
  await first.locator('#chaos-summary').filter({ hasText: 'failed' }).waitFor({ timeout: 20_000 });
  await first.waitForTimeout(2500);
  await first.screenshot({ path: OUT + 'showcase-fr-failed.jpg', type: 'jpeg', quality: 85 });
  await fresh.close();
}

await browser.close();
server.kill();
