import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildTraceDiagram, convertTraces, mergeTraceDiagram, parseTraces, percentile } from '../src/importers/traces.ts';
import { looksLikeTrace } from '../src/importers/sniff.ts';
import { parseBlueprintJson, serializeBlueprintJson } from '../src/exporter/blueprintJson.ts';
import { createBlankDocument } from '../src/templates/presets.ts';

const read = (path: string) => readFileSync(new URL(`./fixtures/${path}`, import.meta.url), 'utf8');
const codes = (issues: Array<{ code: string }>) => issues.map((i) => i.code);

describe('percentiles', () => {
  it('uses the nearest rank', () => {
    const v = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    assert.equal(percentile(v, 0.5), 5);
    assert.equal(percentile(v, 0.95), 10);
    assert.equal(percentile([7], 0.95), 7);
    assert.equal(percentile([], 0.5), 0);
  });
});

describe('OTLP trace import', () => {
  const { doc, issues } = convertTraces(read('traces/otlp.json'), 'Traces');
  const node = (title: string) => doc.nodes.find((n) => n.title === title);
  const wire = (from: string, to: string) => doc.edges.find((e) => e.from === node(from)?.id && e.to === node(to)?.id);

  it('makes a component per service and a bus per messaging destination', () => {
    assert.deepEqual(
      doc.nodes.map((n) => n.title).sort(),
      ['checkout', 'ghost', 'inventory', 'orders', 'orders.created', 'payments', 'shipping', 'web'],
    );
    assert.equal(node('orders.created')?.kind, 'bus');
    assert.equal(node('checkout')?.kind, 'service');
  });

  it('makes a wire where a span\'s parent is in another service, with count, p50, p95 and errors', () => {
    const pay = wire('checkout', 'payments');
    assert.ok(pay);
    assert.equal(pay.label, '20 calls');
    assert.equal(pay.latencyMs, 59, 'p50 of the caller\'s client spans (14 + 5i ms)');
    assert.match(pay.comment ?? '', /p95 104 ms/);
    assert.match(pay.comment ?? '', /2 errors \(10%\)/);
    assert.equal(pay.protocol, 'grpc');
    assert.equal(wire('web', 'checkout')?.protocol, 'http');
    assert.equal(wire('checkout', 'inventory')?.label, '10 calls');
    assert.equal(wire('checkout', 'inventory')?.latencyMs, 10);
  });

  it('turns a high error rate into a rose wire and an at-risk callee', () => {
    assert.equal(wire('checkout', 'payments')?.tone, 'rose');
    assert.equal(node('payments')?.status, 'at-risk');
    assert.equal(wire('checkout', 'inventory')?.tone, 'blue');
    assert.equal(node('inventory')?.status, undefined);
  });

  it('routes messaging spans through the bus as async wires', () => {
    const publish = wire('orders', 'orders.created');
    const consume = wire('orders.created', 'shipping');
    assert.ok(publish && consume);
    for (const w of [publish, consume]) {
      assert.equal(w.sync, 'async');
      assert.equal(w.protocol, 'kafka');
      assert.equal(w.label, '15 calls');
    }
    assert.equal(consume.latencyMs, 37);
    assert.equal(wire('orders', 'shipping'), undefined, 'no direct wire around the bus');
  });

  it('records where every component came from', () => {
    assert.deepEqual(node('payments')?.source, { kind: 'trace', ref: 'payments' });
    assert.deepEqual(node('orders.created')?.source, { kind: 'trace', ref: 'messaging:kafka:orders.created' });
  });

  it('reports what it left out', () => {
    assert.ok(codes(issues).includes('trace-orphan-span'));
    assert.ok(codes(issues).includes('trace-database-spans'));
    assert.equal(wire('ghost', 'web'), undefined);
  });

  it('has the expected wire count and survives the Blueprint file round trip', () => {
    assert.equal(doc.edges.length, 5);
    const back = parseBlueprintJson(serializeBlueprintJson(doc));
    assert.ok(back.ok);
    if (!back.ok) return;
    assert.equal(back.doc.nodes.length, doc.nodes.length);
    assert.equal(back.doc.edges.find((e) => e.latencyMs === 59)?.protocol, 'grpc');
  });

  it('reads the file-exporter form, one object per line', () => {
    const whole = JSON.parse(read('traces/otlp.json')) as { resourceSpans: unknown[] };
    const lines = whole.resourceSpans.map((rs) => JSON.stringify({ resourceSpans: [rs] })).join('\n');
    const lined = convertTraces(lines, 'Lines');
    assert.equal(lined.doc.nodes.length, doc.nodes.length);
    assert.equal(lined.doc.edges.length, doc.edges.length);
  });
});

describe('Jaeger trace import', () => {
  it('makes a wire between processes, with the error counted', () => {
    const { doc } = convertTraces(read('traces/jaeger.json'), 'Jaeger');
    assert.deepEqual(doc.nodes.map((n) => n.title).sort(), ['gateway', 'users']);
    assert.equal(doc.edges.length, 1);
    const e = doc.edges[0];
    assert.equal(e.label, '10 calls');
    // The gateway span is a server span, not a client span, so the callee's own durations (20 to 38 ms) are used.
    assert.equal(e.latencyMs, 28);
    assert.match(e.comment ?? '', /1 error \(10%\)/);
    assert.equal(e.tone, 'rose');
    assert.equal(doc.nodes.find((n) => n.title === 'users')?.status, 'at-risk');
  });
});

