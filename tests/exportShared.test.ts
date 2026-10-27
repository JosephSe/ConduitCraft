import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { generateStandaloneHtml } from '../src/exporter/standaloneHtml.ts';
import { TONE_CSS, TONE_META } from '../src/shared/tones.ts';
import { createBlankDocument } from '../src/templates/presets.ts';

describe('shared export stylesheet and tone metadata', () => {
  it('inlines shared rules once and keeps the viewer layout', () => {
    const html = generateStandaloneHtml(createBlankDocument());
    assert.equal(html.split('--wl-blue-light: #1d4ed8').length - 1, 1);
    assert.equal(html.split('box-sizing: border-box').length - 1, 1);
    assert.match(html, /--wl-panel-light: rgba\(255, 255, 255, 0\.88\)/);
    assert.equal(html.includes('rgba(255, 255, 255, 0.9)'), false);
    assert.match(html, /grid-template-columns: minmax\(0, 1fr\) 24rem/);
    assert.equal(html.includes('16.5rem minmax(0, 1fr) 22.5rem'), false);
    assert.match(html, /--stage-w: 1680px; --stage-h: 920px/);
    assert.match(html, /width: var\(--stage-w\); height: var\(--stage-h\)/);
    assert.match(html, /id="arrow-blue"/);
    assert.match(html, /fill="var\(--wl-blue\)"/);
    assert.match(html, /window\.conduitBindColorScheme/);
    assert.match(html, /"blue":\["var\(--wl-blue\)","var\(--wl-blue-soft\)"\]/);
    assert.equal(html.includes('${'), false);
  });

  it('uses one tone table and one color-scheme boot script', () => {
    assert.deepEqual(TONE_CSS.emerald, [TONE_META.emerald.cssVar, TONE_META.emerald.softVar]);
    const boot = readFileSync(new URL('../src/shared/colorSchemeBoot.js', import.meta.url), 'utf8');
    const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    assert.match(index, /\/\*__COLOR_SCHEME_BOOT__\*\//);
    assert.match(boot, /blueprint-studio-color-scheme/);
    assert.match(boot, /window\.conduitBindColorScheme/);
  });
});
