import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { routeDiagramEdges } from '../src/core/layout.ts';
import { normalizeNodeShape } from '../src/core/nodeStyle.ts';
import { parseBlueprintJson, serializeBlueprintJson } from '../src/exporter/blueprintJson.ts';
import type { EdgeRouteMode, NodeIconName, NodeKind, PortSide, StreamTone } from '../src/types.ts';

const KINDS: NodeKind[] = ['actor', 'core', 'service', 'bus', 'gate', 'store', 'client'];
const SHAPES = ['card', 'rounded', 'pill', 'circle', 'diamond', 'hexagon'] as const;
const ICONS: NodeIconName[] = [
  'actor',
  'monitor',
  'bridge',
  'shield',
  'code',
  'database',
  'agency',
  'server',
  'lock',
  'cloud',
  'spark',
  'cpu',
  'globe',
];
const TONES: StreamTone[] = ['blue', 'emerald', 'rose', 'violet', 'amber'];
const ROUTES: EdgeRouteMode[] = [
  'auto',
  'straight',
  'bezier',
  'arc',
  'orthogonal',
  'step',
  'under',
  'over',
  'fanout',
];
const PORTS: PortSide[] = ['auto', 'top', 'right', 'bottom', 'left'];

describe('lumen relay showcase', () => {
  const raw = readFileSync(new URL('../public/examples/lumen-relay.blueprint.json', import.meta.url), 'utf8');

  it('loads as a blueprint that uses every document feature', () => {
    const parsed = parseBlueprintJson(raw);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    const doc = parsed.doc;
    const ids = new Set(doc.nodes.map((node) => node.id));

    assert.equal(doc.title, 'Lumen Relay');
    assert.equal(doc.direction, 'LR');
    assert.equal(doc.brand.name, 'Lumen Relay');
    assert.equal(doc.brand.accent, '#0f766e');
    assert.match(doc.brand.logo, /^data:image\/svg\+xml;base64,/);
    assert.ok(doc.overviewSummary.includes('harbor'));
    assert.equal(doc.zones.length, 4);
    assert.equal(doc.notesCards.length, 2);
    assert.ok(doc.notesCards.every((card) => card.items.length > 0 && card.code));
    assert.equal(doc.simulations.length, 3);

    assert.deepEqual(new Set(doc.nodes.map((node) => node.kind)), new Set(KINDS));
    assert.deepEqual(new Set(doc.nodes.map((node) => normalizeNodeShape(node.shape))), new Set(SHAPES));
    assert.deepEqual(new Set(doc.nodes.map((node) => node.icon)), new Set(ICONS));
    assert.deepEqual(new Set(doc.nodes.map((node) => node.accent)), new Set(TONES));
    assert.equal(doc.nodes.filter((node) => node.iconImage).length, 1);
    assert.ok(doc.nodes.every((node) => node.metrics.length > 0 && node.code && node.summary));

    assert.deepEqual(new Set(doc.edges.map((edge) => edge.route)), new Set(ROUTES));
    assert.deepEqual(new Set(doc.edges.map((edge) => edge.tone)), new Set(TONES));
    assert.deepEqual(
      new Set(doc.edges.flatMap((edge) => [edge.sourcePort, edge.targetPort])),
      new Set(PORTS),
    );
    assert.ok(doc.edges.some((edge) => edge.animated));
    assert.ok(doc.edges.some((edge) => !edge.animated));
    assert.ok(doc.edges.every((edge) => ids.has(edge.from) && ids.has(edge.to)));

    const stepTones = new Set(doc.simulations.flatMap((scenario) => scenario.steps.map((step) => step.tone)));
    assert.deepEqual(stepTones, new Set(TONES));
    for (const scenario of doc.simulations) {
      assert.ok(scenario.steps.length > 1);
      for (const step of scenario.steps) {
        assert.ok(step.nodes.length > 0);
        assert.ok(step.nodes.every((id) => ids.has(id)));
        assert.ok(step.trace);
      }
    }

    const routed = routeDiagramEdges(doc);
    assert.equal(routed.length, doc.edges.length);
    assert.ok(routed.every((edge) => edge.pathD.startsWith('M ')));

    const again = parseBlueprintJson(serializeBlueprintJson(doc));
    assert.equal(again.ok, true);
    if (!again.ok) return;
    assert.equal(again.doc.nodes.find((node) => node.id === 'permit')?.shape, 'diamond');
    assert.match(again.doc.nodes.find((node) => node.id === 'quay-mark')?.iconImage || '', /^data:image\/svg\+xml;base64,/);
    const sealCopy = again.doc.edges.find((edge) => edge.id === 'e-copy');
    assert.equal(sealCopy?.sourcePort, 'bottom');
    assert.equal(sealCopy?.targetPort, 'top');
    assert.equal(sealCopy?.waypoint, undefined);
    assert.equal(again.doc.edges.find((edge) => edge.id === 'e-seal')?.animated, false);
    assert.equal(again.doc.brand.accent, '#0f766e');
  });
});
