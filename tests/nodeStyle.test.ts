import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { importMermaidOrBlueprint, serializeToBlueprintMarkdown } from '../src/core/parser.ts';
import { normalizeNodeShape, sanitizeIconImage } from '../src/core/nodeStyle.ts';
import { generateStandaloneHtml } from '../src/exporter/standaloneHtml.ts';
import { createBlankDocument, createNodeFromStencil } from '../src/templates/presets.ts';

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('node shapes and custom icons', () => {
  it('accepts known outlines and image data URLs only', () => {
    assert.equal(normalizeNodeShape('Hexagon'), 'hexagon');
    assert.equal(normalizeNodeShape('triangle'), 'card');
    assert.equal(sanitizeIconImage(TINY_PNG), TINY_PNG);
    assert.equal(sanitizeIconImage('data:text/html;base64,PHNjcmlwdD4='), undefined);
    assert.equal(sanitizeIconImage('https://example.com/icon.png'), undefined);
  });

  it('round-trips a node outline and custom icon through Blueprint Markdown and export HTML', () => {
    const doc = createBlankDocument();
    const node = createNodeFromStencil('core', 80, 80, 0);
    node.shape = 'hexagon';
    node.iconImage = TINY_PNG;
    doc.nodes.push(node);

    const md = serializeToBlueprintMarkdown(doc);
    assert.match(md, /shape: hexagon/);
    const { doc: restored, issues } = importMermaidOrBlueprint(md);
    assert.equal(issues.length, 0);
    assert.equal(restored.nodes[0].shape, 'hexagon');
    assert.equal(restored.nodes[0].iconImage, TINY_PNG);

    const html = generateStandaloneHtml(restored);
    assert.match(html, /data-shape="hexagon"/);
    assert.match(html, /class="node-custom-icon"/);
    assert.match(html, /class="node-shape-plate"[\s\S]*class="node-shape-geom"/);
    assert.doesNotMatch(html, /clip-path:\s*polygon/);

    const rejected = importMermaidOrBlueprint(`---
title: Bad
nodes:
  box:
    kind: service
    shape: triangle
    iconImage: data:text/html;base64,PHNjcmlwdD4=
---
flowchart LR
  box[Box]
`);
    assert.equal(rejected.doc.nodes[0].shape, undefined);
    assert.equal(rejected.doc.nodes[0].iconImage, undefined);
    assert.ok(rejected.issues.some((issue) => issue.message.includes('unknown shape')));
    assert.ok(rejected.issues.some((issue) => issue.message.includes('icon image')));
  });
});
