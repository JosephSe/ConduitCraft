import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { importMermaidOrBlueprint, serializeToBlueprintMarkdown } from '../src/core/parser.ts';
import { renderDiagramSvg } from '../src/exporter/diagramSvg.ts';
import {
  MAX_TAGS,
  allTags,
  colourKey,
  effectiveTone,
  matchesTag,
  normalizeLegend,
  normalizeLinks,
  normalizeTags,
  parseTagInput,
  safeLinkUrl,
  toneName,
} from '../src/core/meta.ts';
import { parseBlueprintJson, serializeBlueprintJson } from '../src/exporter/blueprintJson.ts';
import { generateStandaloneHtml } from '../src/exporter/standaloneHtml.ts';
import { createBlankDocument } from '../src/templates/presets.ts';
import type { DiagramDocument } from '../src/types.ts';

function docWithNode(): DiagramDocument {
  const doc = createBlankDocument();
  doc.nodes = [
    {
      id: 'api',
      kind: 'service',
      accent: 'blue',
      icon: 'cpu',
      title: 'API',
      subtitle: '',
      eyebrow: '',
      footerLeft: '',
      chip: '',
      zoneLabel: '',
      interfaceLabel: '',
      summary: '',
      metrics: [],
      code: '',
      x: 80,
      y: 80,
      width: 200,
      height: 100,
    },
  ];
  return doc;
}

describe('link safety (F-27)', () => {
  it('accepts https, http and mailto', () => {
    assert.equal(safeLinkUrl('https://example.com/runbook'), 'https://example.com/runbook');
    assert.equal(safeLinkUrl('http://example.com/'), 'http://example.com/');
    assert.equal(safeLinkUrl('mailto:oncall@example.com'), 'mailto:oncall@example.com');
  });

  for (const [scheme, url] of [
    ['javascript', 'javascript:alert(1)'],
    ['javascript with leading space and case', '  JaVaScRiPt:alert(1)'],
    ['javascript with an embedded tab', 'java\tscript:alert(1)'],
    ['data', 'data:text/html,<script>alert(1)</script>'],
    ['vbscript', 'vbscript:msgbox(1)'],
    ['file', 'file:///etc/passwd'],
    ['relative path', '/runbook'],
    ['empty', '   '],
  ]) {
    it(`rejects ${scheme}`, () => assert.equal(safeLinkUrl(url), null));
  }

  it('rejects non-strings', () => {
    for (const value of [undefined, null, 5, {}, []]) assert.equal(safeLinkUrl(value), null);
  });

  it('drops unsafe links when reading a file and keeps the rest', () => {
    const links = normalizeLinks([
      { label: 'Repo', url: 'https://example.com/r', kind: 'repo' },
      { label: 'Bad', url: 'javascript:alert(1)' },
      { url: 'https://example.com/d', kind: 'dashboard' },
      { label: 'Odd kind', url: 'https://example.com/o', kind: 'wiki' },
    ]);
    assert.deepEqual(links, [
      { label: 'Repo', url: 'https://example.com/r', kind: 'repo' },
      { label: 'Dashboard', url: 'https://example.com/d', kind: 'dashboard' },
      { label: 'Odd kind', url: 'https://example.com/o' },
    ]);
  });
});

describe('tags and legend (F-26)', () => {
  it('trims, de-duplicates ignoring case, and caps tags', () => {
    assert.deepEqual(normalizeTags([' PII ', 'pii', '', 'payments', 5]), ['PII', 'payments']);
    assert.equal(normalizeTags(Array.from({ length: 30 }, (_, i) => `t${i}`)).length, MAX_TAGS);
    assert.deepEqual(parseTagInput('pii, payments\nthird party,,'), ['pii', 'payments', 'third party']);
  });

  it('keeps one labelled entry per known tone', () => {
    const legend = normalizeLegend([
      { tone: 'rose', label: ' PII ', description: 'Personal data' },
      { tone: 'rose', label: 'Duplicate' },
      { tone: 'teal', label: 'Unknown tone' },
      { tone: 'blue', label: '' },
      { tone: 'amber', label: 'Third party' },
    ]);
    assert.deepEqual(legend, [
      { tone: 'rose', label: 'PII', description: 'Personal data' },
      { tone: 'amber', label: 'Third party' },
    ]);
  });

  it('names a tone from the legend, else from the built-in name', () => {
    const legend = normalizeLegend([{ tone: 'rose', label: 'PII' }]);
    assert.equal(toneName(legend, 'rose', 'Exception'), 'PII');
    assert.equal(toneName(legend, 'blue', 'Primary'), 'Primary');
    assert.equal(toneName(undefined, 'blue', 'Primary'), 'Primary');
  });
});

