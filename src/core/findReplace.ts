/**
 * Find and replace across a diagram (F-29). Looks through component titles and subtitles, wire labels, note
 * titles and lines, swimlane titles, and comments, in one level or in every level. Pure and DOM-free; the dialog
 * in `studio/findReplaceDialog.ts` drives it.
 */
import type { DiagramDocument, LevelContent } from '../types';

export interface FindOptions {
  query: string;
  matchCase: boolean;
  wholeWord: boolean;
}

/** One level of the tree: where it is (`[]` is the root) and its content. */
export interface FindLevel {
  path: string[];
  content: LevelContent;
  /** The page this level belongs to, when searching across pages (D10). */
  page?: number;
}

export type MatchKind = 'node' | 'edge' | 'note' | 'zone';

export interface FindMatch {
  path: string[];
  /** The page the match is on, when searching across pages. */
  page?: number;
  kind: MatchKind;
  id: string;
  /** Human name of the field, for the results list. */
  field: string;
  /** The field's text. */
  text: string;
  /** How many times the query occurs in it. */
  count: number;
}

interface FieldRef {
  kind: MatchKind;
  id: string;
  field: string;
  get: () => string;
  set: (value: string) => void;
}

/** The levels to search. `open` is the level being edited, which stands in for its (stale) copy in the tree. */
export function collectLevels(
  root: LevelContent,
  open: FindLevel,
  scope: 'level' | 'all',
): FindLevel[] {
  if (scope === 'level') return [open];
  const out: FindLevel[] = [];
  const here = open.path.join('/');
  const walk = (content: LevelContent, path: string[]) => {
    const current = path.join('/') === here ? open.content : content;
    out.push({ path, content: current });
    for (const node of current.nodes) if (node.child) walk(node.child, [...path, node.id]);
  };
  walk(root, []);
  return out;
}

function fieldsOf(level: FindLevel): FieldRef[] {
  const refs: FieldRef[] = [];
  const { content } = level;
  for (const n of content.nodes) {
    refs.push(
      { kind: 'node', id: n.id, field: 'Title', get: () => n.title, set: (v) => (n.title = v) },
      { kind: 'node', id: n.id, field: 'Subtitle', get: () => n.subtitle, set: (v) => (n.subtitle = v) },
    );
    if (n.comment !== undefined) {
      refs.push({ kind: 'node', id: n.id, field: 'Comment', get: () => n.comment ?? '', set: (v) => (n.comment = v) });
    }
  }
  for (const e of content.edges) {
    refs.push({ kind: 'edge', id: e.id, field: 'Wire label', get: () => e.label, set: (v) => (e.label = v) });
    if (e.comment !== undefined) {
      refs.push({ kind: 'edge', id: e.id, field: 'Comment', get: () => e.comment ?? '', set: (v) => (e.comment = v) });
    }
  }
  for (const c of content.notesCards) {
    refs.push({ kind: 'note', id: c.id, field: 'Note title', get: () => c.title, set: (v) => (c.title = v) });
    c.items.forEach((item, i) => {
      refs.push(
        { kind: 'note', id: c.id, field: `Note line ${i + 1}`, get: () => item.title, set: (v) => (item.title = v) },
        { kind: 'note', id: c.id, field: `Note line ${i + 1} text`, get: () => item.text, set: (v) => (item.text = v) },
      );
    });
  }
  for (const z of content.zones) {
    refs.push(
      { kind: 'zone', id: z.id, field: 'Swimlane title', get: () => z.title, set: (v) => (z.title = v) },
      { kind: 'zone', id: z.id, field: 'Swimlane subtitle', get: () => z.subtitle, set: (v) => (z.subtitle = v) },
    );
  }
  return refs;
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A global pattern for the options, or null when there is nothing to look for. Plain text only, never a regex. */
export function patternFor(opts: FindOptions): RegExp | null {
  if (!opts.query) return null;
  const body = escapeRegex(opts.query);
  // "Whole word" means the match is not inside a longer run of letters, digits or underscores.
  const source = opts.wholeWord ? `(?<![\\p{L}\\p{N}_])${body}(?![\\p{L}\\p{N}_])` : body;
  return new RegExp(source, opts.matchCase ? 'gu' : 'giu');
}

function countIn(text: string, pattern: RegExp): number {
  pattern.lastIndex = 0;
  return text.match(pattern)?.length ?? 0;
}

export function findMatches(levels: FindLevel[], opts: FindOptions): FindMatch[] {
  const pattern = patternFor(opts);
  if (!pattern) return [];
  const out: FindMatch[] = [];
  for (const level of levels) {
    for (const ref of fieldsOf(level)) {
      const text = ref.get();
      const count = text ? countIn(text, pattern) : 0;
      if (count > 0) out.push({ path: level.path, page: level.page, kind: ref.kind, id: ref.id, field: ref.field, text, count });
    }
  }
  return out;
}

/**
 * Replace every occurrence in the given levels (mutates them). `only` limits the change to some of the matches,
 * as the dialog's "Replace" on one row does. Returns how many occurrences were replaced.
 */
export function replaceAll(
  levels: FindLevel[],
  opts: FindOptions,
  replacement: string,
  only?: Pick<FindMatch, 'path' | 'page' | 'id' | 'field'>[],
): number {
  const pattern = patternFor(opts);
  if (!pattern) return 0;
  const allowed = only ? new Set(only.map((m) => `${m.page ?? ''}|${m.path.join('/')}|${m.id}|${m.field}`)) : null;
  let replaced = 0;
  for (const level of levels) {
    for (const ref of fieldsOf(level)) {
      if (allowed && !allowed.has(`${level.page ?? ''}|${level.path.join('/')}|${ref.id}|${ref.field}`)) continue;
      const text = ref.get();
      if (!text) continue;
      const n = countIn(text, pattern);
      if (n === 0) continue;
      pattern.lastIndex = 0;
      // A function replacement keeps "$&" and friends in the replacement text literal.
      ref.set(text.replace(pattern, () => replacement));
      replaced += n;
    }
  }
  return replaced;
}

/** The ids of the matches in one level, split by kind, ready to become a multi-selection. */
export function idsInLevel(matches: FindMatch[], path: string[], page?: number): Record<MatchKind, string[]> {
  const key = path.join('/');
  const out: Record<MatchKind, string[]> = { node: [], edge: [], note: [], zone: [] };
  for (const m of matches) {
    if (m.path.join('/') !== key || m.page !== page) continue;
    if (!out[m.kind].includes(m.id)) out[m.kind].push(m.id);
  }
  return out;
}

/** Convenience for tests and callers holding a whole document. */
export function levelsOfDocument(doc: DiagramDocument, scope: 'level' | 'all'): FindLevel[] {
  return collectLevels(doc, { path: [], content: doc }, scope);
}
