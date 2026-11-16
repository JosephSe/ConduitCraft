import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const shared = readFileSync(resolve('src/styles/shared.css'), 'utf8');

describe('D15 translucency is optional', () => {
  it('makes islands solid and removes blur under reduced transparency', () => {
    const block = /@media \(prefers-reduced-transparency: reduce\) \{[\s\S]*?\n\}/.exec(shared)?.[0] ?? '';
    assert.match(block, /--cc-island:\s*var\(--cc-sheet\)/);
    assert.match(block, /backdrop-filter:\s*none/);
  });

  it('does the same where backdrop-filter is unsupported', () => {
    const block = /@supports not \(\(backdrop-filter[\s\S]*?\n\}/.exec(shared)?.[0] ?? '';
    assert.match(block, /--cc-island:\s*var\(--cc-sheet\)/);
  });
});
