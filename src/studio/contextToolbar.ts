/**
 * Contextual toolbar (redesigned interface): a few buttons floating next to the selection, with "More" opening the
 * full context menu. Buttons are palette actions, so it adds no behaviour of its own.
 */
import { buildActionContext, isActionAvailable } from '../core/actions';
import { contextToolbarCommandIds } from '../core/contextMenuItems';
import type { SelectionTarget } from '../types';
import { viewport } from './dom';
import { openContextMenu } from './contextMenu';
import { findPaletteCommand } from './palette';
import { app, onSelectionChange } from './state';
import { placeTooltip } from './tooltips';

const SHORT_LABEL: Record<string, string> = {
  'edit-rename': 'Rename',
  'edit-duplicate': 'Duplicate',
  'edit-lock': 'Lock',
  'edit-group': 'Group',
  'edit-ungroup': 'Ungroup',
  'edit-delete': 'Delete',
  'wire-from-selection': 'Wire',
  'auto-layout-selection': 'Arrange',
};

let bar: HTMLElement | null = null;
let builtFor = '';
let queued = false;
let pointerDown = false;

/** Elements on the canvas that make up the current selection. */
function selectedElements(sel: SelectionTarget): Element[] {
  const q = (selector: string) => document.querySelector(selector);
  const out: Array<Element | null> = [];
  switch (sel.type) {
    case 'node':
      out.push(q(`.arch-node[data-node-id="${CSS.escape(sel.id)}"]`));
      break;
    case 'edge':
      out.push(q(`.conduit-group[data-edge-id="${CSS.escape(sel.id)}"]`));
      break;
    case 'zone':
      out.push(q(`.zone-banner[data-zone-id="${CSS.escape(sel.id)}"]`));
      break;
    case 'notes':
      out.push(q(`.blueprint-spec[data-notes-id="${CSS.escape(sel.id)}"]`));
      break;
    case 'multi':
      for (const id of sel.ids) out.push(q(`.arch-node[data-node-id="${CSS.escape(id)}"]`));
      for (const id of sel.zoneIds ?? []) out.push(q(`.zone-banner[data-zone-id="${CSS.escape(id)}"]`));
      for (const id of sel.notesIds ?? []) out.push(q(`.blueprint-spec[data-notes-id="${CSS.escape(id)}"]`));
      break;
  }
  return out.filter((el): el is Element => el !== null);
}

function ensureBar(): HTMLElement {
  if (!bar) {
    bar = document.createElement('div');
    bar.className = 'context-toolbar';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'Selection actions');
    bar.hidden = true;
    document.body.appendChild(bar);
  }
  return bar;
}

function rebuild(host: HTMLElement, ids: string[]): void {
  host.replaceChildren();
  for (const id of ids) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'context-toolbar-btn';
    button.dataset.action = id;
    button.textContent = SHORT_LABEL[id] ?? id;
    button.addEventListener('click', () => findPaletteCommand(id)?.run());
    host.appendChild(button);
  }
  const more = document.createElement('button');
  more.type = 'button';
  more.className = 'context-toolbar-btn';
  more.textContent = '⋯';
  more.setAttribute('aria-label', 'More actions');
  more.setAttribute('aria-haspopup', 'menu');
  more.addEventListener('click', () => {
    const r = more.getBoundingClientRect();
    openContextMenu(r.left, r.bottom + 4);
  });
  host.appendChild(more);
}

function update(): void {
  const host = ensureBar();
  const isV2 = document.documentElement.dataset.ui === '2';
  const editing = document.querySelector('.inline-edit-input') !== null;
  if (!isV2 || app.workspaceMode !== 'design' || pointerDown || editing || app.selection.type === 'none') {
    host.hidden = true;
    return;
  }
  const ctx = buildActionContext(app.selection, app.doc, app.workspaceMode);
  const ids = contextToolbarCommandIds(ctx.selection, { grouped: ctx.grouped }).filter((id) =>
    isActionAvailable(id, ctx),
  );
  const elements = selectedElements(app.selection);
  if (ids.length === 0 || elements.length === 0) {
    host.hidden = true;
    return;
  }

  const key = `${app.selection.type}|${ids.join(',')}`;
  if (key !== builtFor) {
    rebuild(host, ids);
    builtFor = key;
  }

  let l = Infinity;
  let t = Infinity;
  let r = -Infinity;
  let b = -Infinity;
  for (const el of elements) {
    const rect = el.getBoundingClientRect();
    l = Math.min(l, rect.left);
    t = Math.min(t, rect.top);
    r = Math.max(r, rect.right);
    b = Math.max(b, rect.bottom);
  }
  const canvas = viewport.getBoundingClientRect();
  // Selection scrolled out of view: nothing sensible to attach to.
  if (r < canvas.left || l > canvas.right || b < canvas.top || t > canvas.bottom) {
    host.hidden = true;
    return;
  }
  host.hidden = false;
  const size = { width: host.offsetWidth, height: host.offsetHeight };
  const spot = placeTooltip(
    { x: l, y: t, width: r - l, height: b - t },
    size,
    { width: window.innerWidth, height: window.innerHeight },
    'top',
    8,
  );
  host.style.left = `${spot.x}px`;
  host.style.top = `${spot.y}px`;
}

function schedule(): void {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    update();
  });
}

export function initContextToolbar(): void {
  onSelectionChange(schedule);
  // Follow pans, zooms and moves, which all change style on the stage or its layers.
  const stage = document.getElementById('stage-world');
  if (stage) {
    new MutationObserver(schedule).observe(stage, {
      attributes: true,
      attributeFilter: ['style'],
      subtree: true,
    });
  }
  window.addEventListener('resize', schedule);
  // Stay out of the way of a drag, then return when the pointer is released.
  viewport.addEventListener('pointerdown', () => {
    pointerDown = true;
    schedule();
  });
  window.addEventListener('pointerup', () => {
    if (!pointerDown) return;
    pointerDown = false;
    schedule();
  });
  window.addEventListener('pointercancel', () => {
    pointerDown = false;
    schedule();
  });
  // Rename editor open/close.
  document.addEventListener('focusout', schedule);
  document.addEventListener('focusin', schedule);
}
