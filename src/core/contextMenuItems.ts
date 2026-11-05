/**
 * Which actions the right-click menu offers for a selection. Entries are command-palette ids, so the menu and
 * the palette stay one list of actions; '-' is a separator. Pure, so it is unit tested without a DOM.
 */
export type ContextSelectionType = 'none' | 'node' | 'edge' | 'zone' | 'frame' | 'notes' | 'multi';

export interface ContextMenuHints {
  /** The selection contains a grouped component or note, so "Ungroup" is meaningful. */
  grouped: boolean;
}

export const MENU_SEPARATOR = '-';

/**
 * The top-bar menu: actions with no button of their own. Palette ids again, with shorter labels than the palette's,
 * whose titles have to make sense in a search list.
 */
export const APP_MENU_ITEMS: ReadonlyArray<{ id: string; label: string } | typeof MENU_SEPARATOR> = [
  { id: 'open-home', label: 'Home' },
  { id: 'new-diagram', label: 'New Diagram' },
  { id: 'open-templates', label: 'Templates' },
  { id: 'open-library', label: 'Your Diagrams' },
  MENU_SEPARATOR,
  { id: 'save-file', label: 'Save' },
  { id: 'save-file-as', label: 'Save As…' },
  { id: 'open-file-disk', label: 'Open File…' },
  { id: 'import-file', label: 'Import File…' },
  { id: 'open-export', label: 'Export…' },
  MENU_SEPARATOR,
  { id: 'open-find-replace', label: 'Find and Replace' },
  { id: 'auto-layout', label: 'Auto-Layout' },
  { id: 'toggle-outline', label: 'Text Outline' },
  { id: 'toggle-code-pane', label: 'Code Pane' },
  { id: 'open-matrix', label: 'Specification Matrix' },
  { id: 'open-snapshots', label: 'Snapshots' },
  { id: 'mode-presentation', label: 'Presentation' },
  MENU_SEPARATOR,
  { id: 'open-settings', label: 'Preferences' },
  { id: 'open-shortcuts', label: 'Keyboard Shortcuts' },
];

export function contextMenuCommandIds(type: ContextSelectionType, hints: ContextMenuHints): string[] {
  switch (type) {
    case 'node':
      return [
        'edit-rename',
        'edit-duplicate',
        'edit-lock',
        ...(hints.grouped ? ['edit-ungroup'] : []),
        MENU_SEPARATOR,
        'edit-bring-to-front',
        'edit-send-to-back',
        MENU_SEPARATOR,
        'level-open',
        'queue-add-dlq',
        'chaos-fail',
        'fit-selection',
        'edit-delete',
      ];
    case 'edge':
      return ['edit-rename', MENU_SEPARATOR, 'edit-delete'];
    case 'frame':
      return ['edit-rename', 'edit-duplicate', 'edit-lock', MENU_SEPARATOR, 'edit-delete'];
    case 'zone':
    case 'notes':
      return [
        'edit-rename',
        'edit-duplicate',
        'edit-lock',
        MENU_SEPARATOR,
        'edit-bring-to-front',
        'edit-send-to-back',
        MENU_SEPARATOR,
        'edit-delete',
      ];
    case 'multi':
      return [
        'edit-duplicate',
        'edit-group',
        'edit-group-frame',
        ...(hints.grouped ? ['edit-ungroup'] : []),
        'edit-lock',
        MENU_SEPARATOR,
        'auto-layout-selection',
        'fit-selection',
        MENU_SEPARATOR,
        'edit-delete',
      ];
    default:
      return ['edit-undo', 'edit-redo', MENU_SEPARATOR, 'edit-select-all', 'auto-layout', 'fit-view'];
  }
}

/** Drop leading, trailing and doubled separators left behind after unavailable items are filtered out. */
export function tidySeparators(ids: string[]): string[] {
  const out: string[] = [];
  for (const id of ids) {
    if (id === MENU_SEPARATOR && (out.length === 0 || out[out.length - 1] === MENU_SEPARATOR)) continue;
    out.push(id);
  }
  if (out[out.length - 1] === MENU_SEPARATOR) out.pop();
  return out;
}

/**
 * The few actions worth a button next to the selection. Everything else is behind "More", which opens the full
 * context menu. Palette ids, like the menu; filtered by availability before display.
 */
export function contextToolbarCommandIds(type: ContextSelectionType, hints: ContextMenuHints): string[] {
  switch (type) {
    case 'node':
      return ['edit-rename', 'edit-duplicate', 'edit-lock', 'wire-from-selection'];
    case 'edge':
      return ['edit-rename', 'edit-delete'];
    case 'frame':
      return ['edit-rename', 'edit-duplicate', 'edit-lock'];
    case 'zone':
    case 'notes':
      return ['edit-rename', 'edit-duplicate', 'edit-lock'];
    case 'multi':
      return [
        'edit-group',
        'edit-group-frame',
        ...(hints.grouped ? ['edit-ungroup'] : []),
        'edit-lock',
        'edit-duplicate',
        'auto-layout-selection',
      ];
    default:
      return [];
  }
}
