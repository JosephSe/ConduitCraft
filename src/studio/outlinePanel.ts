/**
 * The Text outline panel (F-28): the diagram as a tree of swimlanes, components, their outgoing wires and the
 * levels they open into. It is a second way to read and move around the canvas without sight or a pointer.
 *
 * Keys: Up/Down move, Home/End jump, Right opens a row (or steps into it), Left closes it (or steps out),
 * Enter selects the component or wire and pans to it, and on a level row Enter opens that level. Escape closes.
 * The tree is one tab stop (roving focus, reusing the idea in `rovingFocus.ts`).
 */
import { buildOutline, flattenOutline, zoneKeys, type OutlineItem, type OutlineRow } from '../core/outline';
import { announce } from './a11y';
import { app, fullDocument, goToLevel, panToNodeIfNeeded, setSelection } from './state';

const expanded = new Set<string>();
const knownZones = new Set<string>();
let focusKey: string | null = null;
let paintedKey = '';
let rows: OutlineRow[] = [];

const panel = () => document.getElementById('outline-panel');
const tree = () => document.getElementById('outline-tree');

export function isOutlineOpen(): boolean {
  const el = panel();
  return Boolean(el && !el.hidden);
}

/** Select what a row stands for and bring it into view; a level row opens that level instead. */
function activate(row: OutlineRow): void {
  const { item } = row;
  if (item.kind === 'zone') {
    toggle(row);
    return;
  }
  if (item.kind === 'level') {
    if (goToLevel(item.path)) announce(`Opened ${item.path.length} levels deep`, 'polite');
    return;
  }
  if (item.path.join('/') !== app.levelPath.join('/') && !goToLevel(item.path)) return;
  if (item.kind === 'component') {
    const node = app.doc.nodes.find((n) => n.id === item.targetId);
    if (!node) return;
    setSelection({ type: 'node', id: node.id });
    panToNodeIfNeeded(node);
    return;
  }
  const edge = app.doc.edges.find((e) => e.id === item.targetId);
  if (!edge) return;
  setSelection({ type: 'edge', id: edge.id });
  // A wire has no box of its own, so bring its source component into view.
  const from = app.doc.nodes.find((n) => n.id === edge.from);
  if (from) panToNodeIfNeeded(from);
}

function toggle(row: OutlineRow, open = !row.expanded): void {
  if (!row.expandable) return;
  if (open) expanded.add(row.item.key);
  else expanded.delete(row.item.key);
  focusKey = row.item.key;
  paint(true);
}

function focusRow(key: string): void {
  focusKey = key;
  const root = tree();
  if (!root) return;
  for (const el of root.querySelectorAll<HTMLElement>('[role="treeitem"]')) {
    const mine = el.dataset.key === key;
    el.tabIndex = mine ? 0 : -1;
    if (mine) el.focus();
  }
}

function onKeydown(e: KeyboardEvent): void {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[role="treeitem"]');
  if (!el || e.ctrlKey || e.metaKey || e.altKey) return;
  const index = rows.findIndex((r) => r.item.key === el.dataset.key);
  const row = rows[index];
  if (!row) return;
  const go = (target: OutlineRow | undefined) => {
    e.preventDefault();
    if (target) focusRow(target.item.key);
  };
  switch (e.key) {
    case 'ArrowDown':
      return go(rows[index + 1]);
    case 'ArrowUp':
      return go(rows[index - 1]);
    case 'Home':
      return go(rows[0]);
    case 'End':
      return go(rows[rows.length - 1]);
    case 'ArrowRight':
      e.preventDefault();
      if (row.expandable && !row.expanded) toggle(row, true);
      else if (row.expanded) focusRow(rows[index + 1].item.key);
      return;
    case 'ArrowLeft':
      e.preventDefault();
      if (row.expanded) toggle(row, false);
      else if (row.parentKey) focusRow(row.parentKey);
      return;
    case 'Enter':
    case ' ':
      e.preventDefault();
      activate(row);
      return;
    case 'Escape':
      e.preventDefault();
      e.stopPropagation();
      setOutlineOpen(false);
  }
}

