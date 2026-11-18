import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { routeDiagramEdges } from '../src/core/layout.ts';
import { createBlankDocument, createNodeFromStencil } from '../src/templates/presets.ts';
import type { DiagramEdge } from '../src/types.ts';

const wire = (id: string, from: string, to: string, extra: Partial<DiagramEdge> = {}): DiagramEdge => ({
  id,
  from,
  to,
  sourcePort: 'auto',
  targetPort: 'auto',
  tone: 'blue',
  route: 'bezier',
  label: '',
  animated: false,
  ...extra,
});

describe('auto ports avoid other components', () => {
  // Three components stacked in one column, like Config Repo / Gate / Build in the CI/CD template.
  const column = () => {
    const doc = createBlankDocument();
    const top = createNodeFromStencil('store', 1180, 140, 0);
    const middle = createNodeFromStencil('gate', 1167, 430, 1);
    const bottom = createNodeFromStencil('service', 1177, 745, 2);
    doc.nodes.push(top, middle, bottom);
    return { doc, top, middle, bottom };
  };

  it('leaves the facing sides alone when nothing is in the way', () => {
    const { doc, middle, bottom } = column();
    doc.edges.push(wire('e1', middle.id, bottom.id));
    const [routed] = routeDiagramEdges(doc);
    assert.equal(routed.startPoint[1], middle.y + middle.height, 'leaves the bottom of the upper node');
    assert.equal(routed.endPoint[1], bottom.y, 'enters the top of the lower node');
  });

  it('picks other sides when the facing sides would run through a component', () => {
    const { doc, top, middle, bottom } = column();
    doc.edges.push(wire('e1', bottom.id, top.id));
    const [routed] = routeDiagramEdges(doc);
    const inMiddle = ([x, y]: [number, number]) =>
      x > middle.x && x < middle.x + middle.width && y > middle.y && y < middle.y + middle.height;
    assert.ok(routed.startPoint[1] !== bottom.y, 'no longer leaves the top of the lower node');
    assert.ok(!inMiddle(routed.startPoint) && !inMiddle(routed.endPoint));
    // Sample the drawn curve: it must stay clear of the middle node.
    const nums = routed.pathD.match(/-?\d+(\.\d+)?/g)!.map(Number);
    const [sx, sy, c1x, c1y, c2x, c2y, ex, ey] = nums;
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      const u = 1 - t;
      const p: [number, number] = [
        u * u * u * sx + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * ex,
        u * u * u * sy + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * ey,
      ];
      assert.ok(!inMiddle(p), `curve point ${p.map(Math.round)} is inside the middle node`);
    }
  });

  it('never moves an explicit port', () => {
    const { doc, top, bottom } = column();
    doc.edges.push(wire('e1', bottom.id, top.id, { sourcePort: 'top', targetPort: 'bottom' }));
    const [routed] = routeDiagramEdges(doc);
    assert.equal(routed.startPoint[1], bottom.y);
    assert.equal(routed.endPoint[1], top.y + top.height);
  });
});

describe('wires sharing a side get their own port', () => {
  it('spreads two wires that leave the same side, ordered by where they go', () => {
    const doc = createBlankDocument();
    const hub = createNodeFromStencil('service', 200, 400, 0);
    const upper = createNodeFromStencil('store', 700, 200, 1);
    const lower = createNodeFromStencil('store', 700, 600, 2);
    doc.nodes.push(hub, upper, lower);
    doc.edges.push(wire('a', hub.id, lower.id), wire('b', hub.id, upper.id));
    const routed = routeDiagramEdges(doc);
    const a = routed.find((e) => e.id === 'a')!;
    const b = routed.find((e) => e.id === 'b')!;
    assert.equal(a.startPoint[0], hub.x + hub.width);
    assert.equal(b.startPoint[0], hub.x + hub.width);
    assert.ok(b.startPoint[1] < a.startPoint[1], 'the wire to the upper node leaves higher up');
  });

  it('keeps a lone wire on the middle of its side', () => {
    const doc = createBlankDocument();
    const left = createNodeFromStencil('service', 200, 400, 0);
    const right = createNodeFromStencil('service', 700, 400, 1);
    doc.nodes.push(left, right);
    doc.edges.push(wire('a', left.id, right.id));
    const [routed] = routeDiagramEdges(doc);
    assert.equal(routed.startPoint[1], Math.round(left.y + left.height / 2));
  });
});

