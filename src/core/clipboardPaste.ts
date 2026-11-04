/**
 * Reading and placing pasted components (C4). Split from `clipboard.ts` so it loads on the first paste, not at start-up.
 */
import type { DiagramEdge, DiagramNode } from '../types';
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
  if (!Array.isArray(data.nodes) || data.nodes.length === 0 || data.nodes.length > MAX_CLIP_NODES) {
    return { ok: false, reason: 'invalid', message: `A paste can hold 1 to ${MAX_CLIP_NODES} components.` };
  }
  const nodes: DiagramNode[] = [];
  for (const raw of data.nodes) {
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
  return { ok: true, clip: { nodes, edges, droppedImages: false } };
}

/**
 * Fresh copies of a clip's components and wires: new ids (so nothing in the open diagram is overwritten), and moved
 * by multiples of `step` until no copy sits exactly on an existing component.
 */
export function materializeClip(
  clip: Clip,
  existing: Array<{ x: number; y: number }>,
  newId: (prefix: string) => string,
  step = 32,
): { nodes: DiagramNode[]; edges: DiagramEdge[] } {
  const taken = new Set(existing.map((n) => `${n.x},${n.y}`));
  let shift = 0;
  while (shift < 32 * step && clip.nodes.some((n) => taken.has(`${n.x + shift},${n.y + shift}`))) shift += step;
  const idMap = new Map<string, string>();
  const nodes = clip.nodes.map((n) => {
    const copy = structuredClone(n);
    copy.id = newId(n.kind);
    copy.x = n.x + shift;
    copy.y = n.y + shift;
    delete copy.groupId;
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
  return { nodes, edges };
}
