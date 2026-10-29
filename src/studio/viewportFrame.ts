/** Pure viewport framing math. Safe to import from node tests. */
import type { DiagramDocument, DiagramNode, SelectionTarget } from '../types';

export interface WorldRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Studio `.blueprint-spec` width. */
export const NOTES_CARD_WIDTH = 404;

/**
 * Estimated notes-card height from padding, the header, and list rows.
 * Used to frame the card without reading layout.
 */
export function notesCardHeight(itemCount: number): number {
  return 72 + Math.max(0, itemCount) * 40;
}

export const FIT_PAD_X = 48;
export const FIT_PAD_Y = 64;
/** Same floor and ceiling as `zoomAround`. */
export const FIT_SCALE_MIN = 0.35;
export const FIT_SCALE_MAX = 1.9;
/** Minimum readable scale when framing small diagrams (e.g. 1-2 nodes) to prevent low-LOD shrinkage. */
export const READABLE_FIT_SCALE_MIN = 0.65;

export function unionRects(rects: WorldRect[]): WorldRect | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const rect of rects) {
    if (rect.width <= 0 || rect.height <= 0) continue;
    x0 = Math.min(x0, rect.x);
    y0 = Math.min(y0, rect.y);
    x1 = Math.max(x1, rect.x + rect.width);
    y1 = Math.max(y1, rect.y + rect.height);
  }
  if (!Number.isFinite(x0)) return null;
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

export function nodeRect(node: Pick<DiagramNode, 'x' | 'y' | 'width' | 'height'>): WorldRect {
  return { x: node.x, y: node.y, width: node.width, height: node.height };
}

export function notesRect(card: { x: number; y: number; items: readonly unknown[] }): WorldRect {
  return {
    x: card.x,
    y: card.y,
    width: NOTES_CARD_WIDTH,
    height: notesCardHeight(card.items.length),
  };
}

/** Swimlane column. Nodes in the column tighten the vertical span; otherwise the stage height is used. */
export function zoneWorldBounds(
  zone: { x: number; width: number },
  stageHeight: number,
  nodes: readonly Pick<DiagramNode, 'x' | 'y' | 'width' | 'height'>[],
): WorldRect {
  const inside = nodes.filter((node) => node.x < zone.x + zone.width && node.x + node.width > zone.x);
  if (inside.length === 0) {
    return { x: zone.x, y: 0, width: zone.width, height: stageHeight };
  }
  let top = 0;
  let bottom = 0;
  for (const node of inside) {
    top = Math.min(top, node.y);
    bottom = Math.max(bottom, node.y + node.height);
  }
  return {
    x: zone.x,
    y: top,
    width: zone.width,
    height: Math.max(bottom - top, 120),
  };
}

function nodesByIds(doc: DiagramDocument, ids: readonly string[]): WorldRect[] {
  const rects: WorldRect[] = [];
  for (const id of ids) {
    const node = doc.nodes.find((candidate) => candidate.id === id);
    if (node) rects.push(nodeRect(node));
  }
  return rects;
}

export function contentWorldBounds(doc: DiagramDocument): WorldRect | null {
  return unionRects([
    ...doc.nodes.map(nodeRect),
    ...doc.zones.map((zone) => zoneWorldBounds(zone, doc.stageHeight, doc.nodes)),
    ...doc.notesCards.map(notesRect),
  ]);
}

/**
 * World bounds for the current selection.
 * An empty selection frames every node, zone, and notes card.
 */
export function selectionWorldBounds(doc: DiagramDocument, selection: SelectionTarget): WorldRect | null {
  if (selection.type === 'none') return contentWorldBounds(doc);
  if (selection.type === 'node') return unionRects(nodesByIds(doc, [selection.id]));
  if (selection.type === 'multi') {
    const rects = nodesByIds(doc, selection.ids);
    for (const id of selection.zoneIds ?? []) {
      const zone = doc.zones.find((candidate) => candidate.id === id);
      if (zone) rects.push(zoneWorldBounds(zone, doc.stageHeight, doc.nodes));
    }
    for (const id of selection.notesIds ?? []) {
      const card = doc.notesCards.find((candidate) => candidate.id === id);
      if (card) rects.push(notesRect(card));
    }
    for (const id of selection.edgeIds ?? []) {
      const edge = doc.edges.find((candidate) => candidate.id === id);
      if (edge) {
        rects.push(...nodesByIds(doc, [edge.from, edge.to]));
        if (edge.waypoint) {
          const [wx, wy] = edge.waypoint;
          rects.push({ x: wx - 8, y: wy - 8, width: 16, height: 16 });
        }
      }
    }
    return unionRects(rects);
  }
  if (selection.type === 'notes') {
    const card = doc.notesCards.find((candidate) => candidate.id === selection.id);
    return card ? notesRect(card) : null;
  }
  if (selection.type === 'zone') {
    const zone = doc.zones.find((candidate) => candidate.id === selection.id);
    return zone ? zoneWorldBounds(zone, doc.stageHeight, doc.nodes) : null;
  }
  if (selection.type === 'edge') {
    const edge = doc.edges.find((candidate) => candidate.id === selection.id);
    if (!edge) return null;
    const rects = nodesByIds(doc, [edge.from, edge.to]);
    if (edge.waypoint) {
      const [wx, wy] = edge.waypoint;
      rects.push({ x: wx - 8, y: wy - 8, width: 16, height: 16 });
    }
    return unionRects(rects);
  }
  return null;
}

