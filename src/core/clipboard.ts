/**
 * Copy and paste of components as text (C4), so a copy in one tab can be pasted into another tab, window or diagram.
 * The text is JSON with a `conduitcraft: 1` marker. Pure, so it is tested without a browser.
 */
import type { DiagramEdge, DiagramFrame, DiagramNode, DiagramNotesCard, DiagramZone } from '../types';

export const CLIP_MARKER = 1;
/** Pasted text larger than this is refused outright. */
export const MAX_CLIP_CHARS = 4_000_000;
export const MAX_CLIP_NODES = 500;
/** Embedded pictures are dropped from the copy when the text would be longer than this (the share-link limit, B5). */
export const IMAGE_LIMIT_CHARS = 8 * 1024;

export interface Clip {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  /** Swimlanes, frames and note cards copied with the components (they may be all there is). */
  zones?: DiagramZone[];
  frames?: DiagramFrame[];
  notes?: DiagramNotesCard[];
  /** Pictures were left out because the copy was too large to carry them. */
  droppedImages: boolean;
}

export type ParsedClip =
  | { ok: true; clip: Clip }
  | { ok: false; reason: 'not-ours' | 'invalid'; message: string };

/** The text to put on the clipboard for these components and the wires between them. */
export function serializeClip(
  nodes: DiagramNode[],
  edges: DiagramEdge[],
  containers: { zones?: DiagramZone[]; frames?: DiagramFrame[]; notes?: DiagramNotesCard[] } = {},
): { text: string; droppedImages: boolean } {
  const ids = new Set(nodes.map((n) => n.id));
  const wires = edges.filter((e) => ids.has(e.from) && ids.has(e.to));
  const extra = {
    ...(containers.zones?.length ? { zones: containers.zones } : {}),
    ...(containers.frames?.length ? { frames: containers.frames } : {}),
    ...(containers.notes?.length ? { notes: containers.notes } : {}),
  };
  let text = JSON.stringify({ conduitcraft: CLIP_MARKER, nodes, edges: wires, ...extra });
  let droppedImages = false;
  if (text.length > IMAGE_LIMIT_CHARS && nodes.some((n) => n.iconImage)) {
    const bare = nodes.map((n) => {
      const copy = { ...n };
      delete copy.iconImage;
      return copy;
    });
    text = JSON.stringify({ conduitcraft: CLIP_MARKER, nodes: bare, edges: wires, ...extra });
    droppedImages = true;
  }
  return { text, droppedImages };
}
