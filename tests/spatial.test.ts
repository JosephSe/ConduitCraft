import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { nearestInDirection } from '../src/core/spatial.ts';

const me = { id: 'me', x: 100, y: 100 };

describe('nearestInDirection', () => {
  it('picks the nearest candidate strictly ahead', () => {
    const others = [
      { id: 'near', x: 200, y: 100 },
      { id: 'far', x: 400, y: 100 },
      { id: 'behind', x: 0, y: 100 },
    ];
    assert.equal(nearestInDirection(me, others, 'right'), 'near');
    assert.equal(nearestInDirection(me, others, 'left'), 'behind');
  });

  it('prefers a straight neighbour over a closer diagonal one', () => {
    const others = [
      { id: 'diagonal', x: 160, y: 220 },
      { id: 'straight', x: 100, y: 260 },
    ];
    assert.equal(nearestInDirection(me, others, 'down'), 'straight');
  });

  it('returns null when nothing lies that way, and ignores itself', () => {
    assert.equal(nearestInDirection(me, [me, { id: 'a', x: 50, y: 100 }], 'right'), null);
    assert.equal(nearestInDirection(me, [], 'up'), null);
  });
});