describe('wires meeting an actor on one side get their own port', () => {
  // Secure folder -> colleague -> H, both wires on the top of the actor (the head), as when uploads are drawn by hand.
  const relay = (route: DiagramEdge['route']) => {
    const doc = createBlankDocument();
    const folder = createNodeFromStencil('service', 80, 190, 0);
    const person = createNodeFromStencil('actor', 520, 190, 1);
    const tool = createNodeFromStencil('service', 860, 190, 2);
    doc.nodes.push(folder, person, tool);
    doc.edges.push(
      wire('in', folder.id, person.id, { route, sourcePort: 'top', targetPort: 'top' }),
      wire('out', person.id, tool.id, { route, sourcePort: 'top', targetPort: 'top' }),
    );
    const routed = routeDiagramEdges(doc);
    return { person, inbound: routed.find((e) => e.id === 'in')!, outbound: routed.find((e) => e.id === 'out')! };
  };

  for (const route of ['auto', 'over', 'orthogonal', 'step', 'bezier', 'straight'] as const) {
    it(`separates the incoming and outgoing ends on the head (${route})`, () => {
      const { person, inbound, outbound } = relay(route);
      const gap = outbound.startPoint[0] - inbound.endPoint[0];
      assert.ok(gap >= 12, `ends are ${gap}px apart`);
      // Ordered by where the far end sits: the wire from the left arrives on the left.
      const cx = person.x + person.width / 2;
      assert.ok(inbound.endPoint[0] < cx && outbound.startPoint[0] > cx);
      // Both stay on the head: within its radius of the centre line and at or below the top port.
      for (const [x, y] of [inbound.endPoint, outbound.startPoint]) {
        assert.ok(Math.abs(x - cx) < 12, `x ${x} is off the head`);
        assert.ok(y >= person.y + 4 && y <= person.y + 16, `y ${y} is off the top of the head`);
      }
    });
  }

  it('runs a loop into the actor and a loop out of it along one line, with a gap between them', () => {
    // Wires drawn port to port are `auto`; top to top makes each a loop over the components.
    const { inbound, outbound } = relay('auto');
    const runY = (pathD: string) => Number(pathD.match(/Q \S+ (-?\d+)/)![1]);
    assert.equal(runY(inbound.pathD), runY(outbound.pathD));
    assert.ok(outbound.startPoint[0] - inbound.endPoint[0] >= 12);
  });

  it('still steps a loop up past another over the same stretch', () => {
    const doc = createBlankDocument();
    const a = createNodeFromStencil('service', 80, 190, 0);
    const b = createNodeFromStencil('service', 860, 190, 1);
    const c = createNodeFromStencil('service', 1300, 190, 2);
    doc.nodes.push(a, b, c);
    doc.edges.push(wire('ab', a.id, b.id, { route: 'over' }), wire('ac', a.id, c.id, { route: 'over' }));
    const [ab, ac] = routeDiagramEdges(doc);
    const runY = (pathD: string) => Number(pathD.match(/Q \S+ (-?\d+)/)![1]);
    assert.ok(Math.abs(runY(ab.pathD) - runY(ac.pathD)) >= 20);
  });

  it('keeps a lone wire on the top of the head', () => {
    const doc = createBlankDocument();
    const folder = createNodeFromStencil('service', 80, 190, 0);
    const person = createNodeFromStencil('actor', 520, 190, 1);
    doc.nodes.push(folder, person);
    doc.edges.push(wire('in', folder.id, person.id, { route: 'orthogonal', sourcePort: 'top', targetPort: 'top' }));
    const [routed] = routeDiagramEdges(doc);
    assert.deepEqual(routed.endPoint, [Math.round(person.x + person.width / 2), person.y + 4]);
  });
});
