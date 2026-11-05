/**
 * The menu button at the end of the top bar. It lists the actions that have no button of their own, so finding them
 * does not depend on knowing a shortcut or what to search for. Items are palette actions; the list is in
 * `core/contextMenuItems.ts` and the menu itself is the one the canvas uses.
 */
import { APP_MENU_ITEMS, MENU_SEPARATOR } from '../core/contextMenuItems';
import { closeContextMenu, isActionMenuOpenFor, openActionMenu } from './contextMenu';

const IDS = APP_MENU_ITEMS.map((item) => (item === MENU_SEPARATOR ? item : item.id));
const LABELS = new Map(APP_MENU_ITEMS.flatMap((item) => (item === MENU_SEPARATOR ? [] : [[item.id, item.label] as const])));

export function initAppMenu(): void {
  const button = document.getElementById('btn-app-menu');
  if (!button) return;

  button.addEventListener('click', () => {
    if (isActionMenuOpenFor(button)) {
      closeContextMenu();
      return;
    }
    const box = button.getBoundingClientRect();
    openActionMenu({
      ids: IDS,
      x: box.right,
      y: box.bottom + 4,
      label: 'Main menu',
      labelFor: (id) => LABELS.get(id),
      anchor: button,
      onClose: () => button.setAttribute('aria-expanded', 'false'),
    });
    button.setAttribute('aria-expanded', String(isActionMenuOpenFor(button)));
  });
}
