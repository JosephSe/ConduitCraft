import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { describe, it } from 'node:test';

// Appendix A of REDESIGN_PLAN.md: phrases that must not come back into user-visible text.
const BANNED = [
  'Eyebrow Tag',
  'Badge Chip',
  'Stream Channel',
  'STREAM WIRE',
  'Conduit Pill',
  'Data Conduits',
  'Telemetry stream controls',
  'spec card',
  'milestone',
  'Notes card title',
];

function sources(): Array<[string, string]> {
  const dir = new URL('../src/studio/', import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith('.ts'));
  return [
    ['index.html', readFileSync(new URL('../index.html', import.meta.url), 'utf8')],
    ...files.map((f): [string, string] => [`src/studio/${f}`, readFileSync(new URL(f, dir), 'utf8')]),
  ];
}

describe('plain language (Appendix A word list)', () => {
  it('keeps retired jargon out of the UI strings', () => {
    const hits: string[] = [];
    for (const [file, text] of sources()) {
      // Search keywords may keep old words so people who know them can still find things.
      const visible = text
        .split('\n')
        .filter((line) => !line.includes('keywords:'))
        .join('\n')
        .toLowerCase();
      for (const phrase of BANNED) {
        if (visible.includes(phrase.toLowerCase())) hits.push(`${file}: "${phrase}"`);
      }
    }
    assert.deepEqual(hits, []);
  });
});