describe('round trip through Blueprint JSON (the share link and autosave use it too)', () => {
  it('keeps tags, owner, links and legend', () => {
    const doc = docWithNode();
    doc.nodes[0].tags = ['pii', 'payments'];
    doc.nodes[0].owner = 'Payments team';
    doc.nodes[0].links = [{ label: 'Runbook', url: 'https://example.com/rb', kind: 'runbook' }];
    doc.legend = [{ tone: 'rose', label: 'PII' }];
    doc.edges = [
      {
        id: 'w',
        from: doc.nodes[0].id,
        to: doc.nodes[0].id,
        sourcePort: 'auto',
        targetPort: 'auto',
        tone: 'blue',
        route: 'auto',
        label: '',
        animated: true,
        tags: ['hot-path'],
      },
    ];
    const back = parseBlueprintJson(serializeBlueprintJson(doc));
    assert.ok(back.ok);
    if (!back.ok) return;
    assert.deepEqual(back.doc.nodes[0].tags, ['pii', 'payments']);
    assert.equal(back.doc.nodes[0].owner, 'Payments team');
    assert.deepEqual(back.doc.nodes[0].links, doc.nodes[0].links);
    assert.deepEqual(back.doc.legend, [{ tone: 'rose', label: 'PII' }]);
    assert.deepEqual(back.doc.edges[0].tags, ['hot-path']);
  });

  it('rejects an unsafe link planted in a file', () => {
    const doc = docWithNode();
    const text = JSON.stringify({
      kind: 'conduitcraft.blueprint',
      version: 4,
      document: {
        ...doc,
        nodes: [{ ...doc.nodes[0], links: [{ label: 'x', url: 'javascript:alert(1)' }, { label: 'ok', url: 'https://example.com' }] }],
      },
    });
    const back = parseBlueprintJson(text);
    assert.ok(back.ok);
    if (!back.ok) return;
    assert.deepEqual(back.doc.nodes[0].links?.map((l) => l.label), ['ok']);
  });

  it('adds nothing to a plain document, and opens version 3 files', () => {
    const doc = docWithNode();
    const back = parseBlueprintJson(serializeBlueprintJson(doc));
    assert.ok(back.ok);
    if (!back.ok) return;
    for (const key of ['tags', 'owner', 'links']) assert.equal(key in back.doc.nodes[0], false, key);
    assert.equal('legend' in back.doc, false);
    const v3 = JSON.stringify({ kind: 'conduitcraft.blueprint', version: 3, document: doc });
    assert.ok(parseBlueprintJson(v3).ok);
  });
});

describe('exported page (F-26, F-27)', () => {
  it('carries the legend names, owner, tags and links, and never an unsafe link', () => {
    const doc = docWithNode();
    doc.nodes[0].owner = 'Payments <team>';
    doc.nodes[0].tags = ['pii'];
    // Planted after load, as if it had slipped past import: export must still refuse it.
    doc.nodes[0].links = [
      { label: 'Runbook', url: 'https://example.com/rb', kind: 'runbook' },
      { label: 'Evil', url: 'javascript:alert(1)' },
    ];
    doc.legend = [{ tone: 'rose', label: 'PII <data>', description: 'Personal data' }];
    doc.edges = [
      { id: 'w1', from: 'api', to: 'api', sourcePort: 'auto', targetPort: 'auto', tone: 'rose', route: 'auto', label: '', animated: true },
      { id: 'w2', from: 'api', to: 'api', sourcePort: 'auto', targetPort: 'auto', tone: 'blue', route: 'auto', label: '', animated: true },
    ];
    const html = generateStandaloneHtml(doc);
    assert.match(html, /PII &lt;data&gt;/);
    assert.match(html, /Personal data/);
    assert.match(html, /https:\/\/example\.com\/rb/);
    assert.doesNotMatch(html, /javascript:alert/);
    assert.doesNotMatch(html, /PII <data>/);
    assert.match(html, /Payments &lt;team&gt;|Payments \\u003cteam/);
  });
});

