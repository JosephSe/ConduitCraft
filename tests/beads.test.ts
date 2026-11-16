import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  BEAD_RUN_OUT,
  advanceBead,
  beadCount,
  beadSpeed,
  beadStart,
  beadVisible,
} from '../src/core/beads.ts';

describe('traffic beads', () => {
  it('carries about one bead per 300 px, at least one', () => {
    assert.strictEqual(beadCount(0), 1);
    assert.strictEqual(beadCount(120), 1);
    assert.strictEqual(beadCount(600), 2);
    assert.strictEqual(beadCount(1000), 3);
  });

  it('gives a two-way wire a bead each way', () => {
    assert.strictEqual(beadCount(120, true), 2);
    assert.strictEqual(beadCount(1000, true), 3);
  });

  it('runs sync at 150 px/s and async at 105 px/s, scaled by latency', () => {
    assert.strictEqual(beadSpeed(false), 150);
    assert.strictEqual(beadSpeed(true), 105);
    assert.strictEqual(beadSpeed(false, 2), 75);
    assert.strictEqual(beadSpeed(false, 0), 150);
  });

  it('spreads beads evenly along the wire', () => {
    const starts = [0, 1, 2].map((i) => beadStart(i, 3, 900, 'e'));
    assert.ok(Math.abs(starts[1] - starts[0] - 300) < 1e-9);
    assert.ok(Math.abs(starts[2] - starts[1] - 300) < 1e-9);
  });

  it('advances by speed x time and wraps after the run-out', () => {
    assert.strictEqual(advanceBead(0, 150, 1000, 400), 150);
    const loop = 400 + BEAD_RUN_OUT;
    assert.ok(Math.abs(advanceBead(loop - 10, 150, 100, 400) - 5) < 1e-9);
  });

  it('hides a bead while it is past the end of the wire', () => {
    assert.strictEqual(beadVisible(399, 400), true);
    assert.strictEqual(beadVisible(420, 400), false);
  });
});
