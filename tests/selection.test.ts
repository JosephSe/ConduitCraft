import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  normalizeSelection,
  resolveSelectionUpdate,
  selectionKey,
} from '../src/studio/selection.ts';
import type { SelectionTarget } from '../src/types.ts';

describe('selection controller', () => {
  it('keeps the current selection when the key does not change', () => {
    const current: SelectionTarget = { type: 'node', id: 'core' };
    const update = resolveSelectionUpdate(current, { type: 'node', id: 'core' });
    assert.equal(update.changed, false);
    assert.equal(update.selection, current);
  });

  it('copies multi-select ids and treats order as part of the key', () => {
    const ids = ['b', 'a'];
    const next = normalizeSelection({ type: 'multi', ids });
    ids.push('c');
    assert.deepEqual(next.ids, ['b', 'a']);
    assert.notEqual(selectionKey({ type: 'multi', ids: ['b', 'a'] }), selectionKey({ type: 'multi', ids: ['a', 'b'] }));
    const update = resolveSelectionUpdate({ type: 'node', id: 'a' }, { type: 'multi', ids: ['a', 'b'] });
    assert.equal(update.changed, true);
    assert.equal(selectionKey(update.selection), 'multi:a\u0000b');
  });

  it('collapses identical single targets and distinguishes kinds', () => {
    assert.equal(selectionKey({ type: 'edge', id: 'e1' }), 'edge:e1');
    assert.notEqual(selectionKey({ type: 'edge', id: 'e1' }), selectionKey({ type: 'node', id: 'e1' }));
    assert.equal(selectionKey({ type: 'none' }), 'none');
    const cleared = resolveSelectionUpdate({ type: 'zone', id: 'z' }, { type: 'none' });
    assert.equal(cleared.changed, true);
    assert.deepEqual(cleared.selection, { type: 'none' });
  });
});
