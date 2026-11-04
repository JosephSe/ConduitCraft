/**
 * Colour, kind and shape changes for a set of components (C2). The contextual toolbar and the inspector both run
 * these, so a change means the same thing from either. Each returns whether anything changed, which is what
 * `mutateWithHistory` needs to decide whether to record an undo step.
 */
import type { ComponentStatus, DiagramEdge, DiagramNode, NodeKind, NodeShape, StreamTone, WireSync } from '../types';
import { getNodeDimensions } from './layout';
import { nodeShapeFrame } from './nodeStyle';

export function setAccent(nodes: DiagramNode[], tone: StreamTone): boolean {
  let changed = false;
  for (const n of nodes) {
    if (n.accent === tone) continue;
    n.accent = tone;
    changed = true;
  }
  return changed;
}

/** The size a component has for its kind and shape; a component keeps its centre when it changes size. */
function resize(node: DiagramNode): void {
  const frame = nodeShapeFrame(getNodeDimensions(node.kind), node.shape);
  node.x = Math.round(node.x + (node.width - frame.width) / 2);
  node.y = Math.round(node.y + (node.height - frame.height) / 2);
  node.width = frame.width;
  node.height = frame.height;
}

export function setKind(nodes: DiagramNode[], kind: NodeKind): boolean {
  let changed = false;
  for (const n of nodes) {
    if (n.kind === kind) continue;
    n.kind = kind;
    resize(n);
    changed = true;
  }
  return changed;
}

export function setShape(nodes: DiagramNode[], shape: NodeShape): boolean {
  let changed = false;
  for (const n of nodes) {
    if ((n.shape ?? 'card') === shape) continue;
    if (shape === 'card') delete n.shape;
    else n.shape = shape;
    resize(n);
    changed = true;
  }
  return changed;
}

/** Set (or with `undefined`, clear) the status of every component. */
export function setStatus(nodes: DiagramNode[], status: ComponentStatus | undefined): boolean {
  let changed = false;
  for (const n of nodes) {
    if (n.status === status) continue;
    if (status === undefined) delete n.status;
    else n.status = status;
    changed = true;
  }
  return changed;
}

type Tagged = Pick<DiagramNode | DiagramEdge, 'tags'>;

/** Add a tag to every item that lacks it (compared ignoring case). */
export function addTag(items: Tagged[], tag: string): boolean {
  const clean = tag.trim();
  if (!clean) return false;
  let changed = false;
  for (const item of items) {
    const tags = item.tags ?? [];
    if (tags.some((t) => t.toLowerCase() === clean.toLowerCase())) continue;
    item.tags = [...tags, clean];
    changed = true;
  }
  return changed;
}

/** Remove a tag from every item that has it; an item left with no tags loses the field. */
export function removeTag(items: Tagged[], tag: string): boolean {
  const clean = tag.trim().toLowerCase();
  if (!clean) return false;
  let changed = false;
  for (const item of items) {
    const tags = item.tags ?? [];
    const kept = tags.filter((t) => t.toLowerCase() !== clean);
    if (kept.length === tags.length) continue;
    if (kept.length === 0) delete item.tags;
    else item.tags = kept;
    changed = true;
  }
  return changed;
}

/** Colour every wire. */
export function setWireTone(edges: DiagramEdge[], tone: StreamTone): boolean {
  let changed = false;
  for (const e of edges) {
    if (e.tone === tone) continue;
    e.tone = tone;
    changed = true;
  }
  return changed;
}

/** Make every wire sync or async (sync is the default, so it clears the field). */
export function setWireSync(edges: DiagramEdge[], sync: WireSync): boolean {
  let changed = false;
  for (const e of edges) {
    if ((e.sync ?? 'sync') === sync) continue;
    if (sync === 'sync') delete e.sync;
    else e.sync = sync;
    changed = true;
  }
  return changed;
}
