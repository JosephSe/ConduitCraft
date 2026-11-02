import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PINCH_ZOOM_PER_PX,
  WHEEL_ZOOM_PER_PX,
  isPanGesture,
  panForViewportResize,
  wheelPan,
  wheelZoomFactor,
} from '../src/studio/camera.ts';

const wheel = (deltaY: number, extra: Partial<Parameters<typeof wheelZoomFactor>[0]> = {}) => ({
  deltaX: 0,
  deltaY,
  deltaMode: 0,
  ctrlKey: false,
  ...extra,
});

describe('wheelZoomFactor', () => {
  it('zooms in when scrolling up and out when scrolling down', () => {
    assert.ok(wheelZoomFactor(wheel(-100)) > 1);
    assert.ok(wheelZoomFactor(wheel(100)) < 1);
    assert.equal(wheelZoomFactor(wheel(0)), 1);
  });

  it('keeps a 100px mouse-wheel notch at about the old fixed 1.08x step', () => {
    const factor = wheelZoomFactor(wheel(-100));
    assert.ok(Math.abs(factor - 1.08) < 0.005, `got ${factor}`);
  });

  it('is proportional: a tiny trackpad event barely moves the zoom, a larger one moves it more', () => {
    const small = wheelZoomFactor(wheel(-4));
    const large = wheelZoomFactor(wheel(-40));
    assert.ok(small > 1 && small < 1.005, `small ${small}`);
    assert.ok(large - 1 > 5 * (small - 1), 'ten times the travel should move the zoom several times as much');
  });

  it('is symmetric, so zooming in then out by the same travel returns to where it started', () => {
    assert.ok(Math.abs(wheelZoomFactor(wheel(-60)) * wheelZoomFactor(wheel(60)) - 1) < 1e-12);
  });

  it('zooms faster for a pinch (ctrl+wheel) than for the same raw delta on a plain wheel', () => {
    assert.ok(PINCH_ZOOM_PER_PX > WHEEL_ZOOM_PER_PX);
    assert.ok(wheelZoomFactor(wheel(-5, { ctrlKey: true })) > wheelZoomFactor(wheel(-5)));
  });

  it('caps one event so a hard flick cannot leap across the zoom range', () => {
    assert.equal(wheelZoomFactor(wheel(-5000)), wheelZoomFactor(wheel(-120)));
    assert.equal(wheelZoomFactor(wheel(5000)), wheelZoomFactor(wheel(120)));
  });

  it('treats line and page deltas as larger distances than pixels', () => {
    assert.ok(wheelZoomFactor(wheel(-3, { deltaMode: 1 })) > wheelZoomFactor(wheel(-3)));
  });
});

describe('pan gestures', () => {
  it('pans on mostly-sideways scrolling, and zooms otherwise', () => {
    assert.equal(isPanGesture({ deltaX: 40, deltaY: 3, ctrlKey: false }), true);
    assert.equal(isPanGesture({ deltaX: 0, deltaY: 40, ctrlKey: false }), false);
    assert.equal(isPanGesture({ deltaX: 3, deltaY: 40, ctrlKey: false }), false);
  });

  it('never treats a pinch as a pan', () => {
    assert.equal(isPanGesture({ deltaX: 40, deltaY: 3, ctrlKey: true }), false);
  });

  it('moves the content opposite the scroll delta', () => {
    assert.deepEqual(wheelPan({ deltaX: 30, deltaY: -10, deltaMode: 0, ctrlKey: false }), { dx: -30, dy: 10 });
  });
});

describe('panForViewportResize', () => {
  const pan = { panX: 100, panY: -40 };

  it('leaves the pan alone when the size does not change', () => {
    assert.deepEqual(panForViewportResize(pan, { width: 900, height: 600 }, { width: 900, height: 600 }), pan);
  });

  it('keeps the same world point at the centre when the viewport grows or shrinks', () => {
    const grown = panForViewportResize(pan, { width: 900, height: 600 }, { width: 1100, height: 700 });
    assert.deepEqual(grown, { panX: 200, panY: 10 });
    const shrunk = panForViewportResize(pan, { width: 900, height: 600 }, { width: 700, height: 500 });
    assert.deepEqual(shrunk, { panX: 0, panY: -90 });
  });

  it('is reversible: growing then shrinking back restores the pan', () => {
    const grown = panForViewportResize(pan, { width: 900, height: 600 }, { width: 1100, height: 700 });
    assert.deepEqual(panForViewportResize(grown, { width: 1100, height: 700 }, { width: 900, height: 600 }), pan);
  });

  it('keeps the world centre fixed at any zoom', () => {
    // world x under the viewport centre = (width / 2 - panX) / scale; it must not change.
    const scale = 0.5;
    const before = { width: 800, height: 500 };
    const after = { width: 1000, height: 700 };
    const next = panForViewportResize({ panX: 60, panY: 30 }, before, after);
    const worldBefore = [(before.width / 2 - 60) / scale, (before.height / 2 - 30) / scale];
    const worldAfter = [(after.width / 2 - next.panX) / scale, (after.height / 2 - next.panY) / scale];
    assert.deepEqual(worldAfter, worldBefore);
  });
});
