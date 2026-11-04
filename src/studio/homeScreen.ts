/**
 * The home screen (F-08, B4): a Recent grid with search, the starter templates, and the ways in (open a file, paste
 * Mermaid, import). It opens at boot for a returning visitor who arrives with no diagram in the URL, and with
 * Cmd/Ctrl+O. The data comes from `library.ts`; opening a diagram goes through `libraryUi.ts`.
 */
import { filterByTitle, gridTarget, relativeTime, shouldOpenHomeAtBoot, storageWarning, type GridKey } from '../core/home';
import { escapeHtml } from '../shared/escapeHtml';
import { listLibrary, getActiveDiagramId } from './library';
import { homeDialog, homeDialogBody } from './dom';
import { newDiagram, openDiagram, openLibraryDialog } from './libraryUi';
import { app } from './state';
import {
  TEMPLATE_CATEGORIES,
  fillTemplatePreviews,
  getStarterTemplates,
  renderBlankCanvasCardHtml,
  renderTemplateCardHtml,
  type TemplateCategory,
} from './templatesGallery';
import { notify } from './toast';

export interface HomeDeps {
  /** Open a starter template, or `blank` for an empty canvas, as a new diagram. */
  useTemplate: (id: string) => void;
  openFile: () => void;
  /** The Blueprint file dialog, where Mermaid is pasted. */
  pasteMermaid: () => void;
  importFile: () => void;
}

const SESSION_KEY = 'conduitcraft-home-shown';
const THUMB_WIDTH = 160;
const THUMB_HEIGHT = 100;

let deps: HomeDeps | null = null;
let styles: Promise<unknown> | null = null;
let query = '';
let category: TemplateCategory = 'all';

function shownThisSession(): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

function markShown(): void {
  try {
    sessionStorage.setItem(SESSION_KEY, '1');
  } catch {
    // Without session storage Home may open again after a reload, which is harmless.
  }
}

const q = <T extends HTMLElement>(selector: string): T | null => homeDialogBody?.querySelector<T>(selector) ?? null;

function cardHtml(entry: ReturnType<typeof listLibrary>[number], activeId: string): string {
  const id = escapeHtml(entry.id);
  const title = escapeHtml(entry.title);
  const isOpen = entry.id === activeId;
  const thumb = entry.thumbnail?.startsWith('data:image/')
    ? `<img class="home-thumb" alt="" width="${THUMB_WIDTH}" height="${THUMB_HEIGHT}" src="${escapeHtml(entry.thumbnail)}">`
    : '<span class="home-thumb home-thumb-empty" aria-hidden="true"></span>';
  return `<li><button type="button" class="home-card" data-home-card data-home-open="${id}"${isOpen ? ' aria-current="true"' : ''}>
    ${thumb}
    <span class="home-card-title">${title}</span>
    <span class="home-card-when">${isOpen ? 'Open now · ' : ''}${escapeHtml(relativeTime(entry.updatedAt))}</span>
  </button></li>`;
}

function renderRecent(): void {
  const grid = q<HTMLElement>('#home-recent');
  if (!grid) return;
  const entries = filterByTitle(listLibrary(), query);
  const activeId = getActiveDiagramId();
  const newCard = `<li><button type="button" class="home-card home-card-new" data-home-card data-home-new>
    <span class="home-card-plus" aria-hidden="true">+</span>
    <span class="home-card-title">New diagram</span>
    <span class="home-card-when">Blank canvas</span>
  </button></li>`;
  grid.innerHTML = entries.map((entry) => cardHtml(entry, activeId)).join('') + newCard;
  const note = q<HTMLElement>('#home-recent-note');
  if (note) {
    note.textContent = query.trim() && entries.length === 0 ? `No diagrams match "${query.trim()}".` : '';
    note.hidden = !note.textContent;
  }
}

function renderTemplates(): void {
  const filters = q<HTMLElement>('#home-template-filters');
  const grid = q<HTMLElement>('#home-templates');
  if (!filters || !grid) return;
  filters.innerHTML = TEMPLATE_CATEGORIES.map(
    (cat) =>
      `<button type="button" class="template-filter-btn${cat.id === category ? ' is-active' : ''}" data-home-cat="${cat.id}" aria-pressed="${cat.id === category}">${cat.label}</button>`,
  ).join('');
  const templates = getStarterTemplates(category);
  const blank = category === 'all' || category === 'cloud' ? renderBlankCanvasCardHtml() : '';
  grid.innerHTML = blank + templates.map((t) => renderTemplateCardHtml(t)).join('');
  fillTemplatePreviews(grid, templates);
}

