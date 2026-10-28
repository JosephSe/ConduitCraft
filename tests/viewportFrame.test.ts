import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DiagramDocument, DiagramNode, DiagramEdge } from '../src/types.ts';
import {
  FIT_SCALE_MAX,
  FIT_SCALE_MIN,
  READABLE_FIT_SCALE_MIN,
  NOTES_CARD_WIDTH,
  contentWorldBounds,
  frameRectInViewport,
  frameDocumentInViewport,
  minimapMap,
  minimapToWorld,
  notesCardHeight,
  panToCenterWorld,
  selectionWorldBounds,
  viewportWorldRect,
  worldToMinimap,
  zoneWorldBounds,
} from '../src/studio/viewportFrame.ts';

function node(partial: Pick<DiagramNode, 'id' | 'x' | 'y' | 'width' | 'height'>): DiagramNode {
  return {
    kind: 'core',
    accent: 'blue',
    icon: 'cpu',
    title: partial.id,
    subtitle: '',
    eyebrow: '',
    footerLeft: '',
    chip: '',
    zoneLabel: '',
    interfaceLabel: '',
    summary: '',
    metrics: [],
    code: '',
    ...partial,
  };
}

function blank(partial: Partial<DiagramDocument> = {}): DiagramDocument {
  return {
    title: 't',
    systemTag: 't',
    statusLabel: 't',
    direction: 'LR',
    stageWidth: 1680,
    stageHeight: 920,
    overviewSummary: '',
    zones: [],
    notesCards: [],
    nodes: [],
    edges: [],
    simulations: [],
    ...partial,
  };
}

