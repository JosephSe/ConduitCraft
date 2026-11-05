import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  FIRST_PAGE_ID,
  MAX_PAGES,
  indexOfPage,
  neighbourPage,
  normalizePages,
  pageCount,
  pageList,
  viewOfPage,
  writePageBack,
} from '../src/core/pages.ts';
import { addPage, deletePage, duplicatePage, movePage, renamePage } from '../src/core/pageOps.ts';
import { viewOfLevel, writeLevelBack } from '../src/core/levels.ts';
import { parseBlueprintJson, serializeBlueprintJson } from '../src/exporter/blueprintJson.ts';
import { importMermaidOrBlueprint, serializeToBlueprintMarkdown } from '../src/core/parser.ts';
import { createShareUrl, decodeSharedDiagramFromHash } from '../src/studio/shareLink.ts';
import { createBlankDocument, createNodeFromStencil } from '../src/templates/presets.ts';
import { CURRENT_SCHEMA_VERSION, migrate } from '../src/core/schema.ts';
import { matchBinding } from '../src/core/keymap.ts';
import { pruneDanglingChaos } from '../src/core/reachability.ts';
import type { DiagramDocument } from '../src/types.ts';

function node(id: string, x = 200, y = 200) {
  const n = createNodeFromStencil('service', x, y, 0);
  n.id = id;
  n.title = id;
  return n;
}

/** Page 1 holds "web" and "api"; page 2 ("Data") holds "db" and "cache", wired together. */
function twoPages(): DiagramDocument {
  const doc = createBlankDocument();
  doc.title = 'Shop';
  doc.nodes = [node('web'), node('api', 500, 200)];
  doc.edges = [{ id: 'e1', from: 'web', to: 'api', sourcePort: 'auto', targetPort: 'auto', tone: 'blue', route: 'auto', label: 'calls', animated: true }];
  doc.pages = [
    {
      id: 'data',
      title: 'Data',
      nodes: [node('db'), node('cache', 500, 200)],
      edges: [{ id: 'e2', from: 'db', to: 'cache', sourcePort: 'auto', targetPort: 'auto', tone: 'emerald', route: 'auto', label: 'fills', animated: true }],
      zones: [],
      notesCards: [],
      stageWidth: 2000,
      stageHeight: 1100,
    },
  ];
  return doc;
}

const shape = (d: DiagramDocument) => ({
  first: [d.nodes.map((n) => n.id), d.edges.map((e) => e.id)],
  pages: (d.pages ?? []).map((p) => [p.id, p.title, p.nodes.map((n) => n.id), p.edges.map((e) => e.id), p.stageWidth, p.stageHeight]),
  pageTitle: d.pageTitle,
  pageId: d.pageId,
});

