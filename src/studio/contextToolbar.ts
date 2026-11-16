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
import { createUiIconSvg, type UiIconName } from '../ui/icons';
import { placeTooltip } from './tooltips';


const SHORT_LABEL: Record<string, string> = {
  'edit-rename': 'Rename',
  'edit-duplicate': 'Duplicate',
  'edit-lock': 'Lock',
  'edit-group-frame': 'Frame',
  'edit-group': 'Group',
  'edit-ungroup': 'Ungroup',
  'edit-delete': 'Delete',
  'wire-from-selection': 'Wire',
  'auto-layout-selection': 'Arrange',
};

const ICON: Record<string, UiIconName> = {
  'edit-rename': 'pencil',
  'edit-duplicate': 'copy',
  'edit-lock': 'lock',
  'edit-group-frame': 'frame',
  'edit-group': 'group',
  'edit-ungroup': 'ungroup',
  'edit-delete': 'trash',
  'wire-from-selection': 'connect',
  'auto-layout-selection': 'layout',
};

/** An icon button: the name is its accessible name and its tooltip. */
function iconButton(label: string, icon: UiIconName): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'context-toolbar-btn';
  button.setAttribute('aria-label', label);
  button.dataset.tip = label;
  button.dataset.tipPos = 'top';
  button.appendChild(createUiIconSvg(icon, 16));
  return button;
}

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
    case 'frame':
      out.push(q(`.frame-box[data-frame-id="${CSS.escape(sel.id)}"] .frame-title-bar`));
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

/** Close an open Colour, Kind or Shape menu, if its code has been loaded. */
function closePicker(): void {
  if (document.querySelector('.appearance-popover')) void import('./appearancePickers').then((m) => m.closeAppearancePopover());
}

function selectionHasNodes(): boolean {
  const sel = app.selection;
  return sel.type === 'node' || (sel.type === 'multi' && sel.ids.length > 0);
}

function rebuild(host: HTMLElement, ids: string[], withPickers: boolean): void {
  closePicker();
  host.replaceChildren();
  for (const id of ids) {
    const button = iconButton(SHORT_LABEL[id] ?? id, ICON[id] ?? 'more');
    button.dataset.action = id;
    button.addEventListener('click', () => findPaletteCommand(id)?.run());
    host.appendChild(button);
  }
  if (withPickers) {
    for (const [which, label] of [
      ['colour', 'Colour'],
      ['kind', 'Kind'],
      ['shape', 'Shape'],
    ] as const) {
      const button = iconButton(label, which === 'colour' ? 'colour' : which === 'kind' ? 'kind' : 'shape');
      button.dataset.picker = which;
      button.setAttribute('aria-haspopup', 'menu');
      button.setAttribute('aria-expanded', 'false');
      // The menus and their code load the first time one is opened.
      button.addEventListener('click', () => {
        void import('./appearancePickers').then((m) => m.openAppearancePicker(button, which));
      });
      host.appendChild(button);
    }
  }
  const more = iconButton('More actions', 'more');
  more.setAttribute('aria-haspopup', 'menu');
  more.addEventListener('click', () => {
    const r = more.getBoundingClientRect();
    openContextMenu(r.left, r.bottom + 4);
  });
  host.appendChild(more);
}

function update(): void {
  const host = ensureBar();
  const editing = document.querySelector('.inline-edit-input') !== null;
  if (app.workspaceMode !== 'design' || pointerDown || editing || app.selection.type === 'none') {
    host.hidden = true;
    closePicker();
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

  const withPickers = selectionHasNodes();
  const key = `${app.selection.type}|${ids.join(',')}|${withPickers}`;
  if (key !== builtFor) {
    rebuild(host, ids, withPickers);
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
