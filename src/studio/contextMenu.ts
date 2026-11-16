/**
 * Right-click / Shift+F10 / Menu-key context menu for the canvas. Items come from the command palette, so every
 * entry is an action that already exists; this file only decides which ones to show and where.
 */
import { buildActionContext, isActionAvailable } from '../core/actions';
import { MENU_SEPARATOR, contextMenuCommandIds, tidySeparators } from '../core/contextMenuItems';
import type { SelectionTarget } from '../types';
import { announce } from './a11y';
import { viewport } from './dom';
import { findPaletteCommand } from './palette';
import { applySelection } from './render';
import { app } from './state';

let menuEl: HTMLElement | null = null;
let returnFocus: HTMLElement | null = null;
let menuAnchor: HTMLElement | null = null;
let menuOnClose: (() => void) | null = null;

export function closeContextMenu(restoreFocus = true): void {
  if (!menuEl) return;
  menuEl.remove();
  menuEl = null;
  menuAnchor = null;
  menuOnClose?.();
  menuOnClose = null;
  document.removeEventListener('pointerdown', onOutsidePointer, true);
  window.removeEventListener('blur', onWindowBlur);
  if (restoreFocus && returnFocus?.isConnected) returnFocus.focus();
  returnFocus = null;
}

function onOutsidePointer(e: Event): void {
  const target = e.target as Node;
  // A press on the button that opened the menu is left to that button, which closes it on click.
  if (menuEl && !menuEl.contains(target) && !menuAnchor?.contains(target)) closeContextMenu(false);
}
function onWindowBlur(): void {
  closeContextMenu(false);
}

/** The thing under an element, as a selection target. */
function targetOf(el: Element | null): SelectionTarget | null {
  const node = el?.closest<HTMLElement>('.arch-node');
  if (node?.dataset.nodeId) return { type: 'node', id: node.dataset.nodeId };
  const wire = el?.closest<SVGElement>('.conduit-group');
  if (wire?.dataset.edgeId) return { type: 'edge', id: wire.dataset.edgeId };
  const zone = el?.closest<HTMLElement>('.zone-banner');
  if (zone?.dataset.zoneId) return { type: 'zone', id: zone.dataset.zoneId };
  const frame = el?.closest<HTMLElement>('.frame-title-bar')?.parentElement;
  if (frame?.dataset.frameId) return { type: 'frame', id: frame.dataset.frameId };
  const note = el?.closest<HTMLElement>('.blueprint-spec');
  if (note?.dataset.notesId) return { type: 'notes', id: note.dataset.notesId };
  return null;
}

function isInSelection(target: SelectionTarget): boolean {
  const sel = app.selection;
  if (sel.type === target.type && 'id' in sel && 'id' in target) return sel.id === target.id;
  if (sel.type !== 'multi') return false;
  if (target.type === 'node') return sel.ids.includes(target.id);
  if (target.type === 'edge') return (sel.edgeIds ?? []).includes(target.id);
  if (target.type === 'zone') return (sel.zoneIds ?? []).includes(target.id);
  if (target.type === 'notes') return (sel.notesIds ?? []).includes(target.id);
  return false;
}

export function openContextMenu(x: number, y: number): void {
  const ctx = buildActionContext(app.selection, app.doc, app.workspaceMode);
  openActionMenu({
    ids: contextMenuCommandIds(ctx.selection, { grouped: ctx.grouped }),
    x,
    y,
    label: 'Canvas actions',
  });
}

export interface ActionMenuOptions {
  /** Palette ids and separators. Actions that do not apply right now are dropped. */
  ids: readonly string[];
  x: number;
  y: number;
  /** The menu's accessible name. */
  label: string;
  /** Text for an item. Defaults to the palette title. */
  labelFor?: (id: string) => string | undefined;
  /** The button that opened the menu: it takes focus back, and pressing it does not count as clicking away. */
  anchor?: HTMLElement;
  onClose?: () => void;
}

export function isActionMenuOpenFor(anchor: HTMLElement): boolean {
  return menuEl !== null && menuAnchor === anchor;
}

