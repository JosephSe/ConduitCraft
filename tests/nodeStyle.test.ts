import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, it } from 'node:test';
import { getNodeDimensions } from '../src/core/layout.ts';
import { importMermaidOrBlueprint, serializeToBlueprintMarkdown } from '../src/core/parser.ts';
import {
  cylinderPlate,
  nodeShapeContentPadding,
  normalizeNodeShape,
  sanitizeIconImage,
} from '../src/core/nodeStyle.ts';
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

  it('draws a default data store as a cylinder without storing that outline', () => {
    const plate = cylinderPlate(248, 172);
    assert.equal(plate.rx, 122.5);
    assert.equal(plate.ry, 18);
    assert.equal(plate.cy, 19.5);
    assert.equal(
      plate.body,
      'M 1.5,19.5 L 1.5,152.5 A 122.5 18 0 0 0 124,170.5 A 122.5 18 0 0 0 246.5,152.5 L 246.5,19.5 Z',
    );
    assert.equal(nodeShapeContentPadding('store', undefined, 248, 172), '44px 1.15rem 26px');
    for (const sheet of ['studio.css', 'viewer.css']) {
      const css = fs.readFileSync(new URL(`../src/styles/${sheet}`, import.meta.url), 'utf8');
      assert.match(css, /\.arch-node\[data-shape="cylinder"\] \.node-eyebrow \{ display: none; \}/);
    }
    assert.match(nodeShapeContentPadding('store', 'diamond', 248, 172), /px /);

    const doc = createBlankDocument();
    const store = createNodeFromStencil('store', 80, 80, 0);
    store.title = 'ES Cache';
    store.subtitle = 'Elastic Search';
    store.eyebrow = 'Data Store';
    store.footerLeft = 'REST';
    store.chip = 'API';
    doc.nodes.push(store);

    const md = serializeToBlueprintMarkdown(doc);
    assert.doesNotMatch(md, /shape:\s*cylinder/);
    assert.doesNotMatch(md, /shape:\s*rounded/);
    const { doc: restored, issues } = importMermaidOrBlueprint(md);
    assert.equal(issues.length, 0);
    assert.equal(restored.nodes[0].kind, 'store');
    assert.equal(restored.nodes[0].shape, undefined);

    const html = generateStandaloneHtml(restored);
    const open = html.match(/<button\b[^>]*data-kind="store"[^>]*>/)?.[0] ?? '';
    assert.match(open, /data-shape="cylinder"/);
    assert.match(html, /class="node-shape-geom cylinder-body"/);
    assert.match(html, /class="node-shape-geom cylinder-lid"/);
    assert.doesNotMatch(open, /shape:\s*cylinder/);

    store.shape = 'diamond';
    const diamondHtml = generateStandaloneHtml(doc);
    const diamondOpen = diamondHtml.match(/<button\b[^>]*data-kind="store"[^>]*>/)?.[0] ?? '';
    assert.match(diamondOpen, /data-shape="diamond"/);
    assert.doesNotMatch(diamondOpen, /data-shape="cylinder"/);
    assert.match(diamondHtml, /<polygon class="node-shape-geom"/);
    assert.doesNotMatch(diamondHtml, /class="node-shape-geom cylinder-body"/);
  });

  it('sizes client nodes to fit multi-line roles and enforces overflow containment', () => {
    const clientDims = getNodeDimensions('client');
    assert.deepEqual(clientDims, { width: 192, height: 112 });

    const doc = createBlankDocument();
    const clientNode = createNodeFromStencil('client', 100, 100, 0);
    clientNode.title = 'DVA-D';
    clientNode.subtitle = 'Data Validation\nApplication: Digital';
    doc.nodes.push(clientNode);

    const html = generateStandaloneHtml(doc);
    assert.match(html, /data-kind="client"/);
    assert.match(html, /class="node-title">DVA-D<\/span>/);
    assert.match(html, /class="node-sub">Data Validation[\s\S]*Application: Digital<\/span>/);

    const studioCss = fs.readFileSync(new URL('../src/styles/studio.css', import.meta.url), 'utf8');
    const viewerCss = fs.readFileSync(new URL('../src/styles/viewer.css', import.meta.url), 'utf8');

    assert.match(studioCss, /\.arch-node\[data-kind="client"\]\s*\.node-sub\s*\{[^}]*-webkit-line-clamp:\s*3/);
    assert.match(studioCss, /\.arch-node\[data-kind="client"\](?::not\([^)]*\))*\s*\.node-select-hit\s*\{[^}]*overflow:\s*hidden/);

    assert.match(viewerCss, /\.arch-node\[data-kind="client"\]\s*\.node-sub\s*\{[^}]*-webkit-line-clamp:\s*3/);
    assert.match(viewerCss, /\.arch-node\[data-kind="client"\](?::not\([^)]*\))*\s*\{[^}]*overflow:\s*hidden/);
  });
});