describe('refusing what is not a trace', () => {
  it('explains why', () => {
    assert.throws(() => parseTraces('not json'), /not valid JSON/);
    assert.throws(() => parseTraces('{"hello": 1}'), /not an OpenTelemetry/);
    assert.throws(() => parseTraces('{"resourceSpans": []}'), /no spans/);
    assert.throws(() => parseTraces('{"data": []}'), /no spans/);
  });

  it('recognises trace files by content', () => {
    assert.equal(looksLikeTrace('a.json', read('traces/otlp.json')), true);
    assert.equal(looksLikeTrace('a.json', read('traces/jaeger.json')), true);
    assert.equal(looksLikeTrace('a.json', '{"title":"Blueprint","nodes":[]}'), false);
  });
});

describe('updating an open diagram', () => {
  const imported = convertTraces(read('traces/otlp.json'), 'Traces').doc;

  function existing() {
    const doc = createBlankDocument();
    doc.title = 'My architecture';
    const make = (id: string, title: string, x: number) => ({
      ...imported.nodes[0],
      id,
      title,
      x,
      y: 160,
      source: undefined,
      status: undefined,
      metrics: [{ label: 'Owner note', value: 'keep me' }],
    });
    doc.nodes = [make('co', 'Checkout', 100), make('pay', 'payments', 500)];
    doc.edges = [
      {
        id: 'w1',
        from: 'co',
        to: 'pay',
        sourcePort: 'auto',
        targetPort: 'auto',
        tone: 'blue',
        route: 'auto',
        label: 'charge a card',
        animated: true,
      },
    ];
    return doc;
  }

  it('matches by title, keeps what the user wrote, and adds the rest to the right', () => {
    const before = existing();
    const merge = mergeTraceDiagram(before, imported);
    const out = merge.doc;
    assert.equal(merge.updatedNodes, 2, 'Checkout (any case) and payments');
    assert.equal(merge.addedNodes, imported.nodes.length - 2);
    assert.equal(out.nodes.length, 2 + merge.addedNodes);

    const checkout = out.nodes.find((n) => n.id === 'co')!;
    assert.equal(checkout.title, 'Checkout');
    assert.equal(checkout.x, 100);
    assert.deepEqual(checkout.source, { kind: 'trace', ref: 'checkout' });
    assert.ok(checkout.metrics.some((m) => m.label === 'Owner note'), 'the user\'s metric stays');
    assert.ok(checkout.metrics.some((m) => m.label === 'Spans'));
    assert.equal(out.nodes.find((n) => n.id === 'pay')?.status, 'at-risk');

    const wire = out.edges.find((e) => e.id === 'w1')!;
    assert.equal(wire.label, 'charge a card', 'the user\'s label stays');
    assert.equal(wire.latencyMs, 59);
    assert.equal(wire.tone, 'rose');
    assert.match(wire.comment ?? '', /20 calls/);
    assert.equal(merge.updatedEdges, 1);
    assert.equal(merge.addedEdges, imported.edges.length - 1);

    const added = out.nodes.filter((n) => !['co', 'pay'].includes(n.id));
    for (const n of added) assert.ok(n.x >= 600 + 96 - 16, `${n.title} is to the right of the existing components`);
    assert.equal(new Set(out.nodes.map((n) => n.id)).size, out.nodes.length, 'ids stay unique');
    assert.equal(before.nodes.length, 2, 'the original is not changed');
  });

  it('matches on the trace source before the title', () => {
    const before = existing();
    before.nodes[0].title = 'Renamed by the user';
    before.nodes[0].source = { kind: 'trace', ref: 'checkout' };
    const merge = mergeTraceDiagram(before, imported);
    assert.equal(merge.doc.nodes.find((n) => n.id === 'co')?.title, 'Renamed by the user');
    assert.equal(merge.updatedNodes, 2);
  });

  it('merging twice changes nothing the second time', () => {
    const once = mergeTraceDiagram(existing(), imported).doc;
    const twice = mergeTraceDiagram(once, imported);
    assert.equal(twice.addedNodes, 0);
    assert.equal(twice.addedEdges, 0);
    assert.equal(twice.doc.nodes.length, once.nodes.length);
    assert.equal(twice.doc.edges.length, once.edges.length);
  });
});

describe('building from spans directly', () => {
  it('ignores a call inside one service', () => {
    const { doc } = buildTraceDiagram(
      {
        format: 'otlp',
        spans: [
          { traceId: 't', spanId: 'a', parentId: '', service: 'solo', kind: 'server', durationMs: 5, error: false, attrs: {} },
          { traceId: 't', spanId: 'b', parentId: 'a', service: 'solo', kind: 'internal', durationMs: 1, error: false, attrs: {} },
        ],
      },
      'Solo',
    );
    assert.equal(doc.nodes.length, 1);
    assert.equal(doc.edges.length, 0);
  });
});
