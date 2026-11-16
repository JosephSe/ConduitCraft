import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/**
 * The studio sheet with its region files inlined. `studio.css` lists those files; tests that
 * look for a rule read this, so a split does not hide the rule.
 * `shared.css` stays an `@import`: the tests that read it open that file themselves.
 */
export function readStudioCss(): string {
  const entry = resolve(process.cwd(), 'src/styles/studio.css');
  return inlineRegions(entry, new Set());
}

function inlineRegions(file: string, seen: Set<string>): string {
  if (seen.has(file)) return '';
  seen.add(file);
  const dir = dirname(file);
  const text = readFileSync(file, 'utf8');
  return text.replace(/@import\s+["'](\.\/studio\/[^"']+)["'];/g, (_match, spec: string) => {
    return inlineRegions(resolve(dir, spec), seen);
  });
}
