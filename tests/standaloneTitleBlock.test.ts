import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { generateStandaloneHtml } from '../src/exporter/standaloneHtml.ts';
import { createBlankDocument } from '../src/templates/presets.ts';

describe('standalone HTML title block (C6)', () => {
  it('carries the title strip, shown only while presenting, with no date that would change the file daily', () => {
    const doc = createBlankDocument();
    doc.title = 'Harbor <Desk>';
    const html = generateStandaloneHtml(doc);
    assert.match(html, /<div class="title-block" id="title-block" aria-hidden="true"><span>Harbor &lt;Desk&gt;<\/span>/);
    assert.match(html, /body\[data-presenting\] \.title-block \{ display: flex; \}/);
    assert.equal(html, generateStandaloneHtml(doc));
  });
});
