import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { describeDiagram, describeDiagramBrief } from '../src/core/describe.ts';
import { buildOutline, pageItems } from '../src/core/outline.ts';
import { collectLevels, findMatches, replaceAll, type FindLevel } from '../src/core/findReplace.ts';
import { contentOfPage, pageList } from '../src/core/pages.ts';
import { generateStandaloneHtml, generateStandaloneHtmlWithLevels } from '../src/exporter/standaloneHtml.ts';
import { renderDiagramSvg } from '../src/exporter/diagramSvg.ts';
import { parseBlueprintJson } from '../src/exporter/blueprintJson.ts';
import { createShareUrl, decodeSharedDiagramFromHash } from '../src/studio/shareLink.ts';
import { createBlankDocument, createNodeFromStencil } from '../src/templates/presets.ts';
import { createZip, uniqueZipNames } from '../src/core/zip.ts';
import type { DiagramDocument } from '../src/types.ts';

function node(id: string, title: string, x = 200) {
  const n = createNodeFromStencil('service', x, 200, 0);
  n.id = id;
  n.title = title;
  return n;
}

/** "Overview" holds Web and Api; "Deployment" holds Cluster and Registry. */
function twoPages(): DiagramDocument {
  const doc = createBlankDocument();
  doc.title = 'Shop';
  doc.pageTitle = 'Overview';
  doc.nodes = [node('web', 'Web storefront'), node('api', 'Orders API', 520)];
  doc.edges = [{ id: 'e1', from: 'web', to: 'api', sourcePort: 'auto', targetPort: 'auto', tone: 'blue', route: 'auto', label: 'places orders', animated: true }];
  doc.pages = [
    {
      id: 'deploy',
      title: 'Deployment',
      nodes: [node('cluster', 'Kubernetes cluster'), node('registry', 'Image registry', 520)],
      edges: [{ id: 'e2', from: 'registry', to: 'cluster', sourcePort: 'auto', targetPort: 'auto', tone: 'emerald', route: 'auto', label: 'pulls images', animated: true }],
      zones: [],
      notesCards: [],
    },
  ];
  return doc;
}

describe('pages everywhere (P1b): description and outline', () => {
  it('a one-page file is described as before', () => {
    const doc = createBlankDocument();
    doc.nodes = [node('a', 'Alpha')];
    assert.doesNotMatch(describeDiagram(doc), /Page /);
    assert.match(describeDiagramBrief(doc), /It has 1 component/);
  });

  it('lists the pages and tells each one on its own', () => {
    const text = describeDiagram(twoPages());
    assert.match(text, /It has 2 pages: Overview and Deployment\./);
    assert.match(text, /Together they hold 4 components\./);
    assert.match(text, /Page Overview holds 2 components, joined by 1 wire\./);
    assert.match(text, /Page Deployment holds 2 components, joined by 1 wire\./);
    assert.match(text, /Page Deployment: Main flows\n- Image registry calls Kubernetes cluster/);
    assert.doesNotMatch(text, /Web storefront calls Kubernetes/, 'a wire never crosses pages');
  });

  it('an empty page says so', () => {
    const doc = twoPages();
    doc.pages![0].nodes = [];
    doc.pages![0].edges = [];
    assert.match(describeDiagram(doc), /Page Deployment holds nothing yet\./);
  });

  it('the outline has a row per page, marking the open one, and none for one page', () => {
    const doc = twoPages();
    const rows = pageItems(doc, 1);
    assert.deepEqual(rows.map((r) => [r.kind, r.label, r.pageIndex]), [
      ['page', 'Page Overview', 0],
      ['page', 'Page Deployment, open', 1],
    ]);
    assert.deepEqual(pageItems(createBlankDocument(), 0), []);
    assert.equal(buildOutline(doc).some((i) => i.kind === 'page'), false, 'the tree itself holds the open page only');
  });
});

describe('pages everywhere (P1b): find and replace across pages', () => {
  const across = (doc: DiagramDocument): FindLevel[] =>
    pageList(doc).flatMap((p) => {
      const content = contentOfPage(doc, p.index)!;
      return collectLevels(content, { path: ['\u0000'], content }, 'all').map((l) => ({ ...l, page: p.index }));
    });

  it('finds matches on every page and says which page each is on', () => {
    const doc = twoPages();
    doc.nodes[1].title = 'Orders image API';
    const found = findMatches(across(doc), { query: 'image', matchCase: false, wholeWord: false });
    assert.deepEqual(found.filter((m) => m.kind === 'node').map((m) => [m.page, m.id]).sort(), [[0, 'api'], [1, 'registry']]);
    assert.ok(found.some((m) => m.kind === 'edge' && m.page === 1), 'a wire label on the second page matches too');
  });

  it('replaces on every page, or in just one match', () => {
    const doc = twoPages();
    const opts = { query: 'e', matchCase: true, wholeWord: true };
    assert.equal(findMatches(across(doc), opts).length, 0);
    const wire = { query: 'pulls', matchCase: false, wholeWord: false };
    const levels = across(doc);
    const [only] = findMatches(levels, wire);
    assert.equal(only.page, 1);
    assert.equal(replaceAll(levels, wire, 'fetches', [only]), 1);
    assert.equal(doc.pages![0].edges[0].label, 'fetches images');
    assert.equal(doc.edges[0].label, 'places orders', 'the other page is untouched');
    assert.equal(replaceAll(across(doc), { query: 'a', matchCase: false, wholeWord: true }, 'x'), 0);
    assert.ok(replaceAll(across(doc), { query: 'cluster', matchCase: false, wholeWord: false }, 'fleet') >= 1);
    assert.equal(doc.pages![0].nodes[0].title, 'Kubernetes fleet');
  });

  it('a match on one page is not replaced by a row on the same id on another', () => {
    const doc = twoPages();
    doc.pages![0].nodes[0].id = 'web';
    doc.pages![0].nodes[0].title = 'Web storefront';
    const levels = across(doc);
    const matches = findMatches(levels, { query: 'storefront', matchCase: false, wholeWord: false });
    assert.equal(matches.length, 2);
    replaceAll(levels, { query: 'storefront', matchCase: false, wholeWord: false }, 'shop', [matches[1]]);
    assert.equal(doc.nodes[0].title, 'Web storefront');
    assert.equal(doc.pages![0].nodes[0].title, 'Web shop');
  });
});

