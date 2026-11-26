import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { collectMapKeyRows, updateLegendLabel } from '../src/core/mapKey';
import type { DiagramDocument, DiagramEdge, DiagramNode } from '../src/types';

function makeDoc(extra: Partial<Pick<DiagramDocument, 'nodes' | 'edges' | 'legend' | 'direction'>> = {}) {
  return {
    nodes: [],
    edges: [],
    direction: 'LR' as const,
    ...extra,
  };
}

function makeNode(id: string, x: number, y: number, extra: Partial<DiagramNode> = {}): DiagramNode {
  return {
    id,
    title: id,
    kind: 'service',
    x,
    y,
    w: 180,
    h: 100,
    accent: 'blue',
    ...extra,
  };
}

function makeEdge(id: string, from: string, to: string, tone: DiagramEdge['tone'], extra: Partial<DiagramEdge> = {}): DiagramEdge {
  return {
    id,
    from,
    to,
    tone,
    ...extra,
  };
}

describe('collectMapKeyRows (DK4)', () => {
  it('returns an empty list in tone mode when the page has no wires', () => {
    const doc = makeDoc({
      nodes: [makeNode('a', 100, 100)],
      legend: [{ tone: 'blue', label: 'Requests' }],
    });
    assert.deepEqual(collectMapKeyRows(doc, 'tone'), []);
  });

  it('orders tones left-to-right by source component coordinates and deduplicates', () => {
    const doc = makeDoc({
      direction: 'LR',
      nodes: [
        makeNode('late', 500, 100),
        makeNode('top-left', 100, 80),
        makeNode('bottom-left', 100, 260),
        makeNode('mid', 300, 140),
      ],
      // Notice edges are intentionally not in layout order in the array.
      edges: [
        makeEdge('e1', 'late', 'mid', 'rose'),
        makeEdge('e2', 'bottom-left', 'mid', 'amber'),
        makeEdge('e3', 'top-left', 'mid', 'blue'),
        makeEdge('e4', 'mid', 'late', 'blue'),
      ],
    });

    const rows = collectMapKeyRows(doc, 'tone');
    assert.deepEqual(
      rows.map((r) => ({ tone: r.tone, label: r.label })),
      [
        { tone: 'blue', label: 'Primary' },
        { tone: 'amber', label: 'Async' },
        { tone: 'rose', label: 'Exception' },
      ],
    );
  });

  it('orders tones top-down when direction is TD', () => {
    const doc = makeDoc({
      direction: 'TD',
      nodes: [
        makeNode('bottom', 50, 400),
        makeNode('top', 500, 40),
      ],
      edges: [
        makeEdge('e1', 'bottom', 'top', 'emerald'),
        makeEdge('e2', 'top', 'bottom', 'violet'),
      ],
    });
    const rows = collectMapKeyRows(doc, 'tone');
    assert.deepEqual(rows.map((r) => r.tone), ['violet', 'emerald']);
  });

  it('marks a tone dashed only when every wire of that tone is async', () => {
    const doc = makeDoc({
      nodes: [makeNode('a', 10, 10), makeNode('b', 100, 10), makeNode('c', 200, 10)],
      edges: [
        makeEdge('e1', 'a', 'b', 'amber', { sync: 'async' }),
        makeEdge('e2', 'b', 'c', 'amber', { sync: 'async' }),
        makeEdge('e3', 'a', 'b', 'blue', { sync: 'async' }),
        makeEdge('e4', 'b', 'c', 'blue'), // sync default -> mixed, stays solid
      ],
    });
    const rows = collectMapKeyRows(doc, 'tone');
    assert.equal(rows.find((r) => r.tone === 'amber')?.dashed, true);
    assert.equal(rows.find((r) => r.tone === 'blue')?.dashed, false);
  });

  it('uses custom legend labels and descriptions with fallback to default short labels', () => {
    const doc = makeDoc({
      legend: [{ tone: 'blue', label: 'Fan traffic', description: 'Edge requests' }],
      nodes: [makeNode('a', 10, 10), makeNode('b', 200, 10)],
      edges: [
        makeEdge('e1', 'a', 'b', 'blue'),
        makeEdge('e2', 'a', 'b', 'cyan'),
      ],
    });
    const rows = collectMapKeyRows(doc, 'tone');
    assert.deepEqual(rows[0], {
      tone: 'blue',
      label: 'Fan traffic',
      description: 'Edge requests',
      dashed: false,
      editable: true,
      filterable: true,
    });
    assert.deepEqual(rows[1], {
      tone: 'cyan',
      label: 'Data',
      dashed: false,
      editable: true,
      filterable: true,
    });
  });

  it('returns read-only colour rows under status or tag colourBy modes', () => {
    const doc = makeDoc({
      nodes: [makeNode('a', 10, 10, { status: 'live', tags: ['pii'] })],
    });
    const statusRows = collectMapKeyRows(doc, 'status');
    assert.equal(statusRows.length, 4);
    assert.equal(statusRows.every((r) => !r.editable && !r.filterable && !r.dashed), true);

    const tagRows = collectMapKeyRows(doc, 'tag');
    assert.deepEqual(tagRows.map((r) => r.label), ['pii']);
    assert.equal(tagRows[0].editable, false);
  });
});

describe('updateLegendLabel (DK4)', () => {
  it('adds, updates, preserves description, sorts canonically, and clears entries', () => {
    const added = updateLegendLabel(undefined, 'amber', '  Async events  ');
    assert.deepEqual(added, [{ tone: 'amber', label: 'Async events' }]);

    const withDesc = [{ tone: 'amber' as const, label: 'Old', description: 'Queue events' }];
    const updated = updateLegendLabel(withDesc, 'blue', 'Requests');
    assert.deepEqual(updated, [
      { tone: 'blue', label: 'Requests' },
      { tone: 'amber', label: 'Old', description: 'Queue events' },
    ]);

    const renamedAmber = updateLegendLabel(updated, 'amber', 'Live stream');
    assert.deepEqual(renamedAmber, [
      { tone: 'blue', label: 'Requests' },
      { tone: 'amber', label: 'Live stream', description: 'Queue events' },
    ]);

    const clearedAmber = updateLegendLabel(renamedAmber, 'amber', '   ');
    assert.deepEqual(clearedAmber, [{ tone: 'blue', label: 'Requests' }]);

    const empty = updateLegendLabel(clearedAmber, 'blue', '');
    assert.equal(empty, undefined);
  });
});
