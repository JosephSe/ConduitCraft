import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  fanoutDrain,
  fanoutHold,
  maxLag,
  normalizeQueue,
  streamLanes,
} from '../src/core/queues.ts';
import { cylinderPlate, pipePlate, renderPipePlate, storeDrawsBucket, storeDrawsCylinder } from '../src/core/nodeStyle.ts';
import { entryPointIds, reachableFrom } from '../src/core/reachability.ts';
import { runInsights } from '../src/core/insights.ts';
import { describeDiagram } from '../src/core/describe.ts';
import { computeDocumentDiff } from '../src/core/diff.ts';
import { importMermaidOrBlueprint, serializeMermaidBlock, serializeToBlueprintMarkdown } from '../src/core/parser.ts';
import { parseBlueprintJson, serializeBlueprintJson } from '../src/exporter/blueprintJson.ts';
import { renderDiagramSvg } from '../src/exporter/diagramSvg.ts';
import { generateStandaloneHtml } from '../src/exporter/standaloneHtml.ts';
import { createShareUrl, decodeSharedDiagramFromHash } from '../src/studio/shareLink.ts';
import { kindForImage, presetForImage, stencilForImage } from '../src/importers/common.ts';
import { convertCompose } from '../src/importers/compose.ts';
import { convertAsyncApi } from '../src/importers/asyncapi.ts';
import { createBlankDocument, createNodeFromStencil, findStencil } from '../src/templates/presets.ts';
import type { DiagramDocument, DiagramEdge, DiagramNode, NodeKind } from '../src/types.ts';

function build(
  kinds: Record<string, NodeKind | string>,
  wires: Array<[string, string, Partial<DiagramEdge>?]>,
  patch: Record<string, Partial<DiagramNode>> = {},
): DiagramDocument {
  const doc = createBlankDocument();
  doc.nodes = Object.entries(kinds).map(([id, kind], i) => ({
    ...createNodeFromStencil(kind, i * 100, 40, i),
    id,
    title: id,
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
    label: 'calls',
    animated: false,
    ...extra,
  }));
  return doc;
}

