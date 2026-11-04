// Fails when the initial bundle grows past its budget. Run after `pnpm build`.
import fs from 'node:fs';
import path from 'node:path';

const dist = path.resolve('dist/assets');
// Budgets are raw bytes. Entry: JS ~385 kB, CSS ~102 kB, with headroom. Lazy chunks get their own limits so a
// feature moved out of the entry cannot quietly grow without bound.
const budgets = [
  { pattern: /^index-.*\.js$/, maxBytes: 480 * 1024, label: 'entry JS' },
  { pattern: /^index-.*\.css$/, maxBytes: 115 * 1024, label: 'entry CSS' },
];

// Lazy chunks: every one is checked (not just the first match). Patterns are tried in order; a chunk that matches
// none falls under the default limit, so a new lazy chunk is covered without editing this file.
const lazyBudgets = [
  { pattern: /^standaloneHtml-.*\.js$/, maxBytes: 100 * 1024, label: 'HTML export chunk' },
  { pattern: /^gifWorker-.*\.js$/, maxBytes: 12 * 1024, label: 'GIF worker' },
  { pattern: /^gif-.*\.js$/, maxBytes: 12 * 1024, label: 'GIF exporter chunk' },
  { pattern: /\.blueprint-.*\.js$/, maxBytes: 30 * 1024, label: 'template chunk' },
  { pattern: /^drawio-.*\.js$/, maxBytes: 24 * 1024, label: 'draw.io importer chunk' },
];
const DEFAULT_LAZY_MAX_BYTES = 60 * 1024;

if (!fs.existsSync(dist)) {
  console.error('dist/assets not found. Run `pnpm build` first.');
  process.exit(2);
}
const files = fs.readdirSync(dist);
let failed = false;
for (const { pattern, maxBytes, label } of budgets) {
  const match = files.find((f) => pattern.test(f));
  if (!match) {
    console.error(`No ${label} file found matching ${pattern}`);
    failed = true;
    continue;
  }
  const size = fs.statSync(path.join(dist, match)).size;
  const ok = size <= maxBytes;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: ${(size / 1024).toFixed(1)} kB / ${(maxBytes / 1024).toFixed(0)} kB (${match})`);
  if (!ok) failed = true;
}
const entryJs = files.find((f) => /^index-.*\.js$/.test(f));
for (const file of files.filter((f) => f.endsWith('.js') && f !== entryJs)) {
  const budget = lazyBudgets.find((b) => b.pattern.test(file));
  const maxBytes = budget?.maxBytes ?? DEFAULT_LAZY_MAX_BYTES;
  const label = budget?.label ?? 'lazy chunk';
  const size = fs.statSync(path.join(dist, file)).size;
  const ok = size <= maxBytes;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: ${(size / 1024).toFixed(1)} kB / ${(maxBytes / 1024).toFixed(0)} kB (${file})`);
  if (!ok) failed = true;
}
process.exit(failed ? 1 : 0);
