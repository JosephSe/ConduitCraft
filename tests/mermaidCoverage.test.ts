import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  importMermaidOrBlueprint,
  serializeToMermaid,
  colorToStreamTone,
} from '../src/core/parser.ts';

describe('Mermaid import coverage (classDef, style, linkStyle, shapes)', () => {
  it('maps named colors and hex strings to nearest stream tones', () => {
    assert.strictEqual(colorToStreamTone('emerald'), 'emerald');
    assert.strictEqual(colorToStreamTone('green'), 'emerald');
    assert.strictEqual(colorToStreamTone('#10b981'), 'emerald');

    assert.strictEqual(colorToStreamTone('blue'), 'blue');
    assert.strictEqual(colorToStreamTone('#3b82f6'), 'blue');

    assert.strictEqual(colorToStreamTone('red'), 'rose');
    assert.strictEqual(colorToStreamTone('#f43f5e'), 'rose');

    assert.strictEqual(colorToStreamTone('purple'), 'violet');
    assert.strictEqual(colorToStreamTone('violet'), 'violet');
    assert.strictEqual(colorToStreamTone('#8b5cf6'), 'violet');

    assert.strictEqual(colorToStreamTone('orange'), 'amber');
    assert.strictEqual(colorToStreamTone('yellow'), 'amber');
    assert.strictEqual(colorToStreamTone('#f59e0b'), 'amber');
  });

  it('parses classDef and class directives and applies tones', () => {
    const mermaid = `flowchart TD
      classDef dbStyle fill:#10b981,stroke:#059669;
      classDef alertStyle fill:#f43f5e,stroke:#e11d48;

      A[Database Node]
      B[Alert Service]
      C[Worker]

      class A dbStyle;
      class B alertStyle;
      A --> B
    `;

    const { doc, issues } = importMermaidOrBlueprint(mermaid);

    assert.strictEqual(doc.nodes.length, 3);
    const nodeA = doc.nodes.find((n) => n.id === 'A');
    const nodeB = doc.nodes.find((n) => n.id === 'B');

    assert.ok(nodeA);
    assert.strictEqual(nodeA.accent, 'emerald', 'node A gets emerald tone from dbStyle');

    assert.ok(nodeB);
    assert.strictEqual(nodeB.accent, 'rose', 'node B gets rose tone from alertStyle');

    const classDefIssues = issues.filter((i) => i.code === 'mermaid-classdef');
    assert.ok(classDefIssues.length >= 2, 'records informative classDef diagnostics');
  });

  it('parses inline class names (node:::className)', () => {
    const mermaid = `flowchart LR
      classDef secure fill:#8b5cf6;
      Auth:::secure --> Gateway
    `;

    const { doc } = importMermaidOrBlueprint(mermaid);
    const authNode = doc.nodes.find((n) => n.id === 'Auth');

    assert.ok(authNode);
    assert.strictEqual(authNode.accent, 'violet', 'inline class assigns violet tone to Auth');
  });

  it('parses node style directives', () => {
    const mermaid = `flowchart LR
      Ingress[API Ingress] --> Egress[Storage]
      style Ingress fill:#f59e0b,stroke:#d97706;
      style Egress fill:#10b981;
    `;

    const { doc, issues } = importMermaidOrBlueprint(mermaid);
    const ingress = doc.nodes.find((n) => n.id === 'Ingress');
    const egress = doc.nodes.find((n) => n.id === 'Egress');

    assert.ok(ingress);
    assert.strictEqual(ingress.accent, 'amber');

    assert.ok(egress);
    assert.strictEqual(egress.accent, 'emerald');

    const styleIssues = issues.filter((i) => i.code === 'mermaid-style');
    assert.strictEqual(styleIssues.length, 2);
  });

  it('parses linkStyle directives for wire tones', () => {
    const mermaid = `flowchart LR
      A --> B
      B --> C
      linkStyle 0 stroke:#f43f5e,stroke-width:2px;
      linkStyle 1 stroke:#8b5cf6;
    `;

    const { doc, issues } = importMermaidOrBlueprint(mermaid);
    assert.strictEqual(doc.edges.length, 2);

    assert.strictEqual(doc.edges[0].tone, 'rose', 'edge 0 gets rose tone');
    assert.strictEqual(doc.edges[1].tone, 'violet', 'edge 1 gets violet tone');

    const linkStyleIssues = issues.filter((i) => i.code === 'mermaid-linkstyle');
    assert.strictEqual(linkStyleIssues.length, 2);
  });

  it('parses default linkStyle for all wires', () => {
    const mermaid = `flowchart LR
      A --> B
      B --> C
      linkStyle default stroke:#10b981;
    `;

    const { doc } = importMermaidOrBlueprint(mermaid);
    assert.strictEqual(doc.edges.length, 2);
    assert.strictEqual(doc.edges[0].tone, 'emerald');
    assert.strictEqual(doc.edges[1].tone, 'emerald');
  });

  it('parses click directives and captures external links', () => {
    const mermaid = `flowchart LR
      ServiceA[Payment API]
      click ServiceA "https://api.payments.internal/docs" "API Documentation"
    `;

    const { doc, issues } = importMermaidOrBlueprint(mermaid);
    const node = doc.nodes.find((n) => n.id === 'ServiceA');

    assert.ok(node);
    assert.ok(node.summary?.includes('https://api.payments.internal/docs'));

    const clickIssue = issues.find((i) => i.code === 'mermaid-click');
    assert.ok(clickIssue);
  });

  it('parses common Mermaid shapes and maps them to NodeShape', () => {
    const mermaid = `flowchart TD
      CircleNode((Circle Shape))
      DiamondNode{Rhombus Decision}
      HexNode{{Hexagon Gate}}
      AsymNode>Asymmetric Banner]
      StadiumNode([Stadium Pill])
      CylinderNode[(Cylinder Database)]
    `;

    const { doc } = importMermaidOrBlueprint(mermaid);

    const circle = doc.nodes.find((n) => n.id === 'CircleNode');
    assert.strictEqual(circle?.shape, 'circle');

    const diamond = doc.nodes.find((n) => n.id === 'DiamondNode');
    assert.strictEqual(diamond?.shape, 'diamond');

    const hex = doc.nodes.find((n) => n.id === 'HexNode');
    assert.strictEqual(hex?.shape, 'hexagon');

    const asym = doc.nodes.find((n) => n.id === 'AsymNode');
    assert.strictEqual(asym?.shape, 'asymmetric');

    const stadium = doc.nodes.find((n) => n.id === 'StadiumNode');
    assert.strictEqual(stadium?.shape, 'pill');

    const cylinder = doc.nodes.find((n) => n.id === 'CylinderNode');
    assert.strictEqual(cylinder?.kind, 'store');
    assert.strictEqual(cylinder?.shape, undefined);
  });

  it('serializes custom shapes accurately back to Mermaid', () => {
    const mermaid = `flowchart TD
      A((Circle Node))
      B>Banner Node]
      C{Diamond Node}
      A --> B --> C
    `;

    const { doc } = importMermaidOrBlueprint(mermaid);
    const serialized = serializeToMermaid(doc);

    assert.ok(serialized.includes('A(("Circle Node'));
    assert.ok(serialized.includes('B>"Banner Node'));
    assert.ok(serialized.includes('C{"Diamond Node'));
  });
});

