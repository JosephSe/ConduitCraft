/**
 * Frame editing rules (F-09): who owns what, moving, removing, grouping. Kept apart from `frames.ts` (which the
 * parsers load at start-up) so the entry bundle only carries what reading a file needs. Pure and DOM-free.
 */
import type { DiagramFrame, DiagramNode, StreamTone } from '../types';
import { FRAME_HEADER_HEIGHT, FRAME_MIN_HEIGHT, FRAME_MIN_WIDTH, FRAME_PADDING, MAX_FRAME_DEPTH } from './frames';

/** The part of a document that frames touch. */
export interface FrameHost {
  nodes: DiagramNode[];
  frames?: DiagramFrame[];
}

export interface FrameRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function createFrame(id: string, rect: FrameRect, tone: StreamTone = 'blue', title = 'Frame'): DiagramFrame {
  return {
    id,
    title,
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.max(FRAME_MIN_WIDTH, Math.round(rect.width)),
    height: Math.max(FRAME_MIN_HEIGHT, Math.round(rect.height)),
    tone,
  };
}


const area = (f: FrameRect) => f.width * f.height;

/** The frame and every frame inside it, at any depth. */
export function frameAndDescendantIds(frames: readonly DiagramFrame[], id: string): Set<string> {
  const ids = new Set<string>([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of frames) {
      if (f.parentId && ids.has(f.parentId) && !ids.has(f.id)) {
        ids.add(f.id);
        grew = true;
      }
    }
  }
  return ids;
}

/** How many frames lie around this one. A top-level frame has depth 0. */
export function frameDepth(frames: readonly DiagramFrame[], frame: DiagramFrame): number {
  const byId = new Map(frames.map((f) => [f.id, f]));
  let depth = 0;
  for (let cur = frame; cur.parentId && depth <= MAX_FRAME_DEPTH; depth += 1) {
    const next = byId.get(cur.parentId);
    if (!next) break;
    cur = next;
  }
  return depth;
}

/** The smallest frame whose area holds the centre of `box`, ignoring the frames in `skip`. */
export function frameAtCentre(frames: readonly DiagramFrame[], box: FrameRect, skip?: ReadonlySet<string>): DiagramFrame | undefined {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  let best: DiagramFrame | undefined;
  for (const f of frames) {
    if (skip?.has(f.id)) continue;
    if (cx < f.x || cx > f.x + f.width || cy < f.y || cy > f.y + f.height) continue;
    if (!best || area(f) < area(best)) best = f;
  }
  return best;
}

/**
 * Work out who owns what from the geometry: each component belongs to the smallest frame holding its centre, and
 * each frame sits inside the smallest larger frame that holds all of it. Returns true when anything changed.
 */
export function adoptByGeometry(host: FrameHost): boolean {
  const frames = host.frames ?? [];
  let changed = false;
  for (const node of host.nodes) {
    const owner = frameAtCentre(frames, node)?.id;
    if (owner !== node.frameId) {
      if (owner) node.frameId = owner;
      else delete node.frameId;
      changed = true;
    }
  }
  for (const frame of frames) {
    const inside = new Set(frameAndDescendantIds(frames, frame.id));
    let parent: DiagramFrame | undefined;
    for (const other of frames) {
      if (inside.has(other.id) || area(other) <= area(frame)) continue;
      const holds =
        frame.x >= other.x &&
        frame.y >= other.y &&
        frame.x + frame.width <= other.x + other.width &&
        frame.y + frame.height <= other.y + other.height;
      if (holds && (!parent || area(other) < area(parent))) parent = other;
    }
    if (parent?.id !== frame.parentId) {
      if (parent) frame.parentId = parent.id;
      else delete frame.parentId;
      changed = true;
    }
  }
  return changed;
}

/** Move a frame, the frames inside it and the components it owns by the same step, keeping all of them on the canvas. */
export function moveFrame(host: FrameHost, id: string, dx: number, dy: number): void {
  const frames = host.frames ?? [];
  const ids = frameAndDescendantIds(frames, id);
  const frame = frames.find((f) => f.id === id);
  if (!frame) return;
  const movingFrames = frames.filter((f) => ids.has(f.id));
  const movingNodes = host.nodes.filter((n) => n.frameId && ids.has(n.frameId));
  const minX = Math.min(...movingFrames.map((f) => f.x), ...movingNodes.map((n) => n.x));
  const minY = Math.min(...movingFrames.map((f) => f.y), ...movingNodes.map((n) => n.y));
  const stepX = Math.round(Math.max(dx, 16 - minX));
  const stepY = Math.round(Math.max(dy, 24 - minY));
  for (const f of movingFrames) {
    f.x += stepX;
    f.y += stepY;
  }
  for (const n of movingNodes) {
    n.x += stepX;
    n.y += stepY;
  }
}

/** Remove a frame. What it owned goes to its parent frame, or becomes free when there is none. */
export function removeFrame(host: FrameHost, id: string): void {
  const frames = host.frames ?? [];
  const frame = frames.find((f) => f.id === id);
  if (!frame) return;
  for (const f of frames) if (f.parentId === id) (frame.parentId ? (f.parentId = frame.parentId) : delete f.parentId);
  for (const n of host.nodes) {
    if (n.frameId !== id) continue;
    if (frame.parentId) n.frameId = frame.parentId;
    else delete n.frameId;
  }
  host.frames = frames.filter((f) => f.id !== id);
}

/** The frame that would hold `nodes` if they were grouped: their bounding box plus padding and the title strip. */
export function frameAround(nodes: readonly Pick<DiagramNode, 'x' | 'y' | 'width' | 'height'>[]): FrameRect {
  const x = Math.min(...nodes.map((n) => n.x)) - FRAME_PADDING;
  const y = Math.min(...nodes.map((n) => n.y)) - FRAME_PADDING - FRAME_HEADER_HEIGHT;
  const right = Math.max(...nodes.map((n) => n.x + n.width)) + FRAME_PADDING;
  const bottom = Math.max(...nodes.map((n) => n.y + n.height)) + FRAME_PADDING;
  return { x: Math.max(16, x), y: Math.max(24, y), width: right - Math.max(16, x), height: bottom - Math.max(24, y) };
}
