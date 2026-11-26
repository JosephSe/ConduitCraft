/**
 * The unified Composer (REDESIGN_PLAN_V4.md §7.1–§7.3): replaces the component tray (`tray.ts`).
 * Opens above the dock via `/`, `C`, or the dock trigger; holds the combobox input, grouped catalog
 * with V3 cut-out silhouettes (D14), word-search + custom service fallback, and live demo pane.
 * Lazy-loaded on first open so zero bytes ship in the entry bundle.
 */
import '../styles/composer.css';
import { TONE_CSS } from '../shared/tones';
import { findStencil } from '../templates/presets';
import { renderCutoutMarkup, CUTOUT_HEIGHT, CUTOUT_WIDTH } from '../ui/cutout';
import { arm, disarm, setFavourite } from './dock';
import { FAVOURITE_COUNT } from './dockFavourites';
import { viewport } from './dom';
import { attachStencilDragAndDrop } from './interactions';
import { findPaletteCommand } from './palette';
import { createDemoPane, showDemo } from './trayDemo';
import { displayName, searchTray } from './trayWords';

export type ComposerScope = 'all' | 'find' | 'commands';

interface Item {
  id: string;
  title?: string;
  structure?: { command: string; draw: string };
}

const GROUPS: Array<{ label: string; items: Item[] }> = [
  { label: 'Entry points', items: [{ id: 'actor' }, { id: 'client' }, { id: 'scheduler' }] },
  { label: 'Traffic control', items: [{ id: 'balancer' }, { id: 'gate' }, { id: 'limiter' }] },
  { label: 'Compute', items: [{ id: 'service' }, { id: 'core' }, { id: 'cache' }] },
  { label: 'Messaging', items: [{ id: 'queue' }, { id: 'stream' }, { id: 'bus' }] },
  { label: 'Data', items: [{ id: 'store' }, { id: 'object-store' }] },
  {
    label: 'Structure',
    items: [
      { id: 'zone', title: 'Swimlane', structure: { command: 'add-zone', draw: '<rect x="8" y="4" width="22" height="22" rx="2"/><path d="M8 10h22"/>' } },
      { id: 'frame', title: 'Frame', structure: { command: 'tool-frame', draw: '<rect x="6" y="5" width="26" height="20" rx="2" stroke-dasharray="3 3"/><path d="M6 10h26"/>' } },
      { id: 'notes', title: 'Note', structure: { command: 'add-notes', draw: '<path d="M8 4h16l6 6v16H8z"/><path d="M24 4v6h6"/>' } },
      { id: 'text', title: 'Text', structure: { command: 'tool-text', draw: '<path d="M9 22 15 7l6 15M11 17h8M24 22V12"/>' } },
    ],
  },
];

let composer: HTMLElement | null = null;
let input: HTMLInputElement | null = null;
let listEl: HTMLElement | null = null;
let demo: HTMLElement | null = null;
let demoNamedEl: HTMLElement | null = null;
let fallbackGroup: HTMLElement | null = null;
let fallbackLabelEl: HTMLElement | null = null;
let fallbackBtn: HTMLButtonElement | null = null;
let fallbackNoteEl: HTMLElement | null = null;
let activeBtn: HTMLButtonElement | null = null;
let opener: HTMLElement | null = null;
let standardButtons: HTMLButtonElement[] = [];

const isOpen = (): boolean => !!composer && !composer.hidden;

function visibleOptions(): HTMLButtonElement[] {
  if (!listEl) return [];
  return Array.from(listEl.querySelectorAll<HTMLButtonElement>('.composer-item')).filter((b) => !b.hidden);
}

function structureCutout(draw: string): string {
  return `<svg class="cutout" viewBox="0 0 ${CUTOUT_WIDTH} ${CUTOUT_HEIGHT}" width="${CUTOUT_WIDTH}" height="${CUTOUT_HEIGHT}" fill="none" stroke="var(--cc-ink-3)" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${draw}</svg>`;
}

function sync(open: boolean): void {
  document.getElementById('workspace')?.toggleAttribute('data-composer', open);
  document.getElementById('btn-all-components')?.setAttribute('aria-expanded', String(open));
  input?.setAttribute('aria-expanded', String(open));
}

