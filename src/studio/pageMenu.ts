/**
 * Page commands that are not part of the tab strip itself (D10): the context menu, inline rename, delete with
 * Undo, duplicate, move, and drag-to-reorder. A lazy chunk: `pageTabs.ts` loads it the first time someone reaches
 * for the strip, and the command palette loads it for the page commands.
 */
import { addPage, deletePage, duplicatePage, movePage, renamePage } from '../core/pageOps';
import { indexOfPage, pageCount, pageList } from '../core/pages';
import { announce } from './a11y';
import { startTextEdit } from './inlineRename';
import { app, currentPageId, editPages, fullDocument, performUndo, stepPage } from './state';
import { notify } from './toast';

export type PageAction =
  | 'add'
  | 'duplicate'
  | 'delete'
  | 'rename'
  | 'next'
  | 'previous'
  | 'move-left'
  | 'move-right';

const UNDO_MS = 10_000;

const titleAt = (index: number): string => pageList(fullDocument())[index]?.title ?? '';

/** Keep the page that is open open after an edit that may have moved it. */
function keepOpen(edit: ReturnType<typeof addPage>, openId: string) {
  return edit ? { ...edit, index: Math.max(0, indexOfPage(edit.doc, openId)) } : null;
}

export function renamePageInline(index: number): void {
  const tab = document.querySelector<HTMLElement>(`#page-tabs [data-index="${index}"] .page-tab-label`);
  const current = titleAt(index);
  startTextEdit(tab, current, 'Page name', (value) => {
    const openId = currentPageId();
    if (editPages((whole) => keepOpen(renamePage(whole, index, value), openId))) {
      announce(`Page renamed to ${value.trim()}`);
    }
  });
}

function deletePageWithUndo(index: number): void {
  const title = titleAt(index);
  if (pageCount(fullDocument()) <= 1) {
    notify('A file needs at least one page. Add another before deleting this one.');
    return;
  }
  if (!editPages((whole) => deletePage(whole, index))) return;
  announce(`Deleted page ${title}`);
  notify(`Deleted page "${title}".`, { duration: UNDO_MS, action: { label: 'Undo', onClick: performUndo } });
}

function move(index: number, to: number): void {
  const openId = currentPageId();
  if (editPages((whole) => keepOpen(movePage(whole, index, to), openId))) {
    announce(`Page ${titleAt(to)} moved to position ${to + 1} of ${pageCount(fullDocument())}`);
  }
}

/** Run a page command. Without an index it acts on the open page. */
export function runPageAction(action: PageAction, index: number = app.pageIndex): void {
  switch (action) {
    case 'add':
      if (!editPages((whole) => addPage(whole))) notify('That is the most pages one file can hold.');
      break;
    case 'duplicate':
      if (!editPages((whole) => duplicatePage(whole, index))) notify('That is the most pages one file can hold.');
      break;
    case 'delete':
      deletePageWithUndo(index);
      break;
    case 'rename':
      renamePageInline(index);
      break;
    case 'next':
      stepPage(1);
      break;
    case 'previous':
      stepPage(-1);
      break;
    case 'move-left':
      move(index, index - 1);
      break;
    case 'move-right':
      move(index, index + 1);
      break;
  }
}

// ---------------------------------------------------------------------------
// Context menu
// ---------------------------------------------------------------------------
let menuEl: HTMLElement | null = null;
let returnFocus: HTMLElement | null = null;

function closeMenu(restoreFocus = true): void {
  if (!menuEl) return;
  menuEl.remove();
  menuEl = null;
  document.removeEventListener('pointerdown', onOutside, true);
  if (restoreFocus && returnFocus?.isConnected) returnFocus.focus();
  returnFocus = null;
}

function onOutside(e: Event): void {
  if (menuEl && !menuEl.contains(e.target as Node)) closeMenu(false);
}

export function openPageMenu(index: number, x: number, y: number, focusReturn?: HTMLElement): void {
  closeMenu(false);
  const count = pageCount(fullDocument());
  const items: Array<[label: string, action: PageAction, enabled: boolean]> = [
    ['Rename', 'rename', true],
    ['Duplicate', 'duplicate', true],
    ['Delete', 'delete', count > 1],
    ['Move left', 'move-left', index > 0],
    ['Move right', 'move-right', index < count - 1],
  ];
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', `Page ${titleAt(index)}`);
  returnFocus = focusReturn ?? (document.querySelector<HTMLElement>(`#page-tabs [data-index="${index}"]`));
  for (const [label, action, enabled] of items) {
    if (!enabled) continue;
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'context-menu-item';
    item.setAttribute('role', 'menuitem');
    item.tabIndex = -1;
    const text = document.createElement('span');
    text.textContent = label;
    item.appendChild(text);
    item.addEventListener('click', () => {
      closeMenu(action !== 'rename' && action !== 'delete');
      runPageAction(action, index);
    });
    menu.appendChild(item);
  }
  menu.addEventListener('keydown', (e) => {
    const els = Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    const i = els.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') els[(i + 1) % els.length].focus();
    else if (e.key === 'ArrowUp') els[(i - 1 + els.length) % els.length].focus();
    else if (e.key === 'Home') els[0].focus();
    else if (e.key === 'End') els[els.length - 1].focus();
    else if (e.key === 'Escape') closeMenu();
    else if (e.key === 'Tab') {
      closeMenu();
      return;
    } else return;
    e.preventDefault();
    e.stopPropagation();
  });
  document.body.appendChild(menu);
  const w = menu.offsetWidth;
  const h = menu.offsetHeight;
  // Opens upward from the strip, which sits at the bottom edge.
  menu.style.left = `${Math.max(4, Math.min(x, window.innerWidth - w - 4))}px`;
  menu.style.top = `${Math.max(4, Math.min(y - h, window.innerHeight - h - 4))}px`;
  menuEl = menu;
  document.addEventListener('pointerdown', onOutside, true);
  menu.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
}

