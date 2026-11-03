/**
 * Nested levels (F-03). A component can hold a child diagram; a level is addressed by the chain of component ids
 * that lead to it from the root (`[]` is the root). The studio edits one level at a time as an ordinary document,
 * so these helpers only translate between the whole tree and the level being edited. Pure and DOM-free.
 */
import type { DiagramDocument, DiagramNode, LevelContent } from '../types';

export type LevelPath = string[];

export const emptyLevel = (): LevelContent => ({ nodes: [], edges: [], zones: [], notesCards: [] });

/** Document-level fields that belong to the whole tree, not to one level. */
const LEVEL_FIELDS = ['nodes', 'edges', 'zones', 'notesCards'] as const;
/** Shell fields a level shares with the root but sizes for itself. */
const LEVEL_OWN_SHELL = ['stageWidth', 'stageHeight'] as const;

/** The content (components, wires, swimlanes, notes) of the level at `path`, or null when it does not exist. */
export function contentAt(root: DiagramDocument, path: LevelPath): LevelContent | null {
  let current: LevelContent = root;
  for (const id of path) {
    const next: LevelContent | undefined = current.nodes.find((n) => n.id === id)?.child;
    if (!next) return null;
    current = next;
  }
  return current;
}

/** The components of the level at `path`, or null when that level does not exist. */
export function nodesAtLevel(root: DiagramDocument, path: LevelPath): DiagramNode[] | null {
  return contentAt(root, path)?.nodes ?? null;
}

/** The longest leading part of `path` that exists in `root`. */
export function resolveLevelPath(root: DiagramDocument, path: LevelPath): LevelPath {
  const out: LevelPath = [];
  let current: LevelContent = root;
  for (const id of path) {
    const next: LevelContent | undefined = current.nodes.find((n) => n.id === id)?.child;
    if (!next) break;
    out.push(id);
    current = next;
  }
  return out;
}

/** The level at `path` as a standalone document: shared shell fields from the root, content from the level. */
export function viewOfLevel(root: DiagramDocument, path: LevelPath): DiagramDocument {
  const content = contentAt(root, path);
  if (!content) return structuredClone(root);
  const view = structuredClone(root) as DiagramDocument;
  if (path.length === 0) return view;
  for (const field of LEVEL_FIELDS) (view as unknown as Record<string, unknown>)[field] = structuredClone(content[field]);
  return view;
}

/** Write an edited level back into `root` (mutates it), carrying shared shell edits such as the title along. */
export function writeLevelBack(root: DiagramDocument, path: LevelPath, view: DiagramDocument): void {
  if (path.length === 0) {
    Object.assign(root, view);
    return;
  }
  const parentContent = contentAt(root, path.slice(0, -1));
  const node = parentContent?.nodes.find((n) => n.id === path[path.length - 1]);
  if (!node) return;
  node.child = {
    nodes: view.nodes,
    edges: view.edges,
    zones: view.zones,
    notesCards: view.notesCards,
  };
  const skip = new Set<string>([...LEVEL_FIELDS, ...LEVEL_OWN_SHELL]);
  for (const [key, value] of Object.entries(view)) if (!skip.has(key)) (root as unknown as Record<string, unknown>)[key] = value;
}

export interface Crumb {
  /** Path that opens this level. */
  path: LevelPath;
  title: string;
}

/** `Payments ▸ Checkout API ▸ …` as data: the root first, then one entry per open level. */
export function breadcrumb(root: DiagramDocument, path: LevelPath): Crumb[] {
  const crumbs: Crumb[] = [{ path: [], title: root.title || 'Untitled Architecture' }];
  let current: LevelContent = root;
  for (let i = 0; i < path.length; i += 1) {
    const node: DiagramNode | undefined = current.nodes.find((n) => n.id === path[i]);
    if (!node?.child) break;
    crumbs.push({ path: path.slice(0, i + 1), title: node.title });
    current = node.child;
  }
  return crumbs;
}

export interface BoundaryPort {
  edgeId: string;
  /** `in`: the outside node calls this component; `out`: this component calls it. */
  direction: 'in' | 'out';
  outsideId: string;
  outsideTitle: string;
  label: string;
}

/** Wires that cross the edge of the level at `path`, as seen from inside it. */
export function boundaryPorts(root: DiagramDocument, path: LevelPath): BoundaryPort[] {
  if (path.length === 0) return [];
  const parent = contentAt(root, path.slice(0, -1));
  const containerId = path[path.length - 1];
  if (!parent) return [];
  const titleOf = (id: string) => parent.nodes.find((n) => n.id === id)?.title ?? id;
  const ports: BoundaryPort[] = [];
  for (const edge of parent.edges) {
    if (edge.from === containerId && edge.to !== containerId) {
      ports.push({ edgeId: edge.id, direction: 'out', outsideId: edge.to, outsideTitle: titleOf(edge.to), label: edge.label });
    } else if (edge.to === containerId && edge.from !== containerId) {
      ports.push({ edgeId: edge.id, direction: 'in', outsideId: edge.from, outsideTitle: titleOf(edge.from), label: edge.label });
    }
  }
  return ports;
}

export interface LevelNodeEntry {
  path: LevelPath;
  /** Titles of the components that lead here, outermost first. Empty at the root. */
  trail: string[];
  node: DiagramNode;
}

/** Every component at every level, with where it lives. For search and insights. */
export function allLevelNodes(root: DiagramDocument): LevelNodeEntry[] {
  const out: LevelNodeEntry[] = [];
  const walk = (content: LevelContent, path: LevelPath, trail: string[]) => {
    for (const node of content.nodes) {
      out.push({ path, trail, node });
      if (node.child) walk(node.child, [...path, node.id], [...trail, node.title]);
    }
  };
  walk(root, [], []);
  return out;
}

/** Number of nested levels under a component (0 for a leaf). */
export function childCount(node: DiagramNode): number {
  return node.child ? node.child.nodes.length : 0;
}
