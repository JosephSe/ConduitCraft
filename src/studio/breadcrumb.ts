/**
 * NW title-island breadcrumb (V4 DK3): shows `/ Page` (or `/ Page / Level ...`) inside `#nw-breadcrumb`,
 * replacing the bottom-left `#page-strip` tabs. The last crumb opens the lazy-loaded page menu (`pageMenu.ts`).
 */
import { breadcrumb } from '../core/levels';
import { pageCount, pageList } from '../core/pages';
import { announce } from './a11y';
import { simulationPlayback } from './simulationPlayback';
import { app, goToLevel, onPageOpened, onPagesChange, openPageDocument } from './state';

const CHEVRON_SVG =
  '<svg class="ui-icon nw-crumb-chev" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';

let navEl: HTMLElement | null = null;
let paintedKey = '';
let menuModule: Promise<typeof import('./pageMenu')> | null = null;

/** Load the page switcher and actions menu code once. */
export function pageMenuModule(): Promise<typeof import('./pageMenu')> {
  menuModule ??= import('./pageMenu');
  return menuModule;
}

function pagesSource() {
  return app.pageRoot ?? app.levelRoot ?? app.doc;
}

function makeSep(): HTMLSpanElement {
  const sep = document.createElement('span');
  sep.className = 'nw-crumb-sep';
  sep.setAttribute('aria-hidden', 'true');
  sep.textContent = '/';
  return sep;
}

function makeMenuCrumb(
  title: string,
  ariaLabel: string,
  extraClass: string,
  attrs: Record<string, string>,
): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'btn-page-menu';
  btn.className = `nw-crumb is-current ${extraClass}`.trim();
  btn.setAttribute('aria-current', 'page');
  btn.setAttribute('aria-haspopup', 'menu');
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-label', ariaLabel);
  for (const [k, v] of Object.entries(attrs)) btn.dataset[k] = v;
  const label = document.createElement('span');
  label.className = 'nw-crumb-label';
  label.textContent = title;
  btn.append(label);
  btn.insertAdjacentHTML('beforeend', CHEVRON_SVG);
  return btn;
}

/** Repaint the NW page/level breadcrumb when pages, active page, or open level changed. */
export function paintBreadcrumb(): void {
  if (!navEl) return;
  const list = pageList(pagesSource());
  const page = list[app.pageIndex] ?? list[0];
  const path = app.levelPath;
  const root = path.length > 0 ? openPageDocument() : app.doc;
  const levelCrumbs = path.length > 0 ? breadcrumb(root, path) : [];
  const key = JSON.stringify([
    page?.id ?? '',
    page?.title ?? '',
    app.pageIndex,
    list.length,
    levelCrumbs.map((c) => c.title),
  ]);
  if (key === paintedKey) return;
  paintedKey = key;

  const focusId = document.activeElement instanceof HTMLElement ? document.activeElement.id : '';
  const nodes: HTMLElement[] = [makeSep()];

  if (path.length === 0) {
    delete navEl.dataset.nested;
    const title = page?.title || 'Page 1';
    nodes.push(
      makeMenuCrumb(title, `Page: ${title}, open page menu`, '', {
        crumb: 'page',
        pageIndex: String(app.pageIndex),
      }),
    );
  } else {
    navEl.dataset.nested = 'true';
    const pageTitle = page?.title || 'Page 1';
    const pageBtn = document.createElement('button');
    pageBtn.type = 'button';
    pageBtn.className = 'nw-crumb level-crumb';
    pageBtn.dataset.crumb = 'page';
    pageBtn.dataset.pageIndex = String(app.pageIndex);
    const pageLabel = document.createElement('span');
    pageLabel.className = 'nw-crumb-label';
    pageLabel.textContent = pageTitle;
    pageBtn.appendChild(pageLabel);
    pageBtn.addEventListener('click', () => goToLevel([]));
    nodes.push(pageBtn);

    levelCrumbs.slice(1).forEach((crumb, i, arr) => {
      nodes.push(makeSep());
      const isLast = i === arr.length - 1;
      if (isLast) {
        nodes.push(makeMenuCrumb(crumb.title, `Level: ${crumb.title}, open page menu`, 'level-crumb', { crumb: 'level' }));
      } else {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'nw-crumb level-crumb';
        btn.dataset.crumb = 'level';
        const span = document.createElement('span');
        span.className = 'nw-crumb-label';
        span.textContent = crumb.title;
        btn.appendChild(span);
        btn.addEventListener('click', () => goToLevel(crumb.path));
        nodes.push(btn);
      }
    });
  }

  navEl.replaceChildren(...nodes);
  if (focusId === 'btn-page-menu') document.getElementById('btn-page-menu')?.focus();
}

export function initBreadcrumb(): void {
  navEl = document.getElementById('nw-breadcrumb');
  if (!navEl) return;
  const nav = navEl;

  nav.addEventListener('click', (e) => {
    const btn = (e.target as Element | null)?.closest<HTMLButtonElement>('#btn-page-menu');
    if (btn) void pageMenuModule().then((m) => m.toggleBreadcrumbPageMenu(btn));
  });

  nav.addEventListener('dblclick', (e) => {
    const crumb = (e.target as Element | null)?.closest<HTMLElement>('[data-crumb="page"]');
    if (!crumb) return;
    void pageMenuModule().then((m) => m.renamePageInline(app.pageIndex));
  });

  nav.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const anchor = document.getElementById('btn-page-menu');
    if (anchor) void pageMenuModule().then((m) => m.openBreadcrumbPageMenu(anchor));
  });

  nav.addEventListener('keydown', (e) => {
    if (e.key === 'F2') {
      e.preventDefault();
      e.stopPropagation();
      void pageMenuModule().then((m) => m.renamePageInline(app.pageIndex));
    } else if ((e.key === 'F10' && e.shiftKey) || e.key === 'ContextMenu') {
      e.preventDefault();
      e.stopPropagation();
      const anchor = document.getElementById('btn-page-menu');
      if (anchor) void pageMenuModule().then((m) => m.openBreadcrumbPageMenu(anchor));
    }
  });

  const warm = () => void pageMenuModule();
  nav.addEventListener('pointerover', warm, { once: true });
  nav.addEventListener('focusin', warm, { once: true });

  onPagesChange(paintBreadcrumb);
  onPageOpened((id) => {
    simulationPlayback.clear();
    const list = pageList(pagesSource());
    const opened = list.find((p) => p.id === id);
    const total = pageCount(pagesSource());
    if (opened && total > 1) announce(`Page ${opened.title}, ${opened.index + 1} of ${total}`, 'polite');
  });
  paintBreadcrumb();
}
