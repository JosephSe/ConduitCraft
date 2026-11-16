import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { roughEllipsePath, seededRandom } from '../src/core/roughen.ts';

describe('roughen', () => {
  it('gives the same numbers for the same seed', () => {
    const a = seededRandom('api');
    const b = seededRandom('api');
    assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
  });

  it('draws the same ellipse every time, and a different one for another seed', () => {
    const one = roughEllipsePath(100, 80, 60, 40, 'node-a');
    assert.equal(one, roughEllipsePath(100, 80, 60, 40, 'node-a'));
    assert.notEqual(one, roughEllipsePath(100, 80, 60, 40, 'node-b'));
  });

  it('stays near the requested size', () => {
    const d = roughEllipsePath(0, 0, 50, 30, 'x');
    const nums = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
    const xs = nums.filter((_, i) => i % 2 === 0);
    assert.ok(Math.max(...xs.map(Math.abs)) < 50 * 1.3);
    assert.match(d, /^M /);
  });
});