describe('pages everywhere (P1b): HTML and SVG exports', () => {
  it('a one-page file has no page strip', () => {
    const doc = createBlankDocument();
    doc.nodes = [node('a', 'Alpha')];
    assert.doesNotMatch(generateStandaloneHtmlWithLevels(doc), /<nav class="export-page-strip"/);
  });

  it('the HTML export carries every page, each with the tab strip', () => {
    const html = generateStandaloneHtmlWithLevels(twoPages());
    assert.match(html, /<nav class="export-page-strip" aria-label="Pages"/);
    assert.equal((html.match(/class="export-page-tab"/g) ?? []).length, 2, 'the first page shows both tabs');
    assert.match(html, /aria-selected="true"[^>]*data-ccgo="0"[^>]*>Overview/);
    assert.match(html, /Web storefront/);
    const table = /window\.__ccLevels = window\.__ccLevels \|\| (\[.*?\]);<\/script>/s.exec(html);
    assert.ok(table, 'the other pages travel as a table');
    const pages = JSON.parse(table[1].replace(/\\u003c/g, '<')) as string[];
    assert.equal(pages.length, 2);
    assert.match(pages[1], /Kubernetes cluster/);
    assert.doesNotMatch(pages[1], /Web storefront/);
    assert.match(pages[1], /aria-selected="true"[^>]*data-ccgo="1"[^>]*>Deployment/);
  });

  it('a page that holds a level exports as its own pages, and the crumbs stay on that page', () => {
    const doc = twoPages();
    doc.pages![0].nodes[0].child = { nodes: [node('inner', 'Pod')], edges: [], zones: [], notesCards: [] };
    const html = generateStandaloneHtmlWithLevels(doc);
    const table = /window\.__ccLevels = window\.__ccLevels \|\| (\[.*?\]);<\/script>/s.exec(html);
    const pages = JSON.parse(table![1].replace(/\\u003c/g, '<')) as string[];
    assert.equal(pages.length, 3);
    assert.match(pages[2], /Pod/);
    assert.match(pages[2], /level-breadcrumb/);
    assert.match(pages[2], /data-ccgo="1"/, 'the Deployment tab still points at that page');
  });

  it('draws each page to its own picture', () => {
    const doc = twoPages();
    const second = { ...doc, ...doc.pages![0], pages: undefined, pageTitle: 'Deployment' } as unknown as DiagramDocument;
    assert.match(renderDiagramSvg(second), /Kubernetes cluster/);
    assert.doesNotMatch(renderDiagramSvg(second), /Web storefront/);
    assert.ok(generateStandaloneHtml(second).length > 0);
  });

  it('zip names for the pages are unique', () => {
    assert.deepEqual(uniqueZipNames(['01-a.svg', '01-a.svg']), ['01-a.svg', '01-a (2).svg']);
    assert.ok(createZip([{ name: '01-a.svg', data: new Uint8Array([1, 2, 3]) }]).length > 3);
  });
});

describe('pages everywhere (P1b): share link size', () => {
  const examples = new URL('../src/examples/', import.meta.url);

  it('records the link size of every bundled example and of a three-page diagram', async () => {
    const rows: string[] = [];
    for (const file of readdirSync(examples).filter((f) => f.endsWith('.blueprint.json'))) {
      const parsed = parseBlueprintJson(readFileSync(new URL(file, examples), 'utf8'));
      assert.ok(parsed.ok, file);
      const { hash } = await createShareUrl(parsed.doc, { baseUrl: 'https://example.com/app' });
      rows.push(`${file}: ${hash.length} chars`);
    }
    const lumen = parseBlueprintJson(readFileSync(new URL('lumen-relay.blueprint.json', examples), 'utf8'));
    assert.ok(lumen.ok);
    const three: DiagramDocument = structuredClone(lumen.doc);
    three.pages = [1, 2].map((n) => ({
      id: `copy-${n}`,
      title: `Copy ${n}`,
      nodes: structuredClone(lumen.doc.nodes),
      edges: structuredClone(lumen.doc.edges),
      zones: structuredClone(lumen.doc.zones),
      notesCards: structuredClone(lumen.doc.notesCards),
    }));
    const one = await createShareUrl(lumen.doc, { baseUrl: 'https://example.com/app' });
    const triple = await createShareUrl(three, { baseUrl: 'https://example.com/app' });
    rows.push(`lumen-relay x3 pages: ${triple.hash.length} chars (one page: ${one.hash.length})`);
    console.log(`SHARE LINK SIZES\n${rows.join('\n')}`);
    const back = await decodeSharedDiagramFromHash(triple.hash);
    assert.ok(back);
    assert.equal(pageList(back).length, 3);
    // Identical pages compress against each other, so two more pages cost far less than two more diagrams.
    assert.ok(triple.hash.length < one.hash.length * 2.2, `${triple.hash.length} vs ${one.hash.length}`);
  });
});
