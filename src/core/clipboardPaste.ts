/**
 * Reading and placing pasted components (C4). Split from `clipboard.ts` so it loads on the first paste, not at start-up.
 */
import type { DiagramEdge, DiagramFrame, DiagramNode, DiagramNotesCard, DiagramZone } from '../types';
import { CLIP_MARKER, MAX_CLIP_CHARS, MAX_CLIP_NODES, type Clip, type ParsedClip } from './clipboard';

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Read clipboard text. `not-ours` means it is something else (plain text, say) and should be ignored quietly. */
export function parseClip(text: string): ParsedClip {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') || !trimmed.includes('"conduitcraft"')) {
    return { ok: false, reason: 'not-ours', message: 'The clipboard does not hold components.' };
  }
  if (trimmed.length > MAX_CLIP_CHARS) {
    return { ok: false, reason: 'invalid', message: 'That is too large to paste.' };
  }
  let data: unknown;
  try {
    data = JSON.parse(trimmed);
  } catch {
    return { ok: false, reason: 'invalid', message: 'The copied components are damaged and cannot be pasted.' };
  }
  if (!isRecord(data) || data.conduitcraft !== CLIP_MARKER) {
    return { ok: false, reason: 'invalid', message: 'These components come from a newer version of ConduitCraft.' };
  }
  const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
  const rawZones = list(data.zones);
  const rawFrames = list(data.frames);
  const rawNotes = list(data.notes);
  const rawNodes = list(data.nodes);
  const total = rawNodes.length + rawZones.length + rawFrames.length + rawNotes.length;
  if (!Array.isArray(data.nodes) || total === 0 || total > MAX_CLIP_NODES) {
    return { ok: false, reason: 'invalid', message: `A paste can hold 1 to ${MAX_CLIP_NODES} items.` };
  }
  const damaged = { ok: false, reason: 'invalid', message: 'The copied components are damaged and cannot be pasted.' } as const;
  const zones: DiagramZone[] = [];
  for (const raw of rawZones) {
    if (!isRecord(raw) || typeof raw.id !== 'string' || !finite(raw.x) || !finite(raw.width)) return damaged;
    zones.push(structuredClone(raw) as unknown as DiagramZone);
  }
  const frames: DiagramFrame[] = [];
  for (const raw of rawFrames) {
    if (!isRecord(raw) || typeof raw.id !== 'string' || !finite(raw.x) || !finite(raw.y) || !finite(raw.width) || !finite(raw.height)) return damaged;
    frames.push(structuredClone(raw) as unknown as DiagramFrame);
  }
  const notes: DiagramNotesCard[] = [];
  for (const raw of rawNotes) {
    if (!isRecord(raw) || typeof raw.id !== 'string' || !finite(raw.x) || !finite(raw.y)) return damaged;
    notes.push(structuredClone(raw) as unknown as DiagramNotesCard);
  }
  const nodes: DiagramNode[] = [];
  for (const raw of rawNodes) {
    if (
      !isRecord(raw) ||
      typeof raw.id !== 'string' ||
      typeof raw.kind !== 'string' ||
      !finite(raw.x) ||
      !finite(raw.y) ||
      !finite(raw.width) ||
      !finite(raw.height)
    ) {
      return { ok: false, reason: 'invalid', message: 'The copied components are damaged and cannot be pasted.' };
    }
    nodes.push(structuredClone(raw) as unknown as DiagramNode);
  }
  const ids = new Set(nodes.map((n) => n.id));
  const edges: DiagramEdge[] = [];
  for (const raw of Array.isArray(data.edges) ? data.edges : []) {
    if (isRecord(raw) && typeof raw.from === 'string' && typeof raw.to === 'string' && ids.has(raw.from) && ids.has(raw.to)) {
      edges.push(structuredClone(raw) as unknown as DiagramEdge);
    }
  }
  return { ok: true, clip: { nodes, edges, zones, frames, notes, droppedImages: false } };
}

/**
 * Fresh copies of a clip's components, wires, swimlanes, frames and notes: new ids (so nothing in the open diagram is
 * overwritten), and moved by multiples of `step` until no copy sits exactly on an existing item. `existing` holds the
 * positions of what is already there; `existingZoneXs` the left edges of the swimlanes (they only span left to right).
 */
export function materializeClip(
  clip: Clip,
  existing: Array<{ x: number; y: number }>,
  newId: (prefix: string) => string,
  step = 32,
  existingZoneXs: number[] = [],
): { nodes: DiagramNode[]; edges: DiagramEdge[]; zones: DiagramZone[]; frames: DiagramFrame[]; notes: DiagramNotesCard[] } {
  const taken = new Set(existing.map((n) => `${n.x},${n.y}`));
  const placed = [...clip.nodes, ...(clip.frames ?? []), ...(clip.notes ?? [])];
  let shift = 0;
  while (shift < 32 * step && placed.some((n) => taken.has(`${n.x + shift},${n.y + shift}`))) shift += step;
  const idMap = new Map<string, string>();
  const frameMap = new Map<string, string>();
  for (const f of clip.frames ?? []) frameMap.set(f.id, newId('frame'));
  const nodes = clip.nodes.map((n) => {
    const copy = structuredClone(n);
    copy.id = newId(n.kind);
    copy.x = n.x + shift;
    copy.y = n.y + shift;
    delete copy.groupId;
    // A component keeps its frame only when that frame was copied too.
    const frame = n.frameId ? frameMap.get(n.frameId) : undefined;
    if (frame) copy.frameId = frame;
    else delete copy.frameId;
    idMap.set(n.id, copy.id);
    return copy;
  });
  const edges = clip.edges.flatMap((e) => {
    const from = idMap.get(e.from);
    const to = idMap.get(e.to);
    if (!from || !to) return [];
    const copy = structuredClone(e);
    copy.id = newId('edge');
    copy.from = from;
    copy.to = to;
    return [copy];
  });
  const frames = (clip.frames ?? []).map((f) => {
    const copy = structuredClone(f);
    copy.id = frameMap.get(f.id)!;
    copy.x = f.x + shift;
    copy.y = f.y + shift;
    delete copy.locked;
    const parent = f.parentId ? frameMap.get(f.parentId) : undefined;
    if (parent) copy.parentId = parent;
    else delete copy.parentId;
    return copy;
  });
  const notes = (clip.notes ?? []).map((c) => {
    const copy = structuredClone(c);
    copy.id = newId('notes');
    copy.x = c.x + shift;
    copy.y = c.y + shift;
    delete copy.groupId;
    return copy;
  });
  const zoneXs = new Set(existingZoneXs);
  const zones = (clip.zones ?? []).map((z) => {
    const copy = structuredClone(z);
    copy.id = newId('zone');
    let x = z.x;
    while (zoneXs.has(x)) x += z.width + 24;
    zoneXs.add(x);
    copy.x = x;
    delete copy.locked;
    return copy;
  });
  return { nodes, edges, zones, frames, notes };
}
