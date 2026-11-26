/**
 * SW always-visible Key (DK4): lists the tones used on the current page in layout order, dims non-matching wires on
 * hover or focus (`#stage-world[data-key="<tone>"]`), supports one-undo-step inline renaming, and collapses to `#btn-legend-key`.
 */
import { collectMapKeyRows, updateLegendLabel } from '../core/mapKey';
import { MAX_LEGEND_LABEL } from '../core/meta';
import { TONE_META } from '../shared/tones';
import type { StreamTone } from '../types';
import '../styles/mapKey.css';
import { stageWorld } from './dom';
import { renderAll } from './render';
import { app, pushHistory } from './state';

const SHOW_LEGEND_KEY = 'conduitcraft:show-legend';
const KEY_COLLAPSED_KEY = 'conduitcraft:key-collapsed';

let controlsBound = false;
let narrowSessionOpen: boolean | null = null;
let hoveredTone: StreamTone | null = null;
let focusedTone: StreamTone | null = null;
let editingTone: StreamTone | null = null;

function narrowMedia(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  return window.matchMedia('(max-width: 900px), (max-height: 640px)');
}

function legendCardWanted(): boolean {
  try {
    return localStorage.getItem(SHOW_LEGEND_KEY) !== 'false';
  } catch {
    return true;
  }
}

function isKeyCollapsed(): boolean {
  if (narrowMedia()?.matches) {
    return narrowSessionOpen !== null ? !narrowSessionOpen : true;
  }
  try {
    return localStorage.getItem(KEY_COLLAPSED_KEY) === 'true';
  } catch {
    return false;
  }
}

function setKeyCollapsed(collapsed: boolean, moveFocus = false): void {
  if (narrowMedia()?.matches) {
    narrowSessionOpen = !collapsed;
  } else {
    narrowSessionOpen = null;
    try {
      if (collapsed) localStorage.setItem(KEY_COLLAPSED_KEY, 'true');
      else localStorage.removeItem(KEY_COLLAPSED_KEY);
    } catch {
      // Storage unavailable: the collapse state lasts for this session.
    }
  }
  if (collapsed) {
    hoveredTone = null;
    focusedTone = null;
  }
  syncMapKey();
  if (!moveFocus) return;
  const target = collapsed ? document.getElementById('btn-legend-key') : document.getElementById('btn-key-collapse');
  target?.focus();
}

function applyKeyFilter(): void {
  const card = document.getElementById('legend-card');
  const active = card && !card.hidden ? (hoveredTone ?? focusedTone) : null;
  if (active) stageWorld.dataset.key = active;
  else delete stageWorld.dataset.key;
}

function makeSwatch(tone: StreamTone, dashed: boolean): HTMLSpanElement {
  const swatch = document.createElement('span');
  swatch.className = dashed ? 'map-key-swatch is-dashed' : 'map-key-swatch';
  swatch.style.setProperty('--t', TONE_META[tone].cssVar);
  swatch.setAttribute('aria-hidden', 'true');
  return swatch;
}

function startInlineRename(li: HTMLLIElement, tone: StreamTone, dashed: boolean, currentLabel: string): void {
  const prevCustom = app.doc.legend?.find((entry) => entry.tone === tone)?.label ?? '';
  editingTone = tone;
  const editWrap = document.createElement('div');
  editWrap.className = 'map-key-edit';
  const swatch = makeSwatch(tone, dashed);
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'map-key-input';
  input.maxLength = MAX_LEGEND_LABEL;
  input.value = currentLabel;
  input.placeholder = TONE_META[tone].shortLabel;
  input.setAttribute('aria-label', `Rename ${TONE_META[tone].shortLabel} line`);
  editWrap.append(swatch, input);
  li.replaceChildren(editWrap);
  input.focus();
  input.select();

  let settled = false;
  const finish = (commit: boolean, refocusRow: boolean) => {
    if (settled) return;
    settled = true;
    editingTone = null;
    const trimmed = input.value.trim().slice(0, MAX_LEGEND_LABEL);
    const sameAsDefault = !prevCustom && trimmed === TONE_META[tone].shortLabel;
    if (commit && trimmed !== prevCustom && !sameAsDefault) {
      pushHistory();
      const next = updateLegendLabel(app.doc.legend, tone, trimmed);
      app.doc.legend = next;
      if (app.levelRoot) app.levelRoot.legend = next ? structuredClone(next) : undefined;
      if (app.pageRoot) app.pageRoot.legend = next ? structuredClone(next) : undefined;
      renderAll(true);
    } else {
      syncMapKey();
    }
    if (refocusRow) {
      document.querySelector<HTMLElement>(`#legend-card-list .map-key-row[data-tone="${tone}"]`)?.focus();
    }
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      finish(true, true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      finish(false, true);
    }
  });
  input.addEventListener('blur', () => finish(true, false));
}

