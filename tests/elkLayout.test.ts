import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { applyElkPlan, planElkLayout } from '../src/core/elkLayout.ts';
import { parseBlueprintJson } from '../src/exporter/blueprintJson.ts';
import type { DiagramDocument } from '../src/types.ts';

const dir = new URL('../src/examples/', import.meta.url);
const load = (name: string): DiagramDocument => {
  const parsed = parseBlueprintJson(readFileSync(new URL(name, dir), 'utf8'));
  assert.ok(parsed.ok, `${name} parses`);
  return parsed.doc as DiagramDocument;
};
const examples = readdirSync(dir).filter((f) => f.endsWith('.blueprint.json'));

type Node = DiagramDocument['nodes'][number];
const overlap = (a: Node, b: Node) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** Lumen Relay with every component inside a swimlane (the lanes are spelt out so the test does not hang on the file). */
function lumenRelayInLanes(): DiagramDocument {
  const doc = load('lumen-relay.blueprint.json');
  const lanes: Record<string, [number, number]> = {
    'zone-intake': [16, 186], 'zone-desk': [206, 918], 'zone-relay': [1128, 968], 'zone-ledger': [2100, 700],
  };
  for (const z of doc.zones) if (lanes[z.id]) [z.x, z.width] = lanes[z.id];
  return doc;
}

async function arrange(doc: DiagramDocument, options?: Parameters<typeof planElkLayout>[1]) {
  const plan = await planElkLayout(doc, options);
  assert.ok(plan);
  const applied = applyElkPlan(doc, plan);
  return { plan, moved: applied.components + applied.zones, applied };
}

describe('layered (ELK) layout', () => {
  it('arranges every bundled example with no two components on top of each other', async () => {
    assert.ok(examples.length >= 6);
    for (const name of examples) {
      const doc = load(name);
      await arrange(doc);
      for (let i = 0; i < doc.nodes.length; i++) {
        assert.ok(Number.isFinite(doc.nodes[i].x) && Number.isFinite(doc.nodes[i].y), `${name}: finite position`);
        assert.ok(doc.nodes[i].x >= 0 && doc.nodes[i].y >= 0, `${name}: on the stage`);
        for (let j = i + 1; j < doc.nodes.length; j++) {
          assert.ok(!overlap(doc.nodes[i], doc.nodes[j]), `${name}: ${doc.nodes[i].title} and ${doc.nodes[j].title} overlap`);
        }
      }
    }
  });

  it('flows left to right, so most wires run forward', async () => {
    const doc = load('three-tier-web.blueprint.json');
    await arrange(doc, { direction: 'LR' });
    const at = new Map(doc.nodes.map((n) => [n.id, n]));
    const forward = doc.edges.filter((e) => at.get(e.from)!.x < at.get(e.to)!.x).length;
    assert.ok(forward >= doc.edges.length * 0.7, `${forward} of ${doc.edges.length} wires run forward`);
    assert.equal(doc.direction, 'LR');
  });

  it('flows top to bottom when asked', async () => {
    const doc = load('three-tier-web.blueprint.json');
    await arrange(doc, { direction: 'TD' });
    const at = new Map(doc.nodes.map((n) => [n.id, n]));
    const down = doc.edges.filter((e) => at.get(e.from)!.y < at.get(e.to)!.y).length;
    assert.ok(down >= doc.edges.length * 0.7, `${down} of ${doc.edges.length} wires run down`);
    assert.equal(doc.direction, 'TD');
  });

  it('leaves locked components exactly where they are', async () => {
    const doc = load('three-tier-web.blueprint.json');
    const locked = doc.nodes[1];
    locked.locked = true;
    const before = { x: locked.x, y: locked.y, w: locked.width, h: locked.height };
    await arrange(doc);
    assert.deepEqual({ x: locked.x, y: locked.y, w: locked.width, h: locked.height }, before);
  });

  it('does nothing when every component is locked', async () => {
    const doc = load('three-tier-web.blueprint.json');
    for (const n of doc.nodes) n.locked = true;
    assert.equal(await planElkLayout(doc), null);
  });

  it('accepts wires with fixed ends', async () => {
    const doc = load('three-tier-web.blueprint.json');
    const wire = doc.edges.find((e) => e.from !== e.to)!;
    wire.sourcePort = 'bottom';
    wire.targetPort = 'top';
    const { plan } = await arrange(doc, { direction: 'LR' });
    assert.ok(plan.positions.has(wire.from) && plan.positions.has(wire.to));
  });

  it('keeps zones running left to right', async () => {
    const doc = load('three-tier-web.blueprint.json');
    const zones = [...doc.zones].sort((a, b) => a.x - b.x);
    assert.ok(zones.length >= 2, 'the example has zones');
    const zoneIndex = (n: Node) => zones.findIndex((z) => n.x + n.width / 2 >= z.x && n.x + n.width / 2 < z.x + z.width);
    const before = new Map(doc.nodes.map((n) => [n.id, zoneIndex(n)]));
    await arrange(doc, { direction: 'LR' });
    const ordered = [...doc.nodes].sort((a, b) => before.get(a.id)! - before.get(b.id)!);
    for (let i = 1; i < ordered.length; i++) {
      if (before.get(ordered[i].id)! > before.get(ordered[i - 1].id)!) {
        assert.ok(ordered[i].x >= ordered[i - 1].x, `${ordered[i].title} stays right of ${ordered[i - 1].title}`);
      }
    }
  });

  it('is stable: arranging an arranged diagram changes nothing', async () => {
    const doc = load('cicd-pipeline.blueprint.json');
    await arrange(doc);
    const { moved } = await arrange(doc);
    assert.equal(moved, 0);
  });

  it('keeps every component inside its swimlane, so arranging a zoned diagram twice changes nothing', async () => {
    // This used to drift: the components were laid out from the left edge while the lanes stayed put, so the next
    // run found them in other lanes and moved them again.
    const doc = lumenRelayInLanes();
    const zones = [...doc.zones].sort((a, b) => a.x - b.x);
    const laneOf = (n: Node) => zones.find((z) => n.x + n.width / 2 >= z.x && n.x + n.width / 2 < z.x + z.width)?.id;
    const before = new Map(doc.nodes.map((n) => [n.id, laneOf(n)]));
    assert.ok([...before.values()].every(Boolean), 'every component starts in a lane');

    const { plan, moved } = await arrange(doc, { direction: 'LR' });
    assert.ok(moved > 0);
    assert.ok(plan.zones, 'the plan places the lanes too');
    for (const n of doc.nodes) {
      const lane = doc.zones.find((z) => z.id === before.get(n.id))!;
      assert.ok(n.x >= lane.x && n.x + n.width <= lane.x + lane.width, `${n.title} sits wholly inside ${lane.title}`);
    }
    const ordered = [...doc.zones].sort((a, b) => a.x - b.x);
    for (let i = 1; i < ordered.length; i++) {
      assert.ok(ordered[i].x >= ordered[i - 1].x + ordered[i - 1].width, `${ordered[i].title} does not overlap ${ordered[i - 1].title}`);
    }

    const again = await arrange(doc, { direction: 'LR' });
    assert.equal(again.moved, 0);
  });

  it('leaves a locked swimlane where it is', async () => {
    const doc = lumenRelayInLanes();
    const desk = doc.zones.find((z) => z.id === 'zone-desk')!;
    desk.locked = true;
    await arrange(doc, { direction: 'LR' });
    assert.deepEqual([desk.x, desk.width], [206, 918]);
  });
});
