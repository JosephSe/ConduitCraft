import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getNodeDimensions } from '../src/core/layout.ts';
import {
  nodeShapeContentPadding,
  pipePlate,
  queueDrawsPipe,
  renderPipePlate,
} from '../src/core/nodeStyle.ts';

describe('queue pipe outline (K1)', () => {
  it('queueDrawsPipe: queue with no shape or card; an explicit other shape wins; other kinds never', () => {
    assert.equal(queueDrawsPipe('queue', undefined), true);
    assert.equal(queueDrawsPipe('queue', 'card'), true);
    assert.equal(queueDrawsPipe('queue', 'hexagon'), false);
    assert.equal(queueDrawsPipe('queue', 'rounded'), false);
    assert.equal(queueDrawsPipe('store', undefined), false);
    assert.equal(queueDrawsPipe('bus', 'card'), false);
  });

  it('queue default size is 240 x 112', () => {
    assert.deepEqual(getNodeDimensions('queue'), { width: 240, height: 112 });
  });

  it('pipePlate numbers for 240 x 112', () => {
    const p = pipePlate(240, 112);
    assert.equal(p.width, 240);
    assert.equal(p.height, 112);
    // rx = clamp(6, 240 * 0.07 = 16.8, 16) = 16 ; ry = 112 / 2 - 1.5 = 54.5
    assert.equal(p.rx, 16);
    assert.equal(p.ry, 54.5);
    assert.equal(p.cx, 222.5);
    assert.equal(p.cy, 56);
    assert.match(p.body, /^M 17\.5,1\.5 L 222\.5,1\.5 A 16 54\.5 0 0 1 222\.5,110\.5 L 17\.5,110\.5 A 16 54\.5 0 0 1 17\.5,1\.5 Z$/);
  });

  it('pipePlate on a tiny 10 x 10 box has no negative radii', () => {
    const p = pipePlate(10, 10);
    assert.ok(p.rx > 0 && p.ry > 0, `rx ${p.rx} ry ${p.ry}`);
    for (const n of [p.rx, p.ry, p.cx, p.cy]) assert.ok(Number.isFinite(n));
  });

  it('renderPipePlate is an svg tagged as a pipe with a body and an outlet cap', () => {
    const svg = renderPipePlate(240, 112);
    assert.match(svg, /data-plate="pipe"/);
    assert.match(svg, /class="node-shape-geom pipe-body"/);
    assert.match(svg, /class="node-shape-geom pipe-cap"/);
    assert.match(svg, /aria-hidden="true"/);
  });

  it('content padding keeps the label inside the pipe', () => {
    const rx = pipePlate(240, 112).rx;
    assert.equal(
      nodeShapeContentPadding('queue', undefined, 240, 112),
      `${Math.round(112 * 0.14)}px ${Math.round(2 * rx + 12)}px ${Math.round(112 * 0.14)}px ${Math.round(rx + 12)}px`,
    );
    assert.equal(nodeShapeContentPadding('queue', 'hexagon', 240, 112) !== '', true);
  });
});
