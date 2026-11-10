import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  balancerChip,
  balancerTargets,
  normalizeBalancer,
  pickLiveTarget,
  substituteBalancerTargets,
} from '../src/core/balancers.ts';
import { getNodeDimensions } from '../src/core/layout.ts';
import {
  balancerDrawsTrapezoid,
  drawnShape,
  nodeShapeContentPadding,
  nodeShapePlate,
  renderNodeShapePlate,
} from '../src/core/nodeStyle.ts';
import { reachableFrom } from '../src/core/reachability.ts';
import { runInsights } from '../src/core/insights.ts';
import { computeDocumentDiff } from '../src/core/diff.ts';
import { describeDiagram } from '../src/core/describe.ts';
import { importMermaidOrBlueprint, serializeMermaidBlock, serializeToBlueprintMarkdown } from '../src/core/parser.ts';
import { parseBlueprintJson, serializeBlueprintJson } from '../src/exporter/blueprintJson.ts';
import { renderDiagramSvg } from '../src/exporter/diagramSvg.ts';
import { generateStandaloneHtml } from '../src/exporter/standaloneHtml.ts';
import { createShareUrl, decodeSharedDiagramFromHash } from '../src/studio/shareLink.ts';
import { kindForImage } from '../src/importers/common.ts';
import { createBlankDocument, createNodeFromStencil, findStencil } from '../src/templates/presets.ts';
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

describe('load balancer model and outline (K2, spec 4.1)', () => {
  it('has a stencil, a size and a chip', () => {
    const s = findStencil('balancer')!;
    assert.equal(s.kind, 'balancer');
    assert.equal(s.paletteTitle, 'Load Balancer');
    assert.equal(s.eyebrow, 'Balancer');
    assert.equal(s.chip, 'RR');
    assert.equal(s.accent, 'violet');
    assert.deepEqual(getNodeDimensions('balancer'), { width: 200, height: 120 });
    const n = createNodeFromStencil('balancer', 0, 0, 0);
    assert.equal(n.kind, 'balancer');
    assert.equal(n.balancer, undefined, 'a plain balancer stays plain');
    assert.equal(n.shape, undefined);
  });

  it('normalizeBalancer keeps a known strategy and leaves the default absent', () => {
    assert.deepEqual(normalizeBalancer({ strategy: 'hash' }), { strategy: 'hash' });
    assert.deepEqual(normalizeBalancer({ strategy: 'Least-Connections' }), { strategy: 'least-connections' });
    assert.equal(normalizeBalancer({ strategy: 'round-robin' }), undefined);
    assert.equal(normalizeBalancer({ strategy: 'random' }), undefined);
    assert.equal(normalizeBalancer({ strategy: 7 }), undefined);
    assert.equal(normalizeBalancer('hash'), undefined);
    assert.equal(normalizeBalancer(null), undefined);
  });

  it('balancerDrawsTrapezoid: no shape or card; an explicit other shape wins; other kinds never', () => {
    assert.equal(balancerDrawsTrapezoid('balancer', undefined), true);
    assert.equal(balancerDrawsTrapezoid('balancer', 'card'), true);
    assert.equal(balancerDrawsTrapezoid('balancer', 'hexagon'), false);
    assert.equal(balancerDrawsTrapezoid('service', undefined), false);
    assert.equal(drawnShape('balancer', undefined), 'trapezoid');
    assert.equal(drawnShape('balancer', 'pill'), 'pill');
    assert.equal(drawnShape('service', undefined), undefined);
  });

  it('trapezoid plate: wide side right when the flow runs left to right', () => {
    const plate = nodeShapePlate('trapezoid', 200, 120, 'LR');
    assert.equal(plate?.kind, 'polygon');
    // inset 1.25: narrow left edge from 20.4 to 99.6, full-height right edge.
    assert.equal(plate && plate.kind === 'polygon' && plate.points, '1.3,20.4 198.8,1.3 198.8,118.8 1.3,99.6');
  });

  it('trapezoid plate: wide side at the bottom when the flow runs top down', () => {
    const plate = nodeShapePlate('trapezoid', 200, 120, 'TD');
    assert.equal(plate && plate.kind === 'polygon' && plate.points, '34,1.3 166,1.3 198.8,118.8 1.3,118.8');
  });

  it('trapezoid works as a shape on any component, and leaves other shapes as they were', () => {
    assert.ok(renderNodeShapePlate('trapezoid', 200, 120).includes('<polygon'));
    assert.equal(nodeShapePlate('card', 200, 120), null);
    assert.equal(nodeShapePlate(undefined, 200, 120), null);
    const hex = nodeShapePlate('hexagon', 200, 120);
    assert.equal(hex && hex.kind === 'polygon' && hex.points.split(' ').length, 6);
  });

  it('a default balancer gets trapezoid padding; a card service gets none', () => {
    assert.notEqual(nodeShapeContentPadding('balancer', undefined, 200, 120), '');
    assert.equal(nodeShapeContentPadding('service', undefined, 200, 120), '');
  });

  it('balancer chip follows the strategy', () => {
    const b = { kind: 'balancer', chip: 'RR' };
    assert.equal(balancerChip(b), 'RR');
    assert.equal(balancerChip({ ...b, balancer: { strategy: 'least-connections' } }), 'LEAST');
    assert.equal(balancerChip({ ...b, balancer: { strategy: 'weighted' } }), 'WEIGHTED');
    assert.equal(balancerChip({ ...b, balancer: { strategy: 'hash' } }), 'HASH');
    assert.equal(balancerChip({ ...b, kind: 'service', balancer: { strategy: 'hash' } }), 'RR');
  });
});

