/** Node outline and custom-icon values shared by the editor, parser, and export. */
import type { NodeShape } from '../types';

export const NODE_SHAPES = ['card', 'rounded', 'pill', 'circle', 'diamond', 'hexagon'] as const;

export const NODE_SHAPE_LABELS: Record<NodeShape, string> = {
  card: 'Card',
  rounded: 'Rounded',
  pill: 'Pill',
  circle: 'Circle',
  diamond: 'Diamond',
  hexagon: 'Hexagon',
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