describe('K6 stream (spec 6.1)', () => {
  it('is a second stencil on the queue kind with fanout delivery', () => {
    const s = findStencil('stream')!;
    assert.equal(s.kind, 'queue');
    assert.equal(s.icon, 'stream');
    assert.equal(s.chip, 'STREAM');
    assert.equal(s.eyebrow, 'Log');
    const node = createNodeFromStencil('stream', 0, 0, 0);
    assert.equal(node.kind, 'queue');
    assert.equal(node.queue?.delivery, 'fanout');
    assert.equal(createNodeFromStencil('queue', 0, 0, 0).queue, undefined);
  });

  it('reads partitions (1 to 12, default 3) and draws that many lanes', () => {
    assert.equal(normalizeQueue({ partitions: 3 }), undefined);
    assert.deepEqual(normalizeQueue({ partitions: 5 }), { partitions: 5 });
    assert.equal(normalizeQueue({ partitions: 0 }), undefined);
    assert.equal(normalizeQueue({ partitions: 13 }), undefined);
    assert.equal(normalizeQueue({ partitions: 2.5 }), undefined);
    const stream = createNodeFromStencil('stream', 0, 0, 0);
    assert.equal(streamLanes(stream), 3);
    assert.equal(streamLanes({ ...stream, queue: { delivery: 'fanout', partitions: 7 } }), 7);
    assert.equal(streamLanes(createNodeFromStencil('queue', 0, 0, 0)), 0);
    assert.equal(pipePlate(240, 112, 4).lanes.split('M').filter(Boolean).length, 4);
    assert.equal(pipePlate(240, 112).lanes, '');
    assert.match(renderPipePlate(240, 112, 3), /node-shape-lanes/);
    assert.doesNotMatch(renderPipePlate(240, 112), /node-shape-lanes/);
  });

  it('keeps a lag for each consumer', () => {
    let lags = fanoutHold({}, ['a', 'b']);
    lags = fanoutHold(lags, ['b']);
    assert.deepEqual(lags, { a: 1, b: 2 });
    assert.equal(maxLag(lags), 2);
    assert.deepEqual(fanoutDrain(lags, ['b']), { a: 1, b: 1 });
    assert.deepEqual(fanoutDrain({ a: 0 }, ['a']), { a: 0 });
    assert.equal(maxLag({}), 0);
  });

  it('is buffering when any consumer is down, and the live one is not', () => {
    const d = build({ u: 'actor', s: 'stream', a: 'service', b: 'service' }, [['u', 's'], ['s', 'a'], ['s', 'b']]);
    const r = reachableFrom(d, entryPointIds(d), ['a']);
    assert.deepEqual(r.buffering, ['s']);
    assert.ok(r.reachable.includes('b'));
  });

  it('images: kafka, redpanda and pulsar are streams; nats stays a bus', () => {
    for (const image of ['confluentinc/cp-kafka:7', 'redpandadata/redpanda', 'apache/pulsar']) {
      assert.equal(kindForImage(image), 'queue');
      assert.equal(stencilForImage(image), 'stream');
      assert.deepEqual(presetForImage(image), { queue: { delivery: 'fanout' } });
    }
    assert.equal(kindForImage('nats:2'), 'bus');
    assert.equal(presetForImage('nats:2'), undefined);
    const doc = convertCompose('services:\n  events:\n    image: redpandadata/redpanda\n', 'x').doc;
    assert.equal(doc.nodes[0].kind, 'queue');
    assert.equal(doc.nodes[0].queue?.delivery, 'fanout');
  });

  it('an AsyncAPI channel with a kafka binding is a stream', () => {
    const text = `asyncapi: 2.6.0
info:
  title: Orders
  version: 1.0.0
channels:
  orders:
    bindings:
      kafka: {}
    subscribe:
      message:
        name: OrderPlaced
  jobs:
    bindings:
      amqp:
        is: queue
    subscribe:
      message:
        name: Job
`;
    const doc = convertAsyncApi(text, 'x').doc;
    const orders = doc.nodes.find((n) => n.title === 'orders')!;
    const jobs = doc.nodes.find((n) => n.title === 'jobs')!;
    assert.equal(orders.kind, 'queue');
    assert.equal(orders.queue?.delivery, 'fanout');
    assert.equal(jobs.queue?.delivery, undefined);
  });

  it('round-trips partitions and delivery, and is drawn with lanes', async () => {
    const d = build({ s: 'stream', a: 'service' }, [['s', 'a']], { s: { queue: { delivery: 'fanout', partitions: 6 } } });
    const again = importMermaidOrBlueprint(serializeToBlueprintMarkdown(d)).doc;
    assert.deepEqual(again.nodes.find((n) => n.id === 's')!.queue, { delivery: 'fanout', partitions: 6 });
    const json = parseBlueprintJson(serializeBlueprintJson(d));
    assert.ok(json.ok);
    assert.deepEqual(json.ok ? json.doc.nodes[0].queue : null, { delivery: 'fanout', partitions: 6 });
    assert.match(renderDiagramSvg(d), /opacity="0.4"/);
    assert.match(generateStandaloneHtml(d), /node-shape-lanes/);
    assert.match(describeDiagram(d), /stream/i);
    const changed = structuredClone(d);
    changed.nodes[0].queue = { delivery: 'fanout', partitions: 2 };
    assert.ok(computeDocumentDiff(d, changed).nodeDiffs.some((m) => JSON.stringify(m).includes('partitions')));
  });
});

