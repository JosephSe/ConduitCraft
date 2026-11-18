/**
 * One front-to-back order shared by components, notes and text labels, so "Bring to Front" can put a note over a
 * component and the other way round. Each item's place is its `z`; an item without one (an old diagram, or one
 * added since the last reorder) goes above every item that has one. With no `z` anywhere, notes and text sit under
 * the components, which is how the canvas has always drawn them. Pure and DOM-free.
 */
import type { DiagramDocument, DiagramNode, DiagramNotesCard } from '../types';

export type StackItem = { kind: 'node'; item: DiagramNode } | { kind: 'notes'; item: DiagramNotesCard };

/** Every component, note and text label, back to front. */
export function stackOrder(doc: Pick<DiagramDocument, 'nodes' | 'notesCards'>): StackItem[] {
  const all: Array<StackItem & { rank: number }> = [
    ...doc.notesCards.map((item, i) => ({ kind: 'notes' as const, item, rank: i })),
    ...doc.nodes.map((item, i) => ({ kind: 'node' as const, item, rank: doc.notesCards.length + i })),
  ];
  const key = (s: { item: { z?: number } }) => (typeof s.item.z === 'number' && Number.isFinite(s.item.z) ? s.item.z : Infinity);
  all.sort((a, b) => key(a) - key(b) || a.rank - b.rank);
  return all.map(({ kind, item }) => ({ kind, item }) as StackItem);
}

/**
 * Store `order` as the stack: number every item from 1, and keep `doc.nodes` and `doc.notesCards` in the same
 * order, so the canvas, the exports and the saved file all agree.
 */
export function applyStackOrder(doc: Pick<DiagramDocument, 'nodes' | 'notesCards'>, order: StackItem[]): void {
  order.forEach((s, i) => {
    s.item.z = i + 1;
  });
  doc.nodes = order.filter((s) => s.kind === 'node').map((s) => s.item as DiagramNode);
  doc.notesCards = order.filter((s) => s.kind === 'notes').map((s) => s.item as DiagramNotesCard);
}

/**
 * The CSS z-index for each item on the canvas. Wires are drawn at 3 and components from 5, so notes under the
 * lowest component get none (they stay under the wires, as before) and everything from the lowest component up
 * gets 5, 6, 7 ... in stack order.
 */
export function stackZIndices(doc: Pick<DiagramDocument, 'nodes' | 'notesCards'>): Map<string, number | undefined> {
  const out = new Map<string, number | undefined>();
  let inBand = false;
  let next = STACK_BASE_Z;
  for (const s of stackOrder(doc)) {
    if (s.kind === 'node') inBand = true;
    out.set(s.item.id, inBand ? next++ : undefined);
  }
  return out;
}

/** The z-index of the lowest component on the canvas. */
export const STACK_BASE_Z = 5;

type Reorder = (order: StackItem[], picked: (s: StackItem) => boolean) => StackItem[];

const toFront: Reorder = (order, picked) => [...order.filter((s) => !picked(s)), ...order.filter(picked)];
const toBack: Reorder = (order, picked) => [...order.filter(picked), ...order.filter((s) => !picked(s))];

/** Each picked item swaps with the unpicked item just above it. */
const forward: Reorder = (order, picked) => {
  const out = [...order];
  for (let i = out.length - 2; i >= 0; i--) {
    if (picked(out[i]) && !picked(out[i + 1])) [out[i], out[i + 1]] = [out[i + 1], out[i]];
  }
  return out;
};

/** Each picked item swaps with the unpicked item just below it. */
const backward: Reorder = (order, picked) => {
  const out = [...order];
  for (let i = 1; i < out.length; i++) {
    if (picked(out[i]) && !picked(out[i - 1])) [out[i], out[i - 1]] = [out[i - 1], out[i]];
  }
  return out;
};

export const STACK_MOVES = { front: toFront, back: toBack, forward, backward } as const;
export type StackMove = keyof typeof STACK_MOVES;

/**
 * Move the components `nodeIds` and notes `notesIds` in the stack. Returns false, and changes nothing, when
 * nothing is picked or the order would stay the same.
 */
export function moveInStack(
  doc: Pick<DiagramDocument, 'nodes' | 'notesCards'>,
  move: StackMove,
  nodeIds: readonly string[],
  notesIds: readonly string[],
): boolean {
  const nodes = new Set(nodeIds);
  const notes = new Set(notesIds);
  const picked = (s: StackItem) => (s.kind === 'node' ? nodes.has(s.item.id) : notes.has(s.item.id));
  const before = stackOrder(doc);
  if (!before.some(picked)) return false;
  const after = STACK_MOVES[move](before, picked);
  if (after.every((s, i) => s.item === before[i].item)) return false;
  applyStackOrder(doc, after);
  return true;
}

/** A stored stack place read from a file: kept only when it is a finite number. */
export function stackZOf(raw: unknown): { z?: number } {
  return typeof raw === 'number' && Number.isFinite(raw) ? { z: raw } : {};
}
