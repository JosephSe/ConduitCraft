/**
 * Pages (D10): several diagrams in one file, shown as tabs along the bottom of the canvas. The document's own
 * content is the first page, so old files, every importer and the headless core keep working unchanged;
 * `doc.pages` holds the second page onwards. The studio edits one page at a time as an ordinary document, so these
 * helpers translate between the whole file and the page being edited, and do the structural edits (add, duplicate,
 * delete, rename, move) as pure functions on a whole document. Pure and DOM-free.
 */
import type { DiagramDocument, LevelContent } from '../types';

export const FIRST_PAGE_ID = 'page-1';
export const MAX_PAGES = 64;

/** Fields that describe the page structure itself. They belong to the whole file, never to one page's view. */
export const PAGE_STRUCTURE_FIELDS = ['pages', 'pageTitle', 'pageId'] as const;
/** Fields that hold a page's content. The first page keeps them on the document itself. */
const CONTENT_FIELDS = ['nodes', 'edges', 'zones', 'notesCards', 'frames'] as const;

export interface PageInfo {
  id: string;
  title: string;
  index: number;
}

export function pageCount(doc: DiagramDocument): number {
  return 1 + (doc.pages?.length ?? 0);
}

export function defaultPageTitle(index: number): string {
  return `Page ${index + 1}`;
}

/** Every page, in order, with its id and title. */
export function pageList(doc: DiagramDocument): PageInfo[] {
  const first: PageInfo = { id: doc.pageId || FIRST_PAGE_ID, title: doc.pageTitle?.trim() || defaultPageTitle(0), index: 0 };
  return [first, ...(doc.pages ?? []).map((p, i) => ({ id: p.id, title: p.title, index: i + 1 }))];
}

export function pageIdAt(doc: DiagramDocument, index: number): string {
  return pageList(doc)[index]?.id ?? FIRST_PAGE_ID;
}

/** Position of the page with this id, or -1. */
export function indexOfPage(doc: DiagramDocument, id: string): number {
  return pageList(doc).findIndex((p) => p.id === id);
}

export function uniquePageId(existing: Iterable<string>): string {
  const taken = new Set(existing);
  let n = taken.size + 1;
  while (taken.has(`page-${n}`)) n += 1;
  return `page-${n}`;
}

/**
 * Page `index` as a standalone document: the shared fields (title, scenarios, legend and so on) from the file, the
 * content and stage size from the page. Page 0 is the file itself, so it is returned as a copy of the whole.
 */
export function viewOfPage(whole: DiagramDocument, index: number): DiagramDocument {
  const view = structuredClone(whole);
  if (index <= 0) return view;
  const page = (whole.pages ?? [])[index - 1];
  if (!page) return view;
  for (const field of PAGE_STRUCTURE_FIELDS) delete (view as unknown as Record<string, unknown>)[field];
  view.nodes = structuredClone(page.nodes);
  view.edges = structuredClone(page.edges);
  view.zones = structuredClone(page.zones);
  view.notesCards = structuredClone(page.notesCards);
  if (page.frames?.length) view.frames = structuredClone(page.frames);
  else delete view.frames;
  if (page.stageWidth) view.stageWidth = page.stageWidth;
  if (page.stageHeight) view.stageHeight = page.stageHeight;
  return view;
}

/** Write an edited page back into `whole` (mutates it), carrying shared-field edits such as the title along. */
export function writePageBack(whole: DiagramDocument, index: number, view: DiagramDocument): void {
  if (index <= 0) {
    // The first page is the file: keep the page structure the view may not carry.
    const { pages, pageTitle, pageId } = whole;
    Object.assign(whole, view);
    if (pages) whole.pages = pages;
    if (pageTitle) whole.pageTitle = pageTitle;
    if (pageId) whole.pageId = pageId;
    return;
  }
  const page = (whole.pages ?? [])[index - 1];
  if (!page) return;
  page.nodes = view.nodes;
  page.edges = view.edges;
  page.zones = view.zones;
  page.notesCards = view.notesCards;
  if (view.frames?.length) page.frames = view.frames;
  else delete page.frames;
  page.stageWidth = view.stageWidth;
  page.stageHeight = view.stageHeight;
  const skip = new Set<string>([...CONTENT_FIELDS, ...PAGE_STRUCTURE_FIELDS, 'stageWidth', 'stageHeight']);
  for (const [key, value] of Object.entries(view)) if (!skip.has(key)) (whole as unknown as Record<string, unknown>)[key] = value;
}

/** The page after (or before) `index`, wrapping around the ends. */
export function neighbourPage(doc: DiagramDocument, index: number, step: 1 | -1): number {
  const n = pageCount(doc);
  return (index + step + n) % n;
}

/** Make page ids unique and titles non-empty on a document read from a file. Mutates and returns it. */
export function normalizePages(doc: DiagramDocument): DiagramDocument {
  if (doc.pages && doc.pages.length > MAX_PAGES - 1) doc.pages = doc.pages.slice(0, MAX_PAGES - 1);
  if (!doc.pages?.length) delete doc.pages;
  if (doc.pageTitle !== undefined && !doc.pageTitle.trim()) delete doc.pageTitle;
  if (doc.pageId !== undefined && !doc.pageId.trim()) delete doc.pageId;
  const seen = new Set<string>([doc.pageId || FIRST_PAGE_ID]);
  (doc.pages ?? []).forEach((page, i) => {
    if (!page.id || !page.id.trim() || seen.has(page.id)) page.id = uniquePageId(seen);
    seen.add(page.id);
    if (!page.title || !page.title.trim()) page.title = defaultPageTitle(i + 1);
  });
  return doc;
}

/** The content of page `index` as level content (a page is a level-shaped record). */
export function contentOfPage(doc: DiagramDocument, index: number): LevelContent | null {
  if (index === 0) return doc;
  return (doc.pages ?? [])[index - 1] ?? null;
}
