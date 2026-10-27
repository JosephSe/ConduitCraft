import type { SelectionTarget } from '../types';

export interface SelectionChange {
  previous: SelectionTarget;
  selection: SelectionTarget;
}

export function normalizeSelection(selection: SelectionTarget): SelectionTarget {
  if (selection.type === 'multi') return { type: 'multi', ids: [...selection.ids] };
  if (selection.type === 'none') return { type: 'none' };
  return { type: selection.type, id: selection.id };
}

/** Stable identity for a selection. Multi-select order is part of the key. */
export function selectionKey(selection: SelectionTarget): string {
  if (selection.type === 'none') return 'none';
  if (selection.type === 'multi') return `multi:${selection.ids.join('\u0000')}`;
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
