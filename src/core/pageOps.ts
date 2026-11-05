/**
 * Structural page edits (D10): add, duplicate, delete, rename and move, as pure functions on a whole document.
 * Split from `pages.ts` so the studio loads them with the page menu instead of in the entry bundle.
 */
import type { DiagramDocument, DiagramPage } from '../types';
import { FIRST_PAGE_ID, MAX_PAGES, defaultPageTitle, pageCount, pageList, uniquePageId } from './pages';

function emptyPage(id: string, title: string): DiagramPage {
  return { id, title, nodes: [], edges: [], zones: [], notesCards: [] };
}

/** A title no other page uses: "Page 2", or "Page 3" when "Page 2" is taken. */
function freshTitle(doc: DiagramDocument): string {
  const titles = new Set(pageList(doc).map((p) => p.title));
  let n = pageCount(doc) + 1;
  while (titles.has(defaultPageTitle(n - 1))) n += 1;
  return defaultPageTitle(n - 1);
}

/** The pages as a plain list, the first page's content taken from the document. */
function toList(doc: DiagramDocument): DiagramPage[] {
  const first: DiagramPage = {
    id: doc.pageId || FIRST_PAGE_ID,
    title: doc.pageTitle?.trim() || defaultPageTitle(0),
    nodes: doc.nodes,
    edges: doc.edges,
    zones: doc.zones,
    notesCards: doc.notesCards,
    ...(doc.frames?.length ? { frames: doc.frames } : {}),
    stageWidth: doc.stageWidth,
    stageHeight: doc.stageHeight,
  };
  return [first, ...(doc.pages ?? [])];
}

/** Rebuild a whole document from a list of pages, moving the first one's content onto the document itself. */
function fromList(shell: DiagramDocument, list: DiagramPage[]): DiagramDocument {
  const [first, ...rest] = list;
  const out: DiagramDocument = { ...shell, nodes: first.nodes, edges: first.edges, zones: first.zones, notesCards: first.notesCards };
  if (first.frames?.length) out.frames = first.frames;
  else delete out.frames;
  if (first.stageWidth) out.stageWidth = first.stageWidth;
  if (first.stageHeight) out.stageHeight = first.stageHeight;
  if (first.id !== FIRST_PAGE_ID) out.pageId = first.id;
  else delete out.pageId;
  if (first.title !== defaultPageTitle(0)) out.pageTitle = first.title;
  else delete out.pageTitle;
  if (rest.length) out.pages = rest;
  else delete out.pages;
  return out;
}

export interface PageEdit {
  doc: DiagramDocument;
  /** The page to open after the edit. */
  index: number;
}

/** Add a blank page after the last one and open it. Null at the page limit. */
export function addPage(whole: DiagramDocument, title?: string): PageEdit | null {
  if (pageCount(whole) >= MAX_PAGES) return null;
  const list = toList(structuredClone(whole));
  const page = emptyPage(uniquePageId(list.map((p) => p.id)), title?.trim() || freshTitle(whole));
  page.stageWidth = whole.stageWidth;
  page.stageHeight = whole.stageHeight;
  list.push(page);
  return { doc: fromList(whole, list), index: list.length - 1 };
}

/** Copy a page and put the copy straight after it. Component ids are kept: they only need to be unique per page. */
export function duplicatePage(whole: DiagramDocument, index: number): PageEdit | null {
  if (pageCount(whole) >= MAX_PAGES || index < 0 || index >= pageCount(whole)) return null;
  const list = toList(structuredClone(whole));
  const source = list[index];
  const copy: DiagramPage = { ...structuredClone(source), id: uniquePageId(list.map((p) => p.id)), title: `${source.title} copy` };
  list.splice(index + 1, 0, copy);
  return { doc: fromList(whole, list), index: index + 1 };
}

/** Remove a page. Refused (null) for the last page. Opens the page that took its place, or the one before. */
export function deletePage(whole: DiagramDocument, index: number): PageEdit | null {
  if (pageCount(whole) <= 1 || index < 0 || index >= pageCount(whole)) return null;
  const list = toList(structuredClone(whole));
  list.splice(index, 1);
  return { doc: fromList(whole, list), index: Math.min(index, list.length - 1) };
}

/** Rename a page. An empty name keeps the old one. Null when nothing changes. */
export function renamePage(whole: DiagramDocument, index: number, title: string): PageEdit | null {
  const name = title.trim().replace(/\s+/g, ' ').slice(0, 80);
  if (!name || index < 0 || index >= pageCount(whole)) return null;
  if (pageList(whole)[index].title === name) return null;
  const doc = structuredClone(whole);
  if (index === 0) {
    if (name === defaultPageTitle(0)) delete doc.pageTitle;
    else doc.pageTitle = name;
  } else {
    doc.pages![index - 1].title = name;
  }
  return { doc, index };
}

/** Move a page from one position to another. Null when it stays where it is. */
export function movePage(whole: DiagramDocument, from: number, to: number): PageEdit | null {
  const n = pageCount(whole);
  if (from < 0 || from >= n || to < 0 || to >= n || from === to) return null;
  const list = toList(structuredClone(whole));
  const [moved] = list.splice(from, 1);
  list.splice(to, 0, moved);
  return { doc: fromList(whole, list), index: to };
}