describe('pages (D10): model', () => {
  it('a file with no pages is one page', () => {
    const doc = createBlankDocument();
    assert.equal(pageCount(doc), 1);
    assert.deepEqual(pageList(doc), [{ id: FIRST_PAGE_ID, title: 'Page 1', index: 0 }]);
  });

  it('the document itself is the first page', () => {
    const doc = twoPages();
    assert.deepEqual(pageList(doc).map((p) => p.title), ['Page 1', 'Data']);
    assert.equal(viewOfPage(doc, 0).nodes.length, 2);
  });

  it('shows another page as an ordinary document and writes edits back', () => {
    const doc = twoPages();
    const view = viewOfPage(doc, 1);
    assert.deepEqual(view.nodes.map((n) => n.id), ['db', 'cache']);
    assert.equal(view.pages, undefined, 'a page view carries no page list');
    assert.equal(view.stageWidth, 2000, 'a page has its own stage size');
    assert.equal(view.title, 'Shop', 'shared fields come from the file');
    view.nodes.push(node('queue', 800, 200));
    view.title = 'Shop v2';
    writePageBack(doc, 1, view);
    assert.deepEqual(doc.pages![0].nodes.map((n) => n.id), ['db', 'cache', 'queue']);
    assert.equal(doc.title, 'Shop v2');
    assert.deepEqual(doc.nodes.map((n) => n.id), ['web', 'api'], 'the first page is untouched');
    assert.notEqual(doc.stageWidth, 2000, 'the first page keeps its own stage size');
  });

  it('writing the first page back keeps the page list', () => {
    const doc = twoPages();
    const view = viewOfPage(doc, 0);
    delete view.pages;
    view.nodes.pop();
    writePageBack(doc, 0, view);
    assert.equal(doc.pages?.length, 1);
    assert.deepEqual(doc.nodes.map((n) => n.id), ['web']);
  });

  it('adds a blank page after the last and opens it', () => {
    const edit = addPage(twoPages())!;
    assert.equal(edit.index, 2);
    assert.deepEqual(pageList(edit.doc).map((p) => p.title), ['Page 1', 'Data', 'Page 3']);
    assert.equal(edit.doc.pages![1].nodes.length, 0);
    assert.equal(new Set(pageList(edit.doc).map((p) => p.id)).size, 3, 'ids are unique');
  });

  it('a new page does not reuse the title of an existing one', () => {
    const doc = twoPages();
    doc.pages![0].title = 'Page 3';
    assert.equal(pageList(addPage(doc)!.doc)[2].title, 'Page 4');
  });

  it('stops adding at the limit', () => {
    let doc = createBlankDocument();
    for (let i = 1; i < MAX_PAGES; i++) doc = addPage(doc)!.doc;
    assert.equal(pageCount(doc), MAX_PAGES);
    assert.equal(addPage(doc), null);
    assert.equal(duplicatePage(doc, 0), null);
  });

  it('duplicates a page next to the original, with its content', () => {
    const edit = duplicatePage(twoPages(), 1)!;
    assert.equal(edit.index, 2);
    assert.deepEqual(pageList(edit.doc).map((p) => p.title), ['Page 1', 'Data', 'Data copy']);
    assert.deepEqual(edit.doc.pages![1].nodes.map((n) => n.id), ['db', 'cache']);
    edit.doc.pages![1].nodes[0].title = 'changed';
    assert.equal(edit.doc.pages![0].nodes[0].title, 'db', 'the copy is independent');
  });

  it('duplicating the first page leaves the document as the first page', () => {
    const edit = duplicatePage(twoPages(), 0)!;
    assert.equal(edit.index, 1);
    assert.deepEqual(edit.doc.nodes.map((n) => n.id), ['web', 'api']);
    assert.equal(edit.doc.pages![0].title, 'Page 1 copy');
    assert.deepEqual(edit.doc.pages![0].nodes.map((n) => n.id), ['web', 'api']);
  });

  it('deletes a page and refuses to delete the last one', () => {
    const edit = deletePage(twoPages(), 1)!;
    assert.equal(pageCount(edit.doc), 1);
    assert.equal(edit.doc.pages, undefined);
    assert.equal(deletePage(edit.doc, 0), null);
  });

  it('deleting the first page promotes the next one onto the document', () => {
    const edit = deletePage(twoPages(), 0)!;
    assert.deepEqual(edit.doc.nodes.map((n) => n.id), ['db', 'cache']);
    assert.equal(edit.doc.pageTitle, 'Data');
    assert.equal(edit.doc.pageId, 'data');
    assert.equal(edit.doc.stageWidth, 2000);
    assert.equal(edit.index, 0);
    assert.equal(edit.doc.title, 'Shop', 'shared fields stay');
  });

  it('renames a page; an empty name changes nothing', () => {
    const doc = twoPages();
    assert.equal(renamePage(doc, 1, '   '), null);
    assert.equal(renamePage(doc, 1, 'Data'), null);
    assert.equal(pageList(renamePage(doc, 1, '  Data   layer ')!.doc)[1].title, 'Data layer');
    const first = renamePage(doc, 0, 'Storefront')!.doc;
    assert.equal(first.pageTitle, 'Storefront');
    assert.equal(renamePage(first, 0, 'Page 1')!.doc.pageTitle, undefined, 'the default name is not stored');
    assert.equal(doc.pages![0].title, 'Data', 'the original is not changed');
  });

  it('moves pages, including past the first, and the content follows', () => {
    const doc = twoPages();
    const moved = movePage(doc, 1, 0)!;
    assert.deepEqual(pageList(moved.doc).map((p) => p.title), ['Data', 'Page 1']);
    assert.deepEqual(moved.doc.nodes.map((n) => n.id), ['db', 'cache']);
    assert.deepEqual(moved.doc.pages![0].nodes.map((n) => n.id), ['web', 'api']);
    assert.equal(moved.doc.stageWidth, 2000);
    assert.equal(indexOfPage(moved.doc, 'data'), 0);
    assert.equal(movePage(doc, 0, 0), null);
    assert.equal(movePage(doc, 0, 5), null);
    // Moving back restores the file exactly.
    assert.deepEqual(shape(movePage(moved.doc, 0, 1)!.doc), shape(doc));
  });

  it('next and previous wrap around', () => {
    const doc = addPage(twoPages())!.doc;
    assert.equal(neighbourPage(doc, 2, 1), 0);
    assert.equal(neighbourPage(doc, 0, -1), 2);
    assert.equal(neighbourPage(doc, 1, 1), 2);
  });

  it('reads a damaged page list tolerantly', () => {
    const doc = twoPages();
    doc.pages!.push({ id: 'data', title: '', nodes: [], edges: [], zones: [], notesCards: [] });
    doc.pages!.push({ id: '', title: '  ', nodes: [], edges: [], zones: [], notesCards: [] });
    doc.pageId = 'data';
    normalizePages(doc);
    const ids = pageList(doc).map((p) => p.id);
    assert.equal(new Set(ids).size, ids.length, 'repeated and empty ids are fixed');
    assert.ok(pageList(doc).every((p) => p.title.trim()), 'empty titles get a default');
  });

  it('page 1 uses the default id, so no stored id is needed', () => {
    assert.equal(twoPages().pageId, undefined);
    assert.equal(pageList(twoPages())[0].id, 'page-1');
  });
});

