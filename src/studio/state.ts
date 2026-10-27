/** Document, selection, history, autosave, and viewport state. */
import {
  btnRedo,
  btnUndo,
  stageWorld,
  viewport,
  zoomReadout,
} from './dom';
import type {
  DiagramDocument,
  DiagramEdge,
  DiagramNode,
  PortSide,
  SelectionTarget,
} from '../types';
import { createBlankDocument } from '../templates/presets';
import {
  resolveSelectionUpdate,
  type SelectionChange,
} from './selection';

export interface ActiveWireDraft {
  sourceNodeId: string;
  sourcePort: PortSide;
  startPt: [number, number];
  hoveredPortBtn: HTMLElement | null;
}

export const app = {
  doc: createBlankDocument() as DiagramDocument,
  workspaceMode: 'design' as 'design' | 'data',
  pointerTool: 'select' as 'select' | 'connect',
  selection: { type: 'none' } as SelectionTarget,
  connectSourceNodeId: null as string | null,
  snapToGrid: true,
  undoStack: [] as DiagramDocument[],
  redoStack: [] as DiagramDocument[],
  scale: 1,
  panX: 0,
  panY: 0,
  simTimer: null as number | null,
  clipboardNodes: [] as DiagramNode[],
  clipboardEdges: [] as DiagramEdge[],
  autosaveTimer: null as number | null,
  hasPendingAutosave: false,
  activeWireDraft: null as ActiveWireDraft | null,
};

const MAX_HISTORY = 60;
const selectionListeners = new Set<(event: SelectionChange) => void>();

export function onSelectionChange(listener: (event: SelectionChange) => void): () => void {
  selectionListeners.add(listener);
  return () => selectionListeners.delete(listener);
}

/** Write `app.selection` and notify listeners only when the selection key changes. */
export function setSelection(next: SelectionTarget): boolean {
  const update = resolveSelectionUpdate(app.selection, next);
  if (!update.changed) return false;
  const previous = app.selection;
  app.selection = update.selection;
  const event: SelectionChange = { previous, selection: app.selection };
  for (const listener of [...selectionListeners]) listener(event);
  return true;
}

let historyApplied: () => void = () => {};

/** Registered by boot so history can refresh the stage without a state/render import cycle. */
export function setHistoryApplied(fn: () => void): void {
  historyApplied = fn;
}

// Debounced LocalStorage Autosave & Session Recovery
export const AUTOSAVE_KEY = 'conduitcraft-autosave-v1';

export function flushAutosave(): void {
  if (app.autosaveTimer !== null) {
    window.clearTimeout(app.autosaveTimer);
    app.autosaveTimer = null;
  }
  app.hasPendingAutosave = false;
  try {
    const isEmpty =
      app.doc.nodes.length === 0 && app.doc.zones.length === 0 && app.doc.notesCards.length === 0;
    if (!isEmpty) {
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(app.doc));
    }
  } catch {
    // Ignore storage quota or private mode restrictions
  }
}

export function scheduleAutosave(): void {
  app.hasPendingAutosave = true;
  if (app.autosaveTimer !== null) {
    window.clearTimeout(app.autosaveTimer);
  }
  app.autosaveTimer = window.setTimeout(flushAutosave, 320);
}

export function loadSavedSessionDoc(): DiagramDocument | null {
  try {
    const raw =
      localStorage.getItem(AUTOSAVE_KEY) || localStorage.getItem('blueprint-studio-autosave-v1');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DiagramDocument;
    if (
      parsed &&
      Array.isArray(parsed.nodes) &&
      Array.isArray(parsed.edges) &&
      (parsed.nodes.length > 0 || parsed.zones?.length > 0 || parsed.notesCards?.length > 0)
    ) {
      return parsed;
    }
  } catch {
    // Ignore malformed saved state
  }
  return null;
}

export function isSelectedNode(nodeId: string): boolean {
  if (app.selection.type === 'node') return app.selection.id === nodeId;
  if (app.selection.type === 'multi') return app.selection.ids.includes(nodeId);
  return false;
}

export function getSelectedNodeIds(): string[] {
  if (app.selection.type === 'node') return [app.selection.id];
  if (app.selection.type === 'multi') return [...app.selection.ids];
  return [];
}

