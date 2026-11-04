/** Document, selection, history, autosave, and viewport state. */
import {
  btnRedo,
  btnUndo,
  saveStatusPill,
  stageWorld,
  viewport,
  zoomReadout,
} from './dom';
import { lensOfWorkspaceMode, workspaceModeOf, type Lens, type WorkspaceMode } from '../core/lens';
import type { ColourBy } from '../core/meta';
import { getActiveFileHandle, getActiveFileName, isFileDiskDirty, setDiskDirty } from './pwa';
import type {
  DiagramDocument,
  DiagramEdge,
  DiagramNode,
  PortSide,
  SelectionTarget,
} from '../types';
import { normalizeBrand } from '../core/brand';
import { emptyLevel, resolveLevelPath, viewOfLevel, writeLevelBack } from '../core/levels';
import { tightenLegacyStoreCylinder } from '../core/layout';
import { panForViewportResize } from './camera';
import { createBlankDocument } from '../templates/presets';
import {
  resolveSelectionUpdate,
  selectionOfStage,
  type SelectionChange,
} from './selection';
import {
  selectionWorldBounds,
  frameRectInViewport,
  frameDocumentInViewport,
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
  /** Abort the wire being drawn without creating a connection (Escape). */
  cancel?: () => void;
}

export const app = {
  /** The level being edited, as a document. At the root this is the whole document (F-03). */
  _doc: createBlankDocument() as DiagramDocument,
  /** Component ids from the root to the open level; empty at the root. */
  levelPath: [] as string[],
  /** The whole tree while a level is open (its open-level content is stale; `fullDocument` merges it back). */
  levelRoot: null as DiagramDocument | null,
  get doc(): DiagramDocument {
    return this._doc;
  },
  /** Replacing the document from outside (load, import, new) always lands on its root level. */
  set doc(next: DiagramDocument) {
    this._doc = next;
    this.levelPath = [];
    this.levelRoot = null;
  },
  lens: 'design' as Lens,
  /** How components are coloured in the view: by their own tone, by status, or by first tag (F-26). */
  colourBy: 'tone' as ColourBy,
  /** Only components and wires with this tag stay bright; empty shows everything (F-26). */
  tagFilter: '',
  /** Derived from `lens` (T-02); callers move to `lens` one by one, then this goes away. */
  get workspaceMode(): WorkspaceMode {
    return workspaceModeOf(this.lens);
  },
  set workspaceMode(mode: WorkspaceMode) {
    // Setting the old mode must not clobber a richer lens that already maps to it.
    if (workspaceModeOf(this.lens) !== mode) this.lens = lensOfWorkspaceMode(mode);
  },
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
  /** When enabled, clicking canvas items directly unselects them without requiring Shift. */
  selectionUnselectMode: false,
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
  if (app.selection.type === 'none') {
    app.selectionUnselectMode = false;
  }
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
  const whole = fullDocument();
  const isEmpty =
    whole.nodes.length === 0 && whole.zones.length === 0 && whole.notesCards.length === 0;
  if (isEmpty) {
    setSaveState('saved');
    return;
  }

  try {
    const pending = getPendingRestoreOffer();
    if (pending && whole.nodes.length < pending.nodes.length) {
      // Protect the larger saved session: write scratch session to recovery slot
      localStorage.setItem(RECOVERY_KEY, JSON.stringify(whole));
      setSaveState('saved');
      return;
    }
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(whole));
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
      for (const node of parsed.nodes) tightenLegacyStoreCylinder(node);
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

export function isSelectedZone(zoneId: string): boolean {
  if (app.selection.type === 'zone') return app.selection.id === zoneId;
  if (app.selection.type === 'multi') return (app.selection.zoneIds ?? []).includes(zoneId);
  return false;
}

export function isSelectedNotes(notesId: string): boolean {
  if (app.selection.type === 'notes') return app.selection.id === notesId;
  if (app.selection.type === 'multi') return (app.selection.notesIds ?? []).includes(notesId);
  return false;
}

export function isSelectedEdge(edgeId: string): boolean {
  if (app.selection.type === 'edge') return app.selection.id === edgeId;
  if (app.selection.type === 'multi') {
    if (app.selection.excludedEdgeIds?.includes(edgeId)) return false;
    if (app.selection.edgeIds?.includes(edgeId)) return true;
    const edge = app.doc.edges.find((e) => e.id === edgeId);
    if (!edge) return false;
    return app.selection.ids.includes(edge.from) || app.selection.ids.includes(edge.to);
  }
  return false;
}

export function getSelectedEdgeIds(): string[] {
  if (app.selection.type === 'edge') return [app.selection.id];
  if (app.selection.type === 'multi') {
    const selectedNodes = new Set(app.selection.ids);
    const explicitEdges = new Set(app.selection.edgeIds ?? []);
    const excludedEdges = new Set(app.selection.excludedEdgeIds ?? []);
    return app.doc.edges
      .filter((e) => {
        const touches = selectedNodes.has(e.from) || selectedNodes.has(e.to);
        const explicit = explicitEdges.has(e.id);
        return (touches || explicit) && !excludedEdges.has(e.id);
      })
      .map((e) => e.id);
  }
  return [];
}

// ---------------------------------------------------------------------------
// Undo / Redo History
// ---------------------------------------------------------------------------
/** Which level each undo snapshot was taken in, so undo can return there (F-03). */
const snapshotPaths = new WeakMap<DiagramDocument, string[]>();

/** The whole document, merging the open level back into the tree. At the root this is `app.doc` itself. */
export function fullDocument(): DiagramDocument {
  if (app.levelPath.length === 0 || !app.levelRoot) return app.doc;
  const whole = structuredClone(app.levelRoot);
  writeLevelBack(whole, app.levelPath, structuredClone(app.doc));
  return whole;
}

function takeSnapshot(): DiagramDocument {
  const snapshot = structuredClone(fullDocument());
  snapshotPaths.set(snapshot, [...app.levelPath]);
  return snapshot;
}

/** Make `whole` the document with `path` open (or the deepest part of it that still exists). */
function applyWhole(whole: DiagramDocument, path: string[]): void {
  const valid = resolveLevelPath(whole, path);
  app.levelPath = valid;
  if (valid.length === 0) {
    app._doc = whole;
    app.levelRoot = null;
  } else {
    app.levelRoot = whole;
    app._doc = viewOfLevel(whole, valid);
  }
}

const historyCommitListeners = new Set<() => void>();

/** Called after every undo step is recorded: an edit, a load, a template. */
export function onHistoryCommit(listener: () => void): void {
  historyCommitListeners.add(listener);
}

function commitHistorySnapshot(snapshot: DiagramDocument = takeSnapshot()): void {
  app.undoStack.push(snapshot);
  for (const listener of historyCommitListeners) listener();
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

/**
 * Run a mutation and record an undo step only if it changed something, so a no-op
 * (for example "bring to front" on the top layer) doesn't leave an empty step in the history.
 */
export function mutateWithHistory(mutate: () => boolean | void): boolean {
  const before = takeSnapshot();
  const result = mutate();
  // A mutation that doesn't report whether it changed anything is judged by comparing the document itself.
  const changed = result === undefined ? JSON.stringify(before) !== JSON.stringify(fullDocument()) : result;
  if (!changed) return false;
  const decision = resolveHistoryPush(historyGate, { type: 'commit' });
  historyGate = decision.gate;
  if (decision.capture) commitHistorySnapshot(before);
  return true;
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

function restoreSnapshot(snapshot: DiagramDocument): void {
  const before = app.levelPath.join('/');
  applyWhole(snapshot, snapshotPaths.get(snapshot) ?? []);
  if (app.levelPath.join('/') !== before) setSelection({ type: 'none' });
}

export function performUndo(): void {
  const prev = app.undoStack.pop();
  if (!prev) return;
  historyGate = initialHistoryGate();
  app.redoStack.push(takeSnapshot());
  restoreSnapshot(prev);
  validateSelection();
  syncHistoryButtons();
  scheduleAutosave();
  historyApplied();
}

export function performRedo(): void {
  const next = app.redoStack.pop();
  if (!next) return;
  historyGate = initialHistoryGate();
  app.undoStack.push(takeSnapshot());
  restoreSnapshot(next);
  validateSelection();
  syncHistoryButtons();
  scheduleAutosave();
  historyApplied();
}

// ---------------------------------------------------------------------------
// Nested levels (F-03)
// ---------------------------------------------------------------------------
/** Open the level at `path` (`[]` is the root). Not an undo step; edits inside it are. */
export function goToLevel(path: string[]): boolean {
  const whole = fullDocument();
  const valid = resolveLevelPath(whole, path);
  if (valid.length !== path.length) return false;
  if (valid.join('/') === app.levelPath.join('/')) return false;
  applyWhole(whole, valid);
  setSelection({ type: 'none' });
  historyApplied();
  fitToViewport();
  return true;
}

/** Open a component as a level, creating its empty child diagram first when it has none. */
export function openComponentLevel(nodeId: string): boolean {
  const node = app.doc.nodes.find((n) => n.id === nodeId);
  if (!node) return false;
  if (!node.child) mutateWithHistory(() => { node.child = emptyLevel(); });
  return goToLevel([...app.levelPath, nodeId]);
}

export function goUpLevel(): boolean {
  return app.levelPath.length > 0 && goToLevel(app.levelPath.slice(0, -1));
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
  // Lets on-canvas grab handles keep a usable on-screen size when zoomed out (see .conduit-endpoint-handle).
  stageWorld.style.setProperty('--inv-zoom', String(Math.max(1, 1 / scale)));
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

  const frame = frameDocumentInViewport(rect.width, rect.height, app.doc);
  if (frame) {
    app.scale = frame.scale;
    app.panX = Math.round(frame.panX);
    app.panY = Math.round(frame.panY);
    applyTransform();
  }
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

/**
 * Keep the view steady when the viewport changes size (window resize, a panel opening or closing, switching
 * between Design and Data View): the same world point stays at its centre and the zoom is untouched. It used to
 * refit the whole diagram, which threw away the user's zoom and position every time.
 */
export function trackViewportResize(): void {
  if (typeof ResizeObserver === 'undefined') return;
  const measure = () => {
    const r = viewport.getBoundingClientRect();
    return { width: r.width, height: r.height };
  };
  let last = measure();
  // A window resize reflows the chrome, and panels then animate to their new width over a few hundred ms, so the
  // viewport keeps changing after the window has stopped. Count that whole settling period as the resize.
  const SETTLE_MS = 600;
  let lastWindowResize = Number.NEGATIVE_INFINITY;
  window.addEventListener('resize', () => {
    lastWindowResize = performance.now();
  });
  new ResizeObserver(() => {
    const next = measure();
    // A hidden viewport reports 0x0; keep the last real size so the pan is correct when it comes back.
    if (next.width === 0 || next.height === 0) return;
    const prev = last;
    last = next;
    if (prev.width === 0 || prev.height === 0) return;
    if (next.width === prev.width && next.height === prev.height) return;
    const pan = panForViewportResize({ panX: app.panX, panY: app.panY }, prev, next);
    const windowResized = performance.now() - lastWindowResize < SETTLE_MS;
    // The inspector opens and closes by itself with the selection. Keep the diagram where it
    // is (the panel simply covers the right edge) rather than sliding it sideways under the user's pointer. A real
    // window resize is different: the layout reflows in steps, so only the window's own resize events can tell the two apart.
    if (!windowResized && next.height === prev.height) pan.panX = app.panX;
    app.panX = pan.panX;
    app.panY = pan.panY;
    applyTransform();
  }).observe(viewport);
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
