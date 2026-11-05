import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { FIRST_RUN_TEMPLATE_ID, pickFirstRunFailure } from '../src/core/firstRun.ts';
import { runInsightsAllLevels } from '../src/core/insights.ts';
import { routeDiagramEdges } from '../src/core/layout.ts';
import { normalizeNodeShape } from '../src/core/nodeStyle.ts';
import { viewOfPage } from '../src/core/pages.ts';
import { entryPointIds, reachableFrom } from '../src/core/reachability.ts';
import { parseBlueprintJson, serializeBlueprintJson } from '../src/exporter/blueprintJson.ts';
import { renderDiagramSvg } from '../src/exporter/diagramSvg.ts';
import type { DiagramDocument, DiagramEdge, DiagramNode, LevelContent } from '../src/types.ts';

// The flagship showcase (docs/showcase.md) promises to use every feature of the file format and to raise only the
// Review findings it explains. These tests keep that promise as the app grows.

const KINDS = ['actor', 'core', 'service', 'bus', 'gate', 'store', 'client', 'queue', 'balancer', 'cache', 'limiter', 'scheduler'];
const SHAPES = ['card', 'rounded', 'pill', 'circle', 'diamond', 'hexagon', 'asymmetric', 'trapezoid', 'bucket'];
const ICONS = [
  'actor', 'monitor', 'bridge', 'shield', 'code', 'database', 'agency', 'server', 'lock', 'cloud',
  'spark', 'cpu', 'globe', 'queue', 'balancer', 'bolt', 'gauge', 'clock', 'stream', 'bucket',
];
const TONES = ['blue', 'emerald', 'rose', 'violet', 'amber'];
const ROUTES = ['auto', 'straight', 'bezier', 'arc', 'orthogonal', 'step', 'under', 'over', 'fanout'];
const PORTS = ['auto', 'top', 'right', 'bottom', 'left'];
const PROTOCOLS = ['http', 'grpc', 'graphql', 'kafka', 'amqp', 'sql', 'custom'];
const STATUSES = ['planned', 'live', 'deprecated', 'at-risk'];

const raw = readFileSync(new URL('../src/examples/flash-sale-ticketing.blueprint.json', import.meta.url), 'utf8');
const parsed = parseBlueprintJson(raw);
const doc = (parsed.ok ? parsed.doc : null) as DiagramDocument;

/** Every node and edge in the file: page 1, the other pages and every level inside them. */
function everything(): { nodes: DiagramNode[]; edges: DiagramEdge[] } {
  const nodes: DiagramNode[] = [];
  const edges: DiagramEdge[] = [];
  const visit = (level: LevelContent) => {
    nodes.push(...level.nodes);
    edges.push(...level.edges);
    for (const node of level.nodes) if (node.child) visit(node.child);
  };
  visit(doc);
  for (const page of doc.pages ?? []) visit(page);
  return { nodes, edges };
}
const set = <T>(items: T[]) => [...new Set(items)].sort();

