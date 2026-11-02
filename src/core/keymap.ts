/**
 * Keyboard bindings for registry actions. Each entry maps a key chord to an action id (the same ids the command
 * palette and context menu use), so a shortcut is just one more way to run an action. Pure and DOM-free.
 */
export interface KeyBinding {
  actionId: string;
  key: string;
  /** Cmd on Mac, Ctrl elsewhere. */
  mod?: boolean;
  shift?: boolean;
  /** Only in Design mode. */
  designOnly?: boolean;
  /** Only when something is selected (otherwise the key keeps its default behaviour). */
  needsSelection?: boolean;
  /** Only in the redesigned interface (`?ui=2`). */
  uiV2Only?: boolean;
}

export const KEY_BINDINGS: KeyBinding[] = [
  { actionId: 'edit-undo', key: 'z', mod: true },
  { actionId: 'edit-redo', key: 'z', mod: true, shift: true },
  { actionId: 'edit-redo', key: 'y', mod: true },
  { actionId: 'edit-duplicate', key: 'd', mod: true, designOnly: true },
  { actionId: 'edit-select-all', key: 'a', mod: true, designOnly: true },
  { actionId: 'edit-lock', key: 'l', mod: true, designOnly: true },
  { actionId: 'edit-group', key: 'g', mod: true, designOnly: true },
  { actionId: 'edit-ungroup', key: 'g', mod: true, shift: true, designOnly: true },
  { actionId: 'edit-bring-forward', key: ']', mod: true, designOnly: true },
  { actionId: 'edit-send-backward', key: '[', mod: true, designOnly: true },
  // Tool rail (redesign): one letter per tool.
  { actionId: 'tool-select', key: 'v', designOnly: true, uiV2Only: true },
  { actionId: 'tool-connect', key: 'w', designOnly: true, uiV2Only: true },
  { actionId: 'add-zone', key: 'z', designOnly: true, uiV2Only: true },
  { actionId: 'add-notes', key: 'n', designOnly: true, uiV2Only: true },
  { actionId: 'open-insert', key: 'c', designOnly: true, uiV2Only: true },
  // Lenses (redesign). 3 is reserved for Review, which ships with the insights in phase 3.
  { actionId: 'mode-design', key: '1', uiV2Only: true },
  { actionId: 'mode-data', key: '2', uiV2Only: true },
  { actionId: 'mode-presentation', key: '4', uiV2Only: true },
  { actionId: 'edit-rename', key: 'F2', designOnly: true },
  { actionId: 'edit-delete', key: 'Delete', designOnly: true, needsSelection: true },
  { actionId: 'edit-delete', key: 'Backspace', designOnly: true, needsSelection: true },
];

export interface KeyEventLike {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

export interface KeyContext {
  mode: 'design' | 'data';
  hasSelection: boolean;
  /** Interface generation; defaults to the classic one. */
  ui?: 1 | 2;
}

/** The action a key press should run, or null when it is not bound (or not applicable right now). */
export function matchBinding(event: KeyEventLike, ctx: KeyContext, bindings: KeyBinding[] = KEY_BINDINGS): string | null {
  if (event.altKey) return null;
  const mod = event.metaKey || event.ctrlKey;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  for (const b of bindings) {
    if (b.key.toLowerCase() !== key.toLowerCase()) continue;
    if (Boolean(b.mod) !== mod) continue;
    if (Boolean(b.shift) !== event.shiftKey) continue;
    if (b.designOnly && ctx.mode !== 'design') continue;
    if (b.needsSelection && !ctx.hasSelection) continue;
    if (b.uiV2Only && ctx.ui !== 2) continue;
    return b.actionId;
  }
  return null;
}
