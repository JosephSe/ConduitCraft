import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { renderDiagramSvg } from '../src/exporter/diagramSvg.ts';
import { createBlankDocument, createNodeFromStencil } from '../src/templates/presets.ts';

// A16b. The SVG export shows what the canvas shows: icon, eyebrow, footer label and chip, text inside shapes, and
// the colour scheme.
function docWith(shape?: 'diamond' | 'card') {
  const doc = createBlankDocument();
  const node = createNodeFromStencil('service', 'svc', 100, 100);
  node.title = 'Sorter';
  node.eyebrow = 'SERVICE';
  node.footerLeft = 'Planner API';
  node.chip = 'API';
  node.icon = 'code';
  if (shape) node.shape = shape;
  doc.nodes = [node];
  return doc;
}

describe('SVG export details', () => {
  it('draws the icon, eyebrow, footer label and chip of a card', () => {
    const svg = renderDiagramSvg(docWith('card'));
    assert.match(svg, /<polyline points="16 18 22 12 16 6"/, 'the code icon');
    for (const text of ['SERVICE', 'Planner API', '>API<']) assert.ok(svg.includes(text), text);
  });

  it('keeps the text of a diamond centred inside it', () => {
    const doc = docWith('diamond');
    const svg = renderDiagramSvg(doc);
    const cx = doc.nodes[0].x + doc.nodes[0].width / 2;
    assert.ok(svg.includes(`<text x="${cx}"`), 'text anchored at the shape centre');
    assert.ok(svg.includes('text-anchor="middle"'));
  });

  it('has a different look in dark and light', () => {
    const doc = docWith();
    const light = renderDiagramSvg(doc, undefined, undefined, 'light');
    const dark = renderDiagramSvg(doc, undefined, undefined, 'dark');
    assert.notEqual(light, dark);
    assert.ok(light.includes('fill="#f4f7fb"'));
    assert.ok(dark.includes('fill="#070b14"'));
    assert.equal(renderDiagramSvg(doc), light, 'light is the default');
  });
});