// ---------------------------------------------------------------------------
// Undo / Redo History
// ---------------------------------------------------------------------------
export function pushHistory(): void {
  app.undoStack.push(structuredClone(app.doc));
  if (app.undoStack.length > MAX_HISTORY) app.undoStack.shift();
  app.redoStack.length = 0;
  syncHistoryButtons();
  scheduleAutosave();
}

export function syncHistoryButtons(): void {
  btnUndo.disabled = app.undoStack.length === 0;
  btnRedo.disabled = app.redoStack.length === 0;
}

export function performUndo(): void {
  const prev = app.undoStack.pop();
  if (!prev) return;
  app.redoStack.push(structuredClone(app.doc));
  app.doc = prev;
  validateSelection();
  syncHistoryButtons();
  scheduleAutosave();
  historyApplied();
}

export function performRedo(): void {
  const next = app.redoStack.pop();
  if (!next) return;
  app.undoStack.push(structuredClone(app.doc));
  app.doc = next;
  validateSelection();
  syncHistoryButtons();
  scheduleAutosave();
  historyApplied();
}

export function validateSelection(): void {
  const sel = app.selection;
  if (sel.type === 'node' && !app.doc.nodes.some((n) => n.id === sel.id)) {
    setSelection({ type: 'none' });
  } else if (sel.type === 'multi') {
    const validIds = sel.ids.filter((id) => app.doc.nodes.some((n) => n.id === id));
    setSelection(
      validIds.length > 1
        ? { type: 'multi', ids: validIds }
        : validIds.length === 1
          ? { type: 'node', id: validIds[0] }
          : { type: 'none' },
    );
  } else if (sel.type === 'edge' && !app.doc.edges.some((e) => e.id === sel.id)) {
    setSelection({ type: 'none' });
  } else if (sel.type === 'zone' && !app.doc.zones.some((z) => z.id === sel.id)) {
    setSelection({ type: 'none' });
  } else if (sel.type === 'notes' && !app.doc.notesCards.some((c) => c.id === sel.id)) {
    setSelection({ type: 'none' });
  }
}

// ---------------------------------------------------------------------------
// Viewport Pan & Zoom
// ---------------------------------------------------------------------------
export function applyTransform(): void {
  stageWorld.style.transform = `translate(${app.panX}px, ${app.panY}px) scale(${app.scale})`;
  zoomReadout.textContent = `${Math.round(app.scale * 100)}%`;
}

export function screenToWorld(clientX: number, clientY: number): [number, number] {
  const rect = viewport.getBoundingClientRect();
  return [
    Math.round((clientX - rect.left - app.panX) / app.scale),
    Math.round((clientY - rect.top - app.panY) / app.scale),
  ];
}

export function getViewportWorldCenter(): [number, number] {
  const rect = viewport.getBoundingClientRect();
  return [
    Math.round((rect.width / 2 - app.panX) / app.scale),
    Math.round((rect.height / 2 - app.panY) / app.scale),
  ];
}

export function fitToViewport(): void {
  const rect = viewport.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;

  if (app.doc.nodes.length === 0 && app.doc.zones.length === 0 && app.doc.notesCards.length === 0) {
    app.scale = 1;
    app.panX = Math.round((rect.width - app.doc.stageWidth) / 2);
    app.panY = Math.max(0, Math.round((rect.height - app.doc.stageHeight) / 2));
    applyTransform();
    return;
  }

  const padX = 48;
  const padY = 64;
  const scaleX = (rect.width - padX) / app.doc.stageWidth;
  const scaleY = (rect.height - padY) / app.doc.stageHeight;
  app.scale = Math.max(0.38, Math.min(1.12, Math.min(scaleX, scaleY)));
  app.panX = Math.round((rect.width - app.doc.stageWidth * app.scale) / 2);
  app.panY = Math.max(12, Math.round((rect.height - app.doc.stageHeight * app.scale) / 2 - 8));
  applyTransform();
}

export function zoomAround(nextScale: number, cx: number, cy: number): void {
  const clamped = Math.min(1.9, Math.max(0.35, nextScale));
  const worldX = (cx - app.panX) / app.scale;
  const worldY = (cy - app.panY) / app.scale;
  app.scale = clamped;
  app.panX = cx - worldX * app.scale;
  app.panY = cy - worldY * app.scale;
  applyTransform();
}
