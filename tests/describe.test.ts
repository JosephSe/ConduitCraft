import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { describeDiagram, describeDiagramBrief } from '../src/core/describe.ts';
import { importMermaidOrBlueprint } from '../src/core/parser.ts';
import { renderDiagramSvg } from '../src/exporter/diagramSvg.ts';
import { generateStandaloneHtml, generateStandaloneHtmlWithLevels } from '../src/exporter/standaloneHtml.ts';
import { parseBlueprintJson } from '../src/exporter/blueprintJson.ts';
import type { DiagramDocument } from '../src/types.ts';

const examplesDir = new URL('../src/examples/', import.meta.url);

function loadExample(name: string): DiagramDocument {
  const text = readFileSync(new URL(name, examplesDir), 'utf8');
  if (name.endsWith('.json')) {
    const parsed = parseBlueprintJson(text);
    assert.ok(parsed.ok, `${name} parses`);
    return parsed.doc;
  }
  return importMermaidOrBlueprint(text).doc;
}

const names = readdirSync(examplesDir).sort();

describe('describeDiagram', () => {
  it('runs with no DOM globals', () => {
    assert.equal(typeof (globalThis as { document?: unknown }).document, 'undefined');
    assert.equal(typeof (globalThis as { window?: unknown }).window, 'undefined');
    assert.ok(describeDiagram(loadExample('three-tier-web.blueprint.json')).length > 0);
  });

  for (const name of names) {
    it(`reads ${name} as sentences with no ids`, () => {
      const doc = loadExample(name);
      const text = describeDiagram(doc);
      assert.ok(text.startsWith(describeDiagramBrief(doc)));
      assert.match(text, /\n\nMain flows\n- .+ (calls|sends messages to|exchanges data with) /);
      // An id that is not also a word in the diagram's own text must not appear in the description.
      const prose = [doc.title, doc.overviewSummary, ...doc.nodes.flatMap((n) => [n.title, n.subtitle]), ...doc.edges.map((e) => e.label)]
        .join(' ')
        .toLowerCase();
      const ids = [...doc.nodes.map((n) => n.id), ...doc.edges.map((e) => e.id), ...doc.zones.map((z) => z.id)].filter(
        (id) => id.length > 3 && !prose.includes(id.toLowerCase()),
      );
      for (const id of ids) assert.ok(!text.includes(id), `${name}: "${id}" leaks into the description`);
      assert.ok(!/\bundefined\b|\[object|NaN/.test(text));
      for (const line of text.split('\n')) if (line.startsWith('- ')) assert.ok(line.endsWith('.'), line);
    });
  }

  it('describes lumen-relay: swimlanes, flows and scenarios', () => {
    const doc = loadExample('lumen-relay.blueprint.json');
    const text = describeDiagram(doc);
    assert.ok(text.startsWith(doc.title));
    assert.match(text, /\nSwimlanes\n- /);
    assert.match(text, /\nScenarios\n- /);
  });

  it('names protocol, call style, label and latency on a wire', () => {
    const doc = loadExample('three-tier-web.blueprint.json');
    const [a, b] = doc.nodes;
    doc.edges = [{ ...doc.edges[0], from: a.id, to: b.id, protocol: 'grpc', sync: 'async', latencyMs: 40, label: 'charge card' }];
    const text = describeDiagram(doc);
    assert.ok(text.includes(`- ${a.title} sends messages to ${b.title} over gRPC for “charge card” (about 40 ms).`), text);
  });

  it('describes levels, the legend and an empty diagram', () => {
    const doc = loadExample('three-tier-web.blueprint.json');
    doc.nodes[0].child = { nodes: [doc.nodes[1]], edges: [], zones: [], notesCards: [] };
    doc.legend = [{ tone: 'rose', label: 'Customer facing', description: 'Seen by shoppers' }];
    const text = describeDiagram(doc);
    assert.ok(text.includes(`- ${doc.nodes[0].title} opens into 1 component.`), text);
    assert.match(text, /\nColours\n- Red means Customer facing: Seen by shoppers\./);
    const empty = describeDiagram({ ...doc, nodes: [], edges: [], zones: [], simulations: [], legend: undefined });
    assert.match(empty, /It is empty\./);
  });
});

describe('exports carry the description', () => {
  it('puts a title and description in every SVG, escaped', () => {
    const doc = loadExample('three-tier-web.blueprint.json');
    doc.title = 'Orders <&> "co"';
    const svg = renderDiagramSvg(doc);
    assert.match(svg, /<title id="diagram-title">Orders &lt;&amp;&gt; &quot;co&quot;<\/title>/);
    assert.match(svg, /<desc id="diagram-desc">[^<]+Main flows/);
  });

  it('puts a visually hidden description in the HTML page, one per level', () => {
    const doc = loadExample('three-tier-web.blueprint.json');
    const html = generateStandaloneHtml(doc);
    assert.match(html, /<div class="visually-hidden" id="diagram-description"[^>]*>[^<]+Main flows/);
    doc.nodes[0].child = { nodes: [doc.nodes[1]], edges: [], zones: [], notesCards: [] };
    const tree = generateStandaloneHtmlWithLevels(doc);
    assert.ok(tree.includes('opens into 1 component'));
  });
});