describe('viewport framing', () => {
  it('frames nothing when the document has no content', () => {
    assert.equal(contentWorldBounds(blank()), null);
    assert.equal(selectionWorldBounds(blank(), { type: 'none' }), null);
  });

  it('frames a node, a multi-selection, and an edge with its waypoint', () => {
    const doc = blank({
      nodes: [
        node({ id: 'a', x: 10, y: 20, width: 100, height: 40 }),
        node({ id: 'b', x: 200, y: 80, width: 50, height: 60 }),
      ],
      edges: [
        {
          id: 'e',
          from: 'a',
          to: 'b',
          sourcePort: 'right',
          targetPort: 'left',
          tone: 'blue',
          route: 'auto',
          label: '',
          animated: false,
          waypoint: [400, 10],
        } satisfies DiagramEdge,
      ],
    });
    assert.deepEqual(selectionWorldBounds(doc, { type: 'node', id: 'a' }), {
      x: 10,
      y: 20,
      width: 100,
      height: 40,
    });
    assert.deepEqual(selectionWorldBounds(doc, { type: 'multi', ids: ['b', 'a'] }), {
      x: 10,
      y: 20,
      width: 240,
      height: 120,
    });
    const withStage = blank({
      stageHeight: 400,
      nodes: [node({ id: 'a', x: 40, y: 80, width: 100, height: 40 })],
      zones: [{ id: 'lane', number: '01', title: 'Lane', subtitle: '', x: 0, width: 300 }],
      notesCards: [{ id: 'card', title: 'Note', code: 'N', x: 420, y: 200, items: [{ title: 'A', text: 'B' }] }],
    });
    const framed = selectionWorldBounds(withStage, {
      type: 'multi',
      ids: ['a'],
      zoneIds: ['lane'],
      notesIds: ['card'],
    });
    assert.equal(framed?.x, 0);
    assert.ok((framed?.x ?? 0) + (framed?.width ?? 0) >= 420 + NOTES_CARD_WIDTH);
    const edge = selectionWorldBounds(doc, { type: 'edge', id: 'e' });
    assert.ok(edge);
    assert.equal(edge.x, 10);
    assert.equal(edge.y, 2);
    assert.ok(edge.x + edge.width >= 408);
    assert.equal(selectionWorldBounds(doc, { type: 'node', id: 'missing' }), null);
  });

  it('frames a zone column and a notes card', () => {
    const nodes = [node({ id: 'a', x: 40, y: 80, width: 100, height: 50 })];
    assert.deepEqual(zoneWorldBounds({ x: 24, width: 320 }, 920, nodes), {
      x: 24,
      y: 0,
      width: 320,
      height: 130,
    });
    assert.deepEqual(zoneWorldBounds({ x: 400, width: 200 }, 920, nodes), {
      x: 400,
      y: 0,
      width: 200,
      height: 920,
    });
    const doc = blank({
      notesCards: [{ id: 'n', title: 'Notes', code: 'S', x: 30, y: 40, items: [{ title: 'A', text: 'B' }] }],
    });
    assert.deepEqual(selectionWorldBounds(doc, { type: 'notes', id: 'n' }), {
      x: 30,
      y: 40,
      width: NOTES_CARD_WIDTH,
      height: notesCardHeight(1),
    });
  });

  it('centers bounds and clamps the zoom to the studio range', () => {
    const tight = frameRectInViewport(1000, 800, { x: 0, y: 0, width: 10, height: 10 });
    assert.ok(tight);
    assert.equal(tight.scale, FIT_SCALE_MAX);
    assert.ok(Math.abs(tight.panX + 5 * FIT_SCALE_MAX - 500) < 1e-6);

    const wide = frameRectInViewport(400, 300, { x: 0, y: 0, width: 20000, height: 20000 });
    assert.ok(wide);
    assert.equal(wide.scale, FIT_SCALE_MIN);

    assert.equal(frameRectInViewport(0, 100, { x: 0, y: 0, width: 10, height: 10 }), null);
  });

  it('maps the minimap both ways and centers a pan target', () => {
    const map = minimapMap(1680, 920, 168, 96, 6);
    const [px, py] = worldToMinimap(map, 840, 460);
    const [wx, wy] = minimapToWorld(map, px, py);
    assert.ok(Math.abs(wx - 840) < 1e-6);
    assert.ok(Math.abs(wy - 460) < 1e-6);

    const pan = panToCenterWorld(100, 50, 800, 600, 2);
    assert.equal(pan.panX + 100 * 2, 400);
    assert.equal(pan.panY + 50 * 2, 300);

    const visible = viewportWorldRect(800, 600, pan.panX, pan.panY, 2);
    assert.equal(visible.x + visible.width / 2, 100);
    assert.equal(visible.y + visible.height / 2, 50);
  });

  it('clamps small diagrams (1-2 nodes) to a readable minimum zoom instead of whole stage shrinkage', () => {
    // 2 starter nodes placed in default positions
    const smallDoc = blank({
      nodes: [
        node({ id: 'core', x: 200, y: 200, width: 140, height: 80 }),
        node({ id: 'service', x: 420, y: 200, width: 140, height: 80 }),
      ],
    });

    // On standard laptop viewport (e.g. 850px width):
    // Stage framing would do: (850 - 48) / 1680 = 0.47 (shrinks into low-LOD < 55%)
    // frameDocumentInViewport must clamp to at least READABLE_FIT_SCALE_MIN (0.65)
    const frame = frameDocumentInViewport(850, 600, smallDoc);
    assert.ok(frame, 'must frame small document successfully');
    assert.ok(
      frame.scale >= READABLE_FIT_SCALE_MIN,
      `Small diagram zoom (${frame.scale}) must be >= readable minimum (${READABLE_FIT_SCALE_MIN})`
    );
    assert.ok(
      frame.scale <= 1.0,
      `Small diagram zoom (${frame.scale}) should not exceed 1.0`
    );

    // Empty document centers at 1.0 scale
    const emptyFrame = frameDocumentInViewport(850, 600, blank());
    assert.ok(emptyFrame);
    assert.equal(emptyFrame.scale, 1.0);
  });
});
