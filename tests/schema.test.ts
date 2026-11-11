import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CURRENT_SCHEMA_VERSION, MIGRATIONS, migrate, readSchemaVersion } from '../src/core/schema.ts';
import { parseBlueprintJson, serializeBlueprintJson } from '../src/exporter/blueprintJson.ts';
import { importMermaidOrBlueprint, serializeToBlueprintMarkdown } from '../src/core/parser.ts';
import { renderDiagramSvg } from '../src/exporter/diagramSvg.ts';
import { createBlankDocument } from '../src/templates/presets.ts';

describe('schema versioning (T-03)', () => {
  it('treats a missing or odd version as 1', () => {
    for (const declared of [undefined, null, 0, -2, 1.5, '2', NaN]) assert.equal(readSchemaVersion(declared), 1);
    assert.equal(readSchemaVersion(2), 2);
  });

  it('has a migration step for every version below the current one', () => {
    for (let v = 1; v < CURRENT_SCHEMA_VERSION; v++) assert.equal(typeof MIGRATIONS[v], 'function', `step ${v}`);
  });

  it('runs the chain in order and reports where the file started', () => {
    const calls: number[] = [];
    const steps = { ...MIGRATIONS };
    for (let v = 1; v < CURRENT_SCHEMA_VERSION; v++) {
      MIGRATIONS[v] = (doc) => {
        calls.push(v);
        return steps[v](doc);
      };
    }
    try {
      const result = migrate({ nodes: [] }, 1);
      assert.ok(result.ok && result.from === 1);
      assert.deepEqual(calls, Array.from({ length: CURRENT_SCHEMA_VERSION - 1 }, (_, i) => i + 1));
    } finally {
      Object.assign(MIGRATIONS, steps);
    }
  });

  it('refuses a file from a newer version instead of silently dropping fields', () => {
    const result = migrate({ nodes: [] }, CURRENT_SCHEMA_VERSION + 1);
    assert.equal(result.ok, false);
    const parsed = parseBlueprintJson(
      JSON.stringify({ kind: 'conduitcraft.blueprint', version: CURRENT_SCHEMA_VERSION + 1, document: { nodes: [] } }),
    );
    assert.equal(parsed.ok, false);
    assert.match(!parsed.ok ? parsed.error : '', /newer version/);
  });

  it('stamps the current version on save and round-trips the document', () => {
    const doc = createBlankDocument();
    doc.title = 'Round trip';
    const text = serializeBlueprintJson(doc);
    assert.equal(JSON.parse(text).version, CURRENT_SCHEMA_VERSION);
    const back = parseBlueprintJson(text);
    assert.ok(back.ok);
    assert.equal(back.ok && back.doc.title, 'Round trip');
  });

  it('keeps the diagram style through JSON and the Blueprint file, and drops an unknown one (Y1)', () => {
    const doc = createBlankDocument();
    doc.style = 'blueprint';
    const json = parseBlueprintJson(serializeBlueprintJson(doc));
    assert.ok(json.ok && json.doc.style === 'blueprint');
    const md = importMermaidOrBlueprint(serializeToBlueprintMarkdown(doc));
    assert.equal(md.doc?.style, 'blueprint');
    const odd = parseBlueprintJson(JSON.stringify({ kind: 'conduitcraft.blueprint', version: 13, document: { ...doc, style: 'neon' } }));
    assert.ok(odd.ok && odd.doc.style === undefined);
    const studio = createBlankDocument();
    assert.equal('style' in JSON.parse(serializeBlueprintJson(studio)).document, false);
  });

  it('draws each style differently in the vector export (Y1)', () => {
    const doc = createBlankDocument();
    const studio = renderDiagramSvg(doc);
    doc.style = 'blueprint';
    const blueprint = renderDiagramSvg(doc);
    doc.style = 'print';
    const print = renderDiagramSvg(doc);
    assert.notEqual(studio, blueprint);
    assert.notEqual(blueprint, print);
    assert.match(blueprint, /#0b3a6b/);
  });

  it('Sketch round-trips and wobbles every stroke through one fixed-seed filter (Y2)', () => {
    const doc = createBlankDocument();
    doc.style = 'sketch';
    const back = parseBlueprintJson(serializeBlueprintJson(doc));
    assert.ok(back.ok && back.doc.style === 'sketch');
    assert.equal(importMermaidOrBlueprint(serializeToBlueprintMarkdown(doc)).doc?.style, 'sketch');
    const svg = renderDiagramSvg(doc);
    assert.match(svg, /<filter id="cc-rough"[^>]*>.*seed="7"/);
    assert.match(svg, /filter="url\(#cc-rough\)"/);
    assert.equal(svg, renderDiagramSvg(doc));
    doc.style = undefined;
    assert.doesNotMatch(renderDiagramSvg(doc), /cc-rough/);
  });

  it('opens a version-11 file unchanged and stamps 12 (queues, K1)', () => {
    assert.equal(CURRENT_SCHEMA_VERSION >= 12, true);
    const doc = createBlankDocument();
    doc.title = 'Old file';
    const v11 = JSON.stringify({ kind: 'conduitcraft.blueprint', version: 11, document: doc });
    const parsed = parseBlueprintJson(v11);
    assert.ok(parsed.ok);
    assert.equal(parsed.ok && parsed.doc.title, 'Old file');
    assert.equal(JSON.parse(serializeBlueprintJson(parsed.ok ? parsed.doc : doc)).version, CURRENT_SCHEMA_VERSION);
  });

  it('opens files saved before versioning: version 1 in an envelope, or a bare document', () => {
    const doc = createBlankDocument();
    const v1 = JSON.stringify({ kind: 'conduitcraft.blueprint', version: 1, document: doc });
    const bare = JSON.stringify(doc);
    assert.ok(parseBlueprintJson(v1).ok);
    assert.ok(parseBlueprintJson(bare).ok);
  });
});
