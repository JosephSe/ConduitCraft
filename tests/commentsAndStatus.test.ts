import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createBlankDocument, createNodeFromStencil } from '../src/templates/presets.ts';
import {
  importMermaidOrBlueprint,
  serializeToBlueprintMarkdown,
} from '../src/core/parser.ts';
import {
  parseBlueprintJson,
  serializeBlueprintJson,
} from '../src/exporter/blueprintJson.ts';
import { generateStandaloneHtml } from '../src/exporter/standaloneHtml.ts';
import type { ComponentStatus } from '../src/types.ts';

describe('edge and node comments, plus status badges (suggestion 15)', () => {
  it('round-trips status and comments through Blueprint Markdown (.md)', () => {
    const doc = createBlankDocument();
    const nodeA = createNodeFromStencil('core', 100, 100, 0);
    nodeA.id = 'auth-core';
    nodeA.status = 'live';
    nodeA.comment = 'Needs rate-limiting audit';

    const nodeB = createNodeFromStencil('service', 350, 100, 1);
    nodeB.id = 'billing-svc';
    nodeB.status = 'planned';
    nodeB.comment = 'Scheduled for Q2 release';

    doc.nodes.push(nodeA, nodeB);

    doc.edges.push({
      id: 'edge-auth-billing',
      from: 'auth-core',
      to: 'billing-svc',
      sourcePort: 'right',
      targetPort: 'left',
      tone: 'emerald',
      route: 'bezier',
      label: 'gRPC v2',
      animated: true,
      comment: 'TLS 1.3 enforced with mutual auth',
    });

    const markdown = serializeToBlueprintMarkdown(doc);
    assert.ok(markdown.includes('status: live'));
    assert.ok(markdown.includes('status: planned'));
    assert.ok(markdown.includes('comment: Needs rate-limiting audit'));
    assert.ok(markdown.includes('comment: TLS 1.3 enforced with mutual auth'));

    const { doc: restored, issues } = importMermaidOrBlueprint(markdown);
    assert.strictEqual(issues.length, 0);
    assert.strictEqual(restored.nodes.length, 2);

    const rA = restored.nodes.find((n) => n.id === 'auth-core');
    assert.ok(rA);
    assert.strictEqual(rA.status, 'live');
    assert.strictEqual(rA.comment, 'Needs rate-limiting audit');

    const rB = restored.nodes.find((n) => n.id === 'billing-svc');
    assert.ok(rB);
    assert.strictEqual(rB.status, 'planned');
    assert.strictEqual(rB.comment, 'Scheduled for Q2 release');

    assert.strictEqual(restored.edges.length, 1);
    assert.strictEqual(restored.edges[0].comment, 'TLS 1.3 enforced with mutual auth');
  });

  it('round-trips status and comments through .blueprint.json', () => {
    const doc = createBlankDocument();
    const node = createNodeFromStencil('store', 120, 180, 0);
    node.id = 'db-shard';
    node.status = 'at-risk';
    node.comment = 'High replication lag observed during peak';
    doc.nodes.push(node);

    const json = serializeBlueprintJson(doc);
    const res = parseBlueprintJson(json);
    assert.ok(res.ok);
    const restored = res.doc;

    assert.ok(restored);
    const rNode = restored.nodes.find((n) => n.id === 'db-shard');
    assert.ok(rNode);
    assert.strictEqual(rNode.status, 'at-risk');
    assert.strictEqual(rNode.comment, 'High replication lag observed during peak');
  });

  it('renders status badge and comment badges in standalone HTML export', () => {
    const doc = createBlankDocument();
    const node = createNodeFromStencil('gate', 80, 80, 0);
    node.id = 'waf-gate';
    node.status = 'deprecated';
    node.comment = 'Migrating to Cloud Armor next sprint';
    doc.nodes.push(node);

    const html = generateStandaloneHtml(doc);
    assert.ok(html.includes('class="node-status-badge"'));
    assert.ok(html.includes('data-status="deprecated"'));
    assert.ok(html.includes('Deprecated'));
    assert.ok(html.includes('class="node-comment-badge"'));
    assert.ok(html.includes('Migrating to Cloud Armor next sprint'));
  });

  it('supports all four component status values', () => {
    const statuses: ComponentStatus[] = ['planned', 'live', 'deprecated', 'at-risk'];
    for (const st of statuses) {
      const doc = createBlankDocument();
      const node = createNodeFromStencil('service', 100, 100, 0);
      node.id = `node-${st}`;
      node.status = st;
      doc.nodes.push(node);

      const html = generateStandaloneHtml(doc);
      assert.ok(html.includes(`data-status="${st}"`));
    }
  });
});
