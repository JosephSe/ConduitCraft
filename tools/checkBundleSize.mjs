// Fails when the initial bundle grows past its budget. Run after `pnpm build`.
import fs from 'node:fs';
import path from 'node:path';

const dist = path.resolve('dist/assets');
// Budgets are raw bytes of the entry chunks (current: JS ~446 kB, CSS ~102 kB) with headroom.
const budgets = [
  { pattern: /^index-.*\.js$/, maxBytes: 480 * 1024, label: 'entry JS' },
  { pattern: /^index-.*\.css$/, maxBytes: 115 * 1024, label: 'entry CSS' },
];

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
process.exit(failed ? 1 : 0);