/** Show a menu of palette actions at (x, y). */
export function openActionMenu({ ids: requested, x, y, label: menuLabel, labelFor, anchor, onClose }: ActionMenuOptions): void {
  closeContextMenu(false);
  const ctx = {
    ...buildActionContext(app.selection, app.doc, app.workspaceMode),
    canUndo: app.undoStack.length > 0,
    canRedo: app.redoStack.length > 0,
  };
  const ids = tidySeparators(requested.filter((id) => id === MENU_SEPARATOR || isActionAvailable(id, ctx)));

  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', menuLabel);
  returnFocus = anchor ?? (document.activeElement as HTMLElement | null) ?? viewport;

  for (const id of ids) {
    if (id === MENU_SEPARATOR) {
      const sep = document.createElement('div');
      sep.className = 'context-menu-sep';
      sep.setAttribute('role', 'separator');
      menu.appendChild(sep);
      continue;
    }
    const cmd = findPaletteCommand(id);
    if (!cmd) continue;
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'context-menu-item';
    item.setAttribute('role', 'menuitem');
    item.tabIndex = -1;
    const label = document.createElement('span');
    label.textContent = labelFor?.(id) ?? cmd.title;
    item.appendChild(label);
    if (cmd.shortcut) {
      const hint = document.createElement('kbd');
      hint.textContent = cmd.shortcut;
      item.appendChild(hint);
    }
    item.addEventListener('click', () => {
      closeContextMenu();
      cmd.run();
    });
    menu.appendChild(item);
  }
  if (!menu.querySelector('[role="menuitem"]')) return;

  menu.addEventListener('keydown', (e) => {
    const items = Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') items[(i + 1) % items.length].focus();
    else if (e.key === 'ArrowUp') items[(i - 1 + items.length) % items.length].focus();
    else if (e.key === 'Home') items[0].focus();
    else if (e.key === 'End') items[items.length - 1].focus();
    else if (e.key === 'Escape') {
      closeContextMenu();
    } else if (e.key === 'Tab') {
      closeContextMenu();
      return;
    } else return;
    e.preventDefault();
    e.stopPropagation();
  });

  document.body.appendChild(menu);
  const w = menu.offsetWidth;
  const h = menu.offsetHeight;
  menu.style.left = `${Math.max(4, Math.min(x, window.innerWidth - w - 4))}px`;
  menu.style.top = `${Math.max(4, Math.min(y, window.innerHeight - h - 4))}px`;
  menuEl = menu;
  menuAnchor = anchor ?? null;
  menuOnClose = onClose ?? null;
  document.addEventListener('pointerdown', onOutsidePointer, true);
  window.addEventListener('blur', onWindowBlur);
  menu.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  announce(`${menu.querySelectorAll('[role="menuitem"]').length} actions`, 'polite');
}

/** How long a finger must rest, and how far it may drift, for a touch to count as a long press. */
const LONG_PRESS_MS = 500;
const LONG_PRESS_SLOP_PX = 10;

export function initContextMenu(): void {
  /** Open the menu for what is under (x, y): select it if it is not already, then show the actions. */
  const openFor = (el: Element, x: number, y: number): boolean => {
    // Outside Design the menu is for components only (it carries "Fail this component"); the rest keeps the browser's.
    if (app.workspaceMode !== 'design' && targetOf(el)?.type !== 'node') return false;
    if (el.closest('input, textarea, [contenteditable="true"]')) return false;
    const target = targetOf(el);
    if (target && !isInSelection(target)) applySelection(target);
    else if (!target) applySelection({ type: 'none' });
    openContextMenu(x, y);
    return true;
  };

  viewport.addEventListener('contextmenu', (e) => {
    if (openFor(e.target as Element, e.clientX, e.clientY)) e.preventDefault();
  });

  // Touch: Safari on iPad sends no contextmenu event for a long press, so the press is timed here. A second finger,
  // movement or lifting the finger before the time is up cancels it (that is a pinch, a drag or a tap).
  let press: { id: number; x: number; y: number; timer: number } | null = null;
  const cancelPress = (): void => {
    if (press) window.clearTimeout(press.timer);
    press = null;
  };
  viewport.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
    if (!e.isPrimary) {
      cancelPress();
      return;
    }
    cancelPress();
    const el = e.target as Element;
    const { pointerId: id, clientX: x, clientY: y } = e;
    press = {
      id,
      x,
      y,
      timer: window.setTimeout(() => {
        press = null;
        openFor(el, x, y);
      }, LONG_PRESS_MS),
    };
  }, true); // capture: components stop pointerdown from bubbling to the canvas
  viewport.addEventListener('pointermove', (e) => {
    if (press && e.pointerId === press.id && Math.hypot(e.clientX - press.x, e.clientY - press.y) > LONG_PRESS_SLOP_PX) cancelPress();
  }, true);
  viewport.addEventListener('pointerup', cancelPress, true);
  viewport.addEventListener('pointercancel', cancelPress, true);

  // Keyboard: Shift+F10 or the Menu key opens it at the focused component or wire.
  window.addEventListener('keydown', (e) => {
    const isMenuKey = e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey);
    if (!isMenuKey) return;
    const active = document.activeElement as Element | null;
    if (!active || !viewport.contains(active)) return;
    if (app.workspaceMode !== 'design' && targetOf(active)?.type !== 'node') return;
    e.preventDefault();
    const target = targetOf(active);
    if (target && !isInSelection(target)) applySelection(target);
    const rect = (active.closest('.arch-node, .conduit-group, .zone-banner, .blueprint-spec') ?? active).getBoundingClientRect();
    openContextMenu(rect.left + rect.width / 2, rect.top + rect.height / 2);
  });
}
