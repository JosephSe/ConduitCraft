/** Helpers shared by the file importers (draw.io, Excalidraw): ids, colours and placing shapes on the stage. */
import { autoLayoutDocument, expandStageToFit } from '../core/layout';
import type { DiagramDocument, DiagramEdge, DiagramNode, DiagramNotesCard, ImportIssue, NodeKind, StreamTone } from '../types';
import { STENCIL_CATALOG, createNodeFromStencil } from '../templates/presets';

export interface Geo {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const issue = (level: ImportIssue['level'], code: string, message: string): ImportIssue => ({ level, code, message });

export const slugOf = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || 'item';

export function uniqueId(base: string, used: Set<string>): string {
  let id = base;
  for (let i = 2; used.has(id); i++) id = `${base}-${i}`;
  used.add(id);
  return id;
}

/** Nearest of the five wire colours for a `#rrggbb` colour, or undefined for none, default or greys. */
export function colourToTone(raw: string | undefined): StreamTone | undefined {
  if (!raw) return undefined;
  const hex = /^#([0-9a-f]{6})$/i.exec(raw.trim());
  if (!hex) return undefined;
  const r = parseInt(hex[1].slice(0, 2), 16) / 255;
  const g = parseInt(hex[1].slice(2, 4), 16) / 255;
  const b = parseInt(hex[1].slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  // Pastel palettes are pale (saturation 0.07 to 0.2), so only near-greys, blacks and whites are dropped.
  if (delta < 0.035 || max < 0.15) return undefined;
  let hue: number;
  if (max === r) hue = ((g - b) / delta) % 6;
  else if (max === g) hue = (b - r) / delta + 2;
  else hue = (r - g) / delta + 4;
  hue = (hue * 60 + 360) % 360;
  if (hue < 20 || hue >= 330) return 'rose';
  if (hue < 75) return 'amber';
  if (hue < 190) return 'emerald';
  if (hue < 260) return 'blue';
  return 'violet';
}

function rectsOverlap(a: DiagramNode, b: DiagramNode, gap: number): boolean {
  return a.x < b.x + b.width + gap && b.x < a.x + a.width + gap && a.y < b.y + b.height + gap && b.y < a.y + a.height + gap;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * Put components and notes where the source file had them, scaled up so default-size components do not collide,
 * moved to the stage's top left and snapped to the 16 px grid. `origin` holds each component's box in the source
 * file by id, and each note's by `note:<id>`. If any components still overlap, the document is laid out again and
 * an info issue says so. Returns the scale and the horizontal shift, for placing swimlanes the same way.
 */
export function placeShapes(
  doc: DiagramDocument,
  notes: DiagramNotesCard[],
  origin: Map<string, Geo>,
  issues: ImportIssue[],
  codePrefix: string,
): { scale: number; shiftX: number } {
  const sourceWidths = doc.nodes.map((n) => origin.get(n.id)!.width);
  const defaultWidths = doc.nodes.map((n) => n.width);
  const scale = sourceWidths.length ? Math.min(2.5, Math.max(1, median(defaultWidths) / Math.max(1, median(sourceWidths)))) : 1;
  let minX = Infinity;
  let minY = Infinity;
  for (const node of doc.nodes) {
    const g = origin.get(node.id)!;
    node.x = (g.x + g.width / 2) * scale - node.width / 2;
    node.y = (g.y + g.height / 2) * scale - node.height / 2;
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
  }
  for (const note of notes) {
    const g = origin.get(`note:${note.id}`)!;
    note.x = g.x * scale;
    note.y = g.y * scale;
    minX = Math.min(minX, note.x);
    minY = Math.min(minY, note.y);
  }
  let shiftX = 0;
  if (Number.isFinite(minX)) {
    shiftX = 96 - minX;
    const shiftY = 128 - minY;
    for (const node of doc.nodes) {
      node.x = Math.round((node.x + shiftX) / 16) * 16;
      node.y = Math.round((node.y + shiftY) / 16) * 16;
    }
    for (const note of notes) {
      note.x = Math.round((note.x + shiftX) / 16) * 16;
      note.y = Math.round((note.y + shiftY) / 16) * 16;
    }
  }
  let collide = false;
  outer: for (let a = 0; a < doc.nodes.length; a++) {
    for (let b = a + 1; b < doc.nodes.length; b++) {
      if (rectsOverlap(doc.nodes[a], doc.nodes[b], 16)) {
        collide = true;
        break outer;
      }
    }
  }
  if (collide) {
    autoLayoutDocument(doc);
    issues.push(issue('info', `${codePrefix}-relayout`, 'Some shapes were too close together at their original size, so the components were laid out again.'));
  }
  return { scale, shiftX };
}

/** A component made from text alone (no layout in the source). The caller sets the position through `layoutImported`. */
export function makeNode(kind: NodeKind, title: string, used: Set<string>, source: { kind: string; ref: string }): DiagramNode {
  const node = createNodeFromStencil(kind, 0, 0, 0);
  const name = title.trim().slice(0, 60) || STENCIL_CATALOG.find((s) => s.kind === kind)?.defaultTitle || 'Component';
  node.id = uniqueId(slugOf(name), used);
  node.title = name;
  node.summary = `${name} imported from ${source.kind}.`;
  node.code = JSON.stringify({ id: node.id, component: name, source: source.kind }, null, 2);
  node.source = { kind: source.kind, ref: source.ref.slice(0, 200) };
  return node;
}

export function makeEdge(from: DiagramNode, to: DiagramNode, used: Set<string>, extra: Partial<DiagramEdge> = {}): DiagramEdge {
  return {
    id: uniqueId(`wire-${used.size + 1}`, used),
    from: from.id,
    to: to.id,
    sourcePort: 'auto',
    targetPort: 'auto',
    tone: 'blue',
    route: 'auto',
    label: '',
    animated: true,
    ...extra,
  };
}

/** Lay out a document that came from text with no positions, and size the stage to fit. */
export function layoutImported(doc: DiagramDocument): void {
  autoLayoutDocument(doc);
  expandStageToFit(doc);
}
