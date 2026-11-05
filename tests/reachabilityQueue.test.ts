import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { reachableFrom } from '../src/core/reachability.ts';
import { createBlankDocument, createNodeFromStencil } from '../src/templates/presets.ts';
import { entryPointIds } from '../src/core/reachability.ts';
import { parseBlueprintJson } from '../src/exporter/blueprintJson.ts';
import { getStarterTemplateById, loadTemplateRaw } from '../src/studio/templatesGallery.ts';
import type { DiagramDocument, DiagramEdge, DiagramNode, NodeKind } from '../src/types.ts';

function build(
  kinds: Record<string, NodeKind>,
  wires: Array<[string, string, Partial<DiagramEdge>?]>,
  patch: Record<string, Partial<DiagramNode>> = {},
): DiagramDocument {
  const doc = createBlankDocument();
  doc.nodes = Object.entries(kinds).map(([id, kind], i) => ({
    ...createNodeFromStencil(kind, i * 100, 40, i),
    id,
    ...patch[id],
  }));
  doc.edges = wires.map(([from, to, extra], i) => ({
    id: `w${i}`,
    from,
    to,
    sourcePort: 'right',
    targetPort: 'left',
    tone: 'blue',
    route: 'straight',
    label: '',
    animated: false,
    ...extra,
  }));
  return doc;
}

