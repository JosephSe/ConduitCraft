/**
 * Frame editing rules (F-09): who owns what, moving, removing, grouping. Kept apart from `frames.ts` (which the
 * parsers load at start-up) so the entry bundle only carries what reading a file needs. Pure and DOM-free.
 */
import type { DiagramEdge, DiagramFrame, DiagramNode, DiagramNotesCard, StreamTone } from '../types';
import { FRAME_HEADER_HEIGHT, FRAME_MIN_HEIGHT, FRAME_MIN_WIDTH, FRAME_PADDING, MAX_FRAME_DEPTH } from './frames';

/** The part of a document that frames touch. */
export interface FrameHost {
  nodes: DiagramNode[];
  frames?: DiagramFrame[];
  /** Notes and text labels. They have no `frameId`: a frame holds the ones whose point lies inside it (D1b). */
  notesCards?: DiagramNotesCard[];
  edges?: DiagramEdge[];
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

/** Rough size of a note card and of a text label, used to find where one sits (cards store only a top-left corner). */
const NOTE_SIZE = { card: [280, 96], text: [80, 28] } as const;
const noteSize = (c: DiagramNotesCard) => NOTE_SIZE[c.variant === 'text' ? 'text' : 'card'];

/** The notes and text labels whose middle lies inside any of the frames `ids`. */
export function notesInFrames(host: FrameHost, ids: ReadonlySet<string>): DiagramNotesCard[] {
  const rects = (host.frames ?? []).filter((f) => ids.has(f.id));
  return (host.notesCards ?? []).filter((c) => {
    const [w, h] = noteSize(c);
    const mx = c.x + w / 2;
    const my = c.y + h / 2;
    return rects.some((f) => mx >= f.x && mx < f.x + f.width && my >= f.y && my < f.y + f.height);
  });
}

/** Move a frame, the frames inside it, the components it owns and the notes inside it by the same step, keeping all of them on the canvas. */
export function moveFrame(host: FrameHost, id: string, dx: number, dy: number): void {
  const frames = host.frames ?? [];
  const ids = frameAndDescendantIds(frames, id);
  const frame = frames.find((f) => f.id === id);
  if (!frame) return;
  const movingFrames = frames.filter((f) => ids.has(f.id));
  const movingNodes = host.nodes.filter((n) => n.frameId && ids.has(n.frameId));
  const movingNotes = notesInFrames(host, ids);
  const minX = Math.min(...movingFrames.map((f) => f.x), ...movingNodes.map((n) => n.x), ...movingNotes.map((c) => c.x));
  const minY = Math.min(...movingFrames.map((f) => f.y), ...movingNodes.map((n) => n.y), ...movingNotes.map((c) => c.y));
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
  for (const c of movingNotes) {
    c.x += stepX;
    c.y += stepY;
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

/**
 * Make a frame around the chosen components and notes (their bounding box plus padding) and settle ownership.
 * Returns null when nothing usable was chosen.
 */
export function groupIntoFrame(
  host: FrameHost,
  nodeIds: readonly string[],
  noteIds: readonly string[],
  id: string,
  tone: StreamTone = 'blue',
  title = 'Group',
): DiagramFrame | null {
  const nodes = host.nodes.filter((n) => nodeIds.includes(n.id));
  const notes = (host.notesCards ?? []).filter((c) => noteIds.includes(c.id));
  const boxes = [
    ...nodes,
    ...notes.map((c) => ({ x: c.x, y: c.y, width: noteSize(c)[0], height: noteSize(c)[1] })),
  ];
  if (boxes.length === 0) return null;
  const frame = createFrame(id, frameAround(boxes), tone, title);
  host.frames = [...(host.frames ?? []), frame];
  adoptByGeometry(host);
  return frame;
}

/**
 * Copy a frame with everything in it: the frames inside, the components they own (with the wires between them) and
 * the notes inside, all shifted by `offset`. `newId` makes ids. Returns the new top frame, or null for an unknown id.
 */
export function duplicateFrame(host: FrameHost, id: string, newId: (prefix: string) => string, offset = 32): DiagramFrame | null {
  const frames = host.frames ?? [];
  const source = frames.find((f) => f.id === id);
  if (!source) return null;
  const ids = frameAndDescendantIds(frames, id);
  const subtree = frames.filter((x) => ids.has(x.id));
  const frameMap = new Map(subtree.map((f) => [f.id, newId('frame')]));
  const copies = subtree.map((f) => {
    const copy: DiagramFrame = { ...structuredClone(f), id: frameMap.get(f.id)!, x: f.x + offset, y: f.y + offset };
    delete copy.locked;
    delete copy.parentId;
    // Inside the copy, frames keep their parents; the copy of the top frame sits where the original sat.
    const parent = f.id === id ? f.parentId : f.parentId && frameMap.get(f.parentId);
    if (parent) copy.parentId = parent;
    if (f.id === id) copy.title = `${f.title} copy`;
    return copy;
  });
  const nodeMap = new Map<string, string>();
  const nodeCopies = host.nodes
    .filter((n) => n.frameId && ids.has(n.frameId))
    .map((n) => {
      const copy: DiagramNode = { ...structuredClone(n), id: newId(n.kind), x: n.x + offset, y: n.y + offset, frameId: frameMap.get(n.frameId!) };
      nodeMap.set(n.id, copy.id);
      return copy;
    });
  const edgeCopies = (host.edges ?? [])
    .filter((e) => nodeMap.has(e.from) && nodeMap.has(e.to))
    .map((e) => ({ ...structuredClone(e), id: newId('edge'), from: nodeMap.get(e.from)!, to: nodeMap.get(e.to)! }));
  const noteCopies = notesInFrames(host, ids).map((c) => ({ ...structuredClone(c), id: newId('notes'), x: c.x + offset, y: c.y + offset }));
  host.frames = [...frames, ...copies];
  host.nodes.push(...nodeCopies);
  if (host.edges) host.edges.push(...edgeCopies);
  if (host.notesCards) host.notesCards.push(...noteCopies);
  return copies.find((c) => c.id === frameMap.get(id)) ?? null;
}