describe('Mermaid trapezoid bracket (K2, spec 4.1)', () => {
  const mermaid = (shapes: string) => `flowchart LR\n${shapes}\n`;

  it('[/Title\\] imports as a load balancer', () => {
    const { doc } = importMermaidOrBlueprint(mermaid('  lb[/"Edge"\\]\n  a["A"]\n  lb --> a'));
    const lb = doc.nodes.find((n) => n.id === 'lb')!;
    assert.equal(lb.kind, 'balancer');
    assert.equal(lb.title, 'Edge');
  });

  it('[/Title/] and [\\Title\\] are still clients', () => {
    const { doc } = importMermaidOrBlueprint(mermaid('  a[/"Slash"/]\n  b[\\"Back"\\]'));
    assert.equal(doc.nodes.find((n) => n.id === 'a')?.kind, 'client');
    assert.equal(doc.nodes.find((n) => n.id === 'b')?.kind, 'client');
  });

  it('the embedded Mermaid block writes a balancer as a trapezoid and a client as a parallelogram', () => {
    const doc = build({ lb: 'balancer', c: 'client' }, [], { lb: { title: 'Edge' }, c: { title: 'Web' } });
    const block = serializeMermaidBlock(doc);
    assert.match(block, /lb\[\/"Edge[^\]]*\\\]/);
    assert.match(block, /c\[\/"Web[^\]]*\/\]/);
  });
});

describe('chaos: a balancer spreads load over its targets (K2, spec 4.2)', () => {
  const graph = () =>
    build({ U: 'actor', LB: 'balancer', A: 'service', B: 'service', DB: 'store' }, [
      ['U', 'LB'], ['LB', 'A'], ['LB', 'B'], ['A', 'DB'], ['B', 'DB'],
    ]);

  it('U > LB > {A, B} > DB, fail A: B takes the load, LB is not at risk, DB is reachable', () => {
    const r = reachableFrom(graph(), ['U'], ['A']);
    assert.deepEqual(r.failed, ['A']);
    assert.ok(r.rerouted.includes('B'));
    assert.ok(!r.atRisk.includes('LB'));
    assert.deepEqual(r.atRisk, []);
    assert.ok(r.reachable.includes('DB'));
    assert.deepEqual(r.unreachable, []);
  });

  it('fail both A and B: the balancer is at risk', () => {
    const doc = build({ U: 'actor', LB: 'balancer', A: 'service', B: 'service' }, [['U', 'LB'], ['LB', 'A'], ['LB', 'B']]);
    const r = reachableFrom(doc, ['U'], ['A', 'B']);
    assert.deepEqual(r.atRisk, ['LB']);
    assert.deepEqual(r.rerouted, []);
  });

  it('what only the failed target served is still unreachable', () => {
    const doc = build({ U: 'actor', LB: 'balancer', A: 'service', B: 'service', X: 'store' }, [
      ['U', 'LB'], ['LB', 'A'], ['LB', 'B'], ['A', 'X'],
    ]);
    const r = reachableFrom(doc, ['U'], ['A']);
    assert.deepEqual(r.unreachable, ['X']);
    assert.ok(!r.atRisk.includes('LB'));
    assert.ok(r.rerouted.includes('B'));
  });

  it('with nothing failed nothing changes', () => {
    const r = reachableFrom(graph(), ['U'], []);
    assert.deepEqual([r.failed, r.rerouted, r.atRisk, r.unreachable], [[], [], [], []]);
  });

  it('the same diagram with a service in front of the targets keeps the old at-risk result', () => {
    const doc = build({ U: 'actor', P: 'service', A: 'service', B: 'service' }, [['U', 'P'], ['P', 'A'], ['P', 'B']]);
    const r = reachableFrom(doc, ['U'], ['A']);
    assert.deepEqual(r.atRisk, ['P']);
  });

  it('a failed balancer cuts off its targets, as any component does', () => {
    const r = reachableFrom(graph(), ['U'], ['LB']);
    assert.deepEqual(r.failed, ['LB']);
    assert.deepEqual(r.unreachable, ['A', 'B', 'DB']);
  });

  it('a balancer with replicas degrades instead of failing', () => {
    const doc = graph();
    doc.nodes.find((n) => n.id === 'LB')!.resilience = { replicas: 2 };
    const r = reachableFrom(doc, ['U'], ['LB']);
    assert.deepEqual(r.degraded, ['LB']);
    assert.deepEqual(r.unreachable, []);
  });
});

describe('playback substitution maths (K2, spec 4.2)', () => {
  const doc = build({ U: 'actor', LB: 'balancer', A: 'service', B: 'service', C: 'service' }, [
    ['U', 'LB'], ['LB', 'A'], ['LB', 'B'], ['LB', 'C'],
  ]);

  it('balancerTargets lists the targets of wires leaving the balancer', () => {
    assert.deepEqual(balancerTargets(doc, 'LB'), ['A', 'B', 'C']);
    assert.deepEqual(balancerTargets(doc, 'U'), ['LB']);
  });

  it('pickLiveTarget is round robin over the live targets and deterministic', () => {
    const down = new Set(['A']);
    assert.equal(pickLiveTarget(['A', 'B', 'C'], down, 0), 'B');
    assert.equal(pickLiveTarget(['A', 'B', 'C'], down, 1), 'C');
    assert.equal(pickLiveTarget(['A', 'B', 'C'], down, 2), 'B');
    assert.equal(pickLiveTarget(['A', 'B', 'C'], new Set(['A', 'B', 'C']), 0), null);
  });

  it('swaps a down target for a live one and counts per balancer', () => {
    const counters = new Map<string, number>();
    const down = new Set(['A']);
    const first = substituteBalancerTargets(doc, ['LB'], ['A'], down, counters);
    assert.deepEqual(first.nodes, ['B']);
    assert.deepEqual(first.swaps, [{ balancerId: 'LB', from: 'A', to: 'B' }]);
    const second = substituteBalancerTargets(doc, ['LB'], ['A'], down, counters);
    assert.deepEqual(second.nodes, ['C']);
    const third = substituteBalancerTargets(doc, ['LB'], ['A'], down, counters);
    assert.deepEqual(third.nodes, ['B']);
  });

  it('with nothing down the step is returned as it was', () => {
    const out = substituteBalancerTargets(doc, ['LB'], ['A'], new Set(), new Map());
    assert.deepEqual(out, { nodes: ['A'], swaps: [] });
  });

  it('only a balancer in the current step swaps; a plain service does not', () => {
    const out = substituteBalancerTargets(doc, ['U'], ['A'], new Set(['A']), new Map());
    assert.deepEqual(out.nodes, ['A']);
  });

  it('a step that holds both the balancer and its down target swaps too', () => {
    const out = substituteBalancerTargets(doc, [], ['U', 'LB', 'A'], new Set(['A']), new Map());
    assert.deepEqual(out.nodes, ['U', 'LB', 'B']);
    assert.deepEqual(out.swaps, [{ balancerId: 'LB', from: 'A', to: 'B' }]);
  });

  it('with every target down the step is returned as it was', () => {
    const out = substituteBalancerTargets(doc, ['LB'], ['A'], new Set(['A', 'B', 'C']), new Map());
    assert.deepEqual(out, { nodes: ['A'], swaps: [] });
  });

  it('a live target already in the step is not drawn twice', () => {
    const out = substituteBalancerTargets(doc, ['LB'], ['A', 'B'], new Set(['A']), new Map());
    assert.deepEqual(out.nodes, ['B']);
  });
});

describe('balancer review rules (K2, spec 4.3)', () => {
  const found = (doc: DiagramDocument) => runInsights(doc).filter((i) => i.code === 'balancer-single-target');

  it('balancer-single-target: one target', () => {
    const doc = build({ u: 'actor', lb: 'balancer', a: 'service' }, [['u', 'lb'], ['lb', 'a']], { lb: { title: 'Edge LB' } });
    const issues = found(doc);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].level, 'info');
    assert.equal(issues[0].target.id, 'lb');
    assert.match(issues[0].message, /Edge LB has one target, so it does not spread load\./);
  });

  it('balancer-single-target: quiet when the one target runs several replicas', () => {
    const doc = build({ u: 'actor', lb: 'balancer', a: 'service' }, [['u', 'lb'], ['lb', 'a']], { a: { resilience: { replicas: 3 } } });
    assert.equal(found(doc).length, 0);
  });

  it('balancer-single-target: no targets, and quiet with two or more', () => {
    const none = build({ u: 'actor', lb: 'balancer' }, [['u', 'lb']], { lb: { title: 'Edge LB' } });
    assert.match(found(none)[0].message, /has no targets/);
    const two = build({ u: 'actor', lb: 'balancer', a: 'service', b: 'service' }, [['u', 'lb'], ['lb', 'a'], ['lb', 'b']]);
    assert.equal(found(two).length, 0);
  });

  it('spof: a balancer with two live targets does not make either target a SPOF, but the balancer can be one', () => {
    const doc = build({ u: 'actor', lb: 'balancer', a: 'service', b: 'service', db: 'store' }, [
      ['u', 'lb'], ['lb', 'a'], ['lb', 'b'], ['a', 'db'], ['b', 'db'],
    ]);
    const spof = runInsights(doc).filter((i) => i.code === 'spof').map((i) => i.target.id);
    assert.ok(!spof.includes('a'));
    assert.ok(!spof.includes('b'));
    assert.ok(spof.includes('lb'));
  });

  it('spof: a balancer with replicas is not a SPOF', () => {
    const doc = build(
      { u: 'actor', lb: 'balancer', a: 'service', b: 'service', db: 'store' },
      [['u', 'lb'], ['lb', 'a'], ['lb', 'b'], ['a', 'db'], ['b', 'db']],
      { lb: { resilience: { replicas: 2 } } },
    );
    assert.ok(!runInsights(doc).some((i) => i.code === 'spof' && i.target.id === 'lb'));
  });
});

describe('balancer file formats (K2)', () => {
  const doc = (balancer?: DiagramNode['balancer']) =>
    build({ lb: 'balancer', a: 'service', b: 'service' }, [['lb', 'a'], ['lb', 'b']], {
      lb: balancer ? { balancer, title: 'Edge LB' } : { title: 'Edge LB' },
    });

  it('Blueprint file round-trips the strategy, and none', () => {
    for (const balancer of [{ strategy: 'hash' as const }, undefined]) {
      const back = importMermaidOrBlueprint(serializeToBlueprintMarkdown(doc(balancer))).doc;
      const lb = back.nodes.find((n) => n.id === 'lb')!;
      assert.equal(lb.kind, 'balancer');
      assert.deepEqual(lb.balancer, balancer);
    }
  });

  it('Blueprint file aliases map to balancer', () => {
    const kinds = ['balancer', 'lb', 'load-balancer', 'loadbalancer'];
    const nodes = kinds.map((k, i) => `  n${i}:\n    kind: ${k}\n    title: N${i}`).join('\n');
    const text = `---\nnodes:\n${nodes}\n---\n\n\`\`\`mermaid\nflowchart LR\n${kinds.map((_, i) => `  n${i}[N${i}]`).join('\n')}\n\`\`\`\n`;
    const parsed = importMermaidOrBlueprint(text).doc;
    for (let i = 0; i < kinds.length; i++) assert.equal(parsed.nodes.find((n) => n.id === `n${i}`)?.kind, 'balancer', kinds[i]);
  });

  it('Blueprint JSON round-trips and drops bad strategies', () => {
    for (const balancer of [{ strategy: 'weighted' as const }, undefined]) {
      const parsed = parseBlueprintJson(serializeBlueprintJson(doc(balancer)));
      assert.ok(parsed.ok);
      const lb = parsed.ok ? parsed.doc.nodes.find((n) => n.id === 'lb')! : null;
      assert.equal(lb?.kind, 'balancer');
      assert.deepEqual(lb?.balancer, balancer);
    }
    const json = JSON.parse(serializeBlueprintJson(doc({ strategy: 'hash' })));
    json.document.nodes.find((n: { id: string }) => n.id === 'lb').balancer = { strategy: 'random' };
    const parsed = parseBlueprintJson(JSON.stringify(json));
    assert.ok(parsed.ok);
    assert.equal(parsed.ok && parsed.doc.nodes.find((n) => n.id === 'lb')?.balancer, undefined);
  });

  it('a pre-balancer file still opens', () => {
    const json = JSON.parse(serializeBlueprintJson(doc()));
    json.version = 12;
    const parsed = parseBlueprintJson(JSON.stringify(json));
    assert.ok(parsed.ok);
  });

  it('share link round-trips the strategy', async () => {
    const { hash } = await createShareUrl(doc({ strategy: 'least-connections' }));
    const back = await decodeSharedDiagramFromHash(hash);
    const lb = back?.nodes.find((n) => n.id === 'lb');
    assert.equal(lb?.kind, 'balancer');
    assert.deepEqual(lb?.balancer, { strategy: 'least-connections' });
  });

  it('a trapezoid shape on a service round-trips', () => {
    const d = build({ s: 'service' }, [], { s: { shape: 'trapezoid' } });
    const parsed = parseBlueprintJson(serializeBlueprintJson(d));
    assert.ok(parsed.ok);
    assert.equal(parsed.ok && parsed.doc.nodes[0].shape, 'trapezoid');
    const md = importMermaidOrBlueprint(serializeToBlueprintMarkdown(d)).doc;
    assert.equal(md.nodes[0].shape, 'trapezoid');
  });

  it('diff lists a strategy change', () => {
    const item = computeDocumentDiff(doc(), doc({ strategy: 'hash' })).nodeDiffs.find((d) => d.id === 'lb')!;
    assert.equal(item.status, 'modified');
    assert.deepEqual(item.changes, ['Edge LB: strategy round-robin → hash']);
  });

  it('text description names the callers, the targets and the strategy', () => {
    const d = build(
      { w: 'client', lb: 'balancer', a: 'service', b: 'service' },
      [['w', 'lb'], ['lb', 'a'], ['lb', 'b']],
      { w: { title: 'Web' }, lb: { title: 'Edge LB', balancer: { strategy: 'hash' } }, a: { title: 'App A' }, b: { title: 'App B' } },
    );
    assert.match(describeDiagram(d), /Edge LB is a load balancer for Web\. It spreads traffic over App A and App B, hash\./);
  });

  it('SVG and HTML exports draw a trapezoid with the strategy chip', () => {
    const d = doc({ strategy: 'hash' });
    const svg = renderDiagramSvg(d);
    assert.match(svg, /<polygon points="[\d., ]+"/);
    assert.match(svg, /HASH/);
    const html = generateStandaloneHtml(d);
    assert.match(html, /data-kind="balancer"[^>]*data-shape="trapezoid"/);
    assert.match(html, /<polygon class="node-shape-geom"/);
    assert.match(html, /HASH/);
  });

  it('container image: haproxy is a balancer; nginx, traefik and envoy stay gates', () => {
    assert.equal(kindForImage('haproxy:2.9'), 'balancer');
    for (const image of ['nginx:1', 'traefik:v3', 'envoyproxy/envoy']) assert.equal(kindForImage(image), 'gate', image);
  });
});
