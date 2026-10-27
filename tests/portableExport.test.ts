import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseBlueprintJson, serializeBlueprintJson } from '../src/exporter/blueprintJson.ts';
import { renderDiagramSvg } from '../src/exporter/diagramSvg.ts';
import { createBlankDocument, createNodeFromStencil } from '../src/templates/presets.ts';

describe('portable export', () => {
  it('round-trips a diagram through blueprint JSON and draws it as SVG', () => {
    const doc = createBlankDocument();
    doc.title = 'Mesh & Core';
    const left = createNodeFromStencil('service', 48, 64, 0);
    left.title = 'Ingress <edge>';
    const right = createNodeFromStencil('core', 360, 64, 1);
    right.shape = 'pill';
    right.title = 'Core';
    doc.nodes.push(left, right);
    doc.edges.push({
      id: 'wire-1',
      from: left.id,
      to: right.id,
      sourcePort: 'right',
      targetPort: 'left',
      tone: 'emerald',
      route: 'straight',
      label: 'Events',
      animated: true,
    });

    const parsed = parseBlueprintJson(serializeBlueprintJson(doc));
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.doc.title, 'Mesh & Core');
    assert.equal(parsed.doc.nodes[0].title, 'Ingress <edge>');
    assert.equal(parsed.doc.nodes[1].shape, 'pill');
    assert.equal(parsed.doc.edges[0].route, 'straight');
    assert.equal(parsed.doc.edges[0].label, 'Events');

    const svg = renderDiagramSvg(parsed.doc);
    assert.match(svg, /Ingress &lt;edge&gt;/);
    assert.match(svg, /<path d="[^"]+"/);
    assert.match(svg, /stroke="#047857"/);
    assert.match(svg, /rx="[^"]+"/);
    assert.doesNotMatch(svg, /<script/);
  });

  it('rejects JSON that is not a blueprint document', () => {
    const broken = parseBlueprintJson('{');
    assert.equal(broken.ok, false);
    const missing = parseBlueprintJson('{"title":"Nope"}');
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.match(missing.error, /nodes/);
  });
});
