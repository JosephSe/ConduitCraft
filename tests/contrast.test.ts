import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readStudioCss } from './studioCss.ts';

const root = process.cwd();
const shared = readFileSync(resolve(root, 'src/styles/shared.css'), 'utf8');
const studio = readStudioCss();
const layout = readFileSync(resolve(root, 'src/styles/studio/layout.css'), 'utf8');
const stage = readFileSync(resolve(root, 'src/styles/studio/stage.css'), 'utf8');
const components = readFileSync(resolve(root, 'src/styles/studio/components.css'), 'utf8');

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

function themeBlock(selector: string): string {
  const start = shared.indexOf(selector);
  assert.ok(start >= 0, selector);
  const open = shared.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < shared.length; i++) {
    if (shared[i] === '{') depth += 1;
    else if (shared[i] === '}') {
      depth -= 1;
      if (depth === 0) return shared.slice(open + 1, i);
    }
  }
  assert.fail(`unclosed ${selector}`);
}

function token(theme: 'vellum' | 'graphite', name: string): string {
  const block = theme === 'vellum' ? themeBlock(':root {') : themeBlock(':root[data-theme="graphite"]');
  const match = new RegExp(`--cc-${name}:\\s*(#[0-9A-Fa-f]{6})`).exec(block);
  assert.ok(match, `${theme} --cc-${name} must be a 6-digit hex colour`);
  return match[1];
}

describe('5.1 colour pairs', () => {
  const themes = ['vellum', 'graphite'] as const;
  const text = ['ink', 'ink-2', 'ink-3', 'redline'] as const;
  const surfaces = ['canvas', 'canvas-run', 'sheet'] as const;
  const tones = ['blue', 'emerald', 'rose', 'violet', 'amber', 'cyan', 'fuchsia'] as const;

  it('keeps text at 4.5:1 on the sheet and both canvases', () => {
    for (const theme of themes) {
      for (const fg of text) {
        for (const bg of surfaces) {
          const ratio = contrast(token(theme, fg), token(theme, bg));
          assert.ok(ratio >= 4.5, `${fg} on ${bg} (${theme}) is ${ratio.toFixed(2)}:1`);
        }
      }
      const onInk = contrast(token(theme, 'on-ink'), token(theme, 'ink'));
      assert.ok(onInk >= 4.5, `on-ink on ink (${theme}) is ${onInk.toFixed(2)}:1`);
    }
  });

  it('keeps wires at 3:1 on the sheet, the canvas and the Traffic canvas', () => {
    for (const theme of themes) {
      for (const tone of tones) {
        for (const bg of ['sheet', 'canvas', 'canvas-run'] as const) {
          const ratio = contrast(token(theme, tone), token(theme, bg));
          assert.ok(ratio >= 3, `${tone} on ${bg} (${theme}) is ${ratio.toFixed(2)}:1`);
        }
      }
    }
  });

  it('keeps a text field edge at 3:1 on the sheet and the canvas, and fields use it', () => {
    for (const theme of themes) {
      for (const bg of ['sheet', 'canvas'] as const) {
        const ratio = contrast(token(theme, 'field-edge'), token(theme, bg));
        assert.ok(ratio >= 3, `field edge on ${bg} (${theme}) is ${ratio.toFixed(2)}:1`);
      }
    }
    assert.match(studio, /\.field \{[^}]*border:\s*1px solid var\(--cc-field-edge\)/);
  });

  it('keeps the ink ring at 3:1 on the sheet and the canvas', () => {
    for (const theme of themes) {
      for (const bg of ['sheet', 'canvas'] as const) {
        const ratio = contrast(token(theme, 'ink'), token(theme, bg));
        assert.ok(ratio >= 3, `ink ring on ${bg} (${theme}) is ${ratio.toFixed(2)}:1`);
      }
    }
  });

  it('fills the primary button with ink instead of a gradient', () => {
    const rule = /\.btn\.solid \{[^}]*\}/.exec(studio)?.[0] ?? '';
    assert.match(rule, /background:\s*var\(--cc-ink\)/);
    assert.match(rule, /color:\s*var\(--cc-on-ink\)/);
    assert.doesNotMatch(rule, /linear-gradient/);
  });
});

describe('view 1 squint', () => {
  it('has no gradient, wire glow, or inset highlight', () => {
    assert.doesNotMatch(layout, /linear-gradient\(/);
    assert.match(layout, /\.brand-mark \{[^}]*background:\s*var\(--cc-ink\)/);
    assert.doesNotMatch(stage, /radial-gradient\(circle at/);
    assert.match(stage, /\.conduit-glow \{[^}]*display:\s*none/);
    assert.doesNotMatch(components, /linear-gradient\(/);
    assert.doesNotMatch(shared, /inset\s+0\s+1px/);
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
});
