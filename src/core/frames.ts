/**
 * Frames (F-09): titled boxes that own the components inside them, and can sit inside each other (VPC, subnet,
 * service). A component belongs to the smallest frame that holds its centre, recorded as `node.frameId`. Moving a
 * frame moves what it owns. Pure and DOM-free, so the parser, the exporters and the CLI share it.
 */
import type { DiagramFrame, DiagramNode, StreamTone } from '../types';

export const FRAME_MIN_WIDTH = 96;
export const FRAME_MIN_HEIGHT = 72;
/** Height of the title strip. Components dropped on it still count as inside the frame. */
export const FRAME_HEADER_HEIGHT = 28;
/** Space left around the components when a group becomes a frame. */
export const FRAME_PADDING = 24;

const TONES = new Set<StreamTone>(['blue', 'emerald', 'rose', 'violet', 'amber', 'cyan', 'fuchsia']);
/** A hostile file cannot make nesting deeper than this. */
export const MAX_FRAME_DEPTH = 8;

/** Read frames from a parsed file: drops entries that are not frames, repeated ids and cycles, and fixes bad sizes. */
export function coerceFrames(raw: unknown): DiagramFrame[] {
  if (!Array.isArray(raw)) return [];
  const out: DiagramFrame[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const r = item as Record<string, unknown>;
    if (typeof r.id !== 'string' || r.id.trim() === '' || seen.has(r.id)) continue;
    const n = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
    seen.add(r.id);
    out.push({
      id: r.id,
      title: typeof r.title === 'string' && r.title.trim() ? r.title : 'Frame',
      x: n(r.x, 0),
      y: n(r.y, 0),
      width: Math.max(FRAME_MIN_WIDTH, n(r.width, 240)),
      height: Math.max(FRAME_MIN_HEIGHT, n(r.height, 160)),
      tone: typeof r.tone === 'string' && TONES.has(r.tone as StreamTone) ? (r.tone as StreamTone) : 'blue',
      ...(typeof r.parentId === 'string' && r.parentId.trim() ? { parentId: r.parentId } : {}),
      ...(r.locked === true ? { locked: true } : {}),
    });
  }
  // A parent must exist, must not be the frame itself, and the chain must end and stay shallow.
  const byId = new Map(out.map((f) => [f.id, f]));
  for (const frame of out) {
    if (!frame.parentId) continue;
    let depth = 0;
    let cursor: DiagramFrame | undefined = frame;
    while (cursor?.parentId && depth <= MAX_FRAME_DEPTH) {
      cursor = byId.get(cursor.parentId);
      depth += 1;
      if (cursor === frame) {
        depth = MAX_FRAME_DEPTH + 1;
        break;
      }
    }
    if (!byId.has(frame.parentId) || depth > MAX_FRAME_DEPTH) delete frame.parentId;
  }
  return out;
}

/** Drop `frameId` on components that name a frame that is not in `frames`. */
export function dropDanglingFrameIds(nodes: DiagramNode[], frames: readonly DiagramFrame[]): void {
  const ids = new Set(frames.map((f) => f.id));
  for (const node of nodes) if (node.frameId && !ids.has(node.frameId)) delete node.frameId;
}