// ---------------------------------------------------------------------------
// Drag to reorder
// ---------------------------------------------------------------------------
let attached: HTMLElement | null = null;

/** Native drag and drop between tabs. Touch reorders through the menu's Move left and Move right. */
export function attachReorder(tabs: HTMLElement): void {
  if (attached === tabs) return;
  attached = tabs;
  let from = -1;
  const tabAt = (target: EventTarget | null) => (target as Element | null)?.closest<HTMLElement>('.page-tab') ?? null;
  tabs.addEventListener('dragstart', (e) => {
    const tab = tabAt(e.target);
    if (!tab) return;
    from = Number(tab.dataset.index);
    e.dataTransfer?.setData('text/plain', tab.textContent ?? '');
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  });
  tabs.addEventListener('dragover', (e) => {
    if (from < 0 || !tabAt(e.target)) return;
    e.preventDefault();
    for (const t of tabs.querySelectorAll('.page-tab')) t.classList.toggle('is-drop-target', t === tabAt(e.target));
  });
  tabs.addEventListener('drop', (e) => {
    const tab = tabAt(e.target);
    if (from < 0 || !tab) return;
    e.preventDefault();
    const to = Number(tab.dataset.index);
    const moving = from;
    from = -1;
    if (to !== moving) move(moving, to);
  });
  tabs.addEventListener('dragend', () => {
    from = -1;
    for (const t of tabs.querySelectorAll('.page-tab')) t.classList.remove('is-drop-target');
  });
}

// ---------------------------------------------------------------------------
// Strip handlers that only matter once someone reaches for a tab
// ---------------------------------------------------------------------------
const LONG_PRESS_MS = 500;
const LONG_PRESS_SLOP_PX = 10;

/** Double-click and F2 rename, right-click and Shift+F10 open the menu, a touch long-press does too, and tabs drag. */
export function attachTabHandlers(tabs: HTMLElement): void {
  attachReorder(tabs);
  const tabOf = (target: EventTarget | null) => (target as Element | null)?.closest<HTMLElement>('.page-tab') ?? null;
  const indexOf = (tab: HTMLElement) => Number(tab.dataset.index);
  tabs.addEventListener('dblclick', (e) => {
    const tab = tabOf(e.target);
    if (tab) renamePageInline(indexOf(tab));
  });
  tabs.addEventListener('contextmenu', (e) => {
    const tab = tabOf(e.target);
    if (!tab) return;
    e.preventDefault();
    openPageMenu(indexOf(tab), e.clientX, e.clientY);
  });
  tabs.addEventListener('keydown', (e) => {
    const tab = tabOf(e.target);
    if (!tab) return;
    if (e.key === 'F2') {
      e.preventDefault();
      e.stopPropagation();
      renamePageInline(indexOf(tab));
    } else if ((e.key === 'F10' && e.shiftKey) || e.key === 'ContextMenu') {
      e.preventDefault();
      e.stopPropagation();
      const r = tab.getBoundingClientRect();
      openPageMenu(indexOf(tab), r.left, r.top, tab);
    }
  });
  // Touch has no right-click: a long press opens the menu.
  let press: { x: number; y: number; timer: number } | null = null;
  const cancelPress = () => {
    if (press) window.clearTimeout(press.timer);
    press = null;
  };
  tabs.addEventListener('pointerdown', (e) => {
    cancelPress();
    const tab = tabOf(e.target);
    if (!tab || (e.pointerType !== 'touch' && e.pointerType !== 'pen')) return;
    const { clientX: x, clientY: y } = e;
    press = {
      x,
      y,
      timer: window.setTimeout(() => {
        press = null;
        openPageMenu(indexOf(tab), x, y, tab);
      }, LONG_PRESS_MS),
    };
  });
  tabs.addEventListener('pointermove', (e) => {
    if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > LONG_PRESS_SLOP_PX) cancelPress();
  });
  for (const type of ['pointerup', 'pointercancel', 'pointerleave'] as const) tabs.addEventListener(type, cancelPress);
}
