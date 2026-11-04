import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IMAGE_LIMIT_CHARS, serializeClip } from '../src/core/clipboard.ts';
import { materializeClip, parseClip } from '../src/core/clipboardPaste.ts';
import { createNodeFromStencil } from '../src/templates/presets.ts';
import type { DiagramEdge } from '../src/types.ts';

const nodes = () => [createNodeFromStencil('service', 100, 100, 0), createNodeFromStencil('store', 400, 100, 1)];
const wire = (from: string, to: string): DiagramEdge =>
  ({ id: 'w1', from, to, sourcePort: 'auto', targetPort: 'auto', tone: 'blue', route: 'auto', label: 'reads', animated: true }) as DiagramEdge;
let n = 0;
const newId = (p: string) => `${p}-new-${++n}`;

describe('clipboard text', () => {
  it('round-trips two connected components', () => {
    const ns = nodes();
    const { text } = serializeClip(ns, [wire(ns[0].id, ns[1].id), wire(ns[0].id, 'outside')]);
    const parsed = parseClip(text);
    assert.ok(parsed.ok);
    if (!parsed.ok) return;
    assert.equal(parsed.clip.nodes.length, 2);
    assert.equal(parsed.clip.edges.length, 1, 'a wire to something not copied is left out');
    assert.equal(parsed.clip.edges[0].label, 'reads');
  });

  it('gives pasted components new ids, wires follow, and nothing in the target is overwritten', () => {
    const ns = nodes();
    const clip = { nodes: ns, edges: [wire(ns[0].id, ns[1].id)], droppedImages: false };
    const target = structuredClone(ns);
    const out = materializeClip(clip, target, newId);
    assert.equal(out.nodes.length, 2);
    for (const c of out.nodes) assert.ok(!ns.some((o) => o.id === c.id));
    assert.equal(out.edges[0].from, out.nodes[0].id);
    assert.equal(out.edges[0].to, out.nodes[1].id);
    assert.notEqual(out.edges[0].id, 'w1');
    assert.equal(out.nodes[0].x, ns[0].x + 32, 'moved off the originals');
    assert.equal(out.nodes[0].y, ns[0].y + 32);
  });

  it('pastes in place when the target has nothing there', () => {
    const ns = nodes();
    const out = materializeClip({ nodes: ns, edges: [], droppedImages: false }, [], newId);
    assert.equal(out.nodes[0].x, ns[0].x);
  });

  it('ignores plain text quietly', () => {
    const r = parseClip('hello world');
    assert.ok(!r.ok && r.reason === 'not-ours');
  });

  it('refuses broken or hostile input with a message', () => {
    for (const text of [
      '{"conduitcraft": 1, "nodes": [',
      '{"conduitcraft": 2, "nodes": [{}]}',
      '{"conduitcraft": 1, "nodes": []}',
      '{"conduitcraft": 1, "nodes": [{"id": "a"}]}',
      '{"conduitcraft": 1, "nodes": "x"}',
    ]) {
      const r = parseClip(text);
      assert.ok(!r.ok && r.reason === 'invalid', text);
      assert.ok(r.message.length > 0);
    }
    const big = JSON.stringify({ conduitcraft: 1, nodes: Array.from({ length: 501 }, () => nodes()[0]) });
    assert.ok(!parseClip(big).ok);
  });

  it('leaves embedded pictures out when the copy is over the limit', () => {
    const ns = nodes();
    ns[0].iconImage = 'data:image/png;base64,' + 'A'.repeat(IMAGE_LIMIT_CHARS);
    const { text, droppedImages } = serializeClip(ns, []);
    assert.equal(droppedImages, true);
    assert.ok(!text.includes('data:image'));
    const small = nodes();
    small[0].iconImage = 'data:image/png;base64,AAAA';
    assert.equal(serializeClip(small, []).droppedImages, false);
  });
});