export interface ViewportFrame {
  scale: number;
  panX: number;
  panY: number;
}

/** Center `bounds` in the viewport. Scale stays inside the studio zoom range. */
export function frameRectInViewport(
  viewportWidth: number,
  viewportHeight: number,
  bounds: WorldRect,
  minScale = FIT_SCALE_MIN,
  maxScale = FIT_SCALE_MAX,
): ViewportFrame | null {
  if (viewportWidth <= 0 || viewportHeight <= 0) return null;
  if (bounds.width <= 0 || bounds.height <= 0) return null;
  const availW = Math.max(32, viewportWidth - FIT_PAD_X);
  const availH = Math.max(32, viewportHeight - FIT_PAD_Y);
  const raw = Math.min(availW / bounds.width, availH / bounds.height);
  const scale = Math.min(maxScale, Math.max(minScale, raw));
  return {
    scale,
    panX: (viewportWidth - bounds.width * scale) / 2 - bounds.x * scale,
    panY: (viewportHeight - bounds.height * scale) / 2 - bounds.y * scale,
  };
}

/**
 * Frame the diagram document in the viewport.
 * When framing small diagrams (e.g. 1-2 nodes), does not shrink them into a tiny fraction
 * of the 1680x920 stage at default laptop Fit zoom; clamps to a readable minimum zoom (>= READABLE_FIT_SCALE_MIN).
 */
export function frameDocumentInViewport(
  viewportWidth: number,
  viewportHeight: number,
  doc: DiagramDocument,
): ViewportFrame | null {
  if (viewportWidth <= 0 || viewportHeight <= 0) return null;

  if (doc.nodes.length === 0 && doc.zones.length === 0 && doc.notesCards.length === 0) {
    return {
      scale: 1,
      panX: Math.round((viewportWidth - doc.stageWidth) / 2),
      panY: Math.max(0, Math.round((viewportHeight - doc.stageHeight) / 2)),
    };
  }

  const content = contentWorldBounds(doc);
  // When framing small diagrams (1-4 nodes and no zones spanning the full stage),
  // frame the actual content bounding box clamped to a readable minimum zoom (>= READABLE_FIT_SCALE_MIN).
  if (content && doc.nodes.length <= 4 && doc.zones.length === 0) {
    const padX = 80;
    const padY = 80;
    const availW = Math.max(32, viewportWidth - padX);
    const availH = Math.max(32, viewportHeight - padY);
    const raw = Math.min(availW / content.width, availH / content.height);
    const scale = Math.min(1.0, Math.max(READABLE_FIT_SCALE_MIN, raw));
    return {
      scale,
      panX: (viewportWidth - content.width * scale) / 2 - content.x * scale,
      panY: (viewportHeight - content.height * scale) / 2 - content.y * scale,
    };
  }

  // Large or zoned diagrams: frame stage dimensions clamped to [FIT_SCALE_MIN, 1.12]
  const padX = 48;
  const padY = 64;
  const scaleX = (viewportWidth - padX) / doc.stageWidth;
  const scaleY = (viewportHeight - padY) / doc.stageHeight;
  const scale = Math.max(FIT_SCALE_MIN, Math.min(1.12, Math.min(scaleX, scaleY)));
  return {
    scale,
    panX: Math.round((viewportWidth - doc.stageWidth * scale) / 2),
    panY: Math.max(12, Math.round((viewportHeight - doc.stageHeight * scale) / 2 - 8)),
  };
}

export interface MinimapMap {
  scale: number;
  originX: number;
  originY: number;
}

export function minimapMap(
  stageWidth: number,
  stageHeight: number,
  canvasWidth: number,
  canvasHeight: number,
  pad = 6,
): MinimapMap {
  const innerW = Math.max(1, canvasWidth - pad * 2);
  const innerH = Math.max(1, canvasHeight - pad * 2);
  const scale = Math.min(innerW / Math.max(1, stageWidth), innerH / Math.max(1, stageHeight));
  return {
    scale,
    originX: (canvasWidth - stageWidth * scale) / 2,
    originY: (canvasHeight - stageHeight * scale) / 2,
  };
}

export function worldToMinimap(map: MinimapMap, x: number, y: number): [number, number] {
  return [map.originX + x * map.scale, map.originY + y * map.scale];
}

export function minimapToWorld(map: MinimapMap, px: number, py: number): [number, number] {
  return [(px - map.originX) / map.scale, (py - map.originY) / map.scale];
}

export function viewportWorldRect(
  viewportWidth: number,
  viewportHeight: number,
  panX: number,
  panY: number,
  scale: number,
): WorldRect {
  const safe = scale || 1;
  return {
    x: -panX / safe,
    y: -panY / safe,
    width: viewportWidth / safe,
    height: viewportHeight / safe,
  };
}

export function panToCenterWorld(
  worldX: number,
  worldY: number,
  viewportWidth: number,
  viewportHeight: number,
  scale: number,
): { panX: number; panY: number } {
  return {
    panX: viewportWidth / 2 - worldX * scale,
    panY: viewportHeight / 2 - worldY * scale,
  };
}
