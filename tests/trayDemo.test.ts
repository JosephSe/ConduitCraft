import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { STENCIL_CATALOG } from '../src/templates/presets.ts';
import { BEHAVIOUR_NAMES, DESCRIPTIONS, behaviourOf } from '../src/studio/trayDemo.ts';

describe('tray demo pane (7.3)', () => {
  it('has seven loops, and every component that acts on traffic runs one', () => {
    assert.equal(BEHAVIOUR_NAMES.length, 7);
    for (const stencil of STENCIL_CATALOG) {
      const name = behaviourOf(stencil.id);
      assert.ok(name && BEHAVIOUR_NAMES.includes(name), `${stencil.id} has a loop`);
    }
  });

  it('puts the components in the behaviours the plan names', () => {
    const group = (name: string) => STENCIL_CATALOG.filter((s) => behaviourOf(s.id) === name).map((s) => s.id).sort();
    assert.deepEqual(group('starts'), ['actor', 'client', 'scheduler']);
    assert.deepEqual(group('passes'), ['core', 'gate', 'service']);
    assert.deepEqual(group('spreads'), ['balancer', 'bus', 'stream']);
    assert.deepEqual(group('limits'), ['limiter']);
    assert.deepEqual(group('answers'), ['cache']);
    assert.deepEqual(group('holds'), ['queue']);
    assert.deepEqual(group('keeps'), ['object-store', 'store']);
  });

  it('structure items run no loop, and every item has a line about it', () => {
    for (const id of ['zone', 'frame', 'notes', 'text']) assert.equal(behaviourOf(id), undefined, id);
    for (const id of [...STENCIL_CATALOG.map((s) => s.id), 'zone', 'frame', 'notes', 'text']) {
      assert.ok(DESCRIPTIONS[id] && DESCRIPTIONS[id].length > 10, `${id} has a description`);
    }
  });

  it('is still under reduced motion: the end states are drawn, and the loop is not', () => {
    const css = readFileSync(new URL('../src/styles/studio/unlayered.css', import.meta.url), 'utf8');
    assert.match(css, /\.tray-demo\.is-still \.cap \{ animation: none;/);
    for (const name of ['lead', 'through', 'in', 'fan', 'turn', 'hold-0', 'hold-1', 'hold-2', 'keep']) {
      assert.match(css, new RegExp(`@keyframes k-${name} `), `k-${name} exists`);
    }
  });
});
