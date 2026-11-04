import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseBlueprintJson, serializeBlueprintJson } from '../src/exporter/blueprintJson.ts';
import { importMermaidOrBlueprint, serializeToBlueprintMarkdown } from '../src/core/parser.ts';
import { createShareUrl, decodeSharedDiagramFromHash } from '../src/studio/shareLink.ts';
import { createBlankDocument, createNotesCard, createTextCard } from '../src/templates/presets.ts';
import { CURRENT_SCHEMA_VERSION } from '../src/core/schema.ts';
import { renderDiagramSvg } from '../src/exporter/diagramSvg.ts';
import type { DiagramDocument } from '../src/types.ts';

function docWithText(): DiagramDocument {
  const doc = createBlankDocument();
  const label = createTextCard(300, 200);
  label.title = 'Public internet';
  doc.notesCards = [label, createNotesCard(600, 400)];
  return doc;
}

const shape = (d: DiagramDocument) =>
  d.notesCards.map((c) => `${c.variant ?? 'card'}:${c.title}:${c.x},${c.y}:${c.items.length}`);

describe('text label (schema v9)', () => {
  it('is schema version 9 or later', () => {
    assert.ok(CURRENT_SCHEMA_VERSION >= 9);
  });

  it('makes a text note with no items, snapped inside the stage', () => {
    const t = createTextCard(3, 5);
    assert.equal(t.variant, 'text');
    assert.deepEqual(t.items, []);
    assert.equal(t.code, '');
    assert.ok(t.x >= 24 && t.y >= 24);
  });

  it('survives Blueprint JSON', () => {
    const doc = docWithText();
    const back = parseBlueprintJson(serializeBlueprintJson(doc));
    assert.ok(back.ok);
    if (back.ok) assert.deepEqual(shape(back.doc), shape(doc));
  });

  it('survives the Blueprint file', () => {
    const doc = docWithText();
    const back = importMermaidOrBlueprint(serializeToBlueprintMarkdown(doc)).doc;
    assert.deepEqual(shape(back), shape(doc));
    assert.equal(back.notesCards[0].variant, 'text');
    assert.equal(back.notesCards[1].variant, undefined);
  });

  it('survives the share link', async () => {
    const doc = docWithText();
    const { hash } = await createShareUrl(doc, { baseUrl: 'https://example.com/app' });
    const back = await decodeSharedDiagramFromHash(hash);
    assert.ok(back);
    assert.deepEqual(shape(back), shape(doc));
  });

  it('is drawn as plain text in the SVG export, without a card', () => {
    const svg = renderDiagramSvg(docWithText());
    assert.match(svg, />Public internet</);
  });

  it('a document saved before the field existed opens unchanged', () => {
    const doc = createBlankDocument();
    doc.notesCards = [createNotesCard(100, 100)];
    const back = parseBlueprintJson(serializeBlueprintJson(doc));
    assert.ok(back.ok);
    if (back.ok) assert.equal(back.doc.notesCards[0].variant, undefined);
  });
});
