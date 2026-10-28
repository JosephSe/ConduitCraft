/** Document, selection, history, autosave, and viewport state. */
import {
  btnRedo,
  btnUndo,
  saveStatusPill,
  stageWorld,
  viewport,
  zoomReadout,
} from './dom';
import { getActiveFileHandle, getActiveFileName, isFileDiskDirty, setDiskDirty } from './pwa';
import type {
  DiagramDocument,
  DiagramEdge,
  DiagramNode,
  PortSide,
  SelectionTarget,
} from '../types';
import { normalizeBrand } from '../core/brand';
import { createBlankDocument } from '../templates/presets';
import {
  resolveSelectionUpdate,
  selectionOfStage,
  type SelectionChange,
} from './selection';
import {
  selectionWorldBounds,
  frameRectInViewport,
  viewportWorldRect,
  panToCenterWorld,
} from './viewportFrame';
import {
  beginGesture,
  endGesture,
  initialHistoryGate,
  resolveHistoryPush,
  type HistoryGate,
} from './historyGesture';

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
  /** True while two touch or pen pointers are on the canvas. */
  multiPointer: false,
  /** Swallow the click that a pinch or two-finger pan would otherwise trigger. */
  blockPointerClick: false,
};

const MAX_HISTORY = 60;
const selectionListeners = new Set<(event: SelectionChange) => void>();
let historyGate: HistoryGate = initialHistoryGate();

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

// Debounced LocalStorage Autosave, Session Recovery & Save State
export const AUTOSAVE_KEY = 'conduitcraft-autosave-v1';
export const RECOVERY_KEY = 'conduitcraft-recovery-v1';

export type SaveState = 'saving' | 'saved' | 'error';
let currentSaveState: SaveState = 'saved';
let pendingRestoreOffer: DiagramDocument | null = null;
let saveErrorHandler: (() => void) | null = null;

export function getSaveState(): SaveState {
  return currentSaveState;
}

export function setSaveErrorHandler(handler: () => void): void {
  saveErrorHandler = handler;
}

export function updateDocumentTitle(): void {
  if (typeof document === 'undefined') return;
  const baseTitle = app.doc.title || 'Untitled Architecture';
  const hasUnsavedDisk = isFileDiskDirty() && Boolean(getActiveFileHandle());
  const isDirty = app.hasPendingAutosave || hasUnsavedDisk || getSaveState() === 'error';
  document.title = (isDirty ? '• ' : '') + `${baseTitle} — ConduitCraft`;
}

export function setSaveState(state: SaveState): void {
  currentSaveState = state;
  updateDocumentTitle();
  if (saveStatusPill) {
    saveStatusPill.dataset.status = state;
    if (state === 'saving') {
      saveStatusPill.textContent = 'Saving…';
    } else if (state === 'saved') {
      const activeName = getActiveFileName();
      saveStatusPill.textContent = activeName ? `Saved to ${activeName}` : 'Saved';
    } else if (state === 'error') {
      saveStatusPill.textContent = 'Not saved (storage full)';
    }
  }
}

export function setPendingRestoreOffer(doc: DiagramDocument | null): void {
  pendingRestoreOffer = doc;
}

export function getPendingRestoreOffer(): DiagramDocument | null {
  return pendingRestoreOffer;
}

export function clearPendingRestoreOffer(): void {
  pendingRestoreOffer = null;
}

export function discardPendingRestoreOffer(): void {
  pendingRestoreOffer = null;
  try {
    localStorage.removeItem(AUTOSAVE_KEY);
  } catch {
    // Ignore storage errors
  }
}

export function flushAutosave(): void {
  if (app.autosaveTimer !== null) {
    window.clearTimeout(app.autosaveTimer);
    app.autosaveTimer = null;
  }
  app.hasPendingAutosave = false;
  const isEmpty =
    app.doc.nodes.length === 0 && app.doc.zones.length === 0 && app.doc.notesCards.length === 0;
  if (isEmpty) {
    setSaveState('saved');
    return;
  }

  try {
    const pending = getPendingRestoreOffer();
    if (pending && app.doc.nodes.length < pending.nodes.length) {
      // Protect the larger saved session: write scratch session to recovery slot
      localStorage.setItem(RECOVERY_KEY, JSON.stringify(app.doc));
      setSaveState('saved');
      return;
    }
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(app.doc));
    setSaveState('saved');
  } catch {
    setSaveState('error');
    if (saveErrorHandler) {
      saveErrorHandler();
    }
  }
}