function paint(force = false): void {
  const root = tree();
  if (!root || !isOutlineOpen()) return;
  const items = buildOutline(fullDocument(), app.levelPath);
  // Swimlanes start open; later toggles are the reader's choice.
  for (const key of zoneKeys(items)) {
    if (!knownZones.has(key)) {
      knownZones.add(key);
      expanded.add(key);
    }
  }
  rows = flattenOutline(items, expanded);
  if (!rows.some((r) => r.item.key === focusKey)) focusKey = rows[0]?.item.key ?? null;
  const key = JSON.stringify([rows.map((r) => [r.item.key, r.item.label, r.expanded, isSelected(r.item)]), focusKey]);
  if (key === paintedKey && !force) return;
  paintedKey = key;

  const hadFocus = root.contains(document.activeElement);
  root.replaceChildren();
  if (rows.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'outline-empty';
    empty.textContent = 'Nothing to list yet. Add a component to see it here.';
    root.appendChild(empty);
    return;
  }
  for (const row of rows) root.appendChild(rowElement(row));
  if (hadFocus && focusKey) focusRow(focusKey);
}

function rowElement(row: OutlineRow): HTMLElement {
  const { item } = row;
  const el = document.createElement('div');
  el.className = 'outline-row';
  el.setAttribute('role', 'treeitem');
  el.dataset.key = item.key;
  el.dataset.kind = item.kind;
  el.setAttribute('aria-level', String(row.depth));
  el.setAttribute('aria-posinset', String(row.posInSet));
  el.setAttribute('aria-setsize', String(row.setSize));
  if (row.expandable) el.setAttribute('aria-expanded', String(row.expanded));
  el.tabIndex = item.key === focusKey ? 0 : -1;
  el.style.paddingInlineStart = `${0.4 + (row.depth - 1) * 0.9}rem`;
  const selected = item.kind !== 'zone' && item.kind !== 'level' && isSelected(item);
  el.setAttribute('aria-selected', String(selected));

  const twisty = document.createElement('span');
  twisty.className = 'outline-twisty';
  twisty.setAttribute('aria-hidden', 'true');
  twisty.textContent = row.expandable ? (row.expanded ? '▾' : '▸') : '';
  const label = document.createElement('span');
  label.className = 'outline-label';
  label.textContent = item.label;
  el.append(twisty, label);

  el.addEventListener('click', (e) => {
    focusKey = item.key;
    if (row.expandable && (e.target as HTMLElement).closest('.outline-twisty')) toggle(row);
    else activate(row);
  });
  return el;
}

function isSelected(item: OutlineItem): boolean {
  if (item.path.join('/') !== app.levelPath.join('/')) return false;
  const sel = app.selection;
  return (sel.type === 'node' && item.kind === 'component' && sel.id === item.targetId) ||
    (sel.type === 'edge' && item.kind === 'wire' && sel.id === item.targetId);
}

/** Called after every render. Cheap while the panel is closed. */
export function paintOutline(): void {
  paint();
}

export function setOutlineOpen(open: boolean): void {
  const el = panel();
  if (!el) return;
  el.hidden = !open;
  document.getElementById('btn-overflow-outline')?.setAttribute('aria-checked', String(open));
  if (open) {
    paint(true);
    if (focusKey) focusRow(focusKey);
  } else if (el.contains(document.activeElement)) {
    document.getElementById('canvas-viewport')?.focus();
  }
}

export function toggleOutline(): void {
  setOutlineOpen(!isOutlineOpen());
}

export function initOutlinePanel(): void {
  tree()?.addEventListener('keydown', onKeydown);
  document.getElementById('outline-close')?.addEventListener('click', () => setOutlineOpen(false));
  document.getElementById('btn-overflow-outline')?.addEventListener('click', toggleOutline);
}