describe('pages (D10): levels inside a page', () => {
  it('a component on a later page still opens as a level, scoped to that page', () => {
    const doc = twoPages();
    doc.pages![0].nodes[0].child = { nodes: [node('inner')], edges: [], zones: [], notesCards: [] };
    const page = viewOfPage(doc, 1);
    const level = viewOfLevel(page, ['db']);
    assert.deepEqual(level.nodes.map((n) => n.id), ['inner']);
    level.nodes.push(node('inner2', 600, 200));
    writeLevelBack(page, ['db'], level);
    writePageBack(doc, 1, page);
    assert.deepEqual(doc.pages![0].nodes[0].child!.nodes.map((n) => n.id), ['inner', 'inner2']);
    assert.deepEqual(doc.nodes.map((n) => n.id), ['web', 'api']);
  });

  it('writing a level back never overwrites the page list', () => {
    const doc = twoPages();
    doc.nodes[0].child = { nodes: [node('inner')], edges: [], zones: [], notesCards: [] };
    const level = viewOfLevel(doc, ['web']);
    doc.pages = undefined;
    writeLevelBack(doc, ['web'], level);
    assert.equal(doc.pages, undefined, 'the stale copy in the level view is not written back');
  });
});

describe('pages (D10): files', () => {
  it('is schema 11 and older files open as one page', () => {
    assert.equal(CURRENT_SCHEMA_VERSION, 11);
    const result = migrate({ nodes: [] }, 10);
    assert.equal(result.ok, true);
    const parsed = parseBlueprintJson(
      JSON.stringify({ kind: 'conduitcraft.blueprint', version: 10, document: { ...createBlankDocument(), nodes: [node('a')] } }),
    );
    assert.ok(parsed.ok);
    assert.equal(pageCount(parsed.doc), 1);
  });

  it('round-trips through Blueprint JSON', () => {
    const doc = twoPages();
    doc.pageTitle = 'Storefront';
    const parsed = parseBlueprintJson(serializeBlueprintJson(doc));
    assert.ok(parsed.ok);
    assert.deepEqual(shape(parsed.doc), shape(doc));
    assert.equal(parsed.doc.pages![0].edges[0].label, 'fills');
  });

  it('round-trips through the Blueprint file (YAML)', () => {
    const doc = twoPages();
    doc.pageTitle = 'Storefront';
    const text = serializeToBlueprintMarkdown(doc);
    assert.match(text, /^pages:/m);
    const back = importMermaidOrBlueprint(text).doc;
    assert.deepEqual(shape(back), shape(doc));
    assert.equal(back.pages![0].edges[0].label, 'fills');
    assert.deepEqual(back.pages![0].nodes.map((n) => [n.x, n.y]), doc.pages![0].nodes.map((n) => [n.x, n.y]));
  });

  it('round-trips through the share link', async () => {
    const doc = twoPages();
    const { hash } = await createShareUrl(doc, { baseUrl: 'https://example.com/app' });
    const back = await decodeSharedDiagramFromHash(hash);
    assert.ok(back);
    assert.deepEqual(shape(back), shape(doc));
  });

  it('a page inside a page file keeps a nested level and frames', () => {
    const doc = twoPages();
    doc.pages![0].nodes[0].child = { nodes: [node('inner')], edges: [], zones: [], notesCards: [] };
    doc.pages![0].frames = [{ id: 'f1', title: 'VPC', x: 100, y: 100, width: 600, height: 300, tone: 'blue' }];
    doc.pages![0].nodes[1].frameId = 'f1';
    for (const back of [
      (parseBlueprintJson(serializeBlueprintJson(doc)) as { doc: DiagramDocument }).doc,
      importMermaidOrBlueprint(serializeToBlueprintMarkdown(doc)).doc,
    ]) {
      assert.equal(back.pages![0].frames?.[0].title, 'VPC');
      assert.equal(back.pages![0].nodes[1].frameId, 'f1');
      assert.deepEqual(back.pages![0].nodes[0].child?.nodes.map((n) => n.id), ['inner']);
    }
  });

  it('fixes repeated page ids and empty titles in a hand-edited file', () => {
    const raw = {
      kind: 'conduitcraft.blueprint',
      version: 11,
      document: {
        ...createBlankDocument(),
        nodes: [node('a')],
        pages: [
          { id: 'x', title: '', nodes: [node('b')] },
          { id: 'x', title: 'Again', nodes: [node('c')] },
          'junk',
          { nodes: 'nope' },
        ],
      },
    };
    const parsed = parseBlueprintJson(JSON.stringify(raw));
    assert.ok(parsed.ok);
    const list = pageList(parsed.doc);
    assert.equal(new Set(list.map((p) => p.id)).size, list.length);
    assert.ok(list.every((p) => p.title.trim()));
    assert.ok(parsed.doc.pages!.length >= 2);
  });

  it('caps the number of pages a file can carry', () => {
    const many = Array.from({ length: MAX_PAGES + 20 }, (_, i) => ({ id: `p${i}`, title: `P${i}`, nodes: [] }));
    const parsed = parseBlueprintJson(
      JSON.stringify({ kind: 'conduitcraft.blueprint', version: 11, document: { ...createBlankDocument(), nodes: [node('a')], pages: many } }),
    );
    assert.ok(parsed.ok);
    assert.ok(pageCount(parsed.doc) <= MAX_PAGES);
  });

  it('keeps scenario failures that name a component on another page', () => {
    const doc = twoPages();
    doc.simulations = [{ id: 's', name: 'S', tone: 'blue', steps: [], failures: ['db', 'ghost'] }];
    pruneDanglingChaos(doc);
    assert.deepEqual(doc.simulations[0].failures, ['db']);
  });

  it('keeps a scenario step that names a component on another page when reading a file', () => {
    const doc = twoPages();
    doc.simulations = [
      { id: 's', name: 'Warm the cache', tone: 'blue', steps: [{ id: 'st', nodes: ['db', 'cache'], tone: 'blue', label: 'A', trace: 't' }] },
    ];
    const back = importMermaidOrBlueprint(serializeToBlueprintMarkdown(doc)).doc;
    assert.equal(back.simulations.length, 1);
    assert.deepEqual(back.simulations[0].steps[0].nodes, ['db', 'cache']);
  });
});

describe('pages (D10): keys', () => {
  const ev = (key: string, extra: Partial<{ altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }> = {}) => ({
    key,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...extra,
  });
  const ctx = { mode: 'design', hasSelection: false } as const;

  it('Alt+PageDown and Alt+PageUp change page, in every lens', () => {
    assert.equal(matchBinding(ev('PageDown', { altKey: true }), ctx), 'page-next');
    assert.equal(matchBinding(ev('PageUp', { altKey: true }), ctx), 'page-previous');
    assert.equal(matchBinding(ev('PageDown', { altKey: true }), { mode: 'data', hasSelection: false }), 'page-next');
  });

  it('leaves Ctrl+PageUp and Ctrl+PageDown to the browser', () => {
    assert.equal(matchBinding(ev('PageDown', { ctrlKey: true }), ctx), null);
    assert.equal(matchBinding(ev('PageUp', { metaKey: true }), ctx), null);
    assert.equal(matchBinding(ev('PageDown'), ctx), null);
  });
});
