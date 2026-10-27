import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { pinchBaseline, pinchTransform } from '../src/studio/pinch.ts';

describe('pinch gestures', () => {
  it('pans when two pointers move together and zooms when they spread', () => {
    const start = pinchBaseline(1, 0, 0, { x: 50, y: 100 }, { x: 150, y: 100 });
    const panned = pinchTransform(start, { x: 80, y: 100 }, { x: 180, y: 100 }, 0.35, 1.9);
    assert.equal(panned.scale, 1);
    assert.equal(panned.panX, 30);
    assert.equal(panned.panY, 0);

    const zoomed = pinchTransform(start, { x: 0, y: 100 }, { x: 200, y: 100 }, 0.35, 4);
    assert.equal(zoomed.scale, 2);
    assert.equal(zoomed.panX, -100);
    assert.equal(zoomed.panY, -100);
    const worldX = (start.midX - start.panX) / start.scale;
    assert.equal(zoomed.panX + worldX * zoomed.scale, start.midX);
  });

  it('clamps the zoom to the studio range', () => {
    const start = pinchBaseline(1.5, 20, 10, { x: 0, y: 0 }, { x: 100, y: 0 });
    const zoomed = pinchTransform(start, { x: -50, y: 0 }, { x: 150, y: 0 }, 0.35, 1.9);
    assert.equal(zoomed.scale, 1.9);
    const shrunk = pinchTransform(start, { x: 40, y: 0 }, { x: 60, y: 0 }, 0.35, 1.9);
    assert.equal(shrunk.scale, 0.35);
  });
});
