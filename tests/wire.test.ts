import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { routeDiagramEdges } from '../src/core/layout.ts';
import { isAsyncWire, normalizeWireFields, wireLabelText } from '../src/core/wire.ts';
import { parseBlueprintJson, serializeBlueprintJson } from '../src/exporter/blueprintJson.ts';
import { createBlankDocument } from '../src/templates/presets.ts';
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