describe('K7 external (spec 6.2)', () => {
  const doc = () =>
    build(
      { u: 'actor', checkout: 'service', stripe: 'service' },
      [['u', 'checkout'], ['checkout', 'stripe', { label: 'charge' }]],
      { stripe: { title: 'Stripe', external: true }, checkout: { title: 'Checkout' } },
    );
  const withScenario = (d: DiagramDocument) => {
    d.simulations = [{ id: 's', name: 'Pay', tone: 'blue', steps: [{ label: 'Pay', trace: 'pay', nodes: ['checkout', 'stripe'], tone: 'blue' }] }];
    return d;
  };

  it('is written only when true, and round-trips in every format', async () => {
    const d = doc();
    const md = serializeToBlueprintMarkdown(d);
    assert.equal((md.match(/external: true/g) ?? []).length, 1);
    const again = importMermaidOrBlueprint(md).doc;
    assert.equal(again.nodes.find((n) => n.id === 'stripe')!.external, true);
    assert.equal(again.nodes.find((n) => n.id === 'checkout')!.external, undefined);
    const json = parseBlueprintJson(serializeBlueprintJson(d));
    assert.ok(json.ok);
    assert.equal(json.ok ? json.doc.nodes.find((n) => n.id === 'stripe')!.external : null, true);
    const { hash } = await createShareUrl(d);
    assert.equal((await decodeSharedDiagramFromHash(hash))!.nodes.find((n) => n.id === 'stripe')!.external, true);
  });

  it('only `true` counts', () => {
    const d = doc();
    const md = serializeToBlueprintMarkdown(d).replace('external: true', 'external: yes');
    assert.equal(importMermaidOrBlueprint(md).doc.nodes.find((n) => n.id === 'stripe')!.external, undefined);
  });

  it('writes :::external and a dashed classDef into the Mermaid block', () => {
    const block = serializeMermaidBlock(doc());
    assert.match(block, /stripe\[.*\]:::external/);
    assert.match(block, /classDef external stroke-dasharray: 5 5/);
    assert.doesNotMatch(serializeMermaidBlock(build({ a: 'service' }, [])), /classDef external/);
  });

  it('is drawn dashed with a label in the SVG and the HTML export, on a drum and on a pipe', () => {
    const d = build({ q: 'queue', db: 'store' }, [['q', 'db']], { q: { external: true }, db: { external: true } });
    const svg = renderDiagramSvg(d);
    assert.match(svg, /stroke-dasharray="6 4"/);
    assert.equal((svg.match(/>External</g) ?? []).length, 2);
    assert.match(generateStandaloneHtml(d), /data-external="true"/);
    assert.doesNotMatch(renderDiagramSvg(build({ a: 'service' }, [])), />External</);
  });

  it('external-unprotected fires for a sync call on a scenario path with no breaker or fallback', () => {
    const d = withScenario(doc());
    const issue = runInsights(d).find((i) => i.code === 'external-unprotected');
    assert.ok(issue);
    assert.equal(issue!.level, 'warning');
    assert.equal(issue!.message, 'Checkout calls Stripe synchronously with no circuit breaker or fallback.');
  });

  it('is quiet with a breaker, a fallback, an async wire, or a non-external callee', () => {
    const quiet = (d: DiagramDocument) => assert.equal(runInsights(d).some((i) => i.code === 'external-unprotected'), false);
    const breaker = withScenario(doc());
    breaker.nodes.find((n) => n.id === 'checkout')!.resilience = { circuitBreaker: true };
    quiet(breaker);
    const fallback = withScenario(doc());
    fallback.nodes.find((n) => n.id === 'stripe')!.resilience = { fallbackId: 'checkout' };
    quiet(fallback);
    const async = withScenario(doc());
    async.edges[1].sync = 'async';
    quiet(async);
    const plain = withScenario(doc());
    delete plain.nodes.find((n) => n.id === 'stripe')!.external;
    quiet(plain);
  });

  it('is described and diffed', () => {
    assert.match(describeDiagram(doc()), /Stripe is run by someone else/);
    const before = doc();
    const after = structuredClone(before);
    delete after.nodes.find((n) => n.id === 'stripe')!.external;
    assert.ok(computeDocumentDiff(before, after).nodeDiffs.some((m) => JSON.stringify(m).includes('no longer external')));
  });

  it('imports never mark a component external', () => {
    const doc = convertCompose('services:\n  pay:\n    image: stripe/stripe-mock\n', 'x').doc;
    assert.equal(doc.nodes[0].external, undefined);
  });
});

