import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { colorToStreamTone, importMermaidOrBlueprint, serializeToBlueprintMarkdown } from '../src/core/parser.ts';
import { colourToTone, makeEdge } from '../src/importers/common.ts';
import { parseBlueprintJson, serializeBlueprintJson } from '../src/exporter/blueprintJson.ts';
import { renderDiagramSvg } from '../src/exporter/diagramSvg.ts';
import { generateStandaloneHtml } from '../src/exporter/standaloneHtml.ts';
import { TONE_META, TONE_CSS } from '../src/shared/tones.ts';
import { STREAM_TONE_OPTIONS, createBlankDocument, createNodeFromStencil } from '../src/templates/presets.ts';
import { coerceFrames } from '../src/core/frames.ts';
import type { DiagramDocument, StreamTone } from '../src/types.ts';

const NEW: StreamTone[] = ['cyan', 'fuchsia'];

function sample(): DiagramDocument {
  const doc = createBlankDocument();
  const a = createNodeFromStencil('service', 200, 200, 0);
  a.id = 'a';
  a.title = 'A';
  a.accent = 'cyan';
  const b = createNodeFromStencil('service', 600, 200, 0);
  b.id = 'b';
  b.title = 'B';
  b.accent = 'fuchsia';
  doc.nodes = [a, b];
  const used = new Set<string>();
  doc.edges = [
    makeEdge(a, b, used, { label: 'Data', tone: 'cyan' }),
    makeEdge(b, a, used, { label: 'Secrets', tone: 'fuchsia' }),
  ];
  return doc;
}

/** A `#rrggbb` colour at full saturation for a hue in degrees. */
function fromHue(h: number): string {
  const c = (n: number) => {
    const k = (n + h / 60) % 6;
    const v = 1 - Math.max(0, Math.min(k, 4 - k, 1));
    return Math.round(v * 255).toString(16).padStart(2, '0');
  };
  return `#${c(5)}${c(3)}${c(1)}`;
}

describe('cyan and fuchsia (T5)', () => {
  it('has a name, a label, a picker dot and CSS variables for both', () => {
    assert.equal(TONE_META.cyan.shortLabel, 'Data');
    assert.equal(TONE_META.fuchsia.shortLabel, 'Security');
    assert.equal(STREAM_TONE_OPTIONS.length, 7);
    for (const t of NEW) {
      assert.ok(STREAM_TONE_OPTIONS.some((o) => o.id === t));
      assert.deepEqual(TONE_CSS[t], [`var(--cc-${t})`, `var(--cc-${t}-soft)`]);
    }
  });

  it('reads the new words in a Blueprint file', () => {
    const words: Array<[string, StreamTone]> = [
      ['cyan', 'cyan'], ['teal', 'cyan'], ['aqua', 'cyan'], ['data', 'cyan'],
      ['fuchsia', 'fuchsia'], ['magenta', 'fuchsia'], ['security', 'fuchsia'], ['auth', 'fuchsia'],
    ];
    for (const [word, tone] of words) {
      const text = `---\nnodes:\n  a: { kind: service, title: A }\n  b: { kind: service, title: B }\nedges:\n  - { id: e1, from: a, to: b, tone: ${word} }\n---\n\n\`\`\`mermaid\nflowchart LR\n  a[A] --> b[B]\n\`\`\`\n`;
      const doc = importMermaidOrBlueprint(text).doc;
      assert.equal(doc.edges.find((e) => e.id === 'e1')?.tone, tone, word);
    }
  });

  it('maps colour names and values to the new tones', () => {
    assert.equal(colorToStreamTone('teal'), 'cyan');
    assert.equal(colorToStreamTone('aqua'), 'cyan');
    assert.equal(colorToStreamTone('magenta'), 'fuchsia');
    assert.equal(colorToStreamTone('fuchsia'), 'fuchsia');
    assert.equal(colorToStreamTone('#06b6d4'), 'cyan');
    assert.equal(colorToStreamTone('#d946ef'), 'fuchsia');
  });

  it('buckets imported hues at the planned edges', () => {
    const expected: Array<[number, StreamTone]> = [
      [150, 'emerald'], [172, 'cyan'], [200, 'cyan'], [210, 'blue'], [250, 'blue'], [270, 'violet'],
      [290, 'fuchsia'], [320, 'fuchsia'], [335, 'rose'],
    ];
    for (const [hue, tone] of expected) assert.equal(colourToTone(fromHue(hue)), tone, `hue ${hue}`);
  });

  it('round-trips through Blueprint Markdown and JSON', () => {
    const doc = sample();
    const md = importMermaidOrBlueprint(serializeToBlueprintMarkdown(doc)).doc;
    assert.deepEqual(md.nodes.map((n) => n.accent), ['cyan', 'fuchsia']);
    assert.deepEqual(md.edges.map((e) => e.tone), ['cyan', 'fuchsia']);
    const parsed = parseBlueprintJson(serializeBlueprintJson(doc));
    assert.ok(parsed.ok);
    if (parsed.ok) {
      assert.deepEqual(parsed.doc.nodes.map((n) => n.accent), ['cyan', 'fuchsia']);
      assert.deepEqual(parsed.doc.edges.map((e) => e.tone), ['cyan', 'fuchsia']);
    }
  });

  it('keeps the new tones on frames', () => {
    const frames = coerceFrames([{ id: 'f', x: 0, y: 0, width: 100, height: 100, title: 'F', tone: 'fuchsia' }]);
    assert.equal(frames?.[0].tone, 'fuchsia');
  });

  it('shows both in the SVG export in both themes', () => {
    const doc = sample();
    const light = renderDiagramSvg(doc, undefined, undefined, 'light');
    const dark = renderDiagramSvg(doc, undefined, undefined, 'dark');
    for (const hex of ['#0b7c9e', '#b5179e']) assert.ok(light.includes(hex), hex);
    for (const hex of ['#22d3ee', '#f0abfc']) assert.ok(dark.includes(hex), hex);
    assert.match(light, /id="arrow-cyan"/);
    assert.match(light, /id="arrow-fuchsia"/);
  });

  it('shows both in the HTML export: markers, legend swatches and the Traffic filter', () => {
    const html = generateStandaloneHtml(sample());
    for (const t of NEW) {
      assert.ok(html.includes(`id="arrow-${t}"`), `${t} marker`);
      assert.ok(html.includes(`var(--cc-${t})`), `${t} swatch`);
      assert.ok(html.includes(`[data-tone="${t}"]`), `${t} tone rule`);
      assert.ok(html.includes(`[data-flow="${t}"]`), `${t} dimming rule`);
    }
  });

  it('reads a tone it does not know as blue, the way 2.x reads these two', () => {
    const json = JSON.parse(serializeBlueprintJson(sample()));
    json.document.edges[0].tone = 'chartreuse';
    json.document.nodes[0].accent = 'chartreuse';
    const parsed = parseBlueprintJson(JSON.stringify(json));
    assert.ok(parsed.ok);
    if (parsed.ok) {
      assert.equal(parsed.doc.edges[0].tone, 'blue');
      assert.equal(parsed.doc.nodes[0].accent, 'blue');
    }
  });
});
