import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STENCIL_CATALOG } from '../src/templates/presets.ts';
import { cylinderPlate, nodeShapePlate, pipePlate } from '../src/core/nodeStyle.ts';
import { ACTOR_FIGURE } from '../src/ui/icons.ts';
import { CUTOUT_HEIGHT, CUTOUT_STROKE, CUTOUT_WIDTH, cutoutDrawing, renderCutoutMarkup } from '../src/ui/cutout.ts';

describe('cut-outs', () => {
  it('gives every stencil a 38 by 30 outline with a 1.4 stroke and no fill', () => {
    assert.ok(STENCIL_CATALOG.length > 0);
    for (const stencil of STENCIL_CATALOG) {
      const markup = renderCutoutMarkup(stencil);
      assert.ok(markup.startsWith('<svg'), stencil.id);
      assert.ok(markup.includes(`viewBox="0 0 ${CUTOUT_WIDTH} ${CUTOUT_HEIGHT}"`), stencil.id);
      assert.ok(markup.includes(`stroke-width="${CUTOUT_STROKE}"`), stencil.id);
      assert.ok(markup.includes('fill="none"'), stencil.id);
      assert.equal(markup.includes('fill="#'), false, stencil.id);
      assert.ok(/<(?:path|rect|ellipse|circle|polygon) /.test(markup), stencil.id);
    }
  });

  it('uses the canvas pipe, drum, trapezoid and figure', () => {
    const queue = STENCIL_CATALOG.find((s) => s.id === 'queue');
    const stream = STENCIL_CATALOG.find((s) => s.id === 'stream');
    const store = STENCIL_CATALOG.find((s) => s.id === 'store');
    const bucket = STENCIL_CATALOG.find((s) => s.id === 'object-store');
    const balancer = STENCIL_CATALOG.find((s) => s.id === 'balancer');
    const actor = STENCIL_CATALOG.find((s) => s.id === 'actor');
    assert.ok(queue && stream && store && bucket && balancer && actor);

    const queuePipe = pipePlate(240, 112, 0);
    assert.equal(cutoutDrawing(queue).inner.includes(queuePipe.body), true);
    assert.equal(cutoutDrawing(queue).inner.includes('cutout-mark" d="'), false);

    const streamPipe = pipePlate(240, 112, 3);
    assert.equal(cutoutDrawing(stream).inner.includes(streamPipe.body), true);
    assert.equal(cutoutDrawing(stream).inner.includes(streamPipe.lanes), true);

    assert.equal(cutoutDrawing(store).inner.includes(cylinderPlate(216, 150, false).body), true);
    assert.equal(cutoutDrawing(bucket).inner.includes(cylinderPlate(216, 150, true).body), true);
    assert.notEqual(cutoutDrawing(store).inner, cutoutDrawing(bucket).inner);

    const trap = nodeShapePlate('trapezoid', 200, 120, 'LR');
    assert.equal(trap?.kind, 'polygon');
    if (trap?.kind === 'polygon') assert.equal(cutoutDrawing(balancer).inner.includes(trap.points), true);

    assert.equal(cutoutDrawing(actor).inner.includes(ACTOR_FIGURE.body), true);
    assert.equal(cutoutDrawing(actor).kind, 'figure');
  });

  it('draws a hexagon from the same plate as the sheet', () => {
    const plate = nodeShapePlate('hexagon', 222, 142, 'LR');
    assert.equal(plate?.kind, 'polygon');
    const drawing = cutoutDrawing({ kind: 'service', shape: 'hexagon' });
    if (plate?.kind === 'polygon') assert.equal(drawing.inner.includes(plate.points), true);
    assert.equal(drawing.kind, 'hexagon');
  });

  it('grows a carried copy in the source box, and the studio paints cut-outs in the chrome', () => {
    const carried = renderCutoutMarkup({ kind: 'service' }, { carried: true });
    assert.match(carried, /class="cutout is-carried"/);
    assert.match(carried, /viewBox="0 0 222 142"/);
    const tray = readFileSync(new URL('../src/studio/tray.ts', import.meta.url), 'utf8');
    assert.match(tray, /renderCutoutMarkup\(stencil\)/);
    const css = readFileSync(new URL('../src/styles/studio/ui.css', import.meta.url), 'utf8');
    assert.match(css, /translateY\(-4px\) scale\(1\.12\)/);
    assert.match(css, /\.cut\.is-empty/);
    assert.match(css, /color-mix\(in oklab, var\(--t, var\(--cc-blue\)\) 13%, var\(--cc-sheet\)\)/);
  });

  it('puts the kind icon inside card outlines only, so cards can be told apart (Q10)', () => {
    for (const id of ['service', 'core', 'cache', 'scheduler', 'bus', 'limiter']) {
      const stencil = STENCIL_CATALOG.find((s) => s.id === id)!;
      const markup = renderCutoutMarkup(stencil);
      if (/data-cutout="card"/.test(markup)) assert.match(markup, /class="cutout-icon"/, `${id} shows its icon`);
    }
    const cards = STENCIL_CATALOG.filter((s) => /data-cutout="card"/.test(renderCutoutMarkup(s)));
    assert.ok(cards.length >= 4, 'several kinds are cards');
    const marks = new Set(cards.map((s) => renderCutoutMarkup(s)));
    assert.equal(marks.size, cards.length, 'no two card cut-outs are the same drawing');
    for (const id of ['actor', 'store', 'queue', 'balancer']) {
      const stencil = STENCIL_CATALOG.find((s) => s.id === id)!;
      assert.doesNotMatch(renderCutoutMarkup(stencil), /cutout-icon/, `${id} has its own outline and no mark`);
    }
    assert.doesNotMatch(renderCutoutMarkup(cards[0], { carried: true }), /cutout-icon/, 'a carried copy grows into the node, which has its own icon');
  });
});