describe('Blueprint Markdown carries the new fields (F-17, F-26, F-27)', () => {
  it('round-trips tags, owner, links, legend and the wire fields', () => {
    const doc = docWithNode();
    doc.nodes.push({ ...doc.nodes[0], id: 'db', title: 'DB', x: 400 });
    doc.nodes[0].tags = ['pii'];
    doc.nodes[0].owner = 'Payments';
    doc.nodes[0].links = [{ label: 'Repo', url: 'https://example.com/r', kind: 'repo' }];
    doc.legend = [{ tone: 'rose', label: 'PII' }];
    doc.edges = [
      {
        id: 'w1',
        from: 'api',
        to: 'db',
        sourcePort: 'auto',
        targetPort: 'auto',
        tone: 'blue',
        route: 'auto',
        label: 'query',
        animated: true,
        protocol: 'sql',
        sync: 'async',
        latencyMs: 40,
        tags: ['hot-path'],
      },
    ];
    const back = importMermaidOrBlueprint(serializeToBlueprintMarkdown(doc)).doc;
    const api = back.nodes.find((n) => n.id === 'api');
    assert.deepEqual(api?.tags, ['pii']);
    assert.equal(api?.owner, 'Payments');
    assert.deepEqual(api?.links, doc.nodes[0].links);
    assert.deepEqual(back.legend, [{ tone: 'rose', label: 'PII' }]);
    assert.equal(back.edges[0].protocol, 'sql');
    assert.equal(back.edges[0].sync, 'async');
    assert.equal(back.edges[0].latencyMs, 40);
    assert.deepEqual(back.edges[0].tags, ['hot-path']);
  });

  it('drops an unsafe link written by hand in the Markdown', () => {
    const text = [
      '---',
      'title: T',
      'nodes:',
      '  a:',
      '    links:',
      '      - { label: Bad, url: "javascript:alert(1)" }',
      '      - { label: Ok, url: "https://example.com" }',
      '---',
      '```mermaid',
      'flowchart LR',
      '  a[A] --> b[B]',
      '```',
    ].join('\n');
    const a = importMermaidOrBlueprint(text).doc.nodes.find((n) => n.id === 'a');
    assert.deepEqual(a?.links?.map((l) => l.label), ['Ok']);
  });
});

describe('colour by and tag filter (F-26)', () => {
  const doc = docWithNode();
  doc.nodes.push({ ...doc.nodes[0], id: 'db', title: 'DB', tags: ['pii'], status: 'deprecated' });
  doc.nodes[0].tags = ['payments', 'pii'];
  doc.nodes[0].status = 'live';

  it('lists tags once, alphabetically', () => {
    assert.deepEqual(allTags(doc), ['payments', 'pii']);
  });

  it('draws a component by status or first tag, and keeps its own tone when it has none', () => {
    assert.equal(effectiveTone(doc, doc.nodes[0], 'tone'), 'blue');
    assert.equal(effectiveTone(doc, doc.nodes[0], 'status'), 'emerald');
    assert.equal(effectiveTone(doc, doc.nodes[1], 'status'), 'rose');
    assert.equal(effectiveTone(doc, doc.nodes[0], 'tag'), 'blue');
    assert.equal(effectiveTone(doc, doc.nodes[1], 'tag'), 'emerald');
    const untagged = { ...doc.nodes[0], tags: undefined, status: undefined, accent: 'violet' as const };
    assert.equal(effectiveTone(doc, untagged, 'tag'), 'violet');
    assert.equal(effectiveTone(doc, untagged, 'status'), 'violet');
  });

  it('explains the colours in use', () => {
    assert.deepEqual(colourKey(doc, 'tone'), []);
    assert.equal(colourKey(doc, 'status').length, 4);
    assert.deepEqual(colourKey(doc, 'tag'), [
      { tone: 'blue', label: 'payments' },
      { tone: 'emerald', label: 'pii' },
    ]);
  });

  it('matches tags ignoring case, and an empty filter matches all', () => {
    assert.equal(matchesTag({ tags: ['PII'] }, 'pii'), true);
    assert.equal(matchesTag({ tags: ['pii'] }, 'payments'), false);
    assert.equal(matchesTag({}, ''), true);
    assert.equal(matchesTag({}, 'pii'), false);
  });
});

describe('SVG and PNG export legend (F-26)', () => {
  it('draws the legend, escaped, and draws none without one', () => {
    const doc = docWithNode();
    assert.doesNotMatch(renderDiagramSvg(doc), /LEGEND/);
    doc.legend = [{ tone: 'rose', label: 'PII <data>', description: 'Personal' }];
    const svg = renderDiagramSvg(doc);
    assert.match(svg, /LEGEND/);
    assert.match(svg, /PII &lt;data&gt; — Personal/);
  });
});
