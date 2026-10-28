import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  importMermaidOrBlueprint,
  serializeToBlueprintMarkdown,
  serializeToMermaid,
} from '../src/core/parser.ts';
import { parseBlueprintJson, serializeBlueprintJson } from '../src/exporter/blueprintJson.ts';
import {
  autoLayoutDocument,
  relatedNodeIds,
  routeDiagramEdges,
} from '../src/core/layout.ts';
import {
  createBlankDocument,
  createNodeFromStencil,
} from '../src/templates/presets.ts';
import type { EdgeRouteMode } from '../src/types.ts';

describe('ConduitCraft Core Engine — Parser, Routing & Round-Trip Tests', () => {
  it('starts from a 100% blank, domain-agnostic document', () => {
    const doc = createBlankDocument();
    assert.equal(doc.nodes.length, 0);
    assert.equal(doc.edges.length, 0);
    assert.equal(doc.zones.length, 0);
    assert.equal(doc.notesCards.length, 0);
  });

  it('parses standard Mermaid flowcharts and infers component kinds and tones', () => {
    const mmd = `flowchart LR
  user(["Platform User<br/>Initiator"]) -->|Submit Order| api[["Order Core<br/>Primary API"]]
  api ==>|Approved| db[("Order Store<br/>Ledger")]
  api -.->|Rejected| user`;

    const { doc, issues } = importMermaidOrBlueprint(mmd);
    assert.equal(issues.length, 0);
    assert.equal(doc.nodes.length, 3);
    assert.equal(doc.edges.length, 3);

    const userNode = doc.nodes.find((n) => n.id === 'user');
    const apiNode = doc.nodes.find((n) => n.id === 'api');
    const dbNode = doc.nodes.find((n) => n.id === 'db');
    assert.equal(userNode?.kind, 'actor');
    assert.equal(apiNode?.kind, 'core');
    assert.equal(dbNode?.kind, 'store');

    const rejectEdge = doc.edges.find((e) => e.label === 'Rejected');
    assert.equal(rejectEdge?.tone, 'rose');
    assert.equal(rejectEdge?.route, 'auto');
    const routedEdges = routeDiagramEdges(doc);
    const routedReject = routedEdges.find((e) => e.label === 'Rejected');
    assert.equal(routedReject?.isLoop, true);
  });

  it('produces distinct SVG geometry across all 8 explicit routing modes even for horizontally aligned nodes with pinned ports', () => {
    const doc = createBlankDocument();
    const n1 = createNodeFromStencil('actor', 160, 300, 0);
    const n2 = createNodeFromStencil('core', 520, 300, 1);
    doc.nodes.push(n1, n2);

    const modes: EdgeRouteMode[] = [
      'straight',
      'bezier',
      'arc',
      'orthogonal',
      'step',
      'under',
      'over',
      'fanout',
    ];

    const paths = new Map<EdgeRouteMode, string>();
    for (const route of modes) {
      doc.edges = [
        {
          id: 'e1',
          from: n1.id,
          to: n2.id,
          sourcePort: 'right',
          targetPort: 'left',
          tone: 'blue',
          route,
          label: 'Stream',
          animated: true,
        },
      ];
      const [routed] = routeDiagramEdges(doc);
      assert.ok(routed?.pathD, `Missing pathD for mode ${route}`);
      paths.set(route, routed.pathD);
    }

    const uniquePaths = new Set(paths.values());
    assert.equal(
      uniquePaths.size,
      modes.length,
      `Expected ${modes.length} distinct SVG paths, got ${uniquePaths.size}`,
    );
  });

  it('separates parallel wires between the same pair of nodes with lane offsets and de-overlaps badges', () => {
    const doc = createBlankDocument();
    const n1 = createNodeFromStencil('service', 160, 280, 0);
    const n2 = createNodeFromStencil('service', 520, 280, 1);
    doc.nodes.push(n1, n2);
    doc.edges.push(
      {
        id: 'e1',
        from: n1.id,
        to: n2.id,
        sourcePort: 'right',
        targetPort: 'left',
        tone: 'blue',
        route: 'straight',
        label: 'Primary Channel',
        animated: true,
      },
      {
        id: 'e2',
        from: n1.id,
        to: n2.id,
        sourcePort: 'right',
        targetPort: 'left',
        tone: 'emerald',
        route: 'straight',
        label: 'Secondary Channel',
        animated: true,
      },
    );

    const routed = routeDiagramEdges(doc);
    assert.equal(routed.length, 2);
    assert.ok(routed[0].laneOffset, 'Expected laneOffset on first parallel wire');
    assert.ok(routed[1].laneOffset, 'Expected laneOffset on second parallel wire');
    assert.notDeepEqual(routed[0].laneOffset, routed[1].laneOffset);
    assert.notDeepEqual(routed[0].badgePos, routed[1].badgePos);
  });

  it('round-trips Blueprint Markdown (.md) including coordinates, routing modes, waypoints, zones, and notes', () => {
    const doc = createBlankDocument();
    doc.title = 'Telemetry Mesh';
    const n1 = createNodeFromStencil('actor', 192, 320, 0);
    const n2 = createNodeFromStencil('core', 544, 304, 1);
    doc.nodes.push(n1, n2);
    doc.edges.push({
      id: 'wire_1',
      from: n1.id,
      to: n2.id,
      sourcePort: 'right',
      targetPort: 'left',
      tone: 'violet',
      route: 'arc',
      label: 'Control Bus',
      animated: true,
      waypoint: [368, 220],
    });

    const md = serializeToBlueprintMarkdown(doc);
    const { doc: restored, issues } = importMermaidOrBlueprint(md);
    assert.equal(issues.length, 0);
    assert.equal(restored.title, 'Telemetry Mesh');
    assert.equal(restored.nodes.length, 2);
    assert.equal(restored.nodes[0].x, 192);
    assert.equal(restored.edges[0].route, 'arc');
    assert.deepEqual(restored.edges[0].waypoint, [368, 220]);

    const mmd = serializeToMermaid(restored);
    assert.match(mmd, /flowchart LR/);
  });

  it('reports line-numbered validation issues for malformed Mermaid or unknown references', () => {
    const badInput = `flowchart LR
  a[Alpha] --> a
  THIS IS NOT VALID MERMAID SYNTAX`;

    const { issues } = importMermaidOrBlueprint(badInput);
    assert.ok(issues.length >= 2, 'Expected validation issues for self-loop and invalid syntax');
    assert.ok(issues.some((i) => i.code === 'self-loop' && i.line === 2));
    assert.ok(issues.some((i) => i.code === 'unrecognized-line' && i.line === 3));
  });

  it('auto-layouts a multi-tier graph cleanly', () => {
    const { doc } = importMermaidOrBlueprint(`flowchart LR
      a([Actor]) --> b[[Core]]
      b --> c[(Store)]`);
    autoLayoutDocument(doc);
    const [na, nb, nc] = doc.nodes;
    assert.ok(na.x < nb.x && nb.x < nc.x, 'Expected left-to-right monotonic X coordinates');
  });

  it('supports bidirectional connectors with two-way flow and no end arrowheads', () => {
    const mmd = `flowchart LR
      n1([Client]) ---|Sync Bus| n2[[Server]]
      n2 <-->|Peer Link| n3[[Replica]]
      n3 ===|Solid Bus| n4[(Store)]
      n4 <==>|Thick Peer| n5[(Archive)]
      n1 -.-|Dotted Bus| n5
      n2 <-.->|Dotted Peer| n4
      n1 -->|One-way Request| n4`;

    const { doc, issues } = importMermaidOrBlueprint(mmd);
    assert.equal(issues.length, 0);
    assert.equal(doc.edges.length, 7);

    const syncEdge = doc.edges.find((e) => e.label === 'Sync Bus');
    const peerEdge = doc.edges.find((e) => e.label === 'Peer Link');
    const solidEdge = doc.edges.find((e) => e.label === 'Solid Bus');
    const thickPeerEdge = doc.edges.find((e) => e.label === 'Thick Peer');
    const dottedEdge = doc.edges.find((e) => e.label === 'Dotted Bus');
    const dottedPeerEdge = doc.edges.find((e) => e.label === 'Dotted Peer');
    const oneWayEdge = doc.edges.find((e) => e.label === 'One-way Request');

    assert.equal(syncEdge?.flow, 'both');
    assert.equal(syncEdge?.tone, 'blue');
    assert.equal(peerEdge?.flow, 'both');
    assert.equal(peerEdge?.tone, 'blue');
    assert.equal(solidEdge?.flow, 'both');
    assert.equal(solidEdge?.tone, 'emerald');
    assert.equal(thickPeerEdge?.flow, 'both');
    assert.equal(thickPeerEdge?.tone, 'emerald');
    assert.equal(dottedEdge?.flow, 'both');
    assert.equal(dottedEdge?.tone, 'rose');
    assert.equal(dottedPeerEdge?.flow, 'both');
    assert.equal(dottedPeerEdge?.tone, 'rose');
    assert.equal(oneWayEdge?.flow, 'forward');

    // Mermaid serialization: flow: 'both' produces connector without end arrowhead
    const outMmd = serializeToMermaid(doc);
    assert.match(outMmd, /n1 ---\|Sync Bus\| n2/);
    assert.match(outMmd, /n3 ===\|Solid Bus\| n4/);
    assert.match(outMmd, /n1 -\.-\|Dotted Bus\| n5/);
    assert.match(outMmd, /n1 -->\|One-way Request\| n4/);

    // Markdown round-trip preserves flow: 'both'
    const md = serializeToBlueprintMarkdown(doc);
    assert.match(md, /flow: both/);
    const { doc: restoredMd } = importMermaidOrBlueprint(md);
    const restoredSync = restoredMd.edges.find((e) => e.label === 'Sync Bus');
    const restoredOneWay = restoredMd.edges.find((e) => e.label === 'One-way Request');
    assert.equal(restoredSync?.flow, 'both');
    assert.equal(restoredOneWay?.flow, 'forward');

    // JSON round-trip preserves flow: 'both'
    const jsonStr = serializeBlueprintJson(doc);
    assert.match(jsonStr, /"flow": "both"/);
    const parsedJson = parseBlueprintJson(jsonStr);
    assert.equal(parsedJson.ok, true);
    if (parsedJson.ok) {
      const jsonSync = parsedJson.doc.edges.find((e) => e.label === 'Sync Bus');
      const jsonOneWay = parsedJson.doc.edges.find((e) => e.label === 'One-way Request');
      assert.equal(jsonSync?.flow, 'both');
      assert.equal(jsonOneWay?.flow, 'forward');
    }
  });
});

