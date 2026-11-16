/**
 * The page tab strip (D10): one tab per diagram in the file, along the bottom edge of the canvas. Only the strip
 * lives here, in the entry bundle: click to switch, `+` to add, arrow keys between tabs. The context menu, inline
 * rename, delete with Undo and drag-to-reorder load from `pageMenu.ts` the first time they are needed.
 */
import { pageCount, pageList } from '../core/pages';
import { announce } from './a11y';
import { simulationPlayback } from './simulationPlayback';
import { app, goToPage, onPageOpened, onPagesChange } from './state';

let tabsEl: HTMLElement | null = null;
let paintedKey = '';
let menuModule: Promise<typeof import('./pageMenu')> | null = null;

/** Load the menu, rename and reorder code once. */
export function pageMenuModule(): Promise<typeof import('./pageMenu')> {
  menuModule ??= import('./pageMenu').then((m) => {
    if (tabsEl) m.attachTabHandlers(tabsEl);
    return m;
  });
  return menuModule;
}

function pagesSource() {
  // The file's page list lives on the whole document: `pageRoot` while a later page is open, else the open document.
  return app.pageRoot ?? app.levelRoot ?? app.doc;
}

/** Repaint the tabs when the page list or the open page changed. Cheap otherwise. */
export function paintPageTabs(): void {
  if (!tabsEl) return;
  const list = pageList(pagesSource());
  const key = JSON.stringify([list.map((p) => [p.id, p.title]), app.pageIndex]);
  if (key === paintedKey) return;
  paintedKey = key;
  const hadFocus = tabsEl.contains(document.activeElement);
  tabsEl.replaceChildren(
    ...list.map((page) => {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'page-tab';
      tab.id = `page-tab-${page.index}`;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', String(page.index === app.pageIndex));
      tab.setAttribute('aria-controls', 'canvas-viewport');
      tab.tabIndex = page.index === app.pageIndex ? 0 : -1;
      tab.dataset.index = String(page.index);
      tab.draggable = list.length > 1;
      const label = document.createElement('span');
      label.className = 'page-tab-label';
      label.textContent = page.title;
      tab.appendChild(label);
      return tab;
    }),
  );
  if (hadFocus) tabsEl.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
}

function tabOf(target: EventTarget | null): HTMLElement | null {
  return (target as Element | null)?.closest<HTMLElement>('.page-tab') ?? null;
}

const indexOf = (tab: HTMLElement) => Number(tab.dataset.index);

export function initPageTabs(): void {
  tabsEl = document.getElementById('page-tabs');
  const addBtn = document.getElementById('page-add');
  if (!tabsEl || !addBtn) return;
  const tabs = tabsEl;

  tabs.addEventListener('click', (e) => {
    const tab = tabOf(e.target);
    if (!tab) return;
    // Narrow: only the open page's tab shows (6.6), so tapping it moves on to the next page.
    const count = pageCount(pagesSource());
    if (count > 1 && tab.getAttribute('aria-selected') === 'true' && window.matchMedia('(max-width: 56rem)').matches) {
      goToPage((indexOf(tab) + 1) % count);
      return;
    }
    goToPage(indexOf(tab));
  });
  addBtn.addEventListener('click', () => void pageMenuModule().then((m) => m.runPageAction('add')));

  tabs.addEventListener('keydown', (e) => {
    const tab = tabOf(e.target);
    if (!tab) return;
    const index = indexOf(tab);
    const last = pageCount(pagesSource()) - 1;
    let to = -1;
    if (e.key === 'ArrowRight') to = index === last ? 0 : index + 1;
    else if (e.key === 'ArrowLeft') to = index === 0 ? last : index - 1;
    else if (e.key === 'Home') to = 0;
    else if (e.key === 'End') to = last;
    if (to >= 0) {
      e.preventDefault();
      e.stopPropagation();
      goToPage(to);
      tabs.querySelector<HTMLElement>(`[data-index="${to}"]`)?.focus();
    }
  });

  // The menu and reorder code is small but not needed until someone reaches for the strip.
  const warm = () => void pageMenuModule();
  tabs.addEventListener('pointerover', warm, { once: true });
  tabs.addEventListener('focusin', warm, { once: true });

  onPagesChange(paintPageTabs);
  onPageOpened((id) => {
    // A scenario plays on one page's components, so changing page stops it.
    simulationPlayback.clear();
    const list = pageList(pagesSource());
    const page = list.find((p) => p.id === id);
    if (page && list.length > 1) announce(`Page ${page.title}, ${page.index + 1} of ${list.length}`, 'polite');
  });
  paintPageTabs();
}
