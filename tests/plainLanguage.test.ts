import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { STENCIL_CATALOG } from '../src/templates/presets.ts';

function cssFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...cssFiles(path));
    else if (name.endsWith('.css')) out.push(path);
  }
  return out;
}

describe('plain language and the type scale', () => {
  it('forces no label into uppercase', () => {
    for (const file of cssFiles(resolve('src/styles'))) {
      const text = readFileSync(file, 'utf8');
      assert.equal(text.includes('text-transform: uppercase'), false, file);
    }
  });

  it('types no label in capitals (HTML text and assigned display text)', () => {
    const ACRONYMS = new Set(['PNG', 'SVG', 'JSON', 'YAML', 'HTML', 'GIF', 'URL', 'PDF', 'CSV', 'API', 'DLQ', 'FIFO', 'LIFO', 'HTTP', 'HTTPS', 'ELK']);
    const caps = /^[A-Z][A-Z0-9 &/+.-]{3,}$/;
    const bad: string[] = [];
    const html = readFileSync(resolve('index.html'), 'utf8');
    for (const m of html.matchAll(/>([A-Z][A-Z0-9 &/+.-]{3,})</g)) {
      if (!ACRONYMS.has(m[1])) bad.push(`index.html: ${m[1]}`);
    }
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((n) => {
        const p2 = join(dir, n);
        return statSync(p2).isDirectory() ? walk(p2) : p2.endsWith('.ts') ? [p2] : [];
      });
    for (const file of walk(resolve('src/studio'))) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(/(?:textContent|label|title|placeholder)\s*(?:=|:)\s*'([A-Z][A-Z0-9 &/+.-]{3,})'/g)) {
        if (caps.test(m[1]) && !ACRONYMS.has(m[1])) bad.push(`${file}: ${m[1]}`);
      }
    }
    assert.deepEqual(bad, []);
  });

  it('defines the 5.2 scale and keeps chrome at full width', () => {
    const shared = readFileSync(resolve('src/styles/shared.css'), 'utf8');
    const scale: Record<string, string> = {
      meta: '400 11px/14px',
      small: '400 12px/16px',
      body: '400 13px/20px',
      control: '500 13px/20px',
      title: '600 15px/19px',
      panel: '600 16px/20px',
      display: '600 24px/30px',
    };
    for (const [name, value] of Object.entries(scale)) {
      assert.match(shared, new RegExp(`--cc-font-${name}: ${value} var\\(--cc-font-sans\\);`));
    }
    assert.match(shared, /font: var\(--cc-font-body\);\s*font-stretch: 100%;/);
  });

  it('draws the sheet at 88% and sets tabular figures on changing numbers', () => {
    const stage = readFileSync(resolve('src/styles/studio/stage.css'), 'utf8');
    assert.match(stage, /\.stage-world \{[^}]*font-stretch: 88%;/);
    assert.match(stage, /\.node-title \{[^}]*font: var\(--cc-font-title\);[^}]*font-stretch: 88%;/);
    assert.match(stage, /\.node-eyebrow \{[^}]*font: var\(--cc-font-meta\);/);
    assert.doesNotMatch(stage, /\.node-eyebrow \{[^}]*--cc-font-mono/);
    assert.match(stage, /\.zoom-readout \{[^}]*font-variant-numeric: tabular-nums;/);
    assert.match(stage, /\.zoom-readout \{[^}]*--cc-font-sans/);
    const run = readFileSync(resolve('src/styles/studio/unlayered.css'), 'utf8');
    assert.match(run, /\.run-bar-step \{[^}]*font-variant-numeric: tabular-nums;/);
  });

  it('ships stencil labels in sentence case', () => {
    for (const stencil of STENCIL_CATALOG) {
      assert.notEqual(stencil.eyebrow, stencil.eyebrow.toUpperCase(), stencil.id);
      assert.equal(stencil.eyebrow[0], stencil.eyebrow[0].toUpperCase(), stencil.id);
    }
  });
});
