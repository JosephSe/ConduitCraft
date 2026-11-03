import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  allLevelNodes,
  boundaryPorts,
  breadcrumb,
  emptyLevel,
  resolveLevelPath,
  viewOfLevel,
  writeLevelBack,
} from '../src/core/levels.ts';
import { parseBlueprintJson, serializeBlueprintJson } from '../src/exporter/blueprintJson.ts';
import { createBlankDocument, createNodeFromStencil } from '../src/templates/presets.ts';
import type { DiagramDocument, DiagramEdge } from '../src/types.ts';

const wire = (id: string, from: string, to: string, label = ''): DiagramEdge => ({
  id,
  from,
  to,
  sourcePort: 'right',
  targetPort: 'left',
  tone: 'blue',
  route: 'straight',
  label,
  animated: false,
});

function tree(): DiagramDocument {
  const doc = createBlankDocument();
  doc.title = 'Shop';
  const mk = (id: string, title: string) => ({ ...createNodeFromStencil('service', 0, 0, 0), id, title });
  const web = mk('web', 'Web');
  const pay = mk('pay', 'Payments');
  const checkout = mk('checkout', 'Checkout API');
  const ledger = mk('ledger', 'Ledger');
  checkout.child = emptyLevel();
  checkout.child.nodes = [mk('validate', 'Validate')];
  pay.child = { ...emptyLevel(), nodes: [checkout, ledger], edges: [wire('i1', 'checkout', 'ledger')] };
  doc.nodes = [web, pay];
  doc.edges = [wire('w1', 'web', 'pay', 'POST /pay'), wire('w2', 'pay', 'web', 'receipt')];
  return doc;
}

describe('nested levels', () => {
  it('resolves only the part of a path that exists', () => {
    const doc = tree();
    assert.deepEqual(resolveLevelPath(doc, ['pay', 'checkout']), ['pay', 'checkout']);
    assert.deepEqual(resolveLevelPath(doc, ['pay', 'gone', 'x']), ['pay']);
    assert.deepEqual(resolveLevelPath(doc, ['web']), []);
  });

  it('builds a level as a document that keeps the shared fields', () => {
    const doc = tree();
    const view = viewOfLevel(doc, ['pay']);
    assert.equal(view.title, 'Shop');
    assert.deepEqual(view.nodes.map((n) => n.id), ['checkout', 'ledger']);
    assert.equal(view.nodes[0].child?.nodes[0].id, 'validate');
  });

  it('writes edits to a level back without touching the others, and carries shell edits', () => {
    const doc = tree();
    const view = viewOfLevel(doc, ['pay']);
    view.nodes = view.nodes.filter((n) => n.id !== 'ledger');
    view.edges = [];
    view.title = 'Shop v2';
    writeLevelBack(doc, ['pay'], view);
    assert.deepEqual(doc.nodes.find((n) => n.id === 'pay')?.child?.nodes.map((n) => n.id), ['checkout']);
    assert.equal(doc.title, 'Shop v2');
    assert.deepEqual(doc.nodes.map((n) => n.id), ['web', 'pay']);
    assert.equal(doc.edges.length, 2);
  });

  it('names the trail for the breadcrumb', () => {
    const doc = tree();
    assert.deepEqual(breadcrumb(doc, ['pay', 'checkout']).map((c) => c.title), ['Shop', 'Payments', 'Checkout API']);
    assert.deepEqual(breadcrumb(doc, ['pay', 'checkout'])[2].path, ['pay', 'checkout']);
  });

  it('shows wires that cross the boundary as ports named after the outside component', () => {
    const doc = tree();
    const ports = boundaryPorts(doc, ['pay']);
    assert.deepEqual(
      ports.map((p) => [p.direction, p.outsideTitle, p.label]),
      [['in', 'Web', 'POST /pay'], ['out', 'Web', 'receipt']],
    );
    assert.deepEqual(boundaryPorts(doc, []), []);
    assert.deepEqual(boundaryPorts(doc, ['pay', 'checkout']).map((p) => p.outsideTitle), ['Ledger']);
  });

  it('lists every component at every level with its path', () => {
    const entries = allLevelNodes(tree());
    const validate = entries.find((e) => e.node.id === 'validate');
    assert.deepEqual(validate?.path, ['pay', 'checkout']);
    assert.deepEqual(validate?.trail, ['Payments', 'Checkout API']);
    assert.equal(entries.length, 5);
  });

  it('round-trips through Blueprint JSON', () => {
    const parsed = parseBlueprintJson(serializeBlueprintJson(tree()));
    assert.ok(parsed.ok);
    const checkout = parsed.doc.nodes[1].child?.nodes[0];
    assert.equal(checkout?.id, 'checkout');
    assert.equal(checkout?.child?.nodes[0].id, 'validate');
    assert.equal(parsed.doc.nodes[1].child?.edges[0].id, 'i1');
  });

  it('drops levels nested past the depth limit instead of recursing', () => {
    let leaf: Record<string, unknown> = { id: 'n0', title: 'n0' };
    for (let i = 1; i < 20; i += 1) leaf = { id: `n${i}`, title: `n${i}`, child: { nodes: [leaf] } };
    const parsed = parseBlueprintJson(JSON.stringify({ nodes: [leaf] }));
    assert.ok(parsed.ok);
    assert.equal(allLevelNodes(parsed.doc).length <= 10, true);
  });
});
