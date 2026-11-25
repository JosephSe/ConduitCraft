import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { routeDiagramEdges } from '../src/core/layout.ts';
import { flowScale, hopDelayMs, isAsyncWire, latenciesBetween, normalizeWireFields, wireLabelText } from '../src/core/wire.ts';
import { wireEndAngle } from '../src/core/wireGeom.ts';
import { parseBlueprintJson, serializeBlueprintJson } from '../src/exporter/blueprintJson.ts';
import { createBlankDocument, createNodeFromStencil } from '../src/templates/presets.ts';
import { importMermaidOrBlueprint, serializeToBlueprintMarkdown } from '../src/core/parser.ts';
import type { DiagramDocument, DiagramEdge } from '../src/types.ts';

function docWithWire(extra: Partial<DiagramEdge>): DiagramDocument {
  const doc = createBlankDocument();
  doc.nodes = [
    { ...doc.nodes[0], id: 'a', title: 'A', x: 80, y: 120 },
    { ...doc.nodes[0], id: 'b', title: 'B', x: 520, y: 120 },
  ];
  doc.edges = [
    {
      id: 'w1',
      from: 'a',
      to: 'b',
      sourcePort: 'auto',
      targetPort: 'auto',
      tone: 'blue',
      route: 'auto',
      label: 'charge card',
      animated: true,
      ...extra,
    },
  ];
  return doc;
}

describe('wire protocol, sync and latency (F-17)', () => {
  it('prefixes the label with the protocol, and shows the protocol alone on an unlabelled wire', () => {
    assert.equal(wireLabelText({ label: 'charge card', protocol: 'grpc' }), 'gRPC · charge card');
    assert.equal(wireLabelText({ label: '', protocol: 'kafka' }), 'Kafka');
    assert.equal(wireLabelText({ label: 'plain' }), 'plain');
    assert.equal(wireLabelText({ label: '' }), '');
  });

  it('routes with the displayed label so the chip is drawn and sized for it', () => {
    const [plain] = routeDiagramEdges(docWithWire({}));
    const [typed] = routeDiagramEdges(docWithWire({ protocol: 'grpc' }));
    assert.equal(typed.label, 'gRPC · charge card');
    assert.ok(typed.badgeWidth! > plain.badgeWidth!);
    const [protocolOnly] = routeDiagramEdges(docWithWire({ label: '', protocol: 'http' }));
    assert.equal(protocolOnly.label, 'HTTP');
    assert.ok(protocolOnly.badgePos, 'a protocol alone still gets a chip');
  });

  it('keeps only valid values when reading a file', () => {
    assert.deepEqual(normalizeWireFields({ protocol: 'grpc', sync: 'async', latencyMs: 120.4 }), {
      protocol: 'grpc',
      sync: 'async',
      latencyMs: 120,
    });
    assert.deepEqual(normalizeWireFields({ protocol: 'carrier-pigeon', sync: 'sync', latencyMs: -5 }), {});
    assert.deepEqual(normalizeWireFields({ latencyMs: Infinity }), {});
    assert.equal(isAsyncWire({ sync: 'async' }), true);
    assert.equal(isAsyncWire({}), false);
  });

  it('round-trips through Blueprint JSON, which the share link and autosave also use', () => {
    const doc = docWithWire({ protocol: 'amqp', sync: 'async', latencyMs: 35 });
    const back = parseBlueprintJson(serializeBlueprintJson(doc));
    assert.ok(back.ok);
    if (!back.ok) return;
    assert.equal(back.doc.edges[0].protocol, 'amqp');
    assert.equal(back.doc.edges[0].sync, 'async');
    assert.equal(back.doc.edges[0].latencyMs, 35);
  });

  it('leaves a plain wire plain: no empty fields appear in the saved file', () => {
    const back = parseBlueprintJson(serializeBlueprintJson(docWithWire({})));
    assert.ok(back.ok);
    if (!back.ok) return;
    for (const key of ['protocol', 'sync', 'latencyMs']) assert.equal(key in back.doc.edges[0], false, key);
  });
});

describe('latency sets the pace of a hop (F-17)', () => {
  it('keeps the base delay with no latency, and at the reference latency', () => {
    assert.equal(hopDelayMs(950, []), 950);
    assert.equal(hopDelayMs(950, [50]), 950);
  });

  it('stretches slow wires, shortens fast ones, and clamps both ends', () => {
    assert.equal(hopDelayMs(1000, [200]), 2000);
    assert.equal(hopDelayMs(1000, [0]), 250);
    assert.equal(hopDelayMs(1000, [5000]), 4000);
    assert.equal(hopDelayMs(1000, [-5, Infinity]), 1000, 'bad values are ignored');
  });

  it('is set by the slowest wire crossed', () => {
    assert.equal(hopDelayMs(1000, [10, 200]), 2000);
  });

  it('only counts wires that run from one step to the next', () => {
    const edges = [
      { from: 'a', to: 'b', latencyMs: 120 },
      { from: 'b', to: 'a', latencyMs: 900 },
      { from: 'a', to: 'c' },
    ];
    assert.deepEqual(latenciesBetween(edges, ['a'], ['b', 'c']), [120]);
  });
});

