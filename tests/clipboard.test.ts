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

describe('clipboard of stage containers', () => {
  const frame = (id: string, extra: object = {}) => ({ id, title: id, x: 50, y: 50, width: 600, height: 300, tone: 'blue', ...extra });
  const zone = { id: 'z1', number: '1', title: 'Edge', subtitle: '', x: 0, width: 300 };
  const note = { id: 'n1', title: 'Note', code: 'N1', x: 80, y: 80, items: [] };

  it('round-trips swimlanes, frames and notes, even with no components', () => {
    const { text } = serializeClip([], [], { zones: [zone], frames: [frame('f1') as never], notes: [note as never] });
    const parsed = parseClip(text);
    assert.ok(parsed.ok);
    if (!parsed.ok) return;
    assert.equal(parsed.clip.nodes.length, 0);
    assert.equal(parsed.clip.zones?.length, 1);
    assert.equal(parsed.clip.frames?.length, 1);
    assert.equal(parsed.clip.notes?.length, 1);
  });

  it('refuses a damaged frame', () => {
    const r = parseClip('{"conduitcraft": 1, "nodes": [], "frames": [{"id": "f"}]}');
    assert.ok(!r.ok && r.reason === 'invalid');
  });

  it('re-ids a frame, keeps its components and inner frames inside the copy, and drops a lost parent', () => {
    const ns = nodes();
    ns[0].frameId = 'f1';
    ns[1].frameId = 'outside';
    const clip = {
      nodes: ns,
      edges: [],
      frames: [frame('f1', { locked: true }), frame('f2', { parentId: 'f1' }), frame('f3', { parentId: 'gone' })] as never[],
      droppedImages: false,
    };
    const out = materializeClip(clip, [], newId);
    const [f1, f2, f3] = out.frames;
    assert.notEqual(f1.id, 'f1');
    assert.equal(f2.parentId, f1.id);
    assert.equal(f3.parentId, undefined);
    assert.equal(f1.locked, undefined, 'a copy starts unlocked');
    assert.equal(out.nodes[0].frameId, f1.id);
    assert.equal(out.nodes[1].frameId, undefined, 'a component whose frame was not copied is no longer owned');
  });

  it('puts a copied swimlane beside the one it came from', () => {
    const out = materializeClip({ nodes: [], edges: [], zones: [zone], droppedImages: false }, [], newId, 32, [0]);
    assert.equal(out.zones[0].x, 324);
    assert.notEqual(out.zones[0].id, 'z1');
  });

  it('moves copied frames and notes off the originals', () => {
    const out = materializeClip(
      { nodes: [], edges: [], frames: [frame('f1') as never], notes: [note as never], droppedImages: false },
      [{ x: 50, y: 50 }],
      newId,
    );
    assert.equal(out.frames[0].x, 82);
    assert.equal(out.notes[0].x, 112);
  });
});
