import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { titleBlockFor, titleBlockSvg, TITLE_BLOCK_HEIGHT } from '../src/exporter/titleBlock.ts';
import { renderDiagramSvg } from '../src/exporter/diagramSvg.ts';
import type { DiagramDocument } from '../src/types.ts';

const doc = { title: 'Checkout', systemTag: 'PAY-1', statusLabel: 'Draft', nodes: [], edges: [], zones: [], notesCards: [], frames: [], stageWidth: 800, stageHeight: 400 } as unknown as DiagramDocument;

describe('C6 title block', () => {
  it('carries the document fields, the page and the date', () => {
    const block = titleBlockFor(doc, { index: 1, count: 3 }, new Date('2026-03-04T10:00:00Z'));
    assert.equal(block.title, 'Checkout');
    assert.equal(block.systemTag, 'PAY-1');
    assert.equal(block.statusLabel, 'Draft');
    assert.equal(block.page, '2 of 3');
    assert.equal(block.date, '2026-03-04');
    assert.equal(titleBlockFor(doc, { index: 0, count: 1 }).page, undefined);
  });

  it('draws a strip on the bottom edge and escapes text', () => {
    const svg = titleBlockSvg({ title: 'A & <B>', date: '2026-01-01' }, 600, 300, 'light');
    assert.match(svg, /A &amp; &lt;B&gt;/);
    assert.match(svg, new RegExp(`y="${300 - TITLE_BLOCK_HEIGHT}"`));
  });

  it('is in the vector export when asked for, and off otherwise', () => {
    const on = renderDiagramSvg(doc, undefined, undefined, 'light', titleBlockFor(doc));
    assert.match(on, /data-title-block="true"/);
    assert.doesNotMatch(renderDiagramSvg(doc), /data-title-block/);
  });
});