describe('latency sets how fast the wire flows (F-17)', () => {
  it('is 1 without a latency or at the reference latency', () => {
    assert.equal(flowScale(undefined), 1);
    assert.equal(flowScale(50), 1);
  });

  it('slows the dashes for slow calls and speeds them for fast ones, within limits', () => {
    assert.equal(flowScale(200), 2);
    assert.equal(flowScale(0), 0.25);
    assert.equal(flowScale(10_000), 4);
  });

  it('makes a fast call look clearly different from a slow one', () => {
    // Each tenfold step in latency changes the pace by about three times, down to a few milliseconds.
    assert.equal(flowScale(5), 0.32);
    assert.equal(flowScale(10), 0.45);
    assert.equal(flowScale(500), 3.16);
    assert.ok(flowScale(500) / flowScale(5) >= 9, 'a 500 ms call runs about ten times slower than a 5 ms one');
  });

  it('puts the scale on the exported wire', async () => {
    const { generateStandaloneHtml } = await import('../src/exporter/standaloneHtml.ts');
    const doc = docWithWire({ latencyMs: 200 });
    doc.nodes = doc.nodes.map((n) => ({
      ...n,
      kind: 'service',
      accent: 'blue',
      icon: 'cpu',
      subtitle: '',
      eyebrow: '',
      footerLeft: '',
      chip: '',
      zoneLabel: '',
      interfaceLabel: '',
      summary: '',
      metrics: [],
      code: '',
      width: 200,
      height: 100,
    }));
    const html = generateStandaloneHtml(doc);
    assert.match(html, /style="--flow-scale: 2"/);
  });
});

describe('wire label placement', () => {
  const twoParallel = (route: 'auto' | 'straight' | 'orthogonal') => {
    const doc = createBlankDocument();
    const a = createNodeFromStencil('service', 100, 100, 0);
    const b = createNodeFromStencil('service', 600, 100, 1);
    doc.nodes.push(a, b);
    const base = { from: a.id, to: b.id, sourcePort: 'right', targetPort: 'left', route, animated: true } as const;
    doc.edges.push(
      { ...base, id: 'e1', tone: 'emerald', label: 'W/L CRUD operations' },
      { ...base, id: 'e2', tone: 'violet', label: 'W/L Search' },
    );
    return doc;
  };

  it('keeps each label of parallel wires on its own drawn wire, sliding along it rather than off it', () => {
    const routed = routeDiagramEdges(twoParallel('auto'));
    for (const r of routed) {
      const wireY = r.startPoint[1] + (r.laneOffset?.[1] ?? 0);
      assert.ok(Math.abs(r.badgePos![1] - wireY) < 13, `${r.id}: its wire should run through its label`);
    }
    const [p, q] = routed;
    const apart =
      Math.abs(p.badgePos![0] - q.badgePos![0]) >= (p.badgeWidth! + q.badgeWidth!) / 2 ||
      Math.abs(p.badgePos![1] - q.badgePos![1]) >= 26;
    assert.ok(apart, 'labels should not overlap');
  });

  it('slides a clashing label along a long wire so it stays centred on it', () => {
    const doc = twoParallel('auto');
    doc.nodes[1].x = 1100;
    for (const r of routeDiagramEdges(doc)) {
      assert.equal(r.badgePos?.[1], r.startPoint[1] + (r.laneOffset?.[1] ?? 0), `${r.id} label centred on its wire`);
    }
  });

  it('moves a dragged label by its offset from the automatic spot, and round-trips the offset', () => {
    const doc = twoParallel('auto');
    const auto = routeDiagramEdges(doc).find((r) => r.id === 'e2')!.labelAnchor!;
    doc.edges[1].labelOffset = [40, -30];
    const moved = routeDiagramEdges(doc).find((r) => r.id === 'e2')!.badgePos!;
    assert.deepEqual(moved, [auto[0] + 40, auto[1] - 30]);

    const md = serializeToBlueprintMarkdown(doc);
    assert.deepEqual(importMermaidOrBlueprint(md).doc.edges.find((e) => e.id === 'e2')?.labelOffset, [40, -30]);
    const json = parseBlueprintJson(serializeBlueprintJson(doc));
    assert.ok(json.ok);
    if (!json.ok) return;
    assert.deepEqual(json.doc.edges.find((e) => e.id === 'e2')?.labelOffset, [40, -30]);
  });
});

describe('wireEndAngle (V4 MP2)', () => {
  it('computes incoming angles from trimmed endpoints across horizontal, vertical, orthogonal, and curved paths', () => {
    assert.equal(wireEndAngle('M 100 100 L 294 100', [300, 100]), 0);
    assert.equal(wireEndAngle('M 300 100 L 106 100', [100, 100]), 180);
    assert.equal(wireEndAngle('M 100 100 L 100 294', [100, 300]), 90);
    assert.equal(wireEndAngle('M 100 300 L 100 106', [100, 100]), -90);
    assert.equal(wireEndAngle('M 100 100 L 176 100 Q 200 100 200 124 L 200 294', [200, 300]), 90);
    const arcAngle = wireEndAngle('M 100 200 Q 200 80 295 196', [300, 200]);
    assert.ok(arcAngle > 20 && arcAngle < 60, `expected downward-right angle, got ${arcAngle}`);
  });

  it('falls back to the last control or segment vector when path ends directly at endPoint', () => {
    assert.equal(wireEndAngle('M 100 100 L 300 100', [300, 100]), 0);
    assert.equal(wireEndAngle('M 100 100 C 180 100, 220 200, 300 200', [300, 200]), 0);
    assert.equal(wireEndAngle('M 100 100 C 100 180, 200 220, 200 300', [200, 300]), 90);
  });
});
