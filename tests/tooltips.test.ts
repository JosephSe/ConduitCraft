import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { placeTooltip, preferredPlacement } from '../src/studio/tooltips.ts';
import { readStudioCss } from './studioCss.ts';

const VIEWPORT = { width: 1000, height: 700 };
const TIP = { width: 200, height: 30 };

describe('tooltip placement', () => {
  it('centres below the anchor when there is room', () => {
    const anchor = { x: 400, y: 100, width: 100, height: 30 };
    const result = placeTooltip(anchor, TIP, VIEWPORT, 'bottom');
    assert.equal(result.placement, 'bottom');
    assert.equal(result.x, 350); // centred: 450 - 100
    assert.equal(result.y, 138); // below: 130 + 8
  });

  it('clamps horizontally instead of clipping at the left edge', () => {
    // A tooltip centred above an anchor hugging the left edge would start at x < 0.
    const anchor = { x: 14, y: 400, width: 114, height: 80 };
    const result = placeTooltip(anchor, TIP, VIEWPORT, 'top');
    assert.equal(result.placement, 'top');
    assert.ok(result.x >= 8, `x ${result.x} must stay inside the viewport margin`);
  });

  it('clamps horizontally instead of clipping at the right edge', () => {
    const anchor = { x: 912, y: 100, width: 80, height: 30 };
    const result = placeTooltip(anchor, TIP, VIEWPORT, 'bottom');
    assert.ok(result.x + TIP.width <= VIEWPORT.width - 8, 'right edge must stay inside the viewport');
  });

  it('flips to the opposite side when the preferred side has no room', () => {
    const nearBottom = { x: 400, y: 680, width: 100, height: 16 };
    assert.equal(placeTooltip(nearBottom, TIP, VIEWPORT, 'bottom').placement, 'top');
    const nearTop = { x: 400, y: 4, width: 100, height: 16 };
    assert.equal(placeTooltip(nearTop, TIP, VIEWPORT, 'top').placement, 'bottom');
  });

  it('flips a side placement when it would leave the viewport', () => {
    const nearRight = { x: 900, y: 300, width: 80, height: 30 };
    assert.equal(placeTooltip(nearRight, TIP, VIEWPORT, 'right').placement, 'left');
  });

  it('keeps vertical position inside the viewport for side placements', () => {
    const nearTop = { x: 500, y: 0, width: 40, height: 10 };
    const result = placeTooltip(nearTop, TIP, VIEWPORT, 'right');
    assert.ok(result.y >= 8 && result.y + TIP.height <= VIEWPORT.height - 8);
  });

  it('still returns an in-bounds position when the tooltip is wider than the viewport', () => {
    const result = placeTooltip({ x: 10, y: 10, width: 20, height: 20 }, { width: 2000, height: 30 }, VIEWPORT, 'bottom');
    assert.equal(result.x, 8);
  });
});

describe('preferred tooltip placement', () => {
  const fake = (attrs: Record<string, string>, closest: string[] = []) =>
    ({
      getAttribute: (name: string) => attrs[name] ?? null,
      closest: (selector: string) => (closest.includes(selector) ? {} : null),
    }) as unknown as Element;

  it('honours an explicit data-tip-pos', () => {
    assert.equal(preferredPlacement(fake({ 'data-tip-pos': 'top' })), 'top');
    assert.equal(preferredPlacement(fake({ 'data-tip-pos': 'left' })), 'left');
  });

  it('ignores unknown positions and defaults to below', () => {
    assert.equal(preferredPlacement(fake({ 'data-tip-pos': 'diagonal' })), 'bottom');
    assert.equal(preferredPlacement(fake({})), 'bottom');
  });

  it('points the collapsed inspector rail toward the canvas', () => {
    assert.equal(preferredPlacement(fake({}, ['.inspector-rail-content'])), 'left');
  });
});

describe('tooltip styles', () => {
  const css = readStudioCss();

  it('styles one shared layer above everything and drops the per-element pseudo-element tooltips', () => {
    assert.ok(css.includes('.tooltip-layer {'), 'defines the shared tooltip layer');
    assert.ok(css.includes('.tooltip-layer[data-visible="true"]'), 'defines its visible state');
    assert.ok(!css.includes('[data-tip]::after'), 'no per-element ::after tooltips remain');
  });

  it('keeps stencil cards positioned', () => {
    assert.ok(css.includes('.stencil-card {\n    position: relative;'));
  });
});