/** Close the composer popup, clearing any typed query and optionally restoring focus. */
export function closeComposer(returnFocus = false): void {
  if (!isOpen()) return;
  composer!.hidden = true;
  if (input && input.value) {
    input.value = '';
    applyFilter();
  }
  sync(false);
  if (returnFocus) {
    const target = opener && opener.isConnected && opener !== document.body
      ? opener
      : document.getElementById('btn-all-components');
    target?.focus();
  }
}

function updateDemoFor(btn: HTMLButtonElement | null): void {
  if (!demo) return;
  const cut = btn?.querySelector<HTMLElement>('.cut');
  showDemo(
    demo,
    btn && cut
      ? {
          id: btn.dataset.stencilId ?? '',
          title: btn.dataset.title ?? '',
          cutout: cut.innerHTML,
          tone: cut.style.getPropertyValue('--t') || 'var(--cc-ink-2)',
        }
      : null,
  );
  if (demoNamedEl) {
    const named = btn?.dataset.named;
    demoNamedEl.textContent = named ? `It will be named ${named}.` : '';
    demoNamedEl.hidden = !named;
  }
}

function setActive(target: HTMLButtonElement | null): void {
  const all = visibleOptions();
  const resolved = target && !target.hidden ? target : (all[0] ?? null);
  for (const btn of [...standardButtons, ...(fallbackBtn ? [fallbackBtn] : [])]) {
    const on = btn === resolved;
    btn.classList.toggle('is-active', on);
    btn.setAttribute('aria-selected', String(on));
  }
  activeBtn = resolved;
  if (input) {
    if (resolved?.id) input.setAttribute('aria-activedescendant', resolved.id);
    else input.removeAttribute('aria-activedescendant');
  }
  resolved?.scrollIntoView?.({ block: 'nearest' });
  updateDemoFor(resolved);
}

function stepActive(delta: number): void {
  const all = visibleOptions();
  if (all.length === 0) return;
  const idx = activeBtn ? all.indexOf(activeBtn) : -1;
  const next = idx < 0 ? 0 : Math.max(0, Math.min(all.length - 1, idx + delta));
  setActive(all[next]);
}

function activateOption(btn: HTMLButtonElement): void {
  if (btn.dataset.structure) {
    btn.click();
    return;
  }
  // Do not bubble back up to `#composer`'s own keydown listener (which handles Enter from `#composer-input`).
  btn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: false, cancelable: true }));
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    closeComposer(true);
    return;
  }
  if (e.target !== input) return;
  const hasQuery = Boolean(input?.value);
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    stepActive(1);
    return;
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    stepActive(-1);
    return;
  }
  if (!hasQuery && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
    e.preventDefault();
    stepActive(e.key === 'ArrowRight' ? 1 : -1);
    return;
  }
  if (!hasQuery && (e.key === 'Home' || e.key === 'End')) {
    e.preventDefault();
    const all = visibleOptions();
    if (all.length > 0) setActive(e.key === 'Home' ? all[0] : all[all.length - 1]);
    return;
  }
  if (e.key === 'Enter') {
    const target = activeBtn && !activeBtn.hidden ? activeBtn : visibleOptions()[0];
    if (target) {
      e.preventDefault();
      activateOption(target);
    }
  }
}

function setButtonNamed(btn: HTMLButtonElement, named: string | undefined): void {
  if (named) btn.dataset.named = named;
  else delete btn.dataset.named;
  let note = btn.querySelector<HTMLElement>('.composer-note');
  if (named && !note) {
    note = document.createElement('small');
    note.className = 'composer-note';
    btn.querySelector('.composer-name')?.append(note);
  }
  if (note) {
    note.textContent = named ? `named ${named}` : '';
    if (!named) note.remove();
  }
}

function applyFilter(): void {
  if (!composer || !input) return;
  const raw = input.value.trim();
  const entries = standardButtons.map((b) => ({ id: b.dataset.stencilId ?? '', title: b.dataset.title ?? '' }));
  const hits = new Map(searchTray(raw, entries).map((m) => [m.id, m.named]));

  for (const btn of standardButtons) {
    const id = btn.dataset.stencilId ?? '';
    btn.hidden = !hits.has(id);
    setButtonNamed(btn, hits.get(id));
  }
  for (const group of composer.querySelectorAll<HTMLElement>('.composer-group:not(.composer-group--fallback)')) {
    group.hidden = !group.querySelector('.composer-item:not([hidden])');
  }

  const anyStandard = standardButtons.some((b) => !b.hidden);
  if (fallbackGroup && fallbackBtn && fallbackLabelEl && fallbackNoteEl) {
    if (!anyStandard && raw) {
      const customName = displayName(raw.replace(/\s+/g, ' '));
      fallbackGroup.hidden = false;
      fallbackBtn.hidden = false;
      fallbackBtn.dataset.stencilId = 'service';
      fallbackBtn.dataset.named = customName;
      fallbackBtn.setAttribute('aria-label', `Service, named ${customName}`);
      fallbackLabelEl.textContent = `Nothing matches “${raw}”. Press ↵ to add a service with that name.`;
      fallbackNoteEl.textContent = `named ${customName}`;
    } else {
      fallbackGroup.hidden = true;
      fallbackBtn.hidden = true;
      delete fallbackBtn.dataset.stencilId;
      delete fallbackBtn.dataset.named;
    }
  }

  const all = visibleOptions();
  setActive(all[0] ?? null);
}

