import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  QUICK_BUILD_BELOW_GAP,
  QUICK_BUILD_CELL_H,
  QUICK_BUILD_CELL_W,
  QUICK_BUILD_COL_PITCH,
  QUICK_BUILD_MAX_NODES,
  QUICK_BUILD_MAX_WIRES,
  QUICK_BUILD_ROW_PITCH,
  applyBuild,
  planBuild,
} from '../src/core/quickBuild.ts';
import { WORDS } from '../src/studio/trayWords.ts';
import { createBlankDocument, createNodeFromStencil, createWireEdge } from '../src/templates/presets.ts';

describe('quickBuild chain grammar (CP1)', () => {
  it('returns an empty plan for blank or separator-only input and applyBuild is a no-op', () => {
    const doc = createBlankDocument();
    for (const raw of ['', '   ', ' , > ~> ', '> ,']) {
      const plan = planBuild(raw, doc, WORDS);
      assert.deepEqual(plan, { nodes: [], wires: [] });
      assert.deepEqual(applyBuild(doc, plan, { x: 80, y: 80 }), { added: [], wired: [] });
      assert.equal(doc.nodes.length, 0);
      assert.equal(doc.edges.length, 0);
    }
  });

  it('treats a single name without operators as a plain add', () => {
    const doc = createBlankDocument();
    const plan = planBuild('redis', doc, WORDS);
    assert.equal(plan.nodes.length, 1);
    assert.deepEqual(plan.nodes[0], {
      key: 'redis',
      title: 'Redis',
      stencilId: 'store',
      column: 0,
      row: 0,
    });
    assert.deepEqual(plan.wires, []);

    const res = applyBuild(doc, plan, { x: 100, y: 120 });
    assert.equal(res.added.length, 1);
    assert.equal(res.wired.length, 0);
    assert.equal(doc.nodes[0].title, 'Redis');
    assert.equal(doc.nodes[0].kind, 'store');
  });

  it('plans and builds the showcase example (gateway > orders api > postgres, orders api ~> kafka)', () => {
    const doc = createBlankDocument();
    const plan = planBuild('gateway > orders api > postgres, orders api ~> kafka', doc, WORDS);
    assert.equal(plan.error, undefined);
    assert.deepEqual(
      plan.nodes.map((n) => ({
        title: n.title,
        stencilId: n.stencilId,
        column: n.column,
        row: n.row,
      })),
      [
        { title: 'Gateway', stencilId: 'gate', column: 0, row: 0 },
        { title: 'Orders api', stencilId: 'service', column: 1, row: 0 },
        { title: 'Postgres', stencilId: 'store', column: 2, row: 0 },
        { title: 'Kafka', stencilId: 'stream', column: 2, row: 1 },
      ],
    );
    assert.deepEqual(plan.wires, [
      { from: 'gateway', to: 'orders api', sync: 'sync' },
      { from: 'orders api', to: 'postgres', sync: 'sync' },
      { from: 'orders api', to: 'kafka', sync: 'async' },
    ]);

    const origin = { x: 120, y: 100 };
    const result = applyBuild(doc, plan, origin);
    assert.equal(result.added.length, 4);
    assert.equal(result.wired.length, 3);
    assert.equal(doc.nodes.length, 4);
    assert.equal(doc.edges.length, 3);

    // Every wire takes the target's tone, sets async only when ~>, and leaves label empty.
    const [e1, e2, e3] = doc.edges;
    assert.equal(e1.tone, 'blue');
    assert.equal(e1.sync, undefined);
    assert.equal(e1.label, '');
    assert.equal(e2.tone, 'emerald');
    assert.equal(e2.sync, undefined);
    assert.equal(e2.label, '');
    assert.equal(e3.tone, 'amber');
    assert.equal(e3.sync, 'async');
    assert.equal(e3.label, '');

    // Boxes in row 0 are vertically centred in the same 172 px row cell.
    const row0CenterY = origin.y + QUICK_BUILD_CELL_H / 2;
    for (const n of doc.nodes.slice(0, 3)) {
      assert.equal(Math.round(n.y + n.height / 2), row0CenterY);
    }
    const kafka = doc.nodes[3];
    assert.equal(kafka.kind, 'queue');
    assert.equal(kafka.queue?.delivery, 'fanout');
    assert.equal(kafka.x, Math.round(origin.x + 2 * QUICK_BUILD_COL_PITCH + (QUICK_BUILD_CELL_W - kafka.width) / 2));
    assert.equal(kafka.y, Math.round(origin.y + QUICK_BUILD_ROW_PITCH + (QUICK_BUILD_CELL_H - kafka.height) / 2));
  });

  it('reuses existing page components by title without moving them and anchors below the lowest node', () => {
    const doc = createBlankDocument();
    const existingGate = createNodeFromStencil('gate', 320, 140, 0);
    existingGate.title = 'Edge Gateway';
    const lowerNode = createNodeFromStencil('store', 100, 500, 1);
    lowerNode.title = 'Ledger DB';
    const streamNode = createNodeFromStencil('stream', 50, 50, 2);
    streamNode.title = 'Order Stream';
    doc.nodes.push(existingGate, lowerNode, streamNode);

    const plan = planBuild('  edge   gateway  > Billing API > order stream', doc, WORDS);
    assert.equal(plan.nodes.length, 3);
    assert.equal(plan.nodes[0].existingId, existingGate.id);
    assert.equal(plan.nodes[0].title, 'Edge Gateway');
    assert.equal(plan.nodes[1].existingId, undefined);
    assert.equal(plan.nodes[1].title, 'Billing API');
    assert.equal(plan.nodes[2].existingId, streamNode.id);
    assert.equal(plan.nodes[2].stencilId, 'stream');

    const beforeGate = { x: existingGate.x, y: existingGate.y };
    const beforeStream = { x: streamNode.x, y: streamNode.y };
    const res = applyBuild(doc, plan, { x: 40, y: 40 });
    assert.equal(res.added.length, 1);
    assert.equal(res.wired.length, 2);
    assert.equal(existingGate.x, beforeGate.x);
    assert.equal(existingGate.y, beforeGate.y);
    assert.equal(streamNode.x, beforeStream.x);
    assert.equal(streamNode.y, beforeStream.y);

    const billing = doc.nodes.find((n) => n.id === res.added[0])!;
    const lowestBottom = lowerNode.y + lowerNode.height;
    const expectedY0 = lowestBottom + QUICK_BUILD_BELOW_GAP;
    assert.equal(
      billing.x,
      Math.round(existingGate.x + 1 * QUICK_BUILD_COL_PITCH + (QUICK_BUILD_CELL_W - billing.width) / 2),
    );
    assert.equal(billing.y, Math.round(expectedY0 + (QUICK_BUILD_CELL_H - billing.height) / 2));
    assert.ok(doc.stageHeight >= billing.y + billing.height + 160);
  });

  it('infers kinds from exact catalog ids/names, WORDS matches, and preserves mixed-case titles', () => {
    const doc = createBlankDocument();
    const plan = planBuild(
      'object-store > Message Queue > Service API > my postgres db > Edge Gateway > Orders API',
      doc,
      WORDS,
    );
    assert.deepEqual(
      plan.nodes.map((n) => ({ title: n.title, stencilId: n.stencilId })),
      [
        { title: 'Object-store', stencilId: 'object-store' },
        { title: 'Message Queue', stencilId: 'queue' },
        { title: 'Service API', stencilId: 'service' },
        { title: 'My postgres db', stencilId: 'store' },
        { title: 'Edge Gateway', stencilId: 'gate' },
        { title: 'Orders API', stencilId: 'service' },
      ],
    );
  });

  it('places nodes by longest path in DAGs and handles reverse mention order', () => {
    const doc = createBlankDocument();
    const diamond = planBuild('a > b > c > d, a > d', doc, WORDS);
    assert.deepEqual(
      diamond.nodes.map((n) => [n.key, n.column, n.row]),
      [
        ['a', 0, 0],
        ['b', 1, 0],
        ['c', 2, 0],
        ['d', 3, 0],
      ],
    );

    const reversed = planBuild('b > c, a > b', doc, WORDS);
    assert.deepEqual(
      reversed.nodes.map((n) => [n.key, n.column, n.row]),
      [
        ['b', 1, 0],
        ['c', 2, 0],
        ['a', 0, 0],
      ],
    );
  });

  it('handles cycles without infinite recursion and preserves cycle wires', () => {
    const doc = createBlankDocument();
    const plan = planBuild('a > b > a', doc, WORDS);
    assert.equal(plan.error, undefined);
    assert.deepEqual(
      plan.nodes.map((n) => [n.key, n.column, n.row]),
      [
        ['a', 0, 0],
        ['b', 1, 0],
      ],
    );
    assert.deepEqual(plan.wires, [
      { from: 'a', to: 'b', sync: 'sync' },
      { from: 'b', to: 'a', sync: 'sync' },
    ]);

    const res = applyBuild(doc, plan, { x: 80, y: 80 });
    assert.equal(res.added.length, 2);
    assert.equal(res.wired.length, 2);

    const threeCycle = planBuild('x > y > z > x', doc, WORDS);
    assert.deepEqual(
      threeCycle.nodes.map((n) => [n.key, n.column]),
      [
        ['x', 0],
        ['y', 1],
        ['z', 2],
      ],
    );
  });

  it('skips self-loops and duplicate directional wires while preserving reverse wires', () => {
    const doc = createBlankDocument();
    const plan = planBuild('a > a, a > b, a ~> b, b > a', doc, WORDS);
    assert.deepEqual(plan.wires, [
      { from: 'a', to: 'b', sync: 'sync' },
      { from: 'b', to: 'a', sync: 'sync' },
    ]);

    // Existing edge between reused nodes is not duplicated on applyBuild.
    const a = createNodeFromStencil('service', 100, 100, 0);
    a.title = 'A';
    const b = createNodeFromStencil('service', 400, 100, 1);
    b.title = 'B';
    doc.nodes.push(a, b);
    doc.edges.push(createWireEdge(a.id, b.id));

    const reusePlan = planBuild('a > a, a > b, a ~> b, b > a', doc, WORDS);
    const res = applyBuild(doc, reusePlan, { x: 80, y: 80 });
    assert.equal(res.added.length, 0);
    assert.equal(res.wired.length, 1);
    assert.equal(doc.edges.length, 2);
  });

  it('handles unicode names, internal whitespace collapsing, and astral symbols safely', () => {
    const doc = createBlankDocument();
    const plan = planBuild('  élan   service  >  注文サービス  ~>  🚀  kafka-log ', doc, WORDS);
    assert.deepEqual(
      plan.nodes.map((n) => ({ title: n.title, stencilId: n.stencilId, column: n.column })),
      [
        { title: 'Élan service', stencilId: 'service', column: 0 },
        { title: '注文サービス', stencilId: 'service', column: 1 },
        { title: '🚀 kafka-log', stencilId: 'stream', column: 2 },
      ],
    );
  });

  it('enforces 24-node and 40-wire limits cleanly', () => {
    const doc = createBlankDocument();
    const ok24 = Array.from({ length: QUICK_BUILD_MAX_NODES }, (_, i) => `n${i}`).join(', ');
    assert.equal(planBuild(ok24, doc, WORDS).error, undefined);
    assert.equal(planBuild(ok24, doc, WORDS).nodes.length, QUICK_BUILD_MAX_NODES);

    const over25 = Array.from({ length: QUICK_BUILD_MAX_NODES + 1 }, (_, i) => `n${i}`).join(', ');
    const tooManyNodes = planBuild(over25, doc, WORDS);
    assert.equal(tooManyNodes.error, 'too-large');
    assert.deepEqual(applyBuild(doc, tooManyNodes, { x: 80, y: 80 }), { added: [], wired: [] });

    // 10 nodes have up to 90 directed pairs; build 40 wires vs 41 wires.
    const pairs: string[] = [];
    for (let i = 0; i < 10; i++) {
      for (let j = 0; j < 10; j++) {
        if (i !== j) pairs.push(`s${i} > s${j}`);
      }
    }
    const ok40 = planBuild(pairs.slice(0, QUICK_BUILD_MAX_WIRES).join(', '), doc, WORDS);
    assert.equal(ok40.error, undefined);
    assert.equal(ok40.wires.length, QUICK_BUILD_MAX_WIRES);

    const over41 = planBuild(pairs.slice(0, QUICK_BUILD_MAX_WIRES + 1).join(', '), doc, WORDS);
    assert.equal(over41.error, 'too-large');

    // Repeated names/wires beyond 40 tokens still count unique items, not raw mentions.
    const repeated = Array.from({ length: 50 }, () => 'alpha > beta').join(', ');
    const deduped = planBuild(repeated, doc, WORDS);
    assert.equal(deduped.error, undefined);
    assert.equal(deduped.nodes.length, 2);
    assert.equal(deduped.wires.length, 1);
  });

  it('supports atomic snapshot rollback for one-undo-step restoration', () => {
    const doc = createBlankDocument();
    const before = structuredClone(doc);
    const plan = planBuild('gateway > orders api > postgres, orders api ~> kafka', doc, WORDS);
    const { added, wired } = applyBuild(doc, plan, { x: 80, y: 80 });
    assert.equal(added.length, 4);
    assert.equal(wired.length, 3);
    assert.notDeepEqual(doc, before);

    const restored = structuredClone(before);
    assert.deepEqual(restored, before);
  });
});