export function scheduleAutosave(): void {
  app.hasPendingAutosave = true;
  setDiskDirty(true);
  setSaveState('saving');
  if (typeof window === 'undefined') return;
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
      parsed.brand = normalizeBrand(parsed.brand);
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
function commitHistorySnapshot(): void {
  app.undoStack.push(structuredClone(app.doc));
  if (app.undoStack.length > MAX_HISTORY) app.undoStack.shift();
  app.redoStack.length = 0;
  syncHistoryButtons();
  scheduleAutosave();
}

/** Open a gesture. Later `pushHistory` calls keep the first snapshot until `endHistoryGesture`. */
export function beginHistoryGesture(): void {
  historyGate = beginGesture(historyGate);
}

export function endHistoryGesture(): void {
  historyGate = endGesture(historyGate);
}

export function pushHistory(): void {
  const decision = resolveHistoryPush(historyGate, { type: 'commit' });
  historyGate = decision.gate;
  if (!decision.capture) return;
  commitHistorySnapshot();
}

/** Arrow-key nudges inside a short window share one undo step. */
export function pushHistoryNudge(): void {
  const decision = resolveHistoryPush(historyGate, { type: 'nudge', now: Date.now() });
  historyGate = decision.gate;
  if (!decision.capture) return;
  commitHistorySnapshot();
}

export function syncHistoryButtons(): void {
  btnUndo.disabled = app.undoStack.length === 0;
  btnRedo.disabled = app.redoStack.length === 0;
}

export function performUndo(): void {
  const prev = app.undoStack.pop();
  if (!prev) return;
  historyGate = initialHistoryGate();
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
  historyGate = initialHistoryGate();
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
    setSelection(
      selectionOfStage({
        nodes: sel.ids.filter((id) => app.doc.nodes.some((node) => node.id === id)),
        zones: (sel.zoneIds ?? []).filter((id) => app.doc.zones.some((zone) => zone.id === id)),
        notes: (sel.notesIds ?? []).filter((id) => app.doc.notesCards.some((card) => card.id === id)),
      }),
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
let minimapPainter: (() => void) | null = null;

/** Registered by the minimap so pan and zoom repaint the overview. */
export function setMinimapPainter(painter: () => void): void {
  minimapPainter = painter;
}

export function applyTransform(): void {
  const scale = app.scale || 1;
  // Paint at the displayed size. A transform scale stretches a 1× layer and softens text and icons.
  stageWorld.style.setProperty('zoom', String(scale));
  stageWorld.style.transform = `translate(${app.panX / scale}px, ${app.panY / scale}px)`;
  stageWorld.dataset.lod = scale < 0.55 ? 'low' : scale < 0.8 ? 'medium' : 'high';
  zoomReadout.textContent = `${Math.round(scale * 100)}%`;
  minimapPainter?.();
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

/** Frame the current selection. With nothing selected, frame every node, zone, and notes card. */
export function fitSelection(): void {
  const rect = viewport.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;
  const bounds = selectionWorldBounds(app.doc, app.selection);
  if (!bounds) {
    fitToViewport();
    return;
  }
  const frame = frameRectInViewport(rect.width, rect.height, bounds);
  if (!frame) return;
  app.scale = frame.scale;
  app.panX = Math.round(frame.panX);
  app.panY = Math.round(frame.panY);
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

/**
 * Pans the viewport smoothly only if the node lies outside the current viewport.
 * Does not alter camera zoom level, preventing jarring zoom jumps while typing search queries.
 */
export function panToNodeIfNeeded(node: DiagramNode): void {
  const rect = viewport.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;
  const vRect = viewportWorldRect(rect.width, rect.height, app.panX, app.panY, app.scale);
  const margin = 48;
  const nodeLeft = node.x;
  const nodeRight = node.x + node.width;
  const nodeTop = node.y;
  const nodeBottom = node.y + node.height;
  const isInside =
    nodeLeft >= vRect.x + margin &&
    nodeRight <= vRect.x + vRect.width - margin &&
    nodeTop >= vRect.y + margin &&
    nodeBottom <= vRect.y + vRect.height - margin;

  if (!isInside) {
    const center = panToCenterWorld(
      node.x + node.width / 2,
      node.y + node.height / 2,
      rect.width,
      rect.height,
      app.scale,
    );
    app.panX = Math.round(center.panX);
    app.panY = Math.round(center.panY);
    applyTransform();
  }
}
