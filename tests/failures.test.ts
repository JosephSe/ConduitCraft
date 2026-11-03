import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { failedAncestor, failedIdsAt, failureKey, insideFailedComponent } from '../src/core/failures.ts';
import { nodesAtLevel } from '../src/core/levels.ts';
import { createBlankDocument, createNodeFromStencil } from '../src/templates/presets.ts';

describe('failures keyed by level (F-01 across F-03, D5)', () => {
  it('keeps the same id at different levels apart', () => {
    const keys = new Set([failureKey([], 'db'), failureKey(['pay'], 'db')]);
    assert.equal(keys.size, 2);
    assert.deepEqual(failedIdsAt(keys, []), ['db']);
    assert.deepEqual(failedIdsAt(keys, ['pay']), ['db']);
    assert.deepEqual(failedIdsAt(keys, ['other']), []);
  });

  it('lists only the failures directly on a level, not those deeper down', () => {
    const keys = new Set([failureKey([], 'pay'), failureKey(['pay'], 'ledger'), failureKey(['pay', 'ledger'], 'row')]);
    assert.deepEqual(failedIdsAt(keys, []), ['pay']);
    assert.deepEqual(failedIdsAt(keys, ['pay']), ['ledger']);
    assert.deepEqual(failedIdsAt(keys, ['pay', 'ledger']), ['row']);
  });

  it('does not confuse a path prefix with a longer id', () => {
    const keys = new Set([failureKey(['pay'], 'a'), failureKey(['payments'], 'b')]);
    assert.deepEqual(failedIdsAt(keys, ['pay']), ['a']);
  });

  it('finds the outermost failed ancestor, and none when only the level itself failed', () => {
    const keys = new Set([failureKey([], 'pay'), failureKey(['pay'], 'ledger')]);
    assert.deepEqual(failedAncestor(keys, ['pay', 'ledger']), { path: [], id: 'pay' });
    assert.equal(failedAncestor(new Set([failureKey(['pay'], 'ledger')]), ['pay']), null);
    assert.equal(failedAncestor(keys, []), null);
  });

  it('a failure inside a level never fails its parent', () => {
    const keys = new Set([failureKey(['pay'], 'ledger')]);
    assert.equal(failedAncestor(keys, []), null);
    assert.deepEqual(failedIdsAt(keys, []), []);
  });

  it('marks every component inside a failed one as failed, and nothing else', () => {
    const level = createBlankDocument();
    level.nodes = [0, 1].map((i) => ({ ...createNodeFromStencil('service', i * 100, 40, i), id: `n${i}` }));
    const result = insideFailedComponent(level);
    assert.deepEqual(result.failed, ['n0', 'n1']);
    assert.deepEqual([result.unreachable, result.rerouted, result.degraded, result.atRisk], [[], [], [], []]);
  });

  it('finds the components of a level, or null when the level is gone', () => {
    const root = createBlankDocument();
    const parent = { ...createNodeFromStencil('service', 0, 0, 0), id: 'pay' };
    const inner = { ...createNodeFromStencil('store', 0, 0, 1), id: 'db' };
    parent.child = { nodes: [inner], edges: [], zones: [], notesCards: [] };
    root.nodes = [parent];
    assert.deepEqual(nodesAtLevel(root, ['pay'])?.map((n) => n.id), ['db']);
    assert.equal(nodesAtLevel(root, ['gone']), null);
  });
});
