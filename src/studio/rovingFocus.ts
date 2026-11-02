/**
 * Roving tabindex for the canvas: the diagram is one tab stop, not ~100.
 * Arrow keys move focus to the nearest component in that direction; Tab then walks the focused component's
 * wires; Escape hands focus back to the canvas container. Alt+Arrow nudges the focused component (what a bare
 * Arrow used to do on the drag handle).
 */
import { nearestInDirection, type Direction, type Point } from '../core/spatial';
import { announce } from './a11y';
import { app, onSelectionChange } from './state';
import { nodesLayer, viewport, wiresGroup } from './dom';

const KEY_TO_DIRECTION: Record<string, Direction> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
};

let rovingId: string | null = null;

function nodeWrappers(): HTMLElement[] {
  return Array.from(nodesLayer.querySelectorAll<HTMLElement>('.arch-node'));
}

function activeNodeId(wrappers: HTMLElement[]): string | null {
  if (rovingId && wrappers.some((w) => w.dataset.nodeId === rovingId)) return rovingId;
  const sel = app.selection;
  if (sel.type === 'node' && wrappers.some((w) => w.dataset.nodeId === sel.id)) return sel.id;
  return wrappers[0]?.dataset.nodeId ?? null;
}

/** Idempotent: re-run after any render. Exactly one component is a tab stop, plus the wires attached to it. */
export function syncRovingTabindex(): void {
  const wrappers = nodeWrappers();
  const active = activeNodeId(wrappers);
  for (const w of wrappers) {
    const isActive = w.dataset.nodeId === active;
    w.querySelector<HTMLElement>('.node-select-hit')?.setAttribute('tabindex', isActive ? '0' : '-1');
    w.querySelector<HTMLElement>('.node-drag-handle')?.setAttribute('tabindex', '-1');
    for (const port of w.querySelectorAll<HTMLElement>('.node-port')) port.setAttribute('tabindex', '-1');
  }
  for (const g of wiresGroup.querySelectorAll<SVGGElement>('.conduit-group')) {
    const attached = active !== null && (g.dataset.from === active || g.dataset.to === active);
    g.setAttribute('tabindex', attached ? '0' : '-1');
  }
}

function describePosition(id: string, wrappers: HTMLElement[]): string {
  const node = app.doc.nodes.find((n) => n.id === id);
  const index = Math.max(0, wrappers.findIndex((w) => w.dataset.nodeId === id)) + 1;
  const out = app.doc.edges.filter((e) => e.from === id).length;
  const wires = `${out} outgoing ${out === 1 ? 'wire' : 'wires'}`;
  return `${node?.title || id}, ${node?.kind || 'component'}, ${index} of ${wrappers.length}, ${wires}`;
}

function focusNode(id: string, wrappers: HTMLElement[]): void {
  rovingId = id;
  syncRovingTabindex();
  wrappers.find((w) => w.dataset.nodeId === id)?.querySelector<HTMLElement>('.node-select-hit')?.focus();
  announce(describePosition(id, wrappers), 'polite');
}

function onNodeKeydown(e: KeyboardEvent): void {
  const target = e.target as HTMLElement | null;
  const hit = target?.closest<HTMLElement>('.node-select-hit');
  if (!hit || target !== hit) return;
  const wrapper = hit.closest<HTMLElement>('.arch-node');
  const id = wrapper?.dataset.nodeId;
  if (!wrapper || !id) return;

  if (e.key === 'Escape') {
    viewport.focus();
    return;
  }
  const dir = KEY_TO_DIRECTION[e.key];
  if (!dir || e.ctrlKey || e.metaKey) return;

  if (e.altKey) {
    // Keep keyboard nudging: forward to the drag handle's existing handler.
    e.preventDefault();
    wrapper
      .querySelector<HTMLElement>('.node-drag-handle')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: e.key, shiftKey: e.shiftKey }));
    return;
  }

  e.preventDefault();
  const wrappers = nodeWrappers();
  const center = (w: HTMLElement): Point => {
    const r = w.getBoundingClientRect();
    return { id: w.dataset.nodeId || '', x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };
  const next = nearestInDirection(center(wrapper), wrappers.map(center), dir);
  if (next) focusNode(next, wrappers);
}

export function initRovingFocus(): void {
  syncRovingTabindex();
  const observer = new MutationObserver(() => syncRovingTabindex());
  observer.observe(nodesLayer, { childList: true });
  observer.observe(wiresGroup, { childList: true, subtree: true });
  nodesLayer.addEventListener('keydown', onNodeKeydown);
  nodesLayer.addEventListener('focusin', (e) => {
    const id = (e.target as HTMLElement).closest<HTMLElement>('.arch-node')?.dataset.nodeId;
    if (id && id !== rovingId) {
      rovingId = id;
      syncRovingTabindex();
    }
  });
  wiresGroup.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Escape') viewport.focus();
  });
  onSelectionChange(() => {
    if (app.selection.type === 'node') rovingId = app.selection.id;
    syncRovingTabindex();
  });
}