describe('chaos: queues buffer instead of failing the producer (K1, spec 3.3)', () => {
  it('U > P > Q > C > D, fail C: the queue buffers and D is delayed', () => {
    const doc = build({ U: 'actor', P: 'service', Q: 'queue', C: 'service', D: 'store' }, [
      ['U', 'P'], ['P', 'Q'], ['Q', 'C'], ['C', 'D'],
    ]);
    const r = reachableFrom(doc, ['U'], ['C']);
    assert.deepEqual(r.failed, ['C']);
    assert.deepEqual(r.buffering, ['Q']);
    assert.deepEqual(r.delayed, ['D']);
    assert.deepEqual(r.atRisk, []);
    assert.deepEqual(r.unreachable, []);
  });

  it('without a queue the old behaviour is unchanged', () => {
    const doc = build({ U: 'actor', P: 'service', C: 'service', D: 'store' }, [['U', 'P'], ['P', 'C'], ['C', 'D']]);
    const r = reachableFrom(doc, ['U'], ['C']);
    assert.deepEqual(r.failed, ['C']);
    assert.deepEqual(r.atRisk, ['P']);
    assert.deepEqual(r.unreachable, ['D']);
    assert.deepEqual(r.buffering, []);
    assert.deepEqual(r.delayed, []);
  });

  it('with two consumers and one down, the queue keeps flowing and the other consumer is rerouted', () => {
    const doc = build({ U: 'actor', P: 'service', Q: 'queue', C1: 'service', C2: 'service' }, [
      ['U', 'P'], ['P', 'Q'], ['Q', 'C1'], ['Q', 'C2'],
    ]);
    const r = reachableFrom(doc, ['U'], ['C1']);
    assert.deepEqual(r.failed, ['C1']);
    assert.deepEqual(r.rerouted, ['C2']);
    assert.deepEqual(r.buffering, []);
  });

  it('with every consumer down, the queue buffers', () => {
    const doc = build({ U: 'actor', P: 'service', Q: 'queue', C1: 'service', C2: 'service' }, [
      ['U', 'P'], ['P', 'Q'], ['Q', 'C1'], ['Q', 'C2'],
    ]);
    const r = reachableFrom(doc, ['U'], ['C1', 'C2']);
    assert.deepEqual(r.buffering, ['Q']);
  });

  it('a consumer with a live fallback is not down, so the queue does not buffer', () => {
    const doc = build(
      { U: 'actor', P: 'service', Q: 'queue', C: 'service', C2: 'service' },
      [['U', 'P'], ['P', 'Q'], ['Q', 'C']],
      { C: { resilience: { fallbackId: 'C2' } } },
    );
    const r = reachableFrom(doc, ['U'], ['C']);
    assert.deepEqual(r.buffering, []);
    assert.deepEqual(r.rerouted, ['C2']);
  });

  it('a failed single queue behaves like any failed component', () => {
    const doc = build({ U: 'actor', P: 'service', Q: 'queue', C: 'service' }, [['U', 'P'], ['P', 'Q'], ['Q', 'C']]);
    const r = reachableFrom(doc, ['U'], ['Q']);
    assert.deepEqual(r.failed, ['Q']);
    assert.deepEqual(r.atRisk, ['P']);
    assert.deepEqual(r.unreachable, ['C']);
    assert.deepEqual(r.buffering, []);
  });

  it('a failed queue with replicas is degraded and nothing else changes', () => {
    const doc = build(
      { U: 'actor', P: 'service', Q: 'queue', C: 'service' },
      [['U', 'P'], ['P', 'Q'], ['Q', 'C']],
      { Q: { resilience: { replicas: 3 } } },
    );
    const r = reachableFrom(doc, ['U'], ['Q']);
    assert.deepEqual(r.degraded, ['Q']);
    assert.deepEqual(r.failed, []);
    assert.deepEqual(r.atRisk, []);
    assert.deepEqual(r.unreachable, []);
    assert.deepEqual(r.buffering, []);
  });

  it('a component that is still reachable another way is rerouted, not delayed', () => {
    const doc = build({ U: 'actor', P: 'service', Q: 'queue', C: 'service', D: 'store' }, [
      ['U', 'P'], ['P', 'Q'], ['Q', 'C'], ['C', 'D'], ['U', 'D'],
    ]);
    const r = reachableFrom(doc, ['U'], ['C']);
    assert.deepEqual(r.delayed, []);
    assert.deepEqual(r.unreachable, []);
    assert.deepEqual(r.rerouted, ['D']);
  });

  it('the dead-letter target is not a consumer', () => {
    const doc = build(
      { U: 'actor', P: 'service', Q: 'queue', C: 'service', DLQ: 'queue' },
      [['U', 'P'], ['P', 'Q'], ['Q', 'C'], ['Q', 'DLQ']],
      { Q: { queue: { deadLetterId: 'DLQ' } } },
    );
    const r = reachableFrom(doc, ['U'], ['C']);
    assert.ok(r.buffering.includes('Q'));
  });

  it('a queue with no consumers does not buffer', () => {
    const doc = build({ U: 'actor', P: 'service', Q: 'queue' }, [['U', 'P'], ['P', 'Q']]);
    const r = reachableFrom(doc, ['U'], []);
    assert.deepEqual(r.buffering, []);
  });

  it('fanout buffers when any consumer is down', () => {
    const doc = build(
      { U: 'actor', P: 'service', Q: 'queue', C1: 'service', C2: 'service' },
      [['U', 'P'], ['P', 'Q'], ['Q', 'C1'], ['Q', 'C2']],
      { Q: { queue: { delivery: 'fanout' } } },
    );
    const r = reachableFrom(doc, ['U'], ['C1']);
    assert.deepEqual(r.buffering, ['Q']);
  });
});

describe('example: event-driven microservices (K1, spec 3.10)', () => {
  it('"Fulfilment down" makes the fulfilment queue buffer and leaves the order service alone', async () => {
    const parsed = parseBlueprintJson(await loadTemplateRaw(getStarterTemplateById('event-driven-microservices')!));
    assert.ok(parsed.ok);
    const doc = parsed.ok ? parsed.doc : createBlankDocument();
    const scenario = doc.simulations.find((s) => s.name === 'Fulfilment down')!;
    assert.deepEqual(scenario.failures, ['inventory-svc']);
    const r = reachableFrom(doc, entryPointIds(doc), scenario.failures!);
    assert.deepEqual(r.buffering, ['fulfilment-queue']);
    assert.ok(!r.atRisk.includes('order-svc') && !r.atRisk.includes('kafka-bus'));
    assert.deepEqual(r.failed, ['inventory-svc']);
    assert.equal(doc.nodes.find((n) => n.id === 'fulfilment-queue')?.queue?.deadLetterId, 'fulfilment-dlq');
  });
});
