/** Node outline and custom-icon values shared by the editor, parser, and export. */
import type { NodeShape } from '../types';

export const NODE_SHAPES = ['card', 'rounded', 'pill', 'circle', 'diamond', 'hexagon', 'asymmetric'] as const;

export const NODE_SHAPE_LABELS: Record<NodeShape, string> = {
  card: 'Card',
  rounded: 'Rounded',
  pill: 'Pill',
  circle: 'Circle',
  diamond: 'Diamond',
  hexagon: 'Hexagon',
  asymmetric: 'Asymmetric (Banner)',
};

/** Largest custom icon kept on a node, in data-URL characters. */
export const MAX_ICON_IMAGE_CHARS = 380_000;

const ICON_IMAGE_RE = /^data:image\/(png|jpeg|gif|webp|svg\+xml);base64,[a-z0-9+/=\s]+$/i;

export function isNodeShape(value: string): value is NodeShape {
  return (NODE_SHAPES as readonly string[]).includes(value);
}

export function normalizeNodeShape(raw: unknown): NodeShape {
  if (typeof raw !== 'string') return 'card';
  const value = raw.trim().toLowerCase();
  return isNodeShape(value) ? value : 'card';
}

export interface ShapePlateEllipse {
  kind: 'ellipse';
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

export interface ShapePlatePolygon {
  kind: 'polygon';
  points: string;
}

export type ShapePlate = ShapePlateEllipse | ShapePlatePolygon;

function roundTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Closed outline for shapes whose CSS border would be a clipped rectangle. */
export function nodeShapePlate(
  shape: NodeShape | undefined,
  width: number,
  height: number,
): ShapePlate | null {
  if (shape !== 'circle' && shape !== 'diamond' && shape !== 'hexagon' && shape !== 'asymmetric') return null;
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const inset = 1.25;
  if (shape === 'circle') {
    return {
      kind: 'ellipse',
      cx: roundTenth(w / 2),
      cy: roundTenth(h / 2),
      rx: roundTenth(Math.max(1, w / 2 - inset)),
      ry: roundTenth(Math.max(1, h / 2 - inset)),
    };
  }
  let points: Array<[number, number]>;
  if (shape === 'diamond') {
    points = [
      [w / 2, inset],
      [w - inset, h / 2],
      [w / 2, h - inset],
      [inset, h / 2],
    ];
  } else if (shape === 'asymmetric') {
    const notch = Math.min(22, Math.round(w * 0.14));
    points = [
      [inset, inset],
      [w - notch - inset, inset],
      [w - inset, h / 2],
      [w - notch - inset, h - inset],
      [inset, h - inset],
    ];
  } else {
    points = [
      [w * 0.22, inset],
      [w * 0.78, inset],
      [w - inset, h / 2],
      [w * 0.78, h - inset],
      [w * 0.22, h - inset],
      [inset, h / 2],
    ];
  }
  return {
    kind: 'polygon',
    points: points.map(([x, y]) => `${roundTenth(x)},${roundTenth(y)}`).join(' '),
  };
}

/** Diamond's safe area is half the box, so the box grows to hold the same label. */
export function nodeShapeFrame(
  base: { width: number; height: number },
  shape: NodeShape | undefined,
): { width: number; height: number } {
  if (shape !== 'diamond') return { width: base.width, height: base.height };
  return {
    width: Math.round(base.width * 1.42),
    height: Math.round(base.height * 1.65),
  };
}

/**
 * Default data stores are drawn as a cylinder. The outline is not stored:
 * `shape` stays absent, and an explicit non-card outline still wins.
 */
export function storeDrawsCylinder(kind: string, shape: NodeShape | undefined): boolean {
  return kind === 'store' && (shape == null || shape === 'card');
}

export interface CylinderPlate {
  width: number;
  height: number;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  /** Straight walls and a curved base. The lid ellipse covers the open top. */
  body: string;
}

/** Drum geometry in the node's box. Ports stay on the rectangle, so wires do not move. */
export function cylinderPlate(width: number, height: number): CylinderPlate {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const inset = 1.5;
  const rx = Math.max(1, w / 2 - inset);
  const capRoom = Math.max(4, (h - inset * 2) / 4);
  const ry = Math.max(4, Math.min(18, h * 0.14, capRoom));
  const cx = w / 2;
  const cy = inset + ry;
  const bottom = h - inset;
  const left = cx - rx;
  const right = cx + rx;
  const n = roundTenth;
  const body = [
    `M ${n(left)},${n(cy)}`,
    `L ${n(left)},${n(bottom - ry)}`,
    `A ${n(rx)} ${n(ry)} 0 0 0 ${n(cx)},${n(bottom)}`,
    `A ${n(rx)} ${n(ry)} 0 0 0 ${n(right)},${n(bottom - ry)}`,
    `L ${n(right)},${n(cy)}`,
    'Z',
  ].join(' ');
  return {
    width: Math.max(1, Math.round(w)),
    height: Math.max(1, Math.round(h)),
    cx: n(cx),
    cy: n(cy),
    rx: n(rx),
    ry: n(ry),
    body,
  };
}

/** Padding that keeps the label inside the outline. Empty keeps the card padding. */
export function nodeShapeContentPadding(
  kind: string,
  shape: NodeShape | undefined,
  width: number,
  height: number,
): string {
  if (storeDrawsCylinder(kind, shape)) {
    const { cy, ry } = cylinderPlate(width, height);
    return `${Math.round(cy + ry + 6)}px 1.15rem ${Math.round(ry + 8)}px`;
  }
  if (kind === 'actor' || !shape || shape === 'card' || shape === 'rounded') return '';
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  if (shape === 'diamond') return `${Math.round(h * 0.26)}px ${Math.round(w * 0.27)}px`;
  if (shape === 'circle') return `${Math.round(h * 0.16)}px ${Math.round(w * 0.16)}px`;
  if (shape === 'hexagon') return `${Math.round(h * 0.1)}px ${Math.round(w * 0.2)}px`;
  if (shape === 'asymmetric') return `${Math.round(h * 0.12)}px ${Math.round(w * 0.16)}px ${Math.round(h * 0.12)}px ${Math.round(w * 0.08)}px`;
  return `${Math.round(h * 0.1)}px ${Math.round(Math.min(w, h) * 0.2)}px`;
}

export function renderNodeShapePlate(
  shape: NodeShape | undefined,
  width: number,
  height: number,
): string {
  const plate = nodeShapePlate(shape, width, height);
  if (!plate) return '';
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const geom =
    plate.kind === 'ellipse'
      ? `<ellipse class="node-shape-geom" cx="${plate.cx}" cy="${plate.cy}" rx="${plate.rx}" ry="${plate.ry}"/>`
      : `<polygon class="node-shape-geom" points="${plate.points}"/>`;
  return `<svg class="node-shape-plate" viewBox="0 0 ${w} ${h}" width="100%" height="100%" overflow="visible" aria-hidden="true" focusable="false">${geom}</svg>`;
}

export function renderCylinderPlate(width: number, height: number): string {
  const plate = cylinderPlate(width, height);
  return `<svg class="node-shape-plate" data-plate="cylinder" viewBox="0 0 ${plate.width} ${plate.height}" width="100%" height="100%" overflow="visible" aria-hidden="true" focusable="false"><path class="node-shape-geom cylinder-body" d="${plate.body}"/><ellipse class="node-shape-geom cylinder-lid" cx="${plate.cx}" cy="${plate.cy}" rx="${plate.rx}" ry="${plate.ry}"/></svg>`;
}

/** True when the field is absent or a known outline name. */
export function isKnownNodeShape(raw: unknown): boolean {
  if (raw === undefined || raw === null || raw === '') return true;
  return typeof raw === 'string' && isNodeShape(raw.trim().toLowerCase());
}

/** Accept only image data URLs. Anything else is dropped. */
export function sanitizeIconImage(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const value = raw.trim();
  if (!value || value.length > MAX_ICON_IMAGE_CHARS) return undefined;
  if (!ICON_IMAGE_RE.test(value)) return undefined;
  return value;
}
