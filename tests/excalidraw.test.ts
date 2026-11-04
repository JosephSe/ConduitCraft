import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { convertExcalidraw } from '../src/importers/excalidraw.ts';
import { looksLikeExcalidraw } from '../src/importers/sniff.ts';
import { parseBlueprintJson, serializeBlueprintJson } from '../src/exporter/blueprintJson.ts';

const scene = readFileSync(new URL('./fixtures/excalidraw/scene.excalidraw', import.meta.url), 'utf8');
const codes = (issues: Array<{ code: string }>) => issues.map((i) => i.code);

describe('Excalidraw import', () => {
  it('maps shapes, bound text, arrows, frames and free text', () => {
    const { doc, issues } = convertExcalidraw(scene, 'Orders');
    assert.equal(doc.title, 'Orders');
    assert.equal(doc.nodes.length, 4, 'the deleted rectangle is left out');
    assert.equal(doc.edges.length, 2);
    assert.equal(doc.notesCards.length, 1);
    assert.equal(doc.zones.length, 1);

    const byTitle = (t: string) => doc.nodes.find((n) => n.title === t);
    assert.equal(byTitle('Users')?.shape, 'circle');
    assert.equal(byTitle('Users')?.accent, 'blue');
    assert.equal(byTitle('Valid?')?.kind, 'gate');
    assert.equal(byTitle('Valid?')?.shape, 'diamond');
    const api = byTitle('API');
    assert.equal(api?.subtitle, 'Gateway');
    assert.equal(api?.shape, 'rounded');
    assert.equal(byTitle('Orders DB')?.accent, 'emerald');

    const https = doc.edges.find((e) => e.label === 'HTTPS');
    assert.ok(https, 'text bound to an arrow is its label');
    assert.equal(doc.nodes.find((n) => n.id === https.from)?.title, 'Users');
    assert.equal(doc.nodes.find((n) => n.id === https.to)?.title, 'API');
    const dashed = doc.edges.find((e) => e.sync === 'async');
    assert.ok(dashed);
    assert.equal(dashed.flow, 'both');

    assert.equal(doc.notesCards[0].title, 'RETRIES: 3');
    assert.equal(doc.zones[0].title, 'BACKEND');
    const members = [byTitle('API')!, byTitle('Orders DB')!];
    for (const m of members) assert.ok(m.x >= doc.zones[0].x && m.x + m.width <= doc.zones[0].x + doc.zones[0].width);

    assert.deepEqual(
      codes(issues).filter((c) => c.startsWith('excalidraw-')).sort(),
      ['excalidraw-arrow-unattached', 'excalidraw-frames', 'excalidraw-freedraw', 'excalidraw-line'],
    );
  });

  it('survives the Blueprint file round trip', () => {
    const { doc } = convertExcalidraw(scene, 'Orders');
    const parsed = parseBlueprintJson(serializeBlueprintJson(doc));
    assert.ok(parsed.ok);
    if (!parsed.ok) return;
    assert.equal(parsed.doc.nodes.length, doc.nodes.length);
    assert.equal(parsed.doc.edges.length, doc.edges.length);
    assert.equal(parsed.doc.zones.length, doc.zones.length);
  });

  it('puts a reversed arrow the right way round', () => {
    const text = JSON.stringify({
      type: 'excalidraw',
      elements: [
        { id: 'a', type: 'rectangle', x: 0, y: 0, width: 100, height: 50 },
        { id: 'b', type: 'rectangle', x: 300, y: 0, width: 100, height: 50 },
        { id: 'ar', type: 'arrow', x: 100, y: 25, width: 200, height: 0, startBinding: { elementId: 'a' }, endBinding: { elementId: 'b' }, startArrowhead: 'arrow', endArrowhead: null },
      ],
    });
    const { doc } = convertExcalidraw(text, 'Rev');
    assert.equal(doc.edges.length, 1);
    assert.equal(doc.edges[0].from, doc.nodes[1].id);
    assert.equal(doc.edges[0].to, doc.nodes[0].id);
  });

  it('refuses text that is not an Excalidraw scene', () => {
    assert.throws(() => convertExcalidraw('not json', 'x'), /not valid JSON/);
    assert.throws(() => convertExcalidraw('{"nodes":[]}', 'x'), /not an Excalidraw scene/);
    assert.throws(() => convertExcalidraw('[]', 'x'), /not an Excalidraw scene/);
  });

  it('ignores malformed elements instead of failing', () => {
    const { doc } = convertExcalidraw(
      JSON.stringify({ type: 'excalidraw', elements: [null, 3, { id: 1 }, { id: 'ok', type: 'rectangle', x: 0, y: 0, width: 80, height: 40 }] }),
      'Odd',
    );
    assert.equal(doc.nodes.length, 1);
  });

  it('recognises scenes by extension or marker', () => {
    assert.equal(looksLikeExcalidraw('a.excalidraw', ''), true);
    assert.equal(looksLikeExcalidraw('a.json', '{"type": "excalidraw", "version": 2}'), true);
    assert.equal(looksLikeExcalidraw('a.json', '{"title":"Blueprint","nodes":[]}'), false);
  });
});