function renderShell(): void {
  if (!homeDialogBody) return;
  homeDialogBody.innerHTML = `
    <div class="home-top">
      <label class="home-search">
        <span class="home-search-label">Search diagrams</span>
        <input type="search" id="home-search" placeholder="Search diagrams" autocomplete="off" value="${escapeHtml(query)}">
      </label>
      <button type="button" class="btn btn-primary" data-home-new>New diagram</button>
    </div>
    <p class="home-warning" id="home-storage" role="status" hidden></p>
    <section class="home-section" aria-labelledby="home-recent-title">
      <h3 id="home-recent-title">Recent</h3>
      <ul class="home-grid" id="home-recent" aria-label="Recent diagrams"></ul>
      <p class="home-note" id="home-recent-note" role="status" hidden></p>
    </section>
    <section class="home-section" aria-labelledby="home-templates-title">
      <h3 id="home-templates-title">Start from a template</h3>
      <div class="template-category-filters" id="home-template-filters"></div>
      <div class="home-templates" id="home-templates"></div>
    </section>
    <nav class="home-links" aria-label="More ways to start">
      <button type="button" class="btn" data-home-link="open-file">Open file…</button>
      <button type="button" class="btn" data-home-link="mermaid">Paste Mermaid…</button>
      <button type="button" class="btn" data-home-link="import" title="Docker Compose, OpenAPI, AsyncAPI, Kubernetes, OpenTelemetry or Jaeger traces, draw.io, Excalidraw">Import infrastructure…</button>
      <button type="button" class="btn" data-home-link="manage">Manage diagrams…</button>
    </nav>`;
  renderRecent();
  renderTemplates();
}

async function showStorageWarning(): Promise<void> {
  try {
    const estimate = await navigator.storage?.estimate?.();
    const message = storageWarning(estimate?.usage, estimate?.quota);
    const el = q<HTMLElement>('#home-storage');
    if (el && message) {
      el.textContent = message;
      el.hidden = false;
    }
  } catch {
    // The browser would not say; no warning is better than a wrong one.
  }
}

export async function openHome(): Promise<void> {
  if (!homeDialog || !homeDialogBody) return;
  // The home screen's styles are only needed here, so they stay out of the entry stylesheet.
  styles ??= import('../styles/home.css').catch(() => undefined);
  await styles;
  markShown();
  query = '';
  renderShell();
  if (!homeDialog.open) homeDialog.showModal();
  void showStorageWarning();
}

/** Open Home at boot for a returning visitor with saved diagrams and no diagram in the URL. Call after storage is read. */
export function openHomeAtBootIfReturning(): void {
  const open = shouldOpenHomeAtBoot({
    hasShareLink: window.location.hash.length > 1,
    entryCount: listLibrary().length,
    shownThisSession: shownThisSession(),
  });
  // Only the first load of a tab can open Home; a reload while working goes straight back to the canvas.
  markShown();
  if (open) void openHome();
}

function closeHome(): void {
  homeDialog?.close();
}

function columnCount(grid: HTMLElement): number {
  const template = getComputedStyle(grid).gridTemplateColumns;
  return Math.max(1, template.split(' ').filter(Boolean).length);
}

function onKey(event: KeyboardEvent): void {
  const key = event.key as GridKey;
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(key)) return;
  const card = (event.target as HTMLElement).closest<HTMLElement>('[data-home-card]');
  const grid = card?.closest<HTMLElement>('.home-grid');
  if (!card || !grid) return;
  const cards = [...grid.querySelectorAll<HTMLElement>('[data-home-card]')];
  const next = gridTarget(cards.indexOf(card), key, cards.length, columnCount(grid));
  if (next < 0) return;
  event.preventDefault();
  cards[next]?.focus();
}

function onClick(event: Event): void {
  const target = event.target as HTMLElement;
  const cat = target.closest<HTMLElement>('[data-home-cat]')?.dataset.homeCat as TemplateCategory | undefined;
  if (cat) {
    category = cat;
    renderTemplates();
    q<HTMLElement>(`[data-home-cat="${cat}"]`)?.focus();
    return;
  }
  const open = target.closest<HTMLElement>('[data-home-open]')?.dataset.homeOpen;
  if (open) {
    // At boot the open diagram is only remembered, not on the canvas yet, so an empty canvas always loads it.
    const canvasEmpty = app.doc.nodes.length === 0 && app.doc.zones.length === 0 && app.doc.notesCards.length === 0;
    if (openDiagram(open, { force: canvasEmpty })) closeHome();
    else notify('That diagram is no longer saved', { tone: 'error' });
    return;
  }
  if (target.closest('[data-home-new]')) {
    closeHome();
    void newDiagram();
    return;
  }
  const template = target.closest<HTMLElement>('[data-template-id]')?.dataset.templateId;
  if (template) {
    closeHome();
    deps?.useTemplate(template);
    return;
  }
  const link = target.closest<HTMLElement>('[data-home-link]')?.dataset.homeLink;
  if (!link) return;
  closeHome();
  if (link === 'open-file') deps?.openFile();
  else if (link === 'mermaid') deps?.pasteMermaid();
  else if (link === 'import') deps?.importFile();
  else if (link === 'manage') void openLibraryDialog();
}

export function initHome(homeDeps: HomeDeps): void {
  deps = homeDeps;
  homeDialogBody?.addEventListener('click', onClick);
  homeDialogBody?.addEventListener('keydown', onKey);
  homeDialogBody?.addEventListener('input', (event) => {
    const input = (event.target as HTMLElement).closest<HTMLInputElement>('#home-search');
    if (!input) return;
    query = input.value;
    renderRecent();
  });
}