describe('flash-sale ticketing showcase', () => {
  it('is the first-run example and parses', () => {
    assert.equal(parsed.ok, true);
    assert.equal(FIRST_RUN_TEMPLATE_ID, 'flash-sale-ticketing');
    assert.equal(doc.title, 'Marquee: Flash-Sale Ticketing');
    assert.match(doc.brand.logo, /^data:image\/svg\+xml;base64,/);
  });

  it('uses every component kind, outline, icon and colour', () => {
    const { nodes } = everything();
    assert.deepEqual(set(nodes.map((n) => n.kind)), set(KINDS));
    assert.deepEqual(set(nodes.map((n) => normalizeNodeShape(n.shape))), set(SHAPES));
    assert.deepEqual(set(nodes.map((n) => n.icon)), set(ICONS));
    assert.deepEqual(set(doc.nodes.map((n) => n.accent)), set(TONES));
    assert.deepEqual(set(doc.nodes.flatMap((n) => (n.status ? [n.status] : []))), set(STATUSES));
    assert.ok(doc.nodes.some((n) => n.iconImage));
    assert.ok(doc.nodes.every((n) => n.summary && n.metrics.length > 0), 'every card says what it is and shows a metric');
  });

  it('uses every wire route, port, protocol and wire option', () => {
    const { edges } = everything();
    assert.deepEqual(set(doc.edges.map((e) => e.route)), set(ROUTES));
    assert.deepEqual(set(doc.edges.map((e) => e.tone)), set(TONES));
    assert.deepEqual(set(doc.edges.flatMap((e) => [e.sourcePort, e.targetPort])), set(PORTS));
    assert.deepEqual(set(edges.flatMap((e) => (e.protocol ? [e.protocol] : []))), set(PROTOCOLS));
    assert.ok(doc.edges.some((e) => e.sync === 'async') && doc.edges.some((e) => e.sync !== 'async'));
    assert.ok(doc.edges.some((e) => e.flow === 'both'));
    assert.ok(doc.edges.some((e) => e.waypoint));
    assert.ok(doc.edges.some((e) => !e.animated));
    assert.ok(doc.edges.some((e) => e.comment));
    assert.ok(doc.edges.every((e) => e.label), 'every wire says what it carries');
    assert.equal(routeDiagramEdges(doc).length, doc.edges.length);
  });

  it('sets every per-kind option', () => {
    const byKind = (kind: string) => doc.nodes.filter((n) => n.kind === kind);
    assert.ok(byKind('queue').some((n) => n.queue?.delivery === 'fanout' && n.queue.partitions));
    assert.ok(byKind('queue').some((n) => n.queue?.ordering === 'fifo' && n.queue.maxDepth && n.queue.deadLetterId));
    assert.ok(byKind('cache').some((n) => n.cache?.hitRate && n.cache.backingId));
    assert.ok(byKind('limiter').some((n) => n.limiter?.admit === 2));
    assert.ok(byKind('scheduler').some((n) => n.schedule?.every));
    assert.ok(byKind('balancer').some((n) => n.balancer?.strategy));
    assert.ok(doc.nodes.some((n) => n.external));
    assert.ok(doc.nodes.some((n) => n.resilience?.replicas));
    assert.ok(doc.nodes.some((n) => n.resilience?.fallbackId));
    assert.ok(doc.nodes.some((n) => n.resilience?.circuitBreaker));
    assert.ok(doc.nodes.some((n) => n.owner && n.links?.length && n.tags?.length && n.code));
    assert.ok(doc.nodes.some((n) => n.comment));
  });

  it('has levels, pages, frames, swimlanes, notes, a text label and a legend', () => {
    assert.equal(doc.nodes.filter((n) => n.child).length, 2);
    assert.equal((doc.pages ?? []).length, 2);
    assert.ok(doc.pageTitle);
    assert.equal(doc.frames?.length, 2);
    assert.ok(doc.nodes.some((n) => n.frameId));
    assert.equal(doc.zones.length, 5);
    assert.ok(doc.notesCards.some((c) => c.variant === 'text'));
    assert.ok(doc.notesCards.some((c) => c.variant !== 'text' && c.items.length > 0));
    assert.equal(doc.legend?.length, 5);
    for (let i = 0; i < 3; i++) assert.match(renderDiagramSvg(viewOfPage(doc, i)), /<svg /);
  });

  it('plays six scenarios whose every step follows a wire', () => {
    assert.equal(doc.simulations.length, 6);
    const ids = new Set(doc.nodes.map((n) => n.id));
    const wired = (a: string, b: string) => doc.edges.some((e) => (e.from === a && e.to === b) || (e.from === b && e.to === a));
    for (const scenario of doc.simulations) {
      for (const step of scenario.steps) {
        assert.ok(step.nodes.every((id) => ids.has(id)), `${step.id}: known components`);
        for (let i = 0; i + 1 < step.nodes.length; i++) {
          assert.ok(wired(step.nodes[i], step.nodes[i + 1]), `${step.id}: ${step.nodes[i]} and ${step.nodes[i + 1]} are wired`);
        }
      }
    }
    assert.deepEqual(set(doc.simulations.flatMap((s) => s.steps.map((st) => st.tone))), set(TONES));
    assert.ok(doc.simulations.some((s) => s.budgetMs));
    assert.ok(doc.simulations.some((s) => s.failures?.length));
    assert.equal(doc.simulations[0].steps[0].nodes[0], 'fans', 'first run plays a scenario that starts with the fans');
    assert.ok(doc.simulations[0].steps.length <= 6, 'first run fails a component after one loop, so the first scenario is short');
  });

  it('raises exactly the three Review findings the guide explains, on every page and level', () => {
    const found: string[] = [];
    for (let i = 0; i < 3; i++) {
      for (const issue of runInsightsAllLevels(viewOfPage(doc, i))) found.push(`${i}:${issue.code}:${issue.target.id}`);
    }
    assert.deepEqual(found.sort(), ['0:at-risk-fan-in:seat-db', '0:deprecated-in-path:sms-legacy', '0:spof:seat-db']);
  });

  it('first run fails the ticket database, which cuts off ticketing', () => {
    assert.equal(pickFirstRunFailure(doc), 'seat-db');
    const r = reachableFrom(doc, entryPointIds(doc), ['seat-db']);
    assert.ok(r.unreachable.includes('order-events'));
    assert.ok(r.unreachable.includes('worker'));
  });

  it('round-trips through Blueprint JSON', () => {
    const again = parseBlueprintJson(serializeBlueprintJson(doc));
    assert.ok(again.ok);
    if (again.ok) assert.deepEqual(again.doc, doc);
  });
});