function bindStencilBehaviour(btn: HTMLButtonElement, stencilId: string, title: string): void {
  attachStencilDragAndDrop(btn, stencilId, title, {
    onTap: (e) => {
      const named = btn.dataset.named;
      closeComposer();
      arm(stencilId, e.clientX, e.clientY, named);
    },
    onDrop: (e) => {
      const slot = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('.dock-fav');
      if (!slot) return false;
      const index = Array.from(document.querySelectorAll('.dock-fav')).indexOf(slot);
      if (index >= 0 && index < FAVOURITE_COUNT) setFavourite(index, stencilId);
      return true;
    },
    name: () => btn.dataset.named,
    onPlaced: () => closeComposer(true),
  });
}

function makeItem(item: Item): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'composer-item';
  btn.id = `composer-opt-${item.id}`;
  btn.setAttribute('role', 'option');
  btn.setAttribute('aria-selected', 'false');
  btn.tabIndex = -1;
  btn.dataset.stencilId = item.id;

  const cut = document.createElement('span');
  cut.className = 'cut';
  const name = document.createElement('span');
  name.className = 'composer-name';

  if (item.structure) {
    const { command, draw } = item.structure;
    const label = item.title ?? item.id;
    name.textContent = label;
    btn.dataset.title = label;
    btn.dataset.structure = item.id;
    btn.setAttribute('aria-label', label);
    cut.innerHTML = structureCutout(draw);
    btn.addEventListener('click', () => {
      closeComposer();
      disarm();
      findPaletteCommand(command)?.run();
    });
  } else {
    const stencil = findStencil(item.id);
    if (!stencil) return btn;
    name.textContent = stencil.paletteTitle;
    btn.dataset.title = stencil.paletteTitle;
    btn.setAttribute('aria-label', `${stencil.paletteTitle}: ${stencil.paletteSub}`);
    cut.style.setProperty('--t', TONE_CSS[stencil.accent][0]);
    cut.innerHTML = renderCutoutMarkup(stencil);
    bindStencilBehaviour(btn, stencil.id, stencil.paletteTitle);
  }

  btn.append(cut, name);
  return btn;
}

function buildFallbackGroup(): HTMLElement {
  const group = document.createElement('section');
  group.className = 'composer-group composer-group--fallback';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', 'Create service');
  group.hidden = true;

  const label = document.createElement('div');
  label.className = 'composer-group-label';
  label.setAttribute('aria-hidden', 'true');
  group.appendChild(label);

  const grid = document.createElement('div');
  grid.className = 'composer-grid';
  grid.setAttribute('role', 'presentation');

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'composer-item composer-item--fallback';
  btn.id = 'composer-opt-fallback';
  btn.setAttribute('role', 'option');
  btn.setAttribute('aria-selected', 'false');
  btn.tabIndex = -1;
  btn.hidden = true;
  btn.dataset.stencilId = 'service';
  btn.dataset.title = 'Service';

  const stencil = findStencil('service')!;
  const cut = document.createElement('span');
  cut.className = 'cut';
  cut.style.setProperty('--t', TONE_CSS[stencil.accent][0]);
  cut.innerHTML = renderCutoutMarkup(stencil);

  const name = document.createElement('span');
  name.className = 'composer-name';
  name.textContent = stencil.paletteTitle;
  const note = document.createElement('small');
  note.className = 'composer-note';
  name.appendChild(note);

  bindStencilBehaviour(btn, stencil.id, stencil.paletteTitle);
  btn.append(cut, name);
  grid.appendChild(btn);
  group.appendChild(grid);

  fallbackGroup = group;
  fallbackLabelEl = label;
  fallbackBtn = btn;
  fallbackNoteEl = note;
  return group;
}

