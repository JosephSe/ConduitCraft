import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { collectLevels, findMatches, idsInLevel, levelsOfDocument, replaceAll } from '../src/core/findReplace.ts';
import { addTag, removeTag, setStatus, setWireSync, setWireTone } from '../src/core/appearance.ts';
import { createNodeFromStencil, createBlankDocument } from '../src/templates/presets.ts';
import type { DiagramDocument, DiagramEdge } from '../src/types.ts';

const opts = (query: string, extra: Partial<{ matchCase: boolean; wholeWord: boolean }> = {}) => ({
  query,
  matchCase: false,
  wholeWord: false,
  ...extra,
});

function sample(): DiagramDocument {
  const doc = createBlankDocument();
  const a = createNodeFromStencil('service', 100, 100, 0);
  const b = createNodeFromStencil('service', 400, 100, 1);
  a.title = 'Orders API';
  a.subtitle = 'handles orders';
  b.title = 'Payments';
  b.comment = 'Talks to the orders API';
  const edge = { id: 'e1', from: a.id, to: b.id, label: 'orders call', tone: 'blue' } as DiagramEdge;
  doc.nodes = [a, b];
  doc.edges = [edge];
  const child = createNodeFromStencil('service', 100, 100, 5);
  child.title = 'Orders worker';
  a.child = { nodes: [child], edges: [], zones: [], notesCards: [] };
  return doc;
}

describe('find', () => {
  it('finds in titles, subtitles, comments and wire labels, ignoring case by default', () => {
    const doc = sample();
    const found = findMatches(levelsOfDocument(doc, 'level'), opts('orders'));
    assert.deepEqual(found.map((m) => m.field).sort(), ['Comment', 'Subtitle', 'Title', 'Wire label']);
  });

  it('match case narrows, whole word skips longer words', () => {
    const doc = sample();
    assert.equal(findMatches(levelsOfDocument(doc, 'level'), opts('orders', { matchCase: true })).length, 3);
    doc.nodes[1].title = 'Reorders';
    const whole = findMatches(levelsOfDocument(doc, 'level'), opts('orders', { wholeWord: true }));
    assert.ok(!whole.some((m) => m.text === 'Reorders'));
  });

  it('treats the query as plain text, not a pattern', () => {
    const doc = sample();
    doc.nodes[0].title = 'a.b (v2)';
    assert.equal(findMatches(levelsOfDocument(doc, 'level'), opts('.b (')).length, 1);
    assert.equal(findMatches(levelsOfDocument(doc, 'level'), opts('.*')).length, 0);
    assert.equal(findMatches(levelsOfDocument(doc, 'level'), opts('')).length, 0);
  });

  it('this level leaves nested levels alone; all levels reaches them', () => {
    const doc = sample();
    const here = findMatches(levelsOfDocument(doc, 'level'), opts('worker'));
    const all = findMatches(levelsOfDocument(doc, 'all'), opts('worker'));
    assert.equal(here.length, 0);
    assert.equal(all.length, 1);
    assert.deepEqual(all[0].path, [doc.nodes[0].id]);
  });

  it('the open level stands in for its stale copy in the tree', () => {
    const root = sample();
    const parentId = root.nodes[0].id;
    // The user is inside Orders API and has renamed the worker; the tree still holds the old name.
    const open = structuredClone(root.nodes[0].child!);
    open.nodes[0].title = 'Fresh name';
    const levels = collectLevels(root, { path: [parentId], content: open }, 'all');
    const titles = levels.flatMap((l) => l.content.nodes.map((n) => n.title));
    assert.ok(titles.includes('Fresh name'));
    assert.ok(!titles.includes('Orders worker'));
  });
});

describe('replace', () => {
  it('replaces every occurrence and counts them', () => {
    const doc = sample();
    const n = replaceAll(levelsOfDocument(doc, 'all'), opts('orders'), 'Checkout');
    assert.equal(n, 5);
    assert.equal(doc.nodes[0].title, 'Checkout API');
    assert.equal(doc.nodes[1].comment, 'Talks to the Checkout API');
    assert.equal(doc.edges[0].label, 'Checkout call');
    assert.equal(doc.nodes[0].child!.nodes[0].title, 'Checkout worker');
  });

  it('keeps $ in the replacement literal', () => {
    const doc = sample();
    replaceAll(levelsOfDocument(doc, 'level'), opts('Payments'), '$& $1 cost');
    assert.equal(doc.nodes[1].title, '$& $1 cost');
  });

  it('can replace just one chosen match', () => {
    const doc = sample();
    const found = findMatches(levelsOfDocument(doc, 'level'), opts('orders'));
    const one = found.find((m) => m.field === 'Wire label')!;
    assert.equal(replaceAll(levelsOfDocument(doc, 'level'), opts('orders'), 'X', [one]), 1);
    assert.equal(doc.edges[0].label, 'X call');
    assert.equal(doc.nodes[0].title, 'Orders API');
  });

  it('nothing found changes nothing', () => {
    const doc = sample();
    const before = JSON.stringify(doc);
    assert.equal(replaceAll(levelsOfDocument(doc, 'all'), opts('zzz'), 'q'), 0);
    assert.equal(JSON.stringify(doc), before);
  });

  it('select-all-matches groups ids by kind within one level', () => {
    const doc = sample();
    const found = findMatches(levelsOfDocument(doc, 'level'), opts('orders'));
    const ids = idsInLevel(found, []);
    assert.deepEqual(ids.node.sort(), [doc.nodes[0].id, doc.nodes[1].id].sort());
    assert.deepEqual(ids.edge, ['e1']);
  });
});

describe('bulk edit helpers', () => {
  it('status, tags and wires report changes only when something changed', () => {
    const doc = sample();
    assert.equal(setStatus(doc.nodes, 'live'), true);
    assert.equal(setStatus(doc.nodes, 'live'), false);
    assert.equal(setStatus(doc.nodes, undefined), true);
    assert.equal(doc.nodes[0].status, undefined);

    assert.equal(addTag(doc.nodes, 'pci'), true);
    assert.equal(addTag(doc.nodes, 'PCI'), false, 'already there, ignoring case');
    assert.equal(removeTag(doc.nodes, 'Pci'), true);
    assert.equal(doc.nodes[0].tags, undefined, 'an empty list is dropped');

    assert.equal(setWireTone(doc.edges, 'rose'), true);
    assert.equal(setWireSync(doc.edges, 'async'), true);
    assert.equal(doc.edges[0].sync, 'async');
    assert.equal(setWireSync(doc.edges, 'sync'), true);
    assert.equal(doc.edges[0].sync, undefined);
  });
});
