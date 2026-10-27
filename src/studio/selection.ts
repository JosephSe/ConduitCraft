import type { SelectionTarget } from '../types';

export interface SelectionChange {
  previous: SelectionTarget;
  selection: SelectionTarget;
}

export function normalizeSelection(selection: SelectionTarget): SelectionTarget {
  if (selection.type === 'multi') {
    return {
      type: 'multi',
      ids: [...selection.ids],
      ...(selection.zoneIds?.length ? { zoneIds: [...selection.zoneIds] } : {}),
      ...(selection.notesIds?.length ? { notesIds: [...selection.notesIds] } : {}),
    };
  }
  if (selection.type === 'none') return { type: 'none' };
  return { type: selection.type, id: selection.id };
}

/** One selected object stays a single target. Several become a multi-select. */
export function selectionOfStage(parts: {
  nodes: readonly string[];
  zones: readonly string[];
  notes: readonly string[];
}): SelectionTarget {
  const nodes = [...parts.nodes];
  const zones = [...parts.zones];
  const notes = [...parts.notes];
  const count = nodes.length + zones.length + notes.length;
  if (count === 0) return { type: 'none' };
  if (count === 1) {
    if (nodes.length === 1) return { type: 'node', id: nodes[0] };
    if (zones.length === 1) return { type: 'zone', id: zones[0] };
    return { type: 'notes', id: notes[0] };
  }
  return {
    type: 'multi',
    ids: nodes,
    ...(zones.length > 0 ? { zoneIds: zones } : {}),
    ...(notes.length > 0 ? { notesIds: notes } : {}),
  };
}

/** Stable identity for a selection. Multi-select order is part of the key. */
export function selectionKey(selection: SelectionTarget): string {
  if (selection.type === 'none') return 'none';
  if (selection.type === 'multi') {
    const nodes = selection.ids.join('\u0000');
    const zones = selection.zoneIds?.join('\u0000') ?? '';
    const notes = selection.notesIds?.join('\u0000') ?? '';
    if (!zones && !notes) return `multi:${nodes}`;
    return `multi:${nodes}|${zones}|${notes}`;
  }
  return `${selection.type}:${selection.id}`;
}

export function resolveSelectionUpdate(
  current: SelectionTarget,
  next: SelectionTarget,
): { changed: boolean; selection: SelectionTarget } {
  const selection = normalizeSelection(next);
  if (selectionKey(current) === selectionKey(selection)) {
    return { changed: false, selection: current };
  }
  return { changed: true, selection };
}
