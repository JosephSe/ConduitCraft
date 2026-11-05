import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  INSIGHT_RULES,
  insightCountText,
  normalizeBudgetMs,
  normalizeInsights,
  runInsights,
  visibleInsights,
  type InsightCode,
} from '../src/core/insights.ts';
import { STARTER_TEMPLATES, loadTemplateRaw } from '../src/studio/templatesGallery.ts';
import { parseBlueprintJson, serializeBlueprintJson } from '../src/exporter/blueprintJson.ts';
import { importMermaidOrBlueprint, serializeToBlueprintMarkdown } from '../src/core/parser.ts';
import { createBlankDocument, createNodeFromStencil } from '../src/templates/presets.ts';
import type { DiagramDocument, DiagramEdge, NodeKind } from '../src/types.ts';

function build(kinds: Record<string, NodeKind>, wires: Array<[string, string, Partial<DiagramEdge>?]>): DiagramDocument {
  const doc = createBlankDocument();
  doc.nodes = Object.entries(kinds).map(([id, kind], i) => ({ ...createNodeFromStencil(kind, i * 100, 40, i), id, title: id }));
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

const codes = (doc: DiagramDocument, code: InsightCode) =>
  runInsights(doc)
    .filter((i) => i.code === code)
    .map((i) => i.target.id);

describe('architecture insights (F-02)', () => {
  it('spof: flags the node every path to a sink goes through, not nodes with a parallel route', () => {
    const chain = build({ u: 'actor', gw: 'gate', api: 'service', db: 'store' }, [
      ['u', 'gw'],
      ['gw', 'api'],
      ['api', 'db'],
    ]);
    assert.deepEqual(codes(chain, 'spof'), ['gw', 'api']);

    const diamond = build({ u: 'actor', a: 'service', b: 'service', db: 'store' }, [
      ['u', 'a'],
      ['u', 'b'],
      ['a', 'db'],
      ['b', 'db'],
    ]);
    assert.deepEqual(codes(diamond, 'spof'), []);
  });

  it('spof: replicas and a live fallback remove the risk', () => {
    const doc = build({ u: 'actor', api: 'service', db: 'store' }, [
      ['u', 'api'],
      ['api', 'db'],
    ]);
    assert.deepEqual(codes(doc, 'spof'), ['api']);
    doc.nodes[1].resilience = { replicas: 3 };
    assert.deepEqual(codes(doc, 'spof'), []);
  });

  it('cycle: flags a synchronous loop, ignores one broken by an async wire', () => {
    const loop = build({ a: 'service', b: 'service', c: 'service' }, [
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'a'],
    ]);
    assert.deepEqual(codes(loop, 'cycle'), ['a']);
    loop.edges[2].sync = 'async';
    assert.deepEqual(codes(loop, 'cycle'), []);
    const self = build({ a: 'service' }, [['a', 'a']]);
    assert.deepEqual(codes(self, 'cycle'), ['a']);
    const line = build({ a: 'service', b: 'service' }, [['a', 'b']]);
    assert.deepEqual(codes(line, 'cycle'), []);
  });

  it('orphan: flags a component with no wires only', () => {
    const doc = build({ a: 'service', b: 'service', lone: 'service' }, [['a', 'b']]);
    assert.deepEqual(codes(doc, 'orphan'), ['lone']);
    doc.edges = [];
    assert.deepEqual(codes(doc, 'orphan').sort(), ['a', 'b', 'lone']);
  });

  it('dangling-store: a store that is only written to', () => {
    const doc = build({ api: 'service', db: 'store' }, [['api', 'db', { label: 'insert' }]]);
    assert.deepEqual(codes(doc, 'dangling-store'), ['db']);
    doc.edges[0].label = 'query orders';
    assert.deepEqual(codes(doc, 'dangling-store'), []);
    doc.edges[0].label = 'insert';
    doc.edges[0].flow = 'both';
    assert.deepEqual(codes(doc, 'dangling-store'), []);
    doc.edges = [{ ...doc.edges[0], from: 'db', to: 'api', flow: 'forward' }];
    assert.deepEqual(codes(doc, 'dangling-store'), []);
    doc.edges = [];
    assert.deepEqual(codes(doc, 'dangling-store'), []);
  });

  it('deprecated-in-path: a deprecated component a scenario passes through', () => {
    const doc = build({ u: 'actor', old: 'service', api: 'service' }, [
      ['u', 'old'],
      ['old', 'api'],
    ]);
    doc.simulations = [
      { id: 's1', name: 'Checkout', tone: 'emerald', steps: [{ id: 'a', nodes: ['u', 'api'], tone: 'emerald', label: 'A', trace: '' }] },
    ];
    assert.deepEqual(codes(doc, 'deprecated-in-path'), []);
    doc.nodes[1].status = 'deprecated';
    assert.deepEqual(codes(doc, 'deprecated-in-path'), []);
    doc.simulations[0].steps[0].nodes.push('old');
    assert.deepEqual(codes(doc, 'deprecated-in-path'), ['old']);
  });

  it('at-risk-fan-in: needs at-risk status and three or more dependents', () => {
    const doc = build({ a: 'service', b: 'service', c: 'service', hub: 'service' }, [
      ['a', 'hub'],
      ['b', 'hub'],
    ]);
    doc.nodes[3].status = 'at-risk';
    assert.deepEqual(codes(doc, 'at-risk-fan-in'), []);
    doc.edges.push({ ...doc.edges[0], id: 'w9', from: 'c' });
    assert.deepEqual(codes(doc, 'at-risk-fan-in'), ['hub']);
    doc.nodes[3].status = 'live';
    assert.deepEqual(codes(doc, 'at-risk-fan-in'), []);
  });

  it('latency-budget: an error when the path sums past the budget, pointing at the slowest wire', () => {
    const doc = build({ u: 'actor', a: 'service', b: 'service' }, [
      ['u', 'a', { latencyMs: 40 }],
      ['a', 'b', { latencyMs: 90 }],
    ]);
    const step = (id: string, nodes: string[]) => ({ id, nodes, tone: 'emerald' as const, label: id, trace: '' });
    doc.simulations = [
      { id: 's', name: 'Fast path', tone: 'emerald', budgetMs: 100, steps: [step('1', ['u']), step('2', ['a']), step('3', ['b'])] },
    ];
    const found = runInsights(doc).filter((i) => i.code === 'latency-budget');
    assert.equal(found.length, 1);
    assert.equal(found[0].level, 'error');
    assert.deepEqual(found[0].target, { type: 'edge', id: 'w1' });
    assert.match(found[0].message, /130 ms.*30 ms over its 100 ms/);
    doc.simulations[0].budgetMs = 130;
    assert.deepEqual(codes(doc, 'latency-budget'), []);
    delete doc.simulations[0].budgetMs;
    assert.deepEqual(codes(doc, 'latency-budget'), []);
  });

  it('unlabeled-wire: only between two services', () => {
    const doc = build({ a: 'service', b: 'service', db: 'store' }, [
      ['a', 'b', { label: '' }],
      ['a', 'db', { label: '' }],
    ]);
    assert.deepEqual(codes(doc, 'unlabeled-wire'), ['w0']);
    doc.edges[0].label = 'charge';
    assert.deepEqual(codes(doc, 'unlabeled-wire'), []);
  });

  it('muting hides a rule but runInsights still reports it', () => {
    const doc = build({ a: 'service', lone: 'service' }, []);
    assert.equal(visibleInsights(doc).length, 2);
    doc.insights = { muted: ['orphan'] };
    assert.equal(visibleInsights(doc).length, 0);
    assert.equal(runInsights(doc).length, 2);
  });

  it('normalizes untrusted input and words the count', () => {
    assert.deepEqual(normalizeInsights({ muted: ['spof', 'spof', 'nope', 3] }), { muted: ['spof'] });
    assert.equal(normalizeInsights({ muted: [] }), undefined);
    assert.equal(normalizeInsights('x'), undefined);
    assert.equal(normalizeBudgetMs(250.4), 250);
    for (const bad of [0, -1, NaN, '5', null]) assert.equal(normalizeBudgetMs(bad), undefined);
    assert.deepEqual([0, 1, 2].map(insightCountText), ['No issues', '1 issue', '2 issues']);
  });

  it('every rule is listed once with a level', () => {
    assert.equal(new Set(INSIGHT_RULES.map((r) => r.code)).size, INSIGHT_RULES.length);
    assert.equal(INSIGHT_RULES.length, 12);
  });

  it('no bundled template produces an error', async () => {
    for (const template of STARTER_TEMPLATES) {
      const parsed = parseBlueprintJson(await loadTemplateRaw(template));
      assert.ok(parsed.ok, template.id);
      const errors = runInsights(parsed.doc).filter((i) => i.level === 'error');
      assert.deepEqual(errors, [], template.id);
    }
  });

  it('muted rules and budgets survive JSON and Blueprint Markdown round trips', () => {
    const doc = build({ u: 'actor', a: 'service' }, [['u', 'a']]);
    doc.insights = { muted: ['orphan', 'cycle'] };
    doc.simulations = [
      { id: 's', name: 'Run', tone: 'emerald', budgetMs: 200, steps: [{ id: '1', nodes: ['u', 'a'], tone: 'emerald', label: 'x', trace: '' }] },
    ];
    const viaJson = parseBlueprintJson(serializeBlueprintJson(doc));
    assert.ok(viaJson.ok);
    assert.deepEqual(viaJson.doc.insights, { muted: ['orphan', 'cycle'] });
    assert.equal(viaJson.doc.simulations[0].budgetMs, 200);

    const viaMd = importMermaidOrBlueprint(serializeToBlueprintMarkdown(doc));
    assert.deepEqual(viaMd.doc.insights, { muted: ['orphan', 'cycle'] });
    assert.equal(viaMd.doc.simulations[0].budgetMs, 200);
  });
});
