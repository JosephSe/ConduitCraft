import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { indexBlocks, nodeKeys, rangeOfSelection, selectionAtLine } from '../src/core/codeLines.ts';
import { blueprintNodeKey, serializeToBlueprintMarkdown } from '../src/core/parser.ts';
import { createFrame, adoptByGeometry } from '../src/core/frameOps.ts';
import { createBlankDocument, createNodeFromStencil } from '../src/templates/presets.ts';
import type { DiagramDocument } from '../src/types.ts';

function sample(): DiagramDocument {
  const doc = createBlankDocument();
  const make = (id: string, x: number) => {
    const n = createNodeFromStencil('service', x, 200, 0);
    n.id = id;
    n.title = id;
    return n;
  };
  doc.nodes = [make('api', 160), make('web.app', 480), make('web app', 800)];
  doc.edges = [
    { id: 'e1', from: 'api', to: 'web.app', sourcePort: 'auto', targetPort: 'auto', tone: 'blue', route: 'auto', label: 'calls', animated: true },
    { id: 'e2', from: 'web.app', to: 'web app', sourcePort: 'auto', targetPort: 'auto', tone: 'blue', route: 'auto', label: 'next', animated: true },
  ];
  doc.zones = [{ id: 'z1', number: '01', title: 'Edge', subtitle: '', x: 100, width: 500 }];
  doc.notesCards = [{ id: 'n1', title: 'Read me', code: 'S1', x: 100, y: 500, items: [{ title: 'a', text: 'b' }] }];
  doc.frames = [createFrame('f1', { x: 120, y: 120, width: 400, height: 240 }, 'blue', 'VPC')];
  adoptByGeometry(doc);
  return doc;
}

const lineOf = (text: string, needle: string) => text.split('\n').findIndex((l) => l.includes(needle)) + 1;

describe('code pane line index (D2b)', () => {
  const doc = sample();
  const text = serializeToBlueprintMarkdown(doc);
  const index = indexBlocks(text);

  it('finds every component, wire, swimlane, note and frame the writer produced', () => {
    assert.equal(index.nodes.size, 3);
    assert.deepEqual([...index.edges.keys()], ['e1', 'e2']);
    assert.deepEqual([...index.zones.keys()], ['z1']);
    assert.deepEqual([...index.notes.keys()], ['n1']);
    assert.deepEqual([...index.frames.keys()], ['f1']);
  });

  it('each range starts at its own entry and ends before the next one', () => {
    const keys = nodeKeys(doc.nodes.map((n) => n.id), blueprintNodeKey);
    const ranges = doc.nodes.map((n) => index.nodes.get(keys.get(n.id)!)!);
    for (const r of ranges) assert.ok(r && r.end >= r.start);
    assert.ok(ranges[0].end < ranges[1].start && ranges[1].end < ranges[2].start, 'ranges do not overlap');
    assert.match(text.split('\n')[ranges[0].start - 1], /^ {2}api:/);
    const lines = text.split('\n');
    assert.ok(lines.slice(ranges[0].start - 1, ranges[0].end).some((l) => l.includes('title: api')), 'the block holds its own fields');
    assert.ok(!lines.slice(ranges[0].start - 1, ranges[0].end).some((l) => l.includes('title: web')), 'and none of the next one');
  });

  it('keys follow the writer: sanitised and made unique', () => {
    const keys = nodeKeys(['web.app', 'web app', 'web_app', 'web_app'], blueprintNodeKey);
    assert.equal(keys.get('web app'), 'web_app');
    // Both generated keys exist in the file the writer made for these ids.
    const clash = createBlankDocument();
    clash.nodes = ['web app', 'web_app'].map((id) => {
      const n = createNodeFromStencil('service', 200, 200, 0);
      n.id = id;
      n.title = id;
      return n;
    });
    const written = indexBlocks(serializeToBlueprintMarkdown(clash));
    const byId = nodeKeys(clash.nodes.map((n) => n.id), blueprintNodeKey);
    for (const n of clash.nodes) assert.ok(written.nodes.has(byId.get(n.id)!), `${n.id} found as ${byId.get(n.id)}`);
  });

  it('turns a selection into lines, and a line into a selection', () => {
    const keys = nodeKeys(doc.nodes.map((n) => n.id), blueprintNodeKey);
    const keyOf = (id: string) => keys.get(id);
    const idOf = (key: string) => [...keys].find(([, k]) => k === key)?.[0];
    const web = rangeOfSelection(index, { type: 'node', id: 'web.app' }, keyOf)!;
    assert.ok(web);
    const middle = Math.floor((web.start + web.end) / 2);
    assert.deepEqual(selectionAtLine(index, middle, idOf), { type: 'node', id: 'web.app' });
    const wire = rangeOfSelection(index, { type: 'edge', id: 'e2' }, keyOf)!;
    assert.deepEqual(selectionAtLine(index, wire.start, idOf), { type: 'edge', id: 'e2' });
    assert.deepEqual(selectionAtLine(index, lineOf(text, '- id: z1'), idOf), { type: 'zone', id: 'z1' });
    assert.deepEqual(selectionAtLine(index, lineOf(text, '- id: n1'), idOf), { type: 'notes', id: 'n1' });
    assert.deepEqual(selectionAtLine(index, lineOf(text, '- id: f1'), idOf), { type: 'frame', id: 'f1' });
    assert.equal(selectionAtLine(index, 1, idOf), null, 'the opening --- is nothing');
    assert.equal(rangeOfSelection(index, { type: 'none' }, keyOf), null);
    assert.equal(rangeOfSelection(index, { type: 'node', id: 'ghost' }, keyOf), null);
  });

  it('reads only the top level: a page or a nested level does not add blocks', () => {
    const paged = sample();
    paged.pages = [{ id: 'p2', title: 'Two', nodes: [(() => { const n = createNodeFromStencil('service', 200, 200, 0); n.id = 'other'; n.title = 'other'; return n; })()], edges: [], zones: [], notesCards: [] }];
    paged.nodes[0].child = { nodes: [(() => { const n = createNodeFromStencil('service', 200, 200, 0); n.id = 'inner'; n.title = 'inner'; return n; })()], edges: [], zones: [], notesCards: [] };
    const found = indexBlocks(serializeToBlueprintMarkdown(paged));
    assert.equal(found.nodes.size, 3);
    assert.ok(!found.nodes.has('other') && !found.nodes.has('inner'));
  });

  it('copes with text that is not a file', () => {
    assert.equal(indexBlocks('').nodes.size, 0);
    assert.equal(indexBlocks('flowchart LR\n a --> b').nodes.size, 0);
    assert.equal(indexBlocks('---\nnodes:\n  a:\n    title: A\n---\n').nodes.get('a')?.start, 3);
  });
});
