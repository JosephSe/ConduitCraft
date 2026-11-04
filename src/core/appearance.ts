/**
 * Colour, kind and shape changes for a set of components (C2). The contextual toolbar and the inspector both run
 * these, so a change means the same thing from either. Each returns whether anything changed, which is what
 * `mutateWithHistory` needs to decide whether to record an undo step.
 */
import type { DiagramNode, NodeKind, NodeShape, StreamTone } from '../types';
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
