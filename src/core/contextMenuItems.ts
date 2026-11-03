/**
 * Which actions the right-click menu offers for a selection. Entries are command-palette ids, so the menu and
 * the palette stay one list of actions; '-' is a separator. Pure, so it is unit tested without a DOM.
 */
export type ContextSelectionType = 'none' | 'node' | 'edge' | 'zone' | 'notes' | 'multi';

export interface ContextMenuHints {
  /** The selection contains a grouped component or note, so "Ungroup" is meaningful. */
  grouped: boolean;
}

export const MENU_SEPARATOR = '-';

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
        'chaos-fail',
        'fit-selection',
        'edit-delete',
      ];
    case 'edge':
      return ['edit-rename', MENU_SEPARATOR, 'edit-delete'];
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
    case 'zone':
    case 'notes':
      return ['edit-rename', 'edit-duplicate', 'edit-lock'];
    case 'multi':
      return [
        'edit-group',
        ...(hints.grouped ? ['edit-ungroup'] : []),
        'edit-lock',
        'edit-duplicate',
        'auto-layout-selection',
      ];
    default:
      return [];
  }
}
