import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { queueWireDefaults, setQueueMaxDepth, setQueueOrdering } from '../src/core/appearance.ts';
import { buildActionContext, isActionAvailable } from '../src/core/actions.ts';
import { contextMenuCommandIds } from '../src/core/contextMenuItems.ts';
import { pruneDanglingChaos } from '../src/core/reachability.ts';
import { createBlankDocument, createNodeFromStencil } from '../src/templates/presets.ts';
import type { DiagramDocument } from '../src/types.ts';

function docWithQueues(): DiagramDocument {
  const doc = createBlankDocument();
  doc.nodes = [
    { ...createNodeFromStencil('queue', 0, 0, 0), id: 'q1' },
    { ...createNodeFromStencil('queue', 300, 0, 1), id: 'q2' },
    { ...createNodeFromStencil('service', 600, 0, 2), id: 's1' },
  ];
  return doc;
}

describe('queue editing (K1, spec 3.6)', () => {
  it('bulk ordering changes only queues and reports whether anything changed', () => {
    const doc = docWithQueues();
    assert.equal(setQueueOrdering(doc.nodes, 'fifo'), true);
    assert.equal(doc.nodes[0].queue?.ordering, 'fifo');
    assert.equal(doc.nodes[1].queue?.ordering, 'fifo');
    assert.equal(doc.nodes[2].queue, undefined);
    assert.equal(setQueueOrdering(doc.nodes, 'fifo'), false);
    assert.equal(setQueueOrdering(doc.nodes, 'standard'), true);
    assert.equal(doc.nodes[0].queue, undefined, 'back to the default leaves the field absent');
  });

  it('bulk max depth sets, validates and clears', () => {
    const doc = docWithQueues();
    assert.equal(setQueueMaxDepth(doc.nodes, 50), true);
    assert.equal(doc.nodes[0].queue?.maxDepth, 50);
    assert.equal(setQueueMaxDepth(doc.nodes, 50), false);
    assert.equal(setQueueMaxDepth(doc.nodes, 0), true, '0 is not a depth, so it clears');
    assert.equal(doc.nodes[0].queue, undefined);
  });

  it('keeps other queue settings when one changes', () => {
    const doc = docWithQueues();
    doc.nodes[0].queue = { retention: '4 days', deadLetterId: 'q2' };
    setQueueMaxDepth(doc.nodes, 9);
    assert.deepEqual(doc.nodes[0].queue, { retention: '4 days', deadLetterId: 'q2', maxDepth: 9 });
  });

  it('a wire into or out of a queue defaults to async and amber; others are untouched', () => {
    const doc = docWithQueues();
    assert.deepEqual(queueWireDefaults(doc.nodes, 's1', 'q1'), { sync: 'async', tone: 'amber' });
    assert.deepEqual(queueWireDefaults(doc.nodes, 'q1', 's1'), { sync: 'async', tone: 'amber' });
    assert.deepEqual(queueWireDefaults(doc.nodes, 's1', 's1'), {});
  });

  it('"Add dead-letter queue" is offered for exactly one selected queue, in the context menu', () => {
    const doc = docWithQueues();
    const on = (id: string) => buildActionContext({ type: 'node', id }, doc, 'design');
    assert.equal(isActionAvailable('queue-add-dlq', on('q1')), true);
    assert.equal(isActionAvailable('queue-add-dlq', on('s1')), false);
    assert.equal(isActionAvailable('queue-add-dlq', buildActionContext({ type: 'multi', ids: ['q1', 'q2'] }, doc, 'design')), false);
    assert.equal(isActionAvailable('queue-add-dlq', buildActionContext({ type: 'node', id: 'q1' }, doc, 'data')), false);
    assert.ok(contextMenuCommandIds('node', { grouped: false }).includes('queue-add-dlq'));
  });

  it('a dead-letter id that names a missing component or the queue itself is pruned', () => {
    const doc = docWithQueues();
    doc.nodes[0].queue = { deadLetterId: 'ghost', maxDepth: 5 };
    doc.nodes[1].queue = { deadLetterId: 'q2' };
    pruneDanglingChaos(doc);
    assert.deepEqual(doc.nodes[0].queue, { maxDepth: 5 });
    assert.equal(doc.nodes[1].queue, undefined);
    doc.nodes[0].queue = { deadLetterId: 'q2' };
    pruneDanglingChaos(doc);
    assert.equal(doc.nodes[0].queue?.deadLetterId, 'q2');
  });
});
