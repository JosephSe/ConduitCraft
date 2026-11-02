/**
 * Action availability: the one place that says when an action applies. The command palette, the context menu
 * (and, as they arrive, the top bar, contextual toolbar and shortcuts) ask here instead of each keeping its own
 * "is this relevant right now?" rules. Pure and DOM-free so it is unit tested and usable from a CLI.
 */
import type { DiagramDocument, SelectionTarget } from '../types';

export type SelectionKind = 'none' | 'node' | 'edge' | 'zone' | 'notes' | 'multi';

export interface ActionContext {
  mode: 'design' | 'data';
  selection: SelectionKind;
  /** Components + wires + swimlanes + notes in the selection. */
  selectedCount: number;
  /** Components (not wires) selected, used by layout actions. */
  selectedNodeCount: number;
  /** At least one selected component or note belongs to a group. */
  grouped: boolean;
}

export function buildActionContext(
  selection: SelectionTarget,
  doc: DiagramDocument,
  mode: 'design' | 'data',
): ActionContext {
  let nodeIds: string[] = [];
  let noteIds: string[] = [];
  let count = 0;
  let kind: SelectionKind = selection.type;
  switch (selection.type) {
    case 'node':
      nodeIds = [selection.id];
      count = 1;
      break;
    case 'notes':
      noteIds = [selection.id];
      count = 1;
      break;
    case 'edge':
    case 'zone':
      count = 1;
      break;
    case 'multi':
      nodeIds = selection.ids;
      noteIds = selection.notesIds ?? [];
      count =
        selection.ids.length +
        (selection.edgeIds?.length ?? 0) +
        (selection.zoneIds?.length ?? 0) +
        (selection.notesIds?.length ?? 0);
      if (count === 0) kind = 'none';
      break;
  }
  const grouped =
    nodeIds.some((id) => doc.nodes.find((n) => n.id === id)?.groupId) ||
    noteIds.some((id) => doc.notesCards.find((c) => c.id === id)?.groupId);
  return { mode, selection: kind, selectedCount: count, selectedNodeCount: nodeIds.length, grouped: Boolean(grouped) };
}

const hasSelection = (c: ActionContext) => c.selection !== 'none';
const design = (c: ActionContext) => c.mode === 'design';
const arrangeable = (c: ActionContext) => c.selection !== 'none' && c.selection !== 'edge';

/** Rules for actions that depend on the situation. An action not listed here is always available. */
const RULES: Record<string, (c: ActionContext) => boolean> = {
  'edit-rename': (c) => design(c) && hasSelection(c) && c.selection !== 'multi',
  'edit-duplicate': (c) => design(c) && c.selection !== 'edge' && hasSelection(c),
  'edit-delete': (c) => design(c) && hasSelection(c),
  'edit-lock': (c) => design(c) && arrangeable(c),
  'edit-group': (c) => design(c) && c.selection === 'multi' && c.selectedCount >= 2,
  'edit-ungroup': (c) => design(c) && c.grouped,
  'edit-bring-to-front': (c) => design(c) && arrangeable(c),
  'edit-send-to-back': (c) => design(c) && arrangeable(c),
  'edit-bring-forward': (c) => design(c) && arrangeable(c),
  'edit-send-backward': (c) => design(c) && arrangeable(c),
  'fit-selection': hasSelection,
  'auto-layout-selection': (c) => design(c) && c.selectedNodeCount >= 2,
};

export function isActionAvailable(id: string, ctx: ActionContext): boolean {
  const rule = RULES[id];
  return rule ? rule(ctx) : true;
}
