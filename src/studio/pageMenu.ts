/**
 * Page switcher & commands menu (V4 DK3): lazy-loaded when the user opens `#btn-page-menu`,
 * right-clicks / presses F2 on the page crumb, or runs a Page command from the palette.
 */
import { addPage, deletePage, duplicatePage, movePage, renamePage } from '../core/pageOps';
import { indexOfPage, pageCount, pageList } from '../core/pages';
import { announce } from './a11y';
import { startTextEdit } from './inlineRename';
import { app, currentPageId, editPages, fullDocument, goToPage, performUndo, stepPage } from './state';
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

export function renamePageInline(index: number = app.pageIndex): void {
  closeMenu(false);
  if (index !== app.pageIndex) goToPage(index);
  const target = document.querySelector<HTMLElement>('#nw-breadcrumb [data-crumb="page"] .nw-crumb-label');
  const current = titleAt(index);
  startTextEdit(target, current, 'Page name', (value) => {
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
// Unified page switcher & actions menu
// ---------------------------------------------------------------------------
let menuEl: HTMLElement | null = null;
let anchorEl: HTMLElement | null = null;

function closeMenu(restoreFocus = true): void {
  if (!menuEl) return;
  menuEl.remove();
  menuEl = null;
  document.removeEventListener('pointerdown', onOutside, true);
  if (anchorEl) anchorEl.setAttribute('aria-expanded', 'false');
  const focusTarget = restoreFocus ? (document.getElementById('btn-page-menu') ?? anchorEl) : null;
  anchorEl = null;
  if (focusTarget?.isConnected) focusTarget.focus();
}

function onOutside(e: Event): void {
  const target = e.target as Node;
  if (menuEl && !menuEl.contains(target) && !anchorEl?.contains(target)) closeMenu(false);
}

export function toggleBreadcrumbPageMenu(anchor: HTMLElement): void {
  if (menuEl) {
    closeMenu(true);
    return;
  }
  openBreadcrumbPageMenu(anchor);
}

export function openBreadcrumbPageMenu(anchor: HTMLElement): void {
  closeMenu(false);
  const pages = pageList(fullDocument());
  const active = app.pageIndex;
  const count = pages.length;

  const menu = document.createElement('div');
  menu.className = 'context-menu page-menu';
  menu.id = 'page-menu';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', 'Pages');
  anchorEl = anchor;
  anchor.setAttribute('aria-expanded', 'true');

  let dragFrom = -1;
  const rowAt = (target: EventTarget | null) =>
    (target as Element | null)?.closest<HTMLElement>('.page-menu-page') ?? null;

  for (const page of pages) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'context-menu-item page-menu-page';
    item.setAttribute('role', 'menuitem');
    item.tabIndex = -1;
    item.dataset.pageIndex = String(page.index);
    if (page.index === active) item.setAttribute('aria-current', 'true');
    const text = document.createElement('span');
    text.className = 'page-menu-title';
    text.textContent = page.title;
    item.appendChild(text);
    if (page.index === active) {
      const check = document.createElement('span');
      check.className = 'page-menu-check';
      check.setAttribute('aria-hidden', 'true');
      check.textContent = '✓';
      item.appendChild(check);
    }
    if (count > 1) item.draggable = true;
    item.addEventListener('click', () => {
      closeMenu(true);
      goToPage(page.index);
    });
    menu.appendChild(item);
  }

  menu.addEventListener('dragstart', (e) => {
    const row = rowAt(e.target);
    if (!row) return;
    dragFrom = Number(row.dataset.pageIndex);
    e.dataTransfer?.setData('text/plain', row.textContent ?? '');
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  });
  menu.addEventListener('dragover', (e) => {
    if (dragFrom < 0 || !rowAt(e.target)) return;
    e.preventDefault();
    for (const r of menu.querySelectorAll('.page-menu-page')) r.classList.toggle('is-drop-target', r === rowAt(e.target));
  });
  menu.addEventListener('drop', (e) => {
    const row = rowAt(e.target);
    if (dragFrom < 0 || !row) return;
    e.preventDefault();
    const to = Number(row.dataset.pageIndex);
    const moving = dragFrom;
    dragFrom = -1;
    if (to !== moving) {
      move(moving, to);
      const nextAnchor = document.getElementById('btn-page-menu');
      if (nextAnchor) openBreadcrumbPageMenu(nextAnchor);
    }
  });
  menu.addEventListener('dragend', () => {
    dragFrom = -1;
    for (const r of menu.querySelectorAll('.page-menu-page')) r.classList.remove('is-drop-target');
  });

  const sep = document.createElement('div');
  sep.className = 'context-menu-sep';
  sep.setAttribute('role', 'separator');
  menu.appendChild(sep);

  const actions: Array<[label: string, action: PageAction, enabled: boolean]> = [
    ['Add page', 'add', true],
    ['Rename page', 'rename', true],
    ['Duplicate page', 'duplicate', true],
    ['Move up', 'move-left', active > 0],
    ['Move down', 'move-right', active < count - 1],
    ['Delete page', 'delete', count > 1],
  ];

  for (const [label, action, enabled] of actions) {
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
      runPageAction(action, active);
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
    else if (e.key === 'Escape') closeMenu(true);
    else if (e.key === 'Tab') {
      closeMenu(true);
      return;
    } else return;
    e.preventDefault();
    e.stopPropagation();
  });

  document.body.appendChild(menu);
  const r = anchor.getBoundingClientRect();
  const w = menu.offsetWidth;
  const h = menu.offsetHeight;
  menu.style.left = `${Math.max(4, Math.min(r.left, window.innerWidth - w - 4))}px`;
  menu.style.top = `${Math.max(4, Math.min(r.bottom + 6, window.innerHeight - h - 4))}px`;
  menuEl = menu;
  document.addEventListener('pointerdown', onOutside, true);
  (
    menu.querySelector<HTMLElement>('[role="menuitem"][aria-current="true"]') ??
    menu.querySelector<HTMLElement>('[role="menuitem"]')
  )?.focus();
}