/** Attach hover/focus/rename handlers on the Key card and collapse/expand buttons once. */
export function initMapKeyControls(): void {
  if (controlsBound) return;
  const list = document.getElementById('legend-card-list');
  const collapseBtn = document.getElementById('btn-key-collapse');
  const expandBtn = document.getElementById('btn-legend-key');
  if (!list || !collapseBtn || !expandBtn) return;
  controlsBound = true;

  collapseBtn.addEventListener('click', () => setKeyCollapsed(true, true));
  expandBtn.addEventListener('click', () => setKeyCollapsed(false, true));

  const mq = narrowMedia();
  mq?.addEventListener('change', () => {
    if (!mq.matches) narrowSessionOpen = null;
    syncMapKey();
  });

  list.addEventListener('pointerover', (e) => {
    const row = (e.target as Element | null)?.closest<HTMLElement>('.map-key-row[data-tone]');
    const tone = (row?.dataset.tone as StreamTone | undefined) ?? null;
    if (tone === hoveredTone) return;
    hoveredTone = tone;
    applyKeyFilter();
  });
  list.addEventListener('pointerleave', () => {
    if (!hoveredTone) return;
    hoveredTone = null;
    applyKeyFilter();
  });

  list.addEventListener('focusin', (e) => {
    const row = (e.target as Element | null)?.closest<HTMLElement>('.map-key-row[data-tone]');
    focusedTone = (row?.dataset.tone as StreamTone | undefined) ?? null;
    applyKeyFilter();
  });
  list.addEventListener('focusout', (e) => {
    const related = (e as FocusEvent).relatedTarget as Node | null;
    if (related && list.contains(related)) return;
    focusedTone = null;
    applyKeyFilter();
  });

  list.addEventListener('click', (e) => {
    const row = (e.target as Element | null)?.closest<HTMLButtonElement>('button.map-key-row[data-tone]');
    const li = row?.closest('li');
    const tone = row?.dataset.tone as StreamTone | undefined;
    if (!row || !li || !tone) return;
    const label = row.querySelector('.map-key-label')?.textContent ?? TONE_META[tone].shortLabel;
    const dashed = row.querySelector('.map-key-swatch')?.classList.contains('is-dashed') ?? false;
    startInlineRename(li, tone, dashed, label);
  });
}

/** Sync SW Key visibility, layout-ordered rows, and active filter state. */
export function syncMapKey(): void {
  initMapKeyControls();
  const card = document.getElementById('legend-card');
  const list = document.getElementById('legend-card-list');
  const keyBtn = document.getElementById('btn-legend-key');
  const collapseBtn = document.getElementById('btn-key-collapse');
  if (!card || !list || !keyBtn || !collapseBtn) return;

  // Do not rebuild DOM while an inline rename input is active.
  if (editingTone !== null && list.querySelector('.map-key-input')) {
    return;
  }
  editingTone = null;

  const wanted = legendCardWanted();
  if (!wanted) {
    card.hidden = true;
    keyBtn.hidden = true;
    keyBtn.setAttribute('aria-expanded', 'false');
    collapseBtn.setAttribute('aria-expanded', 'false');
    hoveredTone = null;
    focusedTone = null;
    applyKeyFilter();
    return;
  }

  const collapsed = isKeyCollapsed();
  card.hidden = collapsed;
  keyBtn.hidden = !collapsed;
  keyBtn.setAttribute('aria-expanded', String(!collapsed));
  collapseBtn.setAttribute('aria-expanded', String(!collapsed));
  if (collapsed) {
    hoveredTone = null;
    focusedTone = null;
  }

  const rows = collectMapKeyRows(app.doc, app.colourBy);
  list.replaceChildren();
  if (rows.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'map-key-empty';
    empty.textContent = 'Lines you draw will be listed here.';
    list.appendChild(empty);
  } else {
    for (const row of rows) {
      const li = document.createElement('li');
      const label = document.createElement('span');
      label.className = 'map-key-label';
      label.textContent = row.label;
      if (row.filterable && row.editable) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'map-key-row';
        btn.dataset.tone = row.tone;
        btn.title = row.description || 'Click to rename';
        btn.append(makeSwatch(row.tone, row.dashed), label);
        li.appendChild(btn);
      } else {
        li.className = 'map-key-row is-static';
        li.append(makeSwatch(row.tone, row.dashed), label);
      }
      list.appendChild(li);
    }
  }

  const activeTones = new Set(rows.filter((r) => r.filterable).map((r) => r.tone));
  if (hoveredTone && !activeTones.has(hoveredTone)) hoveredTone = null;
  if (focusedTone && !activeTones.has(focusedTone)) focusedTone = null;
  applyKeyFilter();
}

/** The "Show colour legend on the canvas" preference in Settings. */
export function bindLegendPreference(): void {
  initMapKeyControls();
  const box = document.getElementById('chk-show-legend') as HTMLInputElement | null;
  if (!box) return;
  box.checked = legendCardWanted();
  box.addEventListener('change', () => {
    try {
      localStorage.setItem(SHOW_LEGEND_KEY, String(box.checked));
    } catch {
      // Storage unavailable: the preference lasts until reload.
    }
    syncMapKey();
  });
}
