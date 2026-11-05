import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { drainCount, enqueue, holdingQueue, normalizeQueue, type BacklogState } from '../src/core/queues.ts';
import { normalizeNodeMeta } from '../src/core/meta.ts';

const empty: BacklogState = { depth: 0, deadLettered: 0, dropped: 0 };

describe('normalizeQueue (K1)', () => {
  it('returns undefined for non-objects and for objects with nothing to keep', () => {
    assert.equal(normalizeQueue(undefined), undefined);
    assert.equal(normalizeQueue(null), undefined);
    assert.equal(normalizeQueue('fifo'), undefined);
    assert.equal(normalizeQueue({}), undefined);
  });

  it('leaves the defaults absent', () => {
    assert.equal(normalizeQueue({ ordering: 'standard', delivery: 'competing' }), undefined);
  });

  it('keeps known enums and drops unknown ones', () => {
    assert.deepEqual(normalizeQueue({ ordering: 'fifo' }), { ordering: 'fifo' });
    assert.deepEqual(normalizeQueue({ ordering: 'priority', delivery: 'fanout' }), {
      ordering: 'priority',
      delivery: 'fanout',
    });
    assert.equal(normalizeQueue({ ordering: 'lifo', delivery: 'broadcast' }), undefined);
  });

  it('accepts maxDepth only as a whole number from 1 to 9999', () => {
    assert.deepEqual(normalizeQueue({ maxDepth: 1 }), { maxDepth: 1 });
    assert.deepEqual(normalizeQueue({ maxDepth: 9999 }), { maxDepth: 9999 });
    for (const bad of [0, -1, 1.7, 10000, '50', NaN, Infinity, null]) {
      assert.equal(normalizeQueue({ maxDepth: bad }), undefined, `maxDepth ${String(bad)}`);
    }
  });

  it('trims retention and cuts it to 40 characters', () => {
    assert.deepEqual(normalizeQueue({ retention: '  4 days ' }), { retention: '4 days' });
    assert.equal(normalizeQueue({ retention: 'x'.repeat(80) })?.retention?.length, 40);
    assert.equal(normalizeQueue({ retention: '   ' }), undefined);
    assert.equal(normalizeQueue({ retention: 4 }), undefined);
  });

  it('keeps a trimmed deadLetterId', () => {
    assert.deepEqual(normalizeQueue({ deadLetterId: ' dlq ' }), { deadLetterId: 'dlq' });
    assert.equal(normalizeQueue({ deadLetterId: '' }), undefined);
  });

  it('is read by normalizeNodeMeta', () => {
    assert.deepEqual(normalizeNodeMeta({ queue: { maxDepth: 5 } }).queue, { maxDepth: 5 });
    assert.equal('queue' in normalizeNodeMeta({}), false);
  });
});

describe('enqueue (K1)', () => {
  it('holds while below maxDepth, or when there is no maxDepth', () => {
    const a = enqueue(empty, undefined, false);
    assert.equal(a.outcome, 'held');
    assert.equal(a.state.depth, 1);
    const b = enqueue({ ...empty, depth: 2 }, { maxDepth: 3 }, false);
    assert.equal(b.outcome, 'held');
    assert.equal(b.state.depth, 3);
  });

  it('dead-letters at maxDepth when the DLQ is up', () => {
    const r = enqueue({ ...empty, depth: 3 }, { maxDepth: 3, deadLetterId: 'dlq' }, true);
    assert.equal(r.outcome, 'dead-lettered');
    assert.equal(r.state.depth, 3);
    assert.equal(r.state.deadLettered, 1);
  });

  it('drops at maxDepth when the DLQ is down or missing', () => {
    const down = enqueue({ ...empty, depth: 3 }, { maxDepth: 3, deadLetterId: 'dlq' }, false);
    assert.equal(down.outcome, 'dropped');
    assert.equal(down.state.dropped, 1);
    const none = enqueue({ ...empty, depth: 3 }, { maxDepth: 3 }, true);
    assert.equal(none.outcome, 'dropped');
  });

  it('never goes over maxDepth, and does not mutate its input', () => {
    const start = { ...empty, depth: 3 };
    const r = enqueue(start, { maxDepth: 3 }, false);
    assert.equal(r.state.depth, 3);
    assert.equal(start.dropped, 0);
  });
});

describe('drainCount (K1)', () => {
  it('is at least 1', () => {
    assert.equal(drainCount(0, undefined), 1);
  });
  it('is one per live consumer for competing delivery', () => {
    assert.equal(drainCount(3, undefined), 3);
    assert.equal(drainCount(2, { delivery: 'competing' }), 2);
  });
  it('is 1 for fanout', () => {
    assert.equal(drainCount(4, { delivery: 'fanout' }), 1);
  });
});

describe('holdingQueue (K1)', () => {
  const doc = {
    nodes: [{ id: 'p' }, { id: 'q' }, { id: 'c' }, { id: 'd' }] as never,
    edges: [
      { id: 'e1', from: 'p', to: 'q' },
      { id: 'e2', from: 'q', to: 'c' },
      { id: 'e3', from: 'c', to: 'd' },
    ] as never,
  };
  const buffering = new Set(['q']);
  const down = new Set(['c']);

  it('holds when the queue is in the current step and its consumer is next', () => {
    assert.equal(holdingQueue(doc, ['q'], ['c'], buffering, down), 'q');
  });
  it('holds when the queue and its consumer share the next step', () => {
    assert.equal(holdingQueue(doc, ['p'], ['q', 'c'], buffering, down), 'q');
  });
  it('holds when the queue is in the next step and its consumer is also in it', () => {
    assert.equal(holdingQueue(doc, [], ['q', 'c'], buffering, down), 'q');
  });
  it('does not hold when the queue is not buffering', () => {
    assert.equal(holdingQueue(doc, ['q'], ['c'], new Set(), down), null);
  });
  it('does not hold when the next step has no down consumer of the queue', () => {
    assert.equal(holdingQueue(doc, ['p'], ['q'], buffering, down), null);
    assert.equal(holdingQueue(doc, ['q'], ['c'], buffering, new Set()), null);
  });
  it('does not hold for a queue that is in neither step', () => {
    assert.equal(holdingQueue(doc, ['c'], ['d'], buffering, down), null);
  });
});
