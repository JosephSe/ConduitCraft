import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { importMermaidOrBlueprint, serializeToBlueprintMarkdown } from '../src/core/parser.ts';
import { parseBlueprintJson, serializeBlueprintJson } from '../src/exporter/blueprintJson.ts';
import { renderDiagramSvg } from '../src/exporter/diagramSvg.ts';
import { bringToFront } from '../src/studio/zOrderLockGroup.ts';
import { stackOrder } from '../src/core/stack.ts';
import { textLabelRect } from '../src/core/notesSize.ts';
import type { DiagramDocument } from '../src/types.ts';

function docWithText(): DiagramDocument {
  const { doc } = importMermaidOrBlueprint('```mermaid\nflowchart LR\n  a["Alpha"]\n  b["Bravo"]\n  a --> b\n```');
  doc.notesCards = [
    { id: 'note-1', title: 'Notes', code: 'SPEC-01', x: 40, y: 400, items: [{ title: 'One', text: 'first' }] },
    {
      id: 'text-1',
      title: 'Hello there',
      code: '',
      x: 40,
      y: 600,
      items: [],
      variant: 'text',
      width: 120,
      fontSize: 28,
      color: 'rose',
    },
  ];
  return doc;
}

const textOf = (doc: DiagramDocument) => doc.notesCards.find((c) => c.id === 'text-1');
const top = (doc: DiagramDocument) => stackOrder(doc).at(-1)?.item.id;

describe('Text label style and the shared stack order', () => {
  it('keeps a text label width, font size and colour through both file formats', () => {
    const doc = docWithText();
    const fromMd = textOf(importMermaidOrBlueprint(serializeToBlueprintMarkdown(doc)).doc);
    assert.deepEqual([fromMd?.width, fromMd?.fontSize, fromMd?.color], [120, 28, 'rose']);
    const json = parseBlueprintJson(serializeBlueprintJson(doc));
    assert.ok(json.ok);
    const fromJson = json.ok ? textOf(json.doc) : undefined;
    assert.deepEqual([fromJson?.width, fromJson?.fontSize, fromJson?.color], [120, 28, 'rose']);
  });

  it('drops a colour that is not a tone and clamps the font size', () => {
    const doc = docWithText();
    const text = textOf(doc) as unknown as Record<string, unknown>;
    text.color = 'url(javascript:1)';
    text.fontSize = 900;
    const json = parseBlueprintJson(serializeBlueprintJson(doc));
    const back = json.ok ? textOf(json.doc) : undefined;
    assert.equal(back?.color, undefined);
    assert.equal(back?.fontSize, 96);
  });

  it('keeps a note brought in front of the components through both file formats', () => {
    const doc = docWithText();
    assert.equal(bringToFront(doc, { type: 'notes', id: 'note-1' }), true);
    assert.equal(top(doc), 'note-1');
    assert.equal(top(importMermaidOrBlueprint(serializeToBlueprintMarkdown(doc)).doc), 'note-1');
    const json = parseBlueprintJson(serializeBlueprintJson(doc));
    assert.equal(json.ok ? top(json.doc) : '', 'note-1');
  });

  it('draws a note brought to the front after the components in the vector export', () => {
    const doc = docWithText();
    const before = renderDiagramSvg(doc);
    assert.ok(before.indexOf('>Notes<') < before.lastIndexOf('Alpha'));
    bringToFront(doc, { type: 'notes', id: 'note-1' });
    const after = renderDiagramSvg(doc);
    assert.ok(after.indexOf('>Notes<') > after.lastIndexOf('Bravo'));
    assert.match(after, /font-size="28" font-weight="600" fill="[^"]+"><tspan/);
  });

  it('sizes a text label from its width and font size', () => {
    const base = { x: 0, y: 0, title: 'Hello there' };
    assert.ok(textLabelRect({ ...base, fontSize: 32 }).width > textLabelRect(base).width);
    const narrow = textLabelRect({ ...base, width: 60 });
    assert.equal(narrow.width, 60);
    assert.ok(narrow.height > textLabelRect(base).height);
  });
});
