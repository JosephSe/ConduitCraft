/**
 * The component tray (7.3), shelf half: opens above the dock with `C` or "All components". It is not modal; the sheet
 * stays live behind it. Six groups by role, each a quiet label and a list of cut-out plus name. Arrow keys move through
 * the shelf as one grid; Enter places the highlighted component at the centre of the view and closes the tray; a click
 * carries it to the sheet (as a dock favourite does); a drag takes it there, or onto a dock slot to replace it. Esc or a
 * press on the sheet closes it. The search box on top matches names and the words people type for what they run
 * (`kafka`, `redis`), and a match by word names the new component. This file loads the first time the tray opens.
 */
import { nearestInDirection, type Direction } from '../core/spatial';
import { TONE_CSS } from '../shared/tones';
import { findStencil } from '../templates/presets';
import { renderCutoutMarkup, CUTOUT_HEIGHT, CUTOUT_WIDTH } from '../ui/cutout';
import { arm, disarm, setFavourite } from './dock';
import { FAVOURITE_COUNT } from './dockFavourites';
import { viewport } from './dom';
import { attachStencilDragAndDrop } from './interactions';
import { findPaletteCommand } from './palette';
import { searchTray } from './trayWords';

/** A stencil id, or one of the four structure items. */
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

let tray: HTMLElement | null = null;
let search: HTMLInputElement | null = null;
let opener: HTMLElement | null = null;

const isOpen = (): boolean => !!tray && !tray.hidden;
const items = (): HTMLButtonElement[] =>
  tray ? Array.from(tray.querySelectorAll<HTMLButtonElement>('.tray-item')).filter((b) => !b.hidden) : [];

function structureCutout(draw: string): string {
  return `<svg class="cutout" viewBox="0 0 ${CUTOUT_WIDTH} ${CUTOUT_HEIGHT}" width="${CUTOUT_WIDTH}" height="${CUTOUT_HEIGHT}" fill="none" stroke="var(--cc-ink-3)" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${draw}</svg>`;
}

function sync(open: boolean): void {
  document.getElementById('workspace')?.toggleAttribute('data-tray', open);
  document.getElementById('btn-all-components')?.setAttribute('aria-expanded', String(open));
}

export function closeTray(returnFocus = false): void {
  if (!isOpen()) return;
  tray!.hidden = true;
  if (search && search.value) {
    search.value = '';
    applyFilter();
  }
  sync(false);
  if (returnFocus) (opener ?? document.getElementById('btn-all-components'))?.focus();
}

function focusItem(btn: HTMLButtonElement | undefined): void {
  if (!btn) return;
  for (const b of items()) b.tabIndex = b === btn ? 0 : -1;
  btn.focus();
}

function onKeydown(e: KeyboardEvent): void {
  const dir: Direction | undefined = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }[e.key] as Direction | undefined;
  const all = items();
  const current = document.activeElement as HTMLButtonElement | null;
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    closeTray(true);
    return;
  }
  if (e.key === 'Home' || e.key === 'End') {
    e.preventDefault();
    focusItem(e.key === 'Home' ? all[0] : all[all.length - 1]);
    return;
  }
  if (current === search) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusItem(all[0]);
    } else if (e.key === 'Enter' && search?.value.trim() && all[0]) {
      // Place the first match: type `kafka`, press Enter.
      e.preventDefault();
      placeFromKeyboard(all[0]);
    }
    return;
  }
  if (!dir || !current || !all.includes(current)) return;
  e.preventDefault();
  const point = (b: HTMLButtonElement, i: number) => {
    const r = b.getBoundingClientRect();
    return { id: String(i), x: r.x + r.width / 2, y: r.y + r.height / 2 };
  };
  const from = point(current, all.indexOf(current));
  const next = nearestInDirection(from, all.map(point), dir);
  if (next !== null) focusItem(all[Number(next)]);
  else if (dir === 'up') search?.focus();
}

function placeFromKeyboard(btn: HTMLButtonElement): void {
  btn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
}

/** Show the items that match, the groups that still have one, and "named X" under a match by word. */
function applyFilter(): void {
  if (!tray || !search) return;
  const buttons = Array.from(tray.querySelectorAll<HTMLButtonElement>('.tray-item'));
  const entries = buttons.map((b) => ({ id: b.dataset.stencilId ?? '', title: b.dataset.title ?? '' }));
  const hits = new Map(searchTray(search.value, entries).map((m) => [m.id, m.named]));
  for (const b of buttons) {
    const id = b.dataset.stencilId ?? '';
    b.hidden = !hits.has(id);
    const named = hits.get(id);
    if (named) b.dataset.named = named;
    else delete b.dataset.named;
    let note = b.querySelector('.tray-note');
    if (named && !note) {
      note = document.createElement('span');
      note.className = 'tray-note';
      b.querySelector('.tray-name')?.append(note);
    }
    if (note) {
      note.textContent = named ? `named ${named}` : '';
      if (!named) note.remove();
    }
  }
  for (const group of tray.querySelectorAll<HTMLElement>('.tray-group')) group.hidden = !group.querySelector('.tray-item:not([hidden])');
  const empty = tray.querySelector<HTMLElement>('.tray-empty');
  if (empty) empty.hidden = buttons.some((b) => !b.hidden);
  for (const b of buttons) b.tabIndex = -1;
  const first = items()[0];
  if (first) first.tabIndex = 0;
}