describe('connected component highlight', () => {
  it('keeps the highlight to one hop around every selected component', () => {
    const doc = createBlankDocument();
    const a = createNodeFromStencil('core', 40, 40, 0);
    const b = createNodeFromStencil('service', 280, 40, 1);
    const c = createNodeFromStencil('store', 520, 40, 2);
    const lone = createNodeFromStencil('client', 40, 280, 3);
    a.id = 'a';
    b.id = 'b';
    c.id = 'c';
    lone.id = 'lone';
    doc.nodes.push(a, b, c, lone);
    doc.edges.push(
      {
        id: 'ab',
        from: 'a',
        to: 'b',
        sourcePort: 'right',
        targetPort: 'left',
        tone: 'blue',
        route: 'auto',
        label: '',
        animated: false,
      },
      {
        id: 'bc',
        from: 'b',
        to: 'c',
        sourcePort: 'right',
        targetPort: 'left',
        tone: 'blue',
        route: 'auto',
        label: '',
        animated: false,
      },
      {
        id: 'missing',
        from: 'a',
        to: 'ghost',
        sourcePort: 'right',
        targetPort: 'left',
        tone: 'blue',
        route: 'auto',
        label: '',
        animated: false,
      },
    );

    assert.deepEqual([...relatedNodeIds(doc, ['b'])].sort(), ['a', 'b', 'c']);
    assert.deepEqual([...relatedNodeIds(doc, ['a'])].sort(), ['a', 'b']);
    assert.deepEqual([...relatedNodeIds(doc, ['a', 'c'])].sort(), ['a', 'b', 'c']);
    assert.deepEqual([...relatedNodeIds(doc, ['lone', 'ghost'])].sort(), ['lone']);
    assert.equal(relatedNodeIds(doc, ['ghost']).size, 0);
  });
});
