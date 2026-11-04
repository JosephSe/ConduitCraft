import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { setAccent, setKind, setShape } from '../src/core/appearance.ts';
import { createNodeFromStencil } from '../src/templates/presets.ts';

const make = (n: number) => [0, 1, 2].map((i) => createNodeFromStencil('service', 100 + i * 300, 100, n + i));

describe('appearance changes on several components', () => {
  it('recolours all and reports a change only when one happened', () => {
    const nodes = make(0);
    assert.equal(setAccent(nodes, 'rose'), true);
    assert.deepEqual(nodes.map((n) => n.accent), ['rose', 'rose', 'rose']);
    assert.equal(setAccent(nodes, 'rose'), false, 'already that colour');
  });

  it('changes the kind, resizes, and keeps the centre', () => {
    const [a] = make(3);
    const cx = a.x + a.width / 2;
    const cy = a.y + a.height / 2;
    assert.equal(setKind([a], 'store'), true);
    assert.equal(a.kind, 'store');
    assert.ok(Math.abs(a.x + a.width / 2 - cx) <= 1);
    assert.ok(Math.abs(a.y + a.height / 2 - cy) <= 1);
    assert.equal(setKind([a], 'store'), false);
  });

  it('sets a shape, and "card" clears it', () => {
    const nodes = make(6);
    assert.equal(setShape(nodes, 'hexagon'), true);
    assert.ok(nodes.every((n) => n.shape === 'hexagon'));
    assert.equal(setShape(nodes, 'hexagon'), false);
    assert.equal(setShape(nodes, 'card'), true);
    assert.ok(nodes.every((n) => n.shape === undefined));
  });

  it('handles an empty selection', () => {
    assert.equal(setAccent([], 'blue'), false);
  });
});
