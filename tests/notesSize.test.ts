import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  NOTES_CARD_WIDTH,
  NOTES_MAX_WIDTH,
  NOTES_MIN_WIDTH,
  clampNotesWidth,
  notesCardHeight,
  notesCardWidth,
  notesExportHeight,
  wrapNotesText,
} from '../src/core/notesSize.ts';
import { parseBlueprintJson, serializeBlueprintJson } from '../src/exporter/blueprintJson.ts';
import { importMermaidOrBlueprint, serializeToBlueprintMarkdown } from '../src/core/parser.ts';
import { renderDiagramSvg } from '../src/exporter/diagramSvg.ts';
import { createBlankDocument } from '../src/templates/presets.ts';
import type { DiagramNotesCard } from '../src/types.ts';

const LONG = 'Every request is authenticated at the edge and the token is checked again by each service before it reads data.';

function card(width?: number): DiagramNotesCard {
  return {
    id: 'n1',
    title: 'Notes',
    code: 'SPEC-01',
    x: 40,
    y: 60,
    items: [
      { title: 'Auth', text: LONG },
      { title: 'Cache', text: 'Short.' },
    ],
    ...(width === undefined ? {} : { width }),
  };
}

describe('note width and content height', () => {
  it('keeps the original width until the card is resized, and clamps a resize to the allowed range', () => {
    assert.equal(notesCardWidth(card()), NOTES_CARD_WIDTH);
    assert.equal(notesCardWidth(card(300)), 300);
    assert.equal(clampNotesWidth(40), NOTES_MIN_WIDTH);
    assert.equal(clampNotesWidth(5000), NOTES_MAX_WIDTH);
    assert.equal(clampNotesWidth('512.4'), 512);
    assert.equal(clampNotesWidth('wide'), undefined);
    assert.equal(clampNotesWidth(undefined), undefined);
  });

  it('wraps at spaces and splits only a word too long for a line', () => {
    assert.deepEqual(wrapNotesText('one two three four', 9), ['one two', 'three', 'four']);
    assert.deepEqual(wrapNotesText('abcdefghijklmnop', 8), ['abcdefgh', 'ijklmnop']);
    assert.deepEqual(wrapNotesText('', 20), ['']);
  });

  it('grows taller as the card gets narrower and shorter as it gets wider', () => {
    const narrow = card(NOTES_MIN_WIDTH);
    const normal = card();
    const wide = card(NOTES_MAX_WIDTH);
    assert.ok(notesCardHeight(narrow) > notesCardHeight(normal));
    assert.ok(notesCardHeight(normal) > notesCardHeight(wide));
    assert.ok(notesExportHeight(narrow) > notesExportHeight(normal));
    assert.ok(notesExportHeight(normal) > notesExportHeight(wide));
    // Fewer items, shorter card.
    assert.ok(notesExportHeight({ ...normal, items: normal.items.slice(1) }) < notesExportHeight(normal));
  });

  it('keeps the width through the Blueprint file and the JSON file', () => {
    const doc = createBlankDocument();
    doc.notesCards = [card(560)];
    const json = parseBlueprintJson(serializeBlueprintJson(doc));
    assert.ok(json.ok);
    assert.equal(json.ok && json.doc.notesCards[0].width, 560);
    const md = importMermaidOrBlueprint(serializeToBlueprintMarkdown(doc));
    assert.equal(md.doc?.notesCards[0].width, 560);

    doc.notesCards = [card()];
    const plain = parseBlueprintJson(serializeBlueprintJson(doc));
    assert.ok(plain.ok && !('width' in plain.doc.notesCards[0]));
  });

  it('drops a width that is not a number and clamps one out of range when a file is opened', () => {
    const doc = createBlankDocument();
    doc.notesCards = [card()];
    const raw = JSON.parse(serializeBlueprintJson(doc));
    raw.document.notesCards[0].width = 'huge';
    const odd = parseBlueprintJson(JSON.stringify(raw));
    assert.ok(odd.ok && odd.doc.notesCards[0].width === undefined);
    raw.document.notesCards[0].width = 10;
    const tiny = parseBlueprintJson(JSON.stringify(raw));
    assert.ok(tiny.ok && tiny.doc.notesCards[0].width === NOTES_MIN_WIDTH);
  });

  it('draws the card at its width in the vector export and wraps its items', () => {
    const doc = createBlankDocument();
    doc.notesCards = [card(300)];
    const svg = renderDiagramSvg(doc);
    // The folded corner sits at the card's right edge: x + width.
    assert.match(svg, /M322 60V78H340/);
    // The long item wraps onto several lines.
    const lines = svg.match(/<tspan x="58"/g) ?? [];
    assert.ok(lines.length >= 4, `expected wrapped lines, got ${lines.length}`);
  });
});