describe('Mermaid subgraphs as levels (D6)', () => {
  const nested = `flowchart LR
  User([User]) --> Gateway
  subgraph checkout ["Checkout API"]
    Gateway[Gateway]
    subgraph payments ["Payments"]
      Charge[Charge]
      Ledger[(Ledger)]
    end
    Gateway --> Charge
    Charge --> Ledger
  end
  Ledger --> Audit[Audit log]
  checkout --> Audit`;

  type Level = { nodes: Level2[]; edges: unknown[] };
  type Level2 = { child?: Level };
  const countNodes = (nodes: Level2[]): number =>
    nodes.reduce((sum, n) => sum + 1 + (n.child ? countNodes(n.child.nodes) : 0), 0);
  const countEdges = (level: Level): number =>
    level.edges.length + level.nodes.reduce((sum, n) => sum + (n.child ? countEdges(n.child) : 0), 0);

  it('keeps swimlanes as the default, byte for byte', () => {
    const plain = importMermaidOrBlueprint(nested);
    const explicit = importMermaidOrBlueprint(nested, { subgraphs: 'swimlanes' });
    assert.deepStrictEqual(explicit.doc.nodes, plain.doc.nodes);
    assert.deepStrictEqual(explicit.doc.zones, plain.doc.zones);
    assert.ok(plain.doc.zones.length > 0);
    assert.ok(plain.doc.nodes.every((n) => !n.child));
    assert.strictEqual(serializeToMermaid(plain.doc), serializeToMermaid(explicit.doc, { levels: false }));
  });

  it('matches the swimlane output recorded before levels existed (snapshot)', () => {
    const { doc } = importMermaidOrBlueprint(nested);
    assert.deepStrictEqual(
      doc.zones.map((z) => [z.id, z.title, z.subtitle]),
      [
        ['checkout', 'CHECKOUT API', '3 Components'],
        ['payments', 'PAYMENTS', '2 Components'],
      ],
    );
    assert.deepStrictEqual(doc.edges.map((e) => `${e.from}>${e.to}`), [
      'User>Gateway',
      'Gateway>Charge',
      'Charge>Ledger',
      'Ledger>Audit',
      'checkout>Audit',
    ]);
    assert.strictEqual(
      serializeToMermaid(doc),
      [
        'flowchart LR',
        '  subgraph checkout ["CHECKOUT API"]',
        '    Gateway["Gateway<br/>Request Processor"]',
        '    Charge["Charge<br/>Request Processor"]',
        '    Ledger[("Ledger<br/>Persistent Storage")]',
        '  end',
        '  User(["User<br/>Human Role"])',
        '  Audit["Audit log<br/>Request Processor"]',
        '  checkout["checkout<br/>Request Processor"]',
        '',
        '  User --> Gateway',
        '  Gateway --> Charge',
        '  Charge --> Ledger',
        '  Ledger --> Audit',
        '  checkout --> Audit',
      ].join('\n'),
    );
  });

  it('turns each subgraph into a component whose level holds its nodes', () => {
    const { doc } = importMermaidOrBlueprint(nested, { subgraphs: 'levels' });
    assert.deepStrictEqual(doc.zones, []);
    assert.deepStrictEqual(doc.nodes.map((n) => n.id).sort(), ['Audit', 'User', 'checkout']);
    const checkout = doc.nodes.find((n) => n.id === 'checkout')!;
    assert.strictEqual(checkout.title, 'Checkout API');
    assert.deepStrictEqual(checkout.child!.nodes.map((n) => n.id).sort(), ['Gateway', 'payments']);
    const payments = checkout.child!.nodes.find((n) => n.id === 'payments')!;
    assert.deepStrictEqual(payments.child!.nodes.map((n) => n.id).sort(), ['Charge', 'Ledger']);
  });

  it('attaches wires that cross a boundary to the subgraph component', () => {
    const { doc } = importMermaidOrBlueprint(nested, { subgraphs: 'levels' });
    const top = doc.edges.map((e) => `${e.from}>${e.to}`).sort();
    assert.deepStrictEqual(top, ['User>checkout', 'checkout>Audit', 'checkout>Audit']);
    const checkout = doc.nodes.find((n) => n.id === 'checkout')!;
    assert.deepStrictEqual(
      checkout.child!.edges.map((e) => `${e.from}>${e.to}`),
      ['Gateway>payments'],
    );
  });

  it('round-trips Mermaid to levels to Mermaid without losing a node or wire', () => {
    const first = importMermaidOrBlueprint(nested, { subgraphs: 'levels' }).doc;
    const text = serializeToMermaid(first, { levels: true });
    assert.match(text, /subgraph checkout \["Checkout API"\]/);
    assert.match(text, /subgraph payments \["Payments"\]/);
    const second = importMermaidOrBlueprint(text, { subgraphs: 'levels' }).doc;
    assert.strictEqual(countNodes(second.nodes), countNodes(first.nodes));
    assert.strictEqual(countEdges(second), countEdges(first));
    assert.strictEqual(countNodes(first.nodes), 7);
    assert.strictEqual(serializeToMermaid(second, { levels: true }), text);
  });

  it('lets a bare reference to a subgraph id mean the subgraph component', () => {
    const { doc } = importMermaidOrBlueprint('flowchart LR\n  A --> grp\n  subgraph grp [Group]\n    B\n  end', {
      subgraphs: 'levels',
    });
    assert.strictEqual(doc.nodes.filter((n) => n.id === 'grp').length, 1);
    assert.ok(doc.nodes.find((n) => n.id === 'grp')!.child);
    assert.deepStrictEqual(doc.edges.map((e) => `${e.from}>${e.to}`), ['A>grp']);
  });

  it('merges subgraphs nested past the level cap and says so', () => {
    const depth = 10;
    const open = Array.from({ length: depth }, (_, i) => `${'  '.repeat(i)}subgraph g${i} [G${i}]`).join('\n');
    const close = Array.from({ length: depth }, () => 'end').join('\n');
    const { doc, issues } = importMermaidOrBlueprint(`flowchart LR\n${open}\nLeaf\n${close}`, { subgraphs: 'levels' });
    let levels = 0;
    let cursor = doc.nodes[0];
    while (cursor?.child) {
      levels += 1;
      cursor = cursor.child.nodes[0];
    }
    assert.strictEqual(levels, 8);
    assert.ok(issues.some((i) => i.level === 'info' && i.code === 'level-cap'));
    assert.strictEqual(cursor.id, 'Leaf');
  });

  it('ignores the levels option when there are no subgraphs', () => {
    const src = 'flowchart LR\n  A --> B';
    assert.deepStrictEqual(
      importMermaidOrBlueprint(src, { subgraphs: 'levels' }).doc.nodes,
      importMermaidOrBlueprint(src).doc.nodes,
    );
  });
});
