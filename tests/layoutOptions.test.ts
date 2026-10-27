import { describe, it } from 'node:test';
import assert from 'node:assert';
import { autoLayoutDocument, type AutoLayoutOptions } from '../src/core/layout';
import { createBlankDocument, createNodeFromStencil } from '../src/templates/presets';
import type { DiagramDocument, DiagramNode, DiagramEdge } from '../src/types';

describe('auto-layout options and crossing minimization (suggestion 18)', () => {
  function makeSimpleChainDoc(): DiagramDocument {
    const doc = createBlankDocument();
    const a = createNodeFromStencil('client', 0, 0, 0);
    const b = createNodeFromStencil('service', 0, 0, 1);
    const c = createNodeFromStencil('store', 0, 0, 2);
    a.id = 'a';
    b.id = 'b';
    c.id = 'c';
    doc.nodes.push(a, b, c);

    const e1: DiagramEdge = {
      id: 'e1',
      from: 'a',
      to: 'b',
      sourcePort: 'right',
      targetPort: 'left',
      tone: 'blue',
      route: 'bezier',
      label: 'req',
      animated: true,
    };
    const e2: DiagramEdge = {
      id: 'e2',
      from: 'b',
      to: 'c',
      sourcePort: 'right',
      targetPort: 'left',
      tone: 'blue',
      route: 'bezier',
      label: 'query',
      animated: true,
    };
    doc.edges.push(e1, e2);
    return doc;
  }

  it('supports direction: LR (horizontal) and direction: TD (vertical)', () => {
    const docLR = makeSimpleChainDoc();
    autoLayoutDocument(docLR, { direction: 'LR' });
    const [aLR, bLR, cLR] = docLR.nodes;
    assert.strictEqual(docLR.direction, 'LR');
    assert.ok(aLR.x < bLR.x && bLR.x < cLR.x, 'LR must produce strictly increasing X coordinates');

    const docTD = makeSimpleChainDoc();
    autoLayoutDocument(docTD, { direction: 'TD' });
    const [aTD, bTD, cTD] = docTD.nodes;
    assert.strictEqual(docTD.direction, 'TD');
    assert.ok(aTD.y < bTD.y && bTD.y < cTD.y, 'TD must produce strictly increasing Y coordinates');
  });

  it('adjusts layer and node gaps based on spacing options (compact vs comfortable vs spacious)', () => {
    const docCompact = makeSimpleChainDoc();
    autoLayoutDocument(docCompact, { direction: 'LR', spacing: 'compact' });

    const docSpacious = makeSimpleChainDoc();
    autoLayoutDocument(docSpacious, { direction: 'LR', spacing: 'spacious' });

    const compactSpan = docCompact.nodes[2].x - docCompact.nodes[0].x;
    const spaciousSpan = docSpacious.nodes[2].x - docSpacious.nodes[0].x;

    assert.ok(
      spaciousSpan > compactSpan,
      `Spacious span (${spaciousSpan}) must be larger than compact span (${compactSpan})`
    );
  });

  it('minimizes edge crossings using Sugiyama barycenter heuristic', () => {
    const doc = createBlankDocument();
    // Layer 0
    const n1 = createNodeFromStencil('client', 0, 0, 0);
    n1.id = 'n1';
    const n2 = createNodeFromStencil('client', 0, 0, 1);
    n2.id = 'n2';

    // Layer 1
    const t1 = createNodeFromStencil('service', 0, 0, 2);
    t1.id = 't1';
    const t2 = createNodeFromStencil('service', 0, 0, 3);
    t2.id = 't2';

    // Insert with t1 first in document
    doc.nodes.push(n1, n2, t1, t2);

    // Cross edges: n1 -> t2, n2 -> t1
    // Without crossing reduction, t1 would stay at top (y lower) and t2 at bottom, causing a crossing.
    // With barycenter heuristic:
    // n1 is at idx 0, n2 is at idx 1.
    // t2 connects to n1 (score = 0).
    // t1 connects to n2 (score = 1).
    // Therefore t2 should be ordered before t1, eliminating the crossing!
    doc.edges.push({
      id: 'e-n1-t2',
      from: 'n1',
      to: 't2',
      sourcePort: 'right',
      targetPort: 'left',
      tone: 'blue',
      route: 'bezier',
      label: '',
      animated: true,
    });
    doc.edges.push({
      id: 'e-n2-t1',
      from: 'n2',
      to: 't1',
      sourcePort: 'right',
      targetPort: 'left',
      tone: 'blue',
      route: 'bezier',
      label: '',
      animated: true,
    });

    autoLayoutDocument(doc, { direction: 'LR' });

    const laidT1 = doc.nodes.find((n) => n.id === 't1')!;
    const laidT2 = doc.nodes.find((n) => n.id === 't2')!;

    assert.ok(
      laidT2.y < laidT1.y,
      `Expected t2 (y=${laidT2.y}) to be placed above t1 (y=${laidT1.y}) to minimize edge crossing`
    );
  });

  it('layouts selection only without displacing unselected nodes', () => {
    const doc = createBlankDocument();
    const a = createNodeFromStencil('client', 100, 100, 0);
    a.id = 'a';
    const b = createNodeFromStencil('service', 500, 600, 1);
    b.id = 'b';
    const c = createNodeFromStencil('service', 500, 200, 2);
    c.id = 'c';
    const d = createNodeFromStencil('store', 900, 900, 3);
    d.id = 'd';

    doc.nodes.push(a, b, c, d);

    // Edge between selected nodes b and c: b -> c
    doc.edges.push({
      id: 'e-bc',
      from: 'b',
      to: 'c',
      sourcePort: 'right',
      targetPort: 'left',
      tone: 'blue',
      route: 'bezier',
      label: '',
      animated: true,
    });

    const origAX = a.x;
    const origAY = a.y;
    const origDX = d.x;
    const origDY = d.y;

    autoLayoutDocument(doc, {
      direction: 'LR',
      selectionOnly: true,
      selectedNodeIds: ['b', 'c'],
    });

    // Unselected nodes a and d must NOT move
    assert.strictEqual(a.x, origAX);
    assert.strictEqual(a.y, origAY);
    assert.strictEqual(d.x, origDX);
    assert.strictEqual(d.y, origDY);

    // Selected nodes b and c were arranged so b is left of c
    assert.ok(b.x < c.x, 'In LR layout, source b must be placed to the left of target c');
  });
});
