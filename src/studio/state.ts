/** Document, selection, history, autosave, and viewport state. */
import {
  saveStatusPill,
  stageWorld,
  viewport,
  zoomReadout,
} from './dom';
import { lensOfWorkspaceMode, workspaceModeOf, type Lens, type WorkspaceMode } from '../core/lens';
import type { Clip } from '../core/clipboard';
import type { ColourBy } from '../core/meta';
import type { PointerTool } from './pointerTool';
import { getActiveDiagramId } from './library';
import {
  RECOVERY_ID,
  getRecord,
  isQuotaError,
  isStorageReady,
  putRecord,
  removeRecord,
  reportStorageFailure,
  whenStorageReady,
  type DiagramRecord,
} from './storage';
import { getActiveFileHandle, getActiveFileName, isFileDiskDirty, setDiskDirty } from './pwa';
import type {
  DiagramDocument,
  DiagramNode,
  PortSide,
  SelectionTarget,
} from '../types';
import { normalizeBrand } from '../core/brand';
import { emptyLevel, resolveLevelPath, viewOfLevel, writeLevelBack } from '../core/levels';
import {
  indexOfPage,
  neighbourPage,
  pageCount,
  pageIdAt,
  viewOfPage,
  writePageBack,
} from '../core/pages';
import type { PageEdit } from '../core/pageOps';
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
  /** The open page: 0 is the first page, which is the document itself (D10). */
  pageIndex: 0,
  /** The whole file while a page after the first is open (that page's content in it is stale; `fullDocument` merges it back). */
  pageRoot: null as DiagramDocument | null,
  /** Camera of each page this session, by page id, so switching back lands where you left. */
  pageCameras: new Map<string, { scale: number; panX: number; panY: number }>(),
  get doc(): DiagramDocument {
    return this._doc;
  },
  /** Replacing the document from outside (load, import, new) always lands on its first page and root level. */
  set doc(next: DiagramDocument) {
    this._doc = next;
    this.levelPath = [];
    this.levelRoot = null;
    this.pageIndex = 0;
    this.pageRoot = null;
    this.pageCameras.clear();
    announcePageOpened();
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
  pointerTool: 'select' as PointerTool,
  selection: { type: 'none' } as SelectionTarget,
  connectSourceNodeId: null as string | null,
  snapToGrid: true,
  undoStack: [] as DiagramDocument[],
  redoStack: [] as DiagramDocument[],
  scale: 1,
  panX: 0,
  panY: 0,
  simTimer: null as number | null,
  /** What the last copy took: components, wires, swimlanes, frames and notes. Pasted when the system clipboard has nothing of ours. */
  clipboard: null as Clip | null,
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

// Debounced autosave, session recovery and save state. Records live in storage.ts (IndexedDB).

export type SaveState = 'saving' | 'saved' | 'error';
let currentSaveState: SaveState = 'saved';
let pendingRestoreOffer: DiagramDocument | null = null;
let saveErrorHandler: ((quota: boolean) => void) | null = null;

export function getSaveState(): SaveState {
  return currentSaveState;
}

export function setSaveErrorHandler(handler: (quota: boolean) => void): void {
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

/** Drop the offer and the saved session behind it. Returns what was removed so the caller can offer Undo. */
export function discardPendingRestoreOffer(): DiagramRecord | undefined {
  pendingRestoreOffer = null;
  const id = getActiveDiagramId();
  const removed = getRecord<DiagramRecord>('diagrams', id);
  removeRecord('diagrams', id).catch((err) => reportStorageFailure(err, 'discard the previous session'));
  return removed;
}

export function flushAutosave(): void {
  if (app.autosaveTimer !== null) {
    window.clearTimeout(app.autosaveTimer);
    app.autosaveTimer = null;
  }
  if (!isStorageReady()) {
    // Boot has not finished reading what is already saved. Writing now could replace it, so wait.
    app.hasPendingAutosave = true;
    void whenStorageReady().then(flushAutosave);
    return;
  }
  app.hasPendingAutosave = false;
  const whole = fullDocument();
  const isEmpty =
    whole.nodes.length === 0 && whole.zones.length === 0 && whole.notesCards.length === 0;
  if (isEmpty) {
    setSaveState('saved');
    return;
  }

  // Protect the larger saved session: a smaller scratch session goes to the recovery slot instead.
  const pending = getPendingRestoreOffer();
  const slot = pending && whole.nodes.length < pending.nodes.length ? RECOVERY_ID : getActiveDiagramId();
  const record: DiagramRecord = {
    id: slot,
    title: whole.title,
    updatedAt: Date.now(),
    doc: whole,
    thumbnail: getRecord<DiagramRecord>('diagrams', slot)?.thumbnail,
  };
  putRecord('diagrams', record).then(
    () => {
      // A newer edit is already waiting: it will report its own result.
      if (!app.hasPendingAutosave) setSaveState('saved');
      for (const listener of savedListeners) listener(slot);
    },
    (err: unknown) => {
      setSaveState('error');
      reportAutosaveFailure(err);
    },
  );
}

function reportAutosaveFailure(err: unknown): void {
  saveErrorHandler?.(isQuotaError(err));
}

const savedListeners = new Set<(id: string) => void>();

/** Called after each autosave is stored, with the record it went to. The library uses it to refresh thumbnails. */
export function onAutosaved(listener: (id: string) => void): void {
  savedListeners.add(listener);
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

/** A stored document if it is a usable diagram, tidied the way a load always tidies it. */
export function usableStoredDoc(parsed: DiagramDocument | undefined): DiagramDocument | null {
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
  return null;
}

export function loadSavedSessionDoc(): DiagramDocument | null {
  return usableStoredDoc(getRecord<DiagramRecord>('diagrams', getActiveDiagramId())?.doc);
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
/** Which page and level each undo snapshot was taken in, so undo can return there (F-03, D10). */
const snapshotPlaces = new WeakMap<DiagramDocument, { path: string[]; pageId: string }>();

/**
 * The open page with its levels, as one document: the tree that level paths are scoped to (D10). On the first page
 * with no level open this is `app.doc` itself.
 */
export function openPageDocument(): DiagramDocument {
  if (app.levelPath.length === 0 || !app.levelRoot) return app.doc;
  const page = structuredClone(app.levelRoot);
  writeLevelBack(page, app.levelPath, structuredClone(app.doc));
  return page;
}

/**
 * The whole file, merging the open level and the open page back into it. On the first page, with no level open,
 * this is `app.doc` itself.
 */
export function fullDocument(): DiagramDocument {
  const page = openPageDocument();
  if (app.pageIndex === 0 || !app.pageRoot) return page;
  const whole = structuredClone(app.pageRoot);
  writePageBack(whole, app.pageIndex, page === app.doc ? structuredClone(page) : page);
  return whole;
}

/** Id of the open page. */
export function currentPageId(): string {
  return pageIdAt(app.pageRoot ?? app.doc, app.pageIndex);
}

function takeSnapshot(place?: { path: string[]; pageId: string }): DiagramDocument {
  const snapshot = structuredClone(fullDocument());
  snapshotPlaces.set(snapshot, place ?? { path: [...app.levelPath], pageId: currentPageId() });
  return snapshot;
}

/** Show `page` (a page as a document) with `path` open, or the deepest part of that path that still exists. */
function applyPage(page: DiagramDocument, path: string[]): void {
  const valid = resolveLevelPath(page, path);
  app.levelPath = valid;
  if (valid.length === 0) {
    app._doc = page;
    app.levelRoot = null;
  } else {
    app.levelRoot = page;
    app._doc = viewOfLevel(page, valid);
  }
}

/** Make `whole` the file with page `pageIndex` and `path` open. */
function applyWhole(whole: DiagramDocument, path: string[], pageIndex = 0): void {
  const index = Math.min(Math.max(0, pageIndex), pageCount(whole) - 1);
  app.pageIndex = index;
  app.pageRoot = index === 0 ? null : whole;
  applyPage(index === 0 ? whole : viewOfPage(whole, index), path);
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

function restoreSnapshot(snapshot: DiagramDocument): void {
  const before = `${currentPageId()}|${app.levelPath.join('/')}`;
  const place = snapshotPlaces.get(snapshot);
  const found = place ? indexOfPage(snapshot, place.pageId) : 0;
  applyWhole(snapshot, place?.path ?? [], found < 0 ? 0 : found);
  // Undoing a change made on another page brings that page into view first.
  if (`${currentPageId()}|${app.levelPath.join('/')}` !== before) setSelection({ type: 'none' });
  announcePageOpened();
}

let lastOpenedPageId = '';
const pageOpenedListeners = new Set<(pageId: string) => void>();

/** Called whenever the open page becomes a different page: a switch, an edit that opens one, or an undo. */
export function onPageOpened(listener: (pageId: string) => void): void {
  pageOpenedListeners.add(listener);
}

function announcePageOpened(): void {
  const id = currentPageId();
  if (id === lastOpenedPageId) return;
  lastOpenedPageId = id;
  for (const listener of pageOpenedListeners) listener(id);
}

export function performUndo(): void {
  const prev = app.undoStack.pop();
  if (!prev) return;
  historyGate = initialHistoryGate();
  // The redo step goes back to where the change was made, as the undo step does.
  app.redoStack.push(takeSnapshot(snapshotPlaces.get(prev)));
  restoreSnapshot(prev);
  validateSelection();
  scheduleAutosave();
  historyApplied();
  pagesChanged();
}

export function performRedo(): void {
  const next = app.redoStack.pop();
  if (!next) return;
  historyGate = initialHistoryGate();
  app.undoStack.push(takeSnapshot(snapshotPlaces.get(next)));
  restoreSnapshot(next);
  validateSelection();
  scheduleAutosave();
  historyApplied();
  pagesChanged();
}

// ---------------------------------------------------------------------------
// Nested levels (F-03)
// ---------------------------------------------------------------------------
/** Open the level at `path` (`[]` is the root). Not an undo step; edits inside it are. */
export function goToLevel(path: string[]): boolean {
  const page = openPageDocument();
  const valid = resolveLevelPath(page, path);
  if (valid.length !== path.length) return false;
  if (valid.join('/') === app.levelPath.join('/')) return false;
  applyPage(page, valid);
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

// ---------------------------------------------------------------------------
// Pages (D10)
// ---------------------------------------------------------------------------
const pageListeners = new Set<() => void>();

/** Called when the open page or the page list changes, so the tab strip repaints. */
export function onPagesChange(listener: () => void): void {
  pageListeners.add(listener);
}

function pagesChanged(): void {
  for (const listener of pageListeners) listener();
}

function saveCamera(): void {
  app.pageCameras.set(currentPageId(), { scale: app.scale, panX: app.panX, panY: app.panY });
}

/** Open page `index`. Not an undo step; edits inside it are. Keeps each page's camera for the session. */
export function goToPage(index: number): boolean {
  const whole = fullDocument();
  if (index < 0 || index >= pageCount(whole) || index === app.pageIndex) return false;
  saveCamera();
  applyWhole(whole, [], index);
  announcePageOpened();
  setSelection({ type: 'none' });
  historyApplied();
  restorePageCamera();
  pagesChanged();
  return true;
}

/** Put the camera where this page was last left; a page not seen yet is fitted, and an empty one starts at 100%. */
function restorePageCamera(): void {
  const camera = app.pageCameras.get(currentPageId());
  if (camera) {
    app.scale = camera.scale;
    app.panX = camera.panX;
    app.panY = camera.panY;
    applyTransform();
  } else if (app.doc.nodes.length + app.doc.zones.length + app.doc.notesCards.length === 0) {
    app.scale = 1;
    app.panX = 0;
    app.panY = 0;
    applyTransform();
  } else {
    fitToViewport();
  }
}

/** Open the page with this id. */
export function goToPageId(id: string): boolean {
  const index = indexOfPage(fullDocument(), id);
  return index >= 0 && goToPage(index);
}

/** Open the next (or previous) page, wrapping around. */
export function stepPage(step: 1 | -1): boolean {
  const whole = fullDocument();
  if (pageCount(whole) < 2) return false;
  return goToPage(neighbourPage(whole, app.pageIndex, step));
}

/**
 * Replace the whole file with `whole` (typed into the code pane) as one undo step, staying on the open page and level
 * where they still exist.
 */
export function replaceFile(whole: DiagramDocument): void {
  pushHistory();
  applyWhole(whole, app.levelPath, indexOfPage(whole, currentPageId()) < 0 ? 0 : indexOfPage(whole, currentPageId()));
  announcePageOpened();
  validateSelection();
  historyApplied();
  pagesChanged();
}

/**
 * Apply a structural page edit (add, duplicate, delete, rename, move) as one undo step. `edit` gets a copy of the
 * whole file and returns the edited file with the page to open, or null to do nothing.
 */
export function editPages(edit: (whole: DiagramDocument) => PageEdit | null): boolean {
  const before = takeSnapshot();
  const result = edit(structuredClone(fullDocument()));
  if (!result) return false;
  const decision = resolveHistoryPush(historyGate, { type: 'commit' });
  historyGate = decision.gate;
  if (decision.capture) commitHistorySnapshot(before);
  const opened = pageIdAt(result.doc, result.index);
  const same = opened === currentPageId();
  if (!same) saveCamera();
  applyWhole(result.doc, same ? app.levelPath : [], result.index);
  announcePageOpened();
  if (!same) setSelection({ type: 'none' });
  historyApplied();
  if (!same) restorePageCamera();
  pagesChanged();
  return true;
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
  } else if (sel.type === 'frame' && !app.doc.frames?.some((f) => f.id === sel.id)) {
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