function build(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'tray';
  el.id = 'tray';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'All components');
  el.hidden = true;
  search = document.createElement('input');
  search.type = 'search';
  search.className = 'field tray-search';
  search.placeholder = 'Search, or type what you run: redis, kafka, nginx';
  search.setAttribute('aria-label', 'Search components');
  search.autocomplete = 'off';
  search.spellcheck = false;
  search.addEventListener('input', applyFilter);
  el.appendChild(search);
  const empty = document.createElement('p');
  empty.className = 'tray-empty';
  empty.setAttribute('role', 'status');
  empty.textContent = 'Nothing matches. Try the name of what you run, like redis or nginx.';
  empty.hidden = true;
  el.appendChild(empty);
  for (const group of GROUPS) {
    const section = document.createElement('section');
    section.className = 'tray-group';
    const heading = document.createElement('h2');
    heading.className = 'tray-label';
    heading.textContent = group.label;
    section.appendChild(heading);
    const list = document.createElement('div');
    list.className = 'tray-list';
    list.setAttribute('role', 'group');
    list.setAttribute('aria-label', group.label);
    for (const item of group.items) list.appendChild(makeItem(item));
    section.appendChild(list);
    el.appendChild(section);
  }
  el.addEventListener('keydown', onKeydown);
  document.getElementById('slot-s')?.appendChild(el);
  // A press on the sheet puts the tray away; it is not modal.
  viewport.addEventListener('pointerdown', () => closeTray());
  // Leaving Design takes the dock away, and the tray with it.
  new MutationObserver(() => {
    if (document.getElementById('workspace')?.dataset.mode !== 'design') closeTray();
  }).observe(document.getElementById('workspace')!, { attributes: true, attributeFilter: ['data-mode'] });
  return el;
}

function makeItem(item: Item): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'tray-item';
  btn.tabIndex = -1;
  btn.dataset.stencilId = item.id;
  const cut = document.createElement('span');
  cut.className = 'cut';
  const name = document.createElement('span');
  name.className = 'tray-name';

  if (item.structure) {
    const { command, draw } = item.structure;
    name.textContent = item.title ?? item.id;
    btn.dataset.title = name.textContent;
    cut.innerHTML = structureCutout(draw);
    btn.dataset.structure = item.id;
    btn.setAttribute('aria-label', name.textContent);
    // These are not components: each runs its own action, then the tray goes away.
    btn.addEventListener('click', () => {
      closeTray();
      disarm();
      findPaletteCommand(command)?.run();
    });
  } else {
    const stencil = findStencil(item.id);
    if (!stencil) return btn;
    name.textContent = stencil.paletteTitle;
    btn.dataset.title = stencil.paletteTitle;
    btn.setAttribute('aria-label', `${stencil.paletteTitle}: ${stencil.paletteSub}`);
    btn.setAttribute('data-tip', stencil.paletteSub);
    btn.setAttribute('data-tip-pos', 'top');
    cut.style.setProperty('--t', TONE_CSS[stencil.accent][0]);
    cut.innerHTML = renderCutoutMarkup(stencil);
    attachStencilDragAndDrop(btn, stencil.id, stencil.paletteTitle, {
      // A click carries it to the sheet, with the tray out of the way.
      onTap: (e) => {
        const named = btn.dataset.named;
        closeTray();
        arm(stencil.id, e.clientX, e.clientY, named);
      },
      // Dropped on a dock slot, it replaces that favourite instead of going on the sheet.
      onDrop: (e) => {
        const slot = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('.dock-fav');
        if (!slot) return false;
        const index = Array.from(document.querySelectorAll('.dock-fav')).indexOf(slot);
        if (index >= 0 && index < FAVOURITE_COUNT) setFavourite(index, stencil.id);
        return true;
      },
      // A match by word names the new component: kafka gives a Stream called Kafka.
      name: () => btn.dataset.named,
      // Placed by drag or Enter: the tray has done its job.
      onPlaced: () => closeTray(true),
    });
  }
  btn.append(cut, name);
  return btn;
}

export function openTray(opener_?: HTMLElement | null): void {
  tray ??= build();
  if (isOpen()) return;
  opener = opener_ ?? (document.activeElement as HTMLElement | null);
  disarm();
  tray.hidden = false;
  sync(true);
  search?.focus();
}

export function toggleTray(opener_?: HTMLElement | null): void {
  if (isOpen()) closeTray(true);
  else openTray(opener_);
}
