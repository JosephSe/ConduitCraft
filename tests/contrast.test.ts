import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const shared = readFileSync(resolve(process.cwd(), 'src/styles/shared.css'), 'utf8');
const studio = readFileSync(resolve(process.cwd(), 'src/styles/studio.css'), 'utf8');

function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function token(name: string): string {
  const match = new RegExp(`--wl-${name}:\\s*(#[0-9a-fA-F]{6})`).exec(shared);
  assert.ok(match, `--wl-${name} must be a 6-digit hex colour`);
  return match[1];
}

describe('text on accent backgrounds', () => {
  // Each place the theme picks --wl-blue also declares --wl-on-blue, the text colour that goes on top of it.
  const pairs = [...shared.matchAll(/--wl-blue: var\(--wl-blue-(light|dark)\);\s*--wl-on-blue: (#[0-9a-fA-F]{6});/g)];

  it('declares --wl-on-blue alongside every --wl-blue theme definition', () => {
    const blueDefinitions = [...shared.matchAll(/--wl-blue: var\(--wl-blue-(?:light|dark)\);/g)];
    assert.ok(pairs.length >= 2, 'at least a light and a dark pair');
    assert.equal(pairs.length, blueDefinitions.length, 'no --wl-blue definition may lack its --wl-on-blue');
  });

  it('meets 4.5:1 against both ends of the blue-to-emerald gradient in each theme', () => {
    for (const [, theme, onBlue] of pairs) {
      for (const accent of ['blue', 'emerald']) {
        const ratio = contrast(onBlue, token(`${accent}-${theme}`));
        assert.ok(ratio >= 4.5, `${onBlue} on ${accent} (${theme}) is ${ratio.toFixed(2)}:1, needs 4.5:1`);
      }
    }
  });

  it('uses that token for the primary export button instead of fixed white', () => {
    const rule = /\.btn-primary-export \{[^}]*\}/.exec(studio)?.[0] ?? '';
    assert.match(rule, /color:\s*var\(--wl-on-blue\)/);
    assert.doesNotMatch(rule, /color:\s*#fff/i);
  });
});
