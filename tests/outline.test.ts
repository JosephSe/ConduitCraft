import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { buildOutline, flattenOutline, zoneKeys, type OutlineItem } from '../src/core/outline.ts';
import { importMermaidOrBlueprint } from '../src/core/parser.ts';
import { parseBlueprintJson } from '../src/exporter/blueprintJson.ts';
import type { DiagramDocument } from '../src/types.ts';

const examplesDir = new URL('../src/examples/', import.meta.url);

function loadExample(name: string): DiagramDocument {
  const text = readFileSync(new URL(name, examplesDir), 'utf8');
  if (name.endsWith('.json')) {
    const parsed = parseBlueprintJson(text);
    assert.ok(parsed.ok, `${name} parses`);
    return parsed.doc;
  }
  return importMermaidOrBlueprint(text).doc;
}

const walk = (items: readonly OutlineItem[]): OutlineItem[] => items.flatMap((i) => [i, ...walk(i.children)]);

describe('text outline', () => {
  it('imports with no DOM globals', () => {
    assert.equal(typeof (globalThis as { document?: unknown }).document, 'undefined');
    assert.ok(buildOutline(loadExample('three-tier-web.blueprint.json')).length > 0);
  });

  for (const name of readdirSync(examplesDir).sort()) {
    it(`lists every component and wire of ${name} once, with no ids in the labels`, () => {
      const doc = loadExample(name);
      const all = walk(buildOutline(doc));
      assert.equal(all.filter((i) => i.kind === 'component').length, doc.nodes.length);
      const wires = doc.edges.filter((e) => doc.nodes.some((n) => n.id === e.from) && doc.nodes.some((n) => n.id === e.to));
      assert.equal(all.filter((i) => i.kind === 'wire').length, wires.length);
      assert.equal(new Set(all.map((i) => i.key)).size, all.length, 'keys are unique');
      // Kinds are shown on purpose ("Web App, client"), so an id that is also a kind word is not a leak.
      const prose = [doc.title, ...doc.nodes.map((n) => n.kind), ...doc.nodes.flatMap((n) => [n.title, n.subtitle]), ...doc.edges.map((e) => e.label)].join(' ');
      for (const node of doc.nodes) {
        if (!node.id || prose.includes(node.id)) continue;
        for (const item of all) assert.ok(!item.label.includes(node.id), `${item.label} shows an id`);
      }
    });
  }

  it('nests a child level under its component and opens it by path', () => {
    const doc = loadExample('three-tier-web.blueprint.json');
    const parent = doc.nodes[0];
    parent.child = { nodes: [{ ...doc.nodes[1], id: 'inner-1', title: 'Inner' }], edges: [], zones: [], notesCards: [] };
    const outline = buildOutline(doc);
    const level = walk(outline).find((i) => i.kind === 'level');
    assert.ok(level);
    assert.deepEqual(level.path, [parent.id]);
    assert.equal(level.label, 'Opens into 1 component');
    const inner = walk(level.children).find((i) => i.kind === 'component');
    assert.equal(inner?.targetId, 'inner-1');
    assert.deepEqual(inner?.path, [parent.id]);
    // Starting from the open level lists only that level.
    const here = walk(buildOutline(doc, [parent.id])).filter((i) => i.kind === 'component');
    assert.deepEqual(here.map((i) => i.targetId), ['inner-1']);
  });

  it('shows children only while a row is expanded', () => {
    const items = buildOutline(loadExample('three-tier-web.blueprint.json'));
    const closed = flattenOutline(items, new Set());
    assert.equal(closed.length, items.length);
    const open = flattenOutline(items, new Set(zoneKeys(items)));
    assert.ok(open.length > closed.length);
    assert.ok(open.every((r) => r.depth === 1 || r.parentKey !== null));
    assert.deepEqual(open.filter((r) => r.depth === 1).map((r) => r.posInSet), items.map((_, i) => i + 1));
  });
});
