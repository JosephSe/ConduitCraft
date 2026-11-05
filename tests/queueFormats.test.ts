import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { importMermaidOrBlueprint, serializeMermaidBlock, serializeToBlueprintMarkdown } from '../src/core/parser.ts';
import { parseBlueprintJson, serializeBlueprintJson } from '../src/exporter/blueprintJson.ts';
import { createShareUrl, decodeSharedDiagramFromHash } from '../src/studio/shareLink.ts';
import { computeDocumentDiff } from '../src/core/diff.ts';
import { describeDiagram } from '../src/core/describe.ts';
import { queueCardText } from '../src/core/queues.ts';
import { runInsights, visibleInsights } from '../src/core/insights.ts';
import { convertAsyncApi } from '../src/importers/asyncapi.ts';
import { computeDrift } from '../src/core/drift.ts';
import { kindForImage } from '../src/importers/common.ts';
import { createBlankDocument, createNodeFromStencil } from '../src/templates/presets.ts';
import { renderDiagramSvg } from '../src/exporter/diagramSvg.ts';
import { generateStandaloneHtml } from '../src/exporter/standaloneHtml.ts';
import type { DiagramDocument, DiagramEdge, DiagramNode, NodeKind } from '../src/types.ts';

const read = (path: string) => readFileSync(new URL(`./fixtures/${path}`, import.meta.url), 'utf8');