describe('K8 object storage (spec 6.3)', () => {
  it('is a second stencil on the store kind with the bucket outline', () => {
    const s = findStencil('object-store')!;
    assert.equal(s.kind, 'store');
    assert.equal(s.shape, 'bucket');
    assert.equal(s.icon, 'bucket');
    assert.equal(s.defaultSubtitle, 'Blobs and files');
    assert.equal(s.interfaceLabel, 'S3 API');
    const node = createNodeFromStencil('object-store', 0, 0, 0);
    assert.equal(node.kind, 'store');
    assert.equal(node.shape, 'bucket');
    assert.equal(createNodeFromStencil('store', 0, 0, 0).shape, undefined);
  });

  it('draws a drum that is wider at the top', () => {
    assert.equal(storeDrawsBucket('store', 'bucket'), true);
    assert.equal(storeDrawsBucket('service', 'bucket'), false);
    assert.equal(storeDrawsCylinder('store', 'bucket'), true);
    const drum = cylinderPlate(216, 150);
    const bucket = cylinderPlate(216, 150, true);
    assert.equal(bucket.rx, drum.rx);
    assert.equal(bucket.cy, drum.cy);
    assert.notEqual(bucket.body, drum.body);
    const nums = (d: string) => d.match(/-?\d+(\.\d+)?/g)!.map(Number);
    // Second point is the bottom-left corner of the wall: further in than the rim for a bucket.
    assert.ok(nums(bucket.body)[2] > nums(drum.body)[2]);
  });

  it('images: minio and localstack are object storage; redis stays a plain store', () => {
    for (const image of ['minio/minio', 'localstack/localstack:3']) {
      assert.equal(kindForImage(image), 'store');
      assert.equal(stencilForImage(image), 'object-store');
      assert.deepEqual(presetForImage(image), { shape: 'bucket' });
    }
    assert.equal(presetForImage('redis:7'), undefined);
    const doc = convertCompose('services:\n  files:\n    image: minio/minio\n', 'x').doc;
    assert.equal(doc.nodes[0].kind, 'store');
    assert.equal(doc.nodes[0].shape, 'bucket');
  });

  it('round-trips the bucket shape and draws it in the exports', () => {
    const d = build({ b: 'object-store', s: 'service' }, [['s', 'b']]);
    const again = importMermaidOrBlueprint(serializeToBlueprintMarkdown(d)).doc;
    assert.equal(again.nodes.find((n) => n.id === 'b')!.shape, 'bucket');
    assert.match(generateStandaloneHtml(d), /data-bucket="true"/);
    assert.match(renderDiagramSvg(d), /<path d="M /);
  });

  it('dangling-store skips a bucket only a scheduler or an external component writes to', () => {
    const dangling = (d: DiagramDocument) => runInsights(d).some((i) => i.code === 'dangling-store');
    const sched = build({ s: 'scheduler', b: 'object-store' }, [['s', 'b', { label: 'backup' }]]);
    assert.equal(dangling(sched), false);
    const ext = build({ x: 'service', b: 'object-store' }, [['x', 'b', { label: 'export' }]], { x: { external: true } });
    assert.equal(dangling(ext), false);
    const svc = build({ x: 'service', b: 'object-store' }, [['x', 'b', { label: 'export' }]]);
    assert.equal(dangling(svc), true);
    const plainStore = build({ s: 'scheduler', b: 'store' }, [['s', 'b', { label: 'backup' }]]);
    assert.equal(dangling(plainStore), true);
  });
});