function build(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'composer';
  el.id = 'composer';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Add or find');
  el.hidden = true;

  const inputRow = document.createElement('label');
  inputRow.className = 'composer-input-row';
  inputRow.innerHTML =
    '<svg class="composer-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>';

  input = document.createElement('input');
  input.id = 'composer-input';
  input.className = 'composer-input';
  input.type = 'text';
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-controls', 'composer-list');
  input.setAttribute('aria-label', 'Add or find');
  input.placeholder = 'Type what you run, or build a chain: gateway > orders api > postgres';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.addEventListener('input', applyFilter);
  inputRow.appendChild(input);
  el.appendChild(inputRow);

  const body = document.createElement('div');
  body.className = 'composer-body';
  listEl = document.createElement('div');
  listEl.className = 'composer-list';
  listEl.id = 'composer-list';
  listEl.setAttribute('role', 'listbox');
  listEl.setAttribute('aria-label', 'Components');

  standardButtons = [];
  for (const group of GROUPS) {
    const section = document.createElement('section');
    section.className = 'composer-group';
    section.setAttribute('role', 'group');
    section.setAttribute('aria-label', group.label);

    const heading = document.createElement('div');
    heading.className = 'composer-group-label';
    heading.setAttribute('aria-hidden', 'true');
    heading.textContent = group.label;
    section.appendChild(heading);

    const grid = document.createElement('div');
    grid.className = 'composer-grid';
    grid.setAttribute('role', 'presentation');
    for (const item of group.items) {
      const btn = makeItem(item);
      standardButtons.push(btn);
      grid.appendChild(btn);
    }
    section.appendChild(grid);
    listEl.appendChild(section);
  }
  listEl.appendChild(buildFallbackGroup());

  const side = document.createElement('div');
  side.className = 'composer-side';
  demo = createDemoPane();
  demoNamedEl = document.createElement('p');
  demoNamedEl.className = 'composer-demo-named';
  demoNamedEl.hidden = true;
  side.append(demo, demoNamedEl);

  body.append(listEl, side);
  el.appendChild(body);

  const foot = document.createElement('div');
  foot.className = 'composer-foot';
  foot.innerHTML =
    '<span><kbd>↵</kbd> Place on the map</span><span><kbd>&gt;</kbd> Wire to the next one</span><span><kbd>~&gt;</kbd> Without waiting</span><span class="composer-foot-esc"><kbd>esc</kbd> Close</span>';
  el.appendChild(foot);

  el.addEventListener('keydown', onKeydown);
  let lastPointerX = -1;
  let lastPointerY = -1;
  const follow = (e: PointerEvent) => {
    // Ignore synthetic hover events caused by keyboard scroll under a stationary cursor.
    if (e.clientX === lastPointerX && e.clientY === lastPointerY) return;
    lastPointerX = e.clientX;
    lastPointerY = e.clientY;
    const row = (e.target as HTMLElement).closest<HTMLButtonElement>('.composer-item');
    if (row && !row.hidden && row !== activeBtn) setActive(row);
  };
  listEl.addEventListener('pointermove', follow);
  listEl.addEventListener('focusin', (e) => {
    const row = (e.target as HTMLElement).closest<HTMLButtonElement>('.composer-item');
    if (row && !row.hidden && row !== activeBtn) setActive(row);
  });

  document.getElementById('slot-s')?.appendChild(el);
  viewport.addEventListener('pointerdown', () => closeComposer());
  new MutationObserver(() => {
    if (document.getElementById('workspace')?.dataset.mode !== 'design') closeComposer();
  }).observe(document.getElementById('workspace')!, { attributes: true, attributeFilter: ['data-mode'] });

  return el;
}

/** Open the unified composer popup (no-op outside Design mode or if already open). */
export function openComposer(opener_?: HTMLElement | null, _scope: ComposerScope = 'all'): void {
  composer ??= build();
  if (isOpen()) return;
  opener = opener_ ?? (document.activeElement as HTMLElement | null);
  disarm();
  composer.hidden = false;
  sync(true);
  applyFilter();
  input?.focus();
}

/** Toggle the unified composer popup from a trigger button or shortcut. */
export function toggleComposer(opener_?: HTMLElement | null, scope: ComposerScope = 'all'): void {
  if (isOpen()) closeComposer(true);
  else openComposer(opener_, scope);
}