function build(
  kinds: Record<string, NodeKind>,
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

const FULL = { ordering: 'fifo', delivery: 'fanout', maxDepth: 500, deadLetterId: 'dlq', retention: '4 days' } as const;

function queueDoc(queue?: DiagramNode['queue']): DiagramDocument {
  return build(
    { api: 'service', q: 'queue', dlq: 'queue', worker: 'service' },
    [
      ['api', 'q', { sync: 'async' }],
      ['q', 'worker', { sync: 'async' }],
    ],
    { q: queue ? { queue, title: 'Orders Queue' } : { title: 'Orders Queue' }, dlq: { title: 'Orders DLQ' } },
  );
}

describe('queue file formats (K1)', () => {
  it('Blueprint file: a queue with every field round-trips as a queue', () => {
    const doc = queueDoc({ ...FULL });
    const back = importMermaidOrBlueprint(serializeToBlueprintMarkdown(doc)).doc;
    const q = back.nodes.find((n) => n.id === 'q')!;
    assert.equal(q.kind, 'queue');
    assert.deepEqual(q.queue, FULL);
  });

  it('Blueprint file: a queue with no settings stays plain', () => {
    const text = serializeToBlueprintMarkdown(queueDoc());
    assert.ok(!/\bqueue:\s*\n/.test(text), 'no queue: map written');
    const q = importMermaidOrBlueprint(text).doc.nodes.find((n) => n.id === 'q')!;
    assert.equal(q.kind, 'queue');
    assert.equal(q.queue, undefined);
  });

  it('Blueprint file: the embedded Mermaid block draws a queue as a cylinder, and YAML kind wins on re-import', () => {
    const doc = queueDoc();
    assert.match(serializeMermaidBlock(doc), /q\[\("Orders Queue/);
    const back = importMermaidOrBlueprint(serializeToBlueprintMarkdown(doc)).doc;
    assert.equal(back.nodes.find((n) => n.id === 'q')!.kind, 'queue');
    assert.equal(back.nodes.find((n) => n.id === 'api')!.kind, 'service');
  });

  it('Blueprint file: hand-written aliases map to queue; stream, broker and bus still map to bus', () => {
    const kinds = ['queue', 'sqs', 'fifo', 'mq', 'work-queue', 'stream', 'broker', 'bus'];
    const nodes = kinds.map((k, i) => `  n${i}:\n    kind: ${k}\n    title: N${i}`).join('\n');
    const text = `---\nnodes:\n${nodes}\n---\n\n\`\`\`mermaid\nflowchart LR\n${kinds.map((_, i) => `  n${i}[N${i}]`).join('\n')}\n\`\`\`\n`;
    const doc = importMermaidOrBlueprint(text).doc;
    const kindOf = (i: number) => doc.nodes.find((n) => n.id === `n${i}`)?.kind;
    for (let i = 0; i < 5; i++) assert.equal(kindOf(i), 'queue', kinds[i]);
    for (let i = 5; i < 8; i++) assert.equal(kindOf(i), 'bus', kinds[i]);
  });

  it('Blueprint file: the dead-letter id follows the component when ids are rewritten', () => {
    const doc = queueDoc({ deadLetterId: 'dlq', maxDepth: 5 });
    doc.nodes.find((n) => n.id === 'dlq')!.id = 'dead letter!';
    doc.nodes.find((n) => n.id === 'q')!.queue!.deadLetterId = 'dead letter!';
    const back = importMermaidOrBlueprint(serializeToBlueprintMarkdown(doc)).doc;
    const target = back.nodes.find((n) => n.title === 'Orders DLQ')!;
    assert.equal(back.nodes.find((n) => n.id === 'q')!.queue?.deadLetterId, target.id);
  });

  it('Blueprint JSON round-trips every field, and none', () => {
    for (const queue of [{ ...FULL }, undefined]) {
      const parsed = parseBlueprintJson(serializeBlueprintJson(queueDoc(queue)));
      assert.ok(parsed.ok);
      const q = parsed.ok ? parsed.doc.nodes.find((n) => n.id === 'q')! : null;
      assert.equal(q?.kind, 'queue');
      assert.deepEqual(q?.queue, queue);
    }
  });

  it('Blueprint JSON drops bad queue values and a dead-letter id that names nothing', () => {
    const doc = queueDoc({ maxDepth: 5 });
    const json = JSON.parse(serializeBlueprintJson(doc));
    const q = json.document.nodes.find((n: { id: string }) => n.id === 'q');
    q.queue = { ordering: 'lifo', maxDepth: 10000, retention: 'x'.repeat(90), deadLetterId: 'ghost' };
    const parsed = parseBlueprintJson(JSON.stringify(json));
    assert.ok(parsed.ok);
    const back = parsed.ok ? parsed.doc.nodes.find((n) => n.id === 'q')! : null;
    assert.deepEqual(back?.queue, { retention: 'x'.repeat(40) });
  });

  it('a queue field on a non-queue component is kept', () => {
    const doc = build({ a: 'service' }, [], { a: { queue: { maxDepth: 3 } } });
    const parsed = parseBlueprintJson(serializeBlueprintJson(doc));
    assert.ok(parsed.ok);
    assert.deepEqual(parsed.ok && parsed.doc.nodes[0].queue, { maxDepth: 3 });
  });

  it('share link round-trips every field, and none', async () => {
    for (const queue of [{ ...FULL }, undefined]) {
      const { hash } = await createShareUrl(queueDoc(queue));
      const back = await decodeSharedDiagramFromHash(hash);
      const q = back?.nodes.find((n) => n.id === 'q');
      assert.equal(q?.kind, 'queue');
      assert.deepEqual(q?.queue, queue);
    }
  });

  it('diff lists a change to a queue setting', () => {
    const before = queueDoc({ maxDepth: 100 });
    const after = queueDoc({ maxDepth: 500 });
    const item = computeDocumentDiff(before, after).nodeDiffs.find((d) => d.id === 'q')!;
    assert.equal(item.status, 'modified');
    assert.deepEqual(item.changes, ['Orders Queue: max depth 100 → 500']);
  });

  it('text description: "Orders Queue is a FIFO queue between Checkout and Fulfilment..."', () => {
    const doc = build(
      { c: 'service', q: 'queue', f: 'service', dlq: 'queue' },
      [['c', 'q', { sync: 'async' }], ['q', 'f', { sync: 'async' }]],
      {
        c: { title: 'Checkout' },
        f: { title: 'Fulfilment' },
        dlq: { title: 'Orders DLQ' },
        q: { title: 'Orders Queue', queue: { ordering: 'fifo', maxDepth: 500, deadLetterId: 'dlq' } },
      },
    );
    assert.match(
      describeDiagram(doc),
      /Orders Queue is a FIFO queue between Checkout and Fulfilment\. It holds up to 500 messages and sends overflow to Orders DLQ\./,
    );
  });

  it('card text: ordering in the chip, limits in the footer', () => {
    const q = { kind: 'queue', chip: 'ASYNC', footerLeft: 'Point to point' };
    assert.deepEqual(queueCardText(q), { chip: 'ASYNC', footer: 'Point to point' });
    assert.deepEqual(queueCardText({ ...q, queue: { ordering: 'fifo', maxDepth: 500, retention: '4 days' } }), {
      chip: 'FIFO',
      footer: 'max 500 · 4 days',
    });
    assert.deepEqual(queueCardText({ ...q, kind: 'service', queue: { ordering: 'fifo' } }), {
      chip: 'ASYNC',
      footer: 'Point to point',
    });
  });

  it('SVG and HTML exports draw a pipe and no backlog', () => {
    const doc = queueDoc({ ordering: 'priority', maxDepth: 9 });
    const svg = renderDiagramSvg(doc);
    assert.match(svg, /A \d+(\.\d+)? \d+(\.\d+)? 0 0 1/, 'pipe path has its rounded ends');
    assert.match(svg, /PRIORITY/);
    assert.doesNotMatch(svg, /queue-msg|waiting/);
    const html = generateStandaloneHtml(doc);
    assert.match(html, /data-kind="queue"[^>]*data-shape="pipe"/);
    assert.match(html, /data-plate="pipe"/);
    assert.match(html, /max 9/);
    assert.doesNotMatch(html, /queue-msg/);
  });
});

describe('queue insights (K1, spec 3.5)', () => {
  const codes = (doc: DiagramDocument) => runInsights(doc).map((i) => i.code);

  it('queue-no-consumer: wires in, none out', () => {
    const doc = build({ u: 'actor', q: 'queue' }, [['u', 'q', { sync: 'async' }]], { q: { title: 'Orders Queue' } });
    const found = runInsights(doc).filter((i) => i.code === 'queue-no-consumer');
    assert.equal(found.length, 1);
    assert.match(found[0].message, /Nothing reads from Orders Queue; messages pile up forever\./);
    assert.equal(found[0].level, 'warning');
  });

  it('queue-no-consumer is quiet when something reads, or when nothing writes', () => {
    assert.ok(!codes(queueDoc()).includes('queue-no-consumer'));
    const lonely = build({ q: 'queue' }, []);
    assert.ok(!codes(lonely).includes('queue-no-consumer'));
  });

  it('queue-no-dlq: a limit and nowhere to send overflow', () => {
    const doc = queueDoc({ maxDepth: 50 });
    const found = runInsights(doc).filter((i) => i.code === 'queue-no-dlq');
    assert.equal(found.length, 1);
    assert.match(found[0].message, /Orders Queue drops messages when full; it has no dead-letter queue\./);
    assert.ok(!codes(queueDoc({ maxDepth: 50, deadLetterId: 'dlq' })).includes('queue-no-dlq'));
    assert.ok(!codes(queueDoc()).includes('queue-no-dlq'));
  });

  it('sync-into-queue: a wire into a queue that is not async', () => {
    const sync = build({ a: 'service', q: 'queue', b: 'service' }, [['a', 'q'], ['q', 'b', { sync: 'async' }]]);
    const found = runInsights(sync).filter((i) => i.code === 'sync-into-queue');
    assert.equal(found.length, 1);
    assert.equal(found[0].target.type, 'edge');
    assert.ok(!codes(queueDoc()).includes('sync-into-queue'));
  });

  it('rules can be muted', () => {
    const doc = queueDoc({ maxDepth: 50 });
    doc.insights = { muted: ['queue-no-dlq'] };
    assert.ok(!visibleInsights(doc).some((i) => i.code === 'queue-no-dlq'));
    assert.ok(runInsights(doc).some((i) => i.code === 'queue-no-dlq'));
  });

  it('dangling-store does not fire for a queue', () => {
    const doc = build({ a: 'service', q: 'queue' }, [['a', 'q', { sync: 'async' }]]);
    assert.ok(!codes(doc).includes('dangling-store'));
  });

  it('spof reports a single queue between producer and consumer', () => {
    const doc = build({ u: 'actor', q: 'queue', c: 'service' }, [['u', 'q', { sync: 'async' }], ['q', 'c', { sync: 'async' }]]);
    const spof = runInsights(doc).filter((i) => i.code === 'spof');
    assert.ok(spof.some((i) => i.target.id === 'q'));
  });
});

describe('queue importers (K1, spec 3.8)', () => {
  it('container images: RabbitMQ and friends are queues; Kafka, Redpanda and Pulsar are streams (queues with fanout, K6); NATS stays a bus', () => {
    for (const image of ['rabbitmq:3-management', 'apache/activemq-artemis', 'softwaremill/elasticmq', 'schickling/beanstalkd']) {
      assert.equal(kindForImage(image), 'queue', image);
    }
    for (const image of ['confluentinc/cp-kafka', 'apache/pulsar', 'redpandadata/redpanda']) {
      assert.equal(kindForImage(image), 'queue', image);
    }
    assert.equal(kindForImage('nats:2'), 'bus');
  });

  it('AsyncAPI: an amqp queue or sqs binding becomes a queue; other channels stay buses', () => {
    const { doc, issues } = convertAsyncApi(read('asyncapi/orders-queue.yaml'), 'x');
    const kind = (title: string) => doc.nodes.find((n) => n.title === title)?.kind;
    assert.equal(kind('fulfilment.work'), 'queue');
    assert.equal(kind('orders.sqs'), 'queue');
    assert.equal(kind('orders.events'), 'bus');
    assert.equal(kind('Fulfilment Service'), 'service');
    assert.match(issues.find((i) => i.code === 'asyncapi-schemas')?.message ?? '', /bindings/);
  });

  it('AsyncAPI: a file without bindings still draws buses', () => {
    const { doc } = convertAsyncApi(read('asyncapi/orders-v2.yaml'), 'x');
    assert.ok(doc.nodes.filter((n) => n.title.includes('.')).every((n) => n.kind === 'bus'));
  });

  it('drift does not report a change just because the kind guess changed', () => {
    const withBinding = read('asyncapi/orders-queue.yaml');
    const withoutBinding = withBinding.replace(/ {4}bindings:[\s\S]*?(?= {4}publish| {4}subscribe)/g, '');
    const oldDiagram = convertAsyncApi(withoutBinding, 'x').doc;
    const reimport = convertAsyncApi(withBinding, 'x').doc;
    assert.equal(oldDiagram.nodes.find((n) => n.title === 'fulfilment.work')?.kind, 'bus');
    assert.equal(reimport.nodes.find((n) => n.title === 'fulfilment.work')?.kind, 'queue');
    assert.deepEqual(computeDrift(oldDiagram, reimport, 'asyncapi').items, []);
  });
});
