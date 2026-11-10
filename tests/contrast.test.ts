import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readStudioCss } from './studioCss.ts';

const shared = readFileSync(resolve(process.cwd(), 'src/styles/shared.css'), 'utf8');
const studio = readStudioCss();

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

describe('ConduitCraft design tokens (--cc-*)', () => {
  const block = /--cc-surface-0:[\s\S]*?--cc-dur-slow: 320ms;/.exec(shared)?.[0] ?? '';

  it('defines every token group from the plan', () => {
    for (const name of [
      ...[0, 1, 2, 3, 4].map((n) => `surface-${n}`),
      'ink', 'ink-muted', 'ink-faint', 'accent', 'on-accent',
      'shadow-1', 'shadow-2', 'shadow-3', 'radius-s', 'radius-m', 'radius-l',
      ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `space-${n}`),
      'ease-out', 'dur-fast', 'dur-base', 'dur-slow',
    ]) {
      assert.match(shared, new RegExp(`--cc-${name}:`), `--cc-${name}`);
    }
    assert.ok(block.length > 0);
  });

  it('uses the planned radius, spacing and motion values', () => {
    assert.match(shared, /--cc-radius-s: 6px;[\s\S]*--cc-radius-m: 10px;[\s\S]*--cc-radius-l: 16px;/);
    for (let n = 1; n <= 8; n++) assert.match(shared, new RegExp(`--cc-space-${n}: ${n * 4}px;`));
    assert.match(shared, /--cc-ease-out: cubic-bezier\(0\.2, 0\.8, 0\.2, 1\);/);
    assert.match(shared, /--cc-dur-fast: 120ms;[\s\S]*--cc-dur-base: 200ms;[\s\S]*--cc-dur-slow: 320ms;/);
  });

  it('drops every duration to 0 ms under prefers-reduced-motion', () => {
    const reduced = /--cc-dur-slow: 320ms;\s*@media \(prefers-reduced-motion: reduce\) \{([^}]*)\}/.exec(shared)?.[1] ?? '';
    for (const d of ['fast', 'base', 'slow']) assert.match(reduced, new RegExp(`--cc-dur-${d}: 0ms;`));
  });

  it('keeps ink, muted ink and faint ink readable (4.5:1) on the first three surfaces in both themes', () => {
    const pairs: Array<[string, string]> = [
      ['ink', 'canvas'], ['ink', 'surface'], ['ink', 'surface-elevated'],
      ['ink-secondary', 'canvas'], ['ink-secondary', 'surface'], ['ink-secondary', 'surface-elevated'],
      ['ink-muted', 'canvas'], ['ink-muted', 'surface'], ['ink-muted', 'surface-elevated'],
    ];
    for (const theme of ['light', 'dark']) {
      for (const [fg, bg] of pairs) {
        const ratio = contrast(token(`${fg}-${theme}`), token(`${bg}-${theme}`));
        assert.ok(ratio >= 4.5, `${fg} on ${bg} (${theme}) is ${ratio.toFixed(2)}:1`);
      }
    }
  });
});
