import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  NUDGE_COALESCE_MS,
  beginGesture,
  endGesture,
  initialHistoryGate,
  resolveHistoryPush,
} from '../src/studio/historyGesture.ts';

describe('undo grouping', () => {
  it('stores one snapshot for an open gesture and records again after it ends', () => {
    let gate = beginGesture(initialHistoryGate());
    const first = resolveHistoryPush(gate, { type: 'commit' });
    const second = resolveHistoryPush(first.gate, { type: 'commit' });
    assert.equal(first.capture, true);
    assert.equal(second.capture, false);

    gate = endGesture(second.gate);
    const third = resolveHistoryPush(gate, { type: 'commit' });
    assert.equal(third.capture, true);
    const idle = initialHistoryGate();
    assert.equal(endGesture(idle), idle);
  });

  it('keeps the outer gesture closed until every begin is matched', () => {
    let gate = beginGesture(beginGesture(initialHistoryGate()));
    gate = resolveHistoryPush(gate, { type: 'commit' }).gate;
    gate = endGesture(gate);
    assert.equal(resolveHistoryPush(gate, { type: 'commit' }).capture, false);
    gate = endGesture(gate);
    assert.equal(resolveHistoryPush(gate, { type: 'commit' }).capture, true);
  });

  it('coalesces arrow nudges inside the window and starts a new step after a commit', () => {
    const first = resolveHistoryPush(initialHistoryGate(), { type: 'nudge', now: 1_000 });
    const mid = resolveHistoryPush(first.gate, { type: 'nudge', now: 1_000 + NUDGE_COALESCE_MS - 1 });
    assert.equal(first.capture, true);
    assert.equal(mid.capture, false);
    assert.equal(mid.gate.coalesceUntil, 1_000 + NUDGE_COALESCE_MS - 1 + NUDGE_COALESCE_MS);

    const later = resolveHistoryPush(mid.gate, { type: 'nudge', now: mid.gate.coalesceUntil });
    assert.equal(later.capture, true);

    const commit = resolveHistoryPush(later.gate, { type: 'commit' });
    assert.equal(commit.capture, true);
    assert.equal(commit.gate.coalesceUntil, 0);
    const after = resolveHistoryPush(commit.gate, { type: 'nudge', now: later.gate.coalesceUntil + 1 });
    assert.equal(after.capture, true);
  });
});
