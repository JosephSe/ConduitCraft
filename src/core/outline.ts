/**
 * The text outline (F-28): the diagram as a tree a keyboard or screen reader can walk. Swimlane → component →
 * its outgoing wires, and a component that opens into a level carries one more row for that level, which holds
 * the level's own swimlanes. Pure and DOM-free; the panel in `studio/outlinePanel.ts` only draws it.
 * Labels are titles and plain words, never ids.
 */
import type { DiagramDocument, DiagramNode, LevelContent } from '../types';
import { describeWire, zoneOf } from './describe';
import { contentAt, type LevelPath } from './levels';
import { pageList } from './pages';

export type OutlineKind = 'page' | 'frame' | 'zone' | 'component' | 'wire' | 'level';

export interface OutlineItem {
  /** Unique and stable across rebuilds, so expansion and focus survive an edit. Never shown. */
  key: string;
  kind: OutlineKind;
  label: string;
  /** The level this row's target lives in. For a `level` row, the level it opens. */
  path: LevelPath;
  /** The component or wire a `component` or `wire` row selects. */
  targetId?: string;
  /** The page a `page` row opens (D10). */
  pageIndex?: number;
  children: OutlineItem[];
}

const txt = (value: string | undefined): string => (value ?? '').trim();
const plural = (count: number, one: string) => `${count} ${count === 1 ? one : `${one}s`}`;
const titleOf = (node: DiagramNode | undefined) => txt(node?.title) || 'Untitled component';
const keyOf = (path: LevelPath, kind: OutlineKind, id: string) => `${path.join('/')}|${kind}|${id}`;

function componentItem(content: LevelContent, node: DiagramNode, path: LevelPath): OutlineItem {
  const byId = new Map(content.nodes.map((n) => [n.id, n]));
  const children: OutlineItem[] = (content.edges ?? [])
    .filter((e) => e.from === node.id && byId.has(e.to))
    .map((e) => ({
      key: keyOf(path, 'wire', e.id),
      kind: 'wire' as const,
      label: describeWire(e, byId.get(e.to)),
      path,
      targetId: e.id,
      children: [],
    }));
  if (node.child) {
    const inner = [...path, node.id];
    const lanes = node.child.zones?.length ?? 0;
    children.push({
      key: keyOf(path, 'level', node.id),
      kind: 'level',
      label: `Opens into ${plural(node.child.nodes.length, 'component')}${lanes ? ` in ${plural(lanes, 'swimlane')}` : ''}`,
      path: inner,
      children: levelItems(node.child, inner),
    });
  }
  const kind = txt(node.kind);
  return {
    key: keyOf(path, 'component', node.id),
    kind: 'component',
    label: kind ? `${titleOf(node)}, ${kind}` : titleOf(node),
    path,
    targetId: node.id,
    children,
  };
}

function levelItems(content: LevelContent, path: LevelPath): OutlineItem[] {
  const zones = [...(content.zones ?? [])].sort((a, b) => a.x - b.x);
  if (zones.length === 0) return content.nodes.map((n) => componentItem(content, n, path));
  const items: OutlineItem[] = zones.map((zone) => ({
    key: keyOf(path, 'zone', zone.id),
    kind: 'zone' as const,
    label: txt(zone.title) || 'Untitled swimlane',
    path,
    children: content.nodes.filter((n) => zoneOf(content, n) === zone).map((n) => componentItem(content, n, path)),
  }));
  const loose = content.nodes.filter((n) => !zoneOf(content, n));
  if (loose.length) {
    items.push({
      key: keyOf(path, 'zone', '*outside'),
      kind: 'zone',
      label: 'Outside any swimlane',
      path,
      children: loose.map((n) => componentItem(content, n, path)),
    });
  }
  return items;
}

/** One row per page when the file has several, so the outline can move between them (D10). Empty for one page. */
export function pageItems(doc: DiagramDocument, openIndex: number): OutlineItem[] {
  const pages = pageList(doc);
  if (pages.length < 2) return [];
  return pages.map((page) => ({
    key: `|page|${page.id}`,
    kind: 'page' as const,
    label: `Page ${page.title}${page.index === openIndex ? ', open' : ''}`,
    path: [],
    pageIndex: page.index,
    children: [],
  }));
}

/** One row per frame of the level, nested frames indented under the frame they sit in. A row selects the frame (D1b). */
export function frameItems(content: LevelContent, path: LevelPath = []): OutlineItem[] {
  const frames = content.frames ?? [];
  if (!frames.length) return [];
  const make = (f: (typeof frames)[number]): OutlineItem => {
    const held = content.nodes.filter((n) => n.frameId === f.id).length;
    return {
      key: keyOf(path, 'frame', f.id),
      kind: 'frame',
      label: `Frame ${txt(f.title) || 'Untitled'}, holds ${plural(held, 'component')}${f.locked ? ', locked' : ''}`,
      path,
      targetId: f.id,
      children: frames.filter((x) => x.parentId === f.id).map(make),
    };
  };
  const ids = new Set(frames.map((f) => f.id));
  return frames.filter((f) => !f.parentId || !ids.has(f.parentId)).sort((a, b) => a.y - b.y || a.x - b.x).map(make);
}

/** The outline of the level at `openPath`, with every child level nested under its component. */
export function buildOutline(root: DiagramDocument, openPath: LevelPath = []): OutlineItem[] {
  const content = contentAt(root, openPath);
  return content ? levelItems(content, openPath) : [];
}

export interface OutlineRow {
  item: OutlineItem;
  depth: number;
  expandable: boolean;
  expanded: boolean;
  /** 1-based position among its siblings, and how many siblings there are, for `aria-posinset`/`setsize`. */
  posInSet: number;
  setSize: number;
  parentKey: string | null;
}

/** The rows a tree shows right now: an item's children appear only while it is expanded. */
export function flattenOutline(items: readonly OutlineItem[], expanded: ReadonlySet<string>): OutlineRow[] {
  const rows: OutlineRow[] = [];
  const walk = (list: readonly OutlineItem[], depth: number, parentKey: string | null) => {
    list.forEach((item, index) => {
      const expandable = item.children.length > 0;
      const open = expandable && expanded.has(item.key);
      rows.push({ item, depth, expandable, expanded: open, posInSet: index + 1, setSize: list.length, parentKey });
      if (open) walk(item.children, depth + 1, item.key);
    });
  };
  walk(items, 1, null);
  return rows;
}

/** Keys of every swimlane row, which start expanded. */
export function zoneKeys(items: readonly OutlineItem[]): string[] {
  return items.flatMap((item) => [...(item.kind === 'zone' ? [item.key] : []), ...zoneKeys(item.children)]);
}
