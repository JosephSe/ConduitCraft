import type {
  DiagramDocument,
  DiagramEdge,
  DiagramNode,
  DiagramNotesCard,
  DiagramZone,
  EdgeRouteMode,
  NodeIconName,
  NodeKind,
  PortSide,
  SelectionTarget,
  StreamTone,
} from './types';
import {
  STENCIL_CATALOG,
  STREAM_TONE_OPTIONS,
  createBlankDocument,
  createNodeFromStencil,
  createNotesCard,
  createSwimlaneZone,
  nextUid,
} from './templates/presets';
import {
  autoLayoutDocument,
  expandStageToFit,
  getAdjacencyLists,
  getEffectiveSimulations,
  getNodeCenter,
  getNodeDimensions,
  getPortPoint,
  routeDiagramEdges,
} from './core/layout';
import {
  importMermaidOrBlueprint,
  serializeToBlueprintMarkdown,
  serializeToMermaid,
} from './core/parser';
import { generateStandaloneHtml } from './exporter/standaloneHtml';
import { ICON_LIST, createHumanOutlineSvg, createNodeIconSvg } from './ui/icons';

const SVG_NS = 'http://www.w3.org/2000/svg';
const MAX_HISTORY = 60;

// ---------------------------------------------------------------------------
// Top-Layer Exit Animation Helper (`animate-to-from-top-layer` fallback)
// ---------------------------------------------------------------------------
let cachedDisplayTransitionSupport: boolean | undefined;
function canTransitionDisplay(): boolean {
  if (cachedDisplayTransitionSupport !== undefined) return cachedDisplayTransitionSupport;
  if (!window.CSS?.supports?.('transition-behavior', 'allow-discrete') || !document.body) {
    return false;
  }
  const probe = document.createElement('div');
  probe.style.cssText = 'transition: display 1s allow-discrete !important; display: block;';
  document.body.appendChild(probe);
  void getComputedStyle(probe).display;
  probe.style.display = 'none';
  cachedDisplayTransitionSupport = getComputedStyle(probe).display === 'block';
  probe.remove();
  return cachedDisplayTransitionSupport;
}

function supportsTopLayerExit(): boolean {
  return Boolean(window.CSS?.supports?.('overlay', 'auto')) && canTransitionDisplay();
}

async function closeDialogSmoothly(dialog: HTMLDialogElement): Promise<void> {
  if (!dialog.open) return;
  if (!supportsTopLayerExit()) {
    dialog.setAttribute('data-closing', '');
    const animations = dialog.getAnimations({ subtree: true });
    if (animations.length > 0) {
      await Promise.race([
        Promise.allSettled(animations.map((a) => a.finished)),
        new Promise((r) => setTimeout(r, 280)),
      ]);
    }
    dialog.removeAttribute('data-closing');
  }
  dialog.close();
}

// ---------------------------------------------------------------------------
// DOM Elements
// ---------------------------------------------------------------------------
const workspace = document.getElementById('workspace') as HTMLElement;
const docSystemTagEl = document.getElementById('doc-system-tag') as HTMLElement;
const docStatusLabelEl = document.getElementById('doc-status-label') as HTMLElement;
const docTitleHeadingEl = document.getElementById('doc-title-heading') as HTMLElement;
const btnFocusDocTitle = document.getElementById('btn-focus-doc-title') as HTMLButtonElement;

const designToolbar = document.getElementById('design-toolbar') as HTMLElement;
const dataToolbar = document.getElementById('data-toolbar') as HTMLElement;
const btnUndo = document.getElementById('btn-undo') as HTMLButtonElement;
const btnRedo = document.getElementById('btn-redo') as HTMLButtonElement;
const btnAutoLayout = document.getElementById('btn-auto-layout') as HTMLButtonElement;
const simButtonsSlot = document.getElementById('sim-buttons-slot') as HTMLElement;
const btnToggleMotion = document.getElementById('btn-toggle-motion') as HTMLButtonElement;

const fileUploadInput = document.getElementById('file-upload') as HTMLInputElement;
const btnNewCanvas = document.getElementById('btn-new-canvas') as HTMLButtonElement;
const btnImportFile = document.getElementById('btn-import-file') as HTMLButtonElement;
const btnOpenCode = document.getElementById('btn-open-code') as HTMLButtonElement;
const btnOpenMatrix = document.getElementById('btn-open-matrix') as HTMLButtonElement;
const btnOpenExport = document.getElementById('btn-open-export') as HTMLButtonElement;
const btnOpenSettings = document.getElementById('btn-open-settings') as HTMLButtonElement;

const canvasStatsPill = document.getElementById('canvas-stats-pill') as HTMLElement;
const stencilGrid = document.getElementById('stencil-grid') as HTMLElement;
const btnAddZone = document.getElementById('btn-add-zone') as HTMLButtonElement;
const btnAddNotes = document.getElementById('btn-add-notes') as HTMLButtonElement;
const btnPaletteImport = document.getElementById('btn-palette-import') as HTMLButtonElement;
const btnPaletteCode = document.getElementById('btn-palette-code') as HTMLButtonElement;

const windowDropVeil = document.getElementById('window-drop-veil') as HTMLElement;
const emptyStageOverlay = document.getElementById('empty-stage-overlay') as HTMLElement;
const btnQuickStarter = document.getElementById('btn-quick-starter') as HTMLButtonElement;
const btnEmptyImport = document.getElementById('btn-empty-import') as HTMLButtonElement;
const btnEmptyCode = document.getElementById('btn-empty-code') as HTMLButtonElement;
const btnRestoreSession = document.getElementById('btn-restore-session') as HTMLButtonElement | null;

const viewport = document.getElementById('canvas-viewport') as HTMLElement;
const stageWorld = document.getElementById('stage-world') as HTMLElement;
const alignGuideX = document.getElementById('align-guide-x') as HTMLElement;
const alignGuideY = document.getElementById('align-guide-y') as HTMLElement;
const marqueeBox = document.getElementById('marquee-box') as HTMLElement | null;
const zonesLayer = document.getElementById('zones-layer') as HTMLElement;
const notesLayer = document.getElementById('notes-layer') as HTMLElement;
const wiresSvg = document.getElementById('wires-svg') as unknown as SVGSVGElement;
const wiresGroup = document.getElementById('wires-group') as unknown as SVGGElement;
const draftWire = document.getElementById('draft-wire') as unknown as SVGPathElement;
const nodesLayer = document.getElementById('nodes-layer') as HTMLElement;
const simPacket = document.getElementById('sim-packet') as HTMLElement;
const simPacketDot = document.getElementById('sim-packet-dot') as HTMLElement;
const simPacketLabel = document.getElementById('sim-packet-label') as HTMLElement;

const hudStatusTip = document.getElementById('hud-status-tip') as HTMLElement;
const zoomReadout = document.getElementById('zoom-readout') as HTMLElement;
const btnZoomIn = document.getElementById('btn-zoom-in') as HTMLButtonElement;
const btnZoomOut = document.getElementById('btn-zoom-out') as HTMLButtonElement;
const btnZoomFit = document.getElementById('btn-zoom-fit') as HTMLButtonElement;

// Right Panel: Design vs Data View
const designInspectorPane = document.getElementById('design-inspector-pane') as HTMLElement;
const propPanelHeading = document.getElementById('prop-panel-heading') as HTMLElement;
const propSelectionActions = document.getElementById('prop-selection-actions') as HTMLElement;
const btnPropDuplicate = document.getElementById('btn-prop-duplicate') as HTMLButtonElement;
const btnPropDelete = document.getElementById('btn-prop-delete') as HTMLButtonElement;
const propFormContainer = document.getElementById('prop-form-container') as HTMLElement;

const dataInspectorPane = document.getElementById('data-inspector-pane') as HTMLElement;
const inspectorScope = document.getElementById('inspector-scope') as HTMLElement;
const tabInspector = document.getElementById('tab-inspector') as HTMLButtonElement;
const tabTrace = document.getElementById('tab-trace') as HTMLButtonElement;
const panelInspector = document.getElementById('panel-inspector') as HTMLElement;
const panelTrace = document.getElementById('panel-trace') as HTMLElement;
const btnResetSelection = document.getElementById('btn-reset-selection') as HTMLButtonElement;
const btnClearTrace = document.getElementById('btn-clear-trace') as HTMLButtonElement;

const inspBadge = document.getElementById('insp-badge') as HTMLElement;
const inspId = document.getElementById('insp-id') as HTMLElement;
const inspTitle = document.getElementById('insp-title') as HTMLElement;
const inspSummary = document.getElementById('insp-summary') as HTMLElement;
const inspMetrics = document.getElementById('insp-metrics') as HTMLElement;
const inspLineage = document.getElementById('insp-lineage') as HTMLElement;
const inspCode = document.getElementById('insp-code') as HTMLElement;
const traceList = document.getElementById('trace-list') as HTMLOListElement;

// Dialogs
const codeDialog = document.getElementById('code-dialog') as HTMLDialogElement;
const codeSyncTextarea = document.getElementById('code-sync-textarea') as HTMLTextAreaElement;
const codeSyncDiagnostics = document.getElementById('code-sync-diagnostics') as HTMLElement;
const btnCopyCode = document.getElementById('btn-copy-code') as HTMLButtonElement;
const btnApplyCode = document.getElementById('btn-apply-code') as HTMLButtonElement;

const exportDialog = document.getElementById('export-dialog') as HTMLDialogElement;
const btnExportHtml = document.getElementById('btn-export-html') as HTMLButtonElement;
const btnExportMd = document.getElementById('btn-export-md') as HTMLButtonElement;
const btnExportMmd = document.getElementById('btn-export-mmd') as HTMLButtonElement;

const matrixDialog = document.getElementById('matrix-dialog') as HTMLDialogElement;
const matrixTbody = document.getElementById('matrix-tbody') as HTMLTableSectionElement;

const settingsDialog = document.getElementById('settings-dialog') as HTMLDialogElement;
const chkSnapGrid = document.getElementById('chk-snap-grid') as HTMLInputElement;

// ---------------------------------------------------------------------------
// Application State
// ---------------------------------------------------------------------------
let doc: DiagramDocument = createBlankDocument();
let workspaceMode: 'design' | 'data' = 'design';
let pointerTool: 'select' | 'connect' = 'select';
let selection: SelectionTarget = { type: 'none' };
let connectSourceNodeId: string | null = null;
let snapToGrid = true;

const undoStack: DiagramDocument[] = [];
const redoStack: DiagramDocument[] = [];

let scale = 1;
let panX = 0;
let panY = 0;
let simTimer: number | null = null;

// Internal Clipboard for Copy / Paste (`Cmd/Ctrl+C` and `Cmd/Ctrl+V`)
let clipboardNodes: DiagramNode[] = [];
let clipboardEdges: DiagramEdge[] = [];

// Debounced LocalStorage Autosave & Session Recovery
const AUTOSAVE_KEY = 'conduitcraft-autosave-v1';
let autosaveTimer: number | null = null;
let hasPendingAutosave = false;

function flushAutosave(): void {
  if (autosaveTimer !== null) {
    window.clearTimeout(autosaveTimer);
    autosaveTimer = null;
  }
  hasPendingAutosave = false;
  try {
    const isEmpty =
      doc.nodes.length === 0 && doc.zones.length === 0 && doc.notesCards.length === 0;
    if (!isEmpty) {
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(doc));
    }
  } catch {
    // Ignore storage quota or private mode restrictions
  }
}

function scheduleAutosave(): void {
  hasPendingAutosave = true;
  if (autosaveTimer !== null) {
    window.clearTimeout(autosaveTimer);
  }
  autosaveTimer = window.setTimeout(flushAutosave, 320);
}

function loadSavedSessionDoc(): DiagramDocument | null {
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

function isSelectedNode(nodeId: string): boolean {
  if (selection.type === 'node') return selection.id === nodeId;
  if (selection.type === 'multi') return selection.ids.includes(nodeId);
  return false;
}

function getSelectedNodeIds(): string[] {
  if (selection.type === 'node') return [selection.id];
  if (selection.type === 'multi') return [...selection.ids];
  return [];
}

// Element-scoped View Transitions (`scoped-component-transitions`)
const supportsScopedVT = 'startViewTransition' in Element.prototype;
function withInspectorTransition(updateFn: () => void): void {
  if (!supportsScopedVT) {
    updateFn();
    return;
  }
  const vt = (
    inspectorScope as unknown as {
      startViewTransition: (cb: () => void) => { ready: Promise<void> };
    }
  ).startViewTransition(updateFn);
  vt.ready.catch(() => {});
}

// ---------------------------------------------------------------------------
// Undo / Redo History
// ---------------------------------------------------------------------------
function pushHistory(): void {
  undoStack.push(structuredClone(doc));
  if (undoStack.length > MAX_HISTORY) undoStack.shift();
  redoStack.length = 0;
  syncHistoryButtons();
  scheduleAutosave();
}

function syncHistoryButtons(): void {
  btnUndo.disabled = undoStack.length === 0;
  btnRedo.disabled = redoStack.length === 0;
}

function performUndo(): void {
  const prev = undoStack.pop();
  if (!prev) return;
  redoStack.push(structuredClone(doc));
  doc = prev;
  validateSelection();
  syncHistoryButtons();
  scheduleAutosave();
  renderAll(true);
}

function performRedo(): void {
  const next = redoStack.pop();
  if (!next) return;
  undoStack.push(structuredClone(doc));
  doc = next;
  validateSelection();
  syncHistoryButtons();
  scheduleAutosave();
  renderAll(true);
}

function validateSelection(): void {
  const sel = selection;
  if (sel.type === 'node' && !doc.nodes.some((n) => n.id === sel.id)) {
    selection = { type: 'none' };
  } else if (sel.type === 'multi') {
    const validIds = sel.ids.filter((id) => doc.nodes.some((n) => n.id === id));
    selection =
      validIds.length > 1
        ? { type: 'multi', ids: validIds }
        : validIds.length === 1
          ? { type: 'node', id: validIds[0] }
          : { type: 'none' };
  } else if (sel.type === 'edge' && !doc.edges.some((e) => e.id === sel.id)) {
    selection = { type: 'none' };
  } else if (sel.type === 'zone' && !doc.zones.some((z) => z.id === sel.id)) {
    selection = { type: 'none' };
  } else if (sel.type === 'notes' && !doc.notesCards.some((c) => c.id === sel.id)) {
    selection = { type: 'none' };
  }
}

// ---------------------------------------------------------------------------
// Viewport Pan & Zoom
// ---------------------------------------------------------------------------
function applyTransform(): void {
  stageWorld.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
  zoomReadout.textContent = `${Math.round(scale * 100)}%`;
}

function screenToWorld(clientX: number, clientY: number): [number, number] {
  const rect = viewport.getBoundingClientRect();
  return [
    Math.round((clientX - rect.left - panX) / scale),
    Math.round((clientY - rect.top - panY) / scale),
  ];
}

function getViewportWorldCenter(): [number, number] {
  const rect = viewport.getBoundingClientRect();
  return [
    Math.round((rect.width / 2 - panX) / scale),
    Math.round((rect.height / 2 - panY) / scale),
  ];
}

function fitToViewport(): void {
  const rect = viewport.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;

  if (doc.nodes.length === 0 && doc.zones.length === 0 && doc.notesCards.length === 0) {
    scale = 1;
    panX = Math.round((rect.width - doc.stageWidth) / 2);
    panY = Math.max(0, Math.round((rect.height - doc.stageHeight) / 2));
    applyTransform();
    return;
  }

  const padX = 48;
  const padY = 64;
  const scaleX = (rect.width - padX) / doc.stageWidth;
  const scaleY = (rect.height - padY) / doc.stageHeight;
  scale = Math.max(0.38, Math.min(1.12, Math.min(scaleX, scaleY)));
  panX = Math.round((rect.width - doc.stageWidth * scale) / 2);
  panY = Math.max(12, Math.round((rect.height - doc.stageHeight * scale) / 2 - 8));
  applyTransform();
}

function zoomAround(nextScale: number, cx: number, cy: number): void {
  const clamped = Math.min(1.9, Math.max(0.35, nextScale));
  const worldX = (cx - panX) / scale;
  const worldY = (cy - panY) / scale;
  scale = clamped;
  panX = cx - worldX * scale;
  panY = cy - worldY * scale;
  applyTransform();
}

// ---------------------------------------------------------------------------
// Palette Stencils (Click to Place OR Drag onto Stage)
// ---------------------------------------------------------------------------
const TONE_CSS: Record<StreamTone, [string, string]> = {
  blue: ['var(--wl-blue)', 'var(--wl-blue-soft)'],
  emerald: ['var(--wl-emerald)', 'var(--wl-emerald-soft)'],
  rose: ['var(--wl-rose)', 'var(--wl-rose-soft)'],
  violet: ['var(--wl-violet)', 'var(--wl-violet-soft)'],
  amber: ['var(--wl-amber)', 'var(--wl-amber-soft)'],
};

function initStencilPalette(): void {
  stencilGrid.replaceChildren();

  for (const stencil of STENCIL_CATALOG) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'stencil-card';
    btn.dataset.kind = stencil.kind;
    btn.setAttribute('role', 'listitem');
    const [accent, soft] = TONE_CSS[stencil.accent];
    btn.style.setProperty('--stencil-accent', accent);
    btn.style.setProperty('--stencil-soft', soft);

    const preview = document.createElement('span');
    preview.className = 'stencil-preview';
    if (stencil.kind === 'actor') {
      preview.appendChild(createHumanOutlineSvg(true));
    } else {
      preview.appendChild(createNodeIconSvg(stencil.icon, 20));
    }

    const title = document.createElement('span');
    title.className = 'stencil-title';
    title.textContent = stencil.paletteTitle;

    const sub = document.createElement('span');
    sub.className = 'stencil-sub';
    sub.textContent = stencil.paletteSub;

    btn.append(preview, title, sub);

    // Pointer drag onto canvas OR simple click to add at viewport center
    let ghostEl: HTMLElement | null = null;
    let startClientX = 0;
    let startClientY = 0;
    let dragged = false;

    btn.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      startClientX = e.clientX;
      startClientY = e.clientY;
      dragged = false;
      btn.setPointerCapture(e.pointerId);
    });

    btn.addEventListener('pointermove', (e) => {
      if (!btn.hasPointerCapture(e.pointerId)) return;
      if (!dragged && Math.hypot(e.clientX - startClientX, e.clientY - startClientY) > 6) {
        dragged = true;
        ghostEl = document.createElement('div');
        ghostEl.className = 'stencil-drag-ghost';
        ghostEl.textContent = `+ ${stencil.paletteTitle}`;
        document.body.appendChild(ghostEl);
      }
      if (ghostEl) {
        ghostEl.style.setProperty('--gx', String(e.clientX));
        ghostEl.style.setProperty('--gy', String(e.clientY));
      }
    });

    const finishStencilPointer = (e: PointerEvent, commit: boolean) => {
      if (ghostEl) {
        ghostEl.remove();
        ghostEl = null;
      }
      if (!commit) return;

      if (dragged) {
        const vpRect = viewport.getBoundingClientRect();
        if (
          e.clientX >= vpRect.left &&
          e.clientX <= vpRect.right &&
          e.clientY >= vpRect.top &&
          e.clientY <= vpRect.bottom
        ) {
          const [wx, wy] = screenToWorld(e.clientX, e.clientY);
          const dims = getNodeDimensions(stencil.kind);
          addNodeAt(stencil.kind, wx - dims.width / 2, wy - dims.height / 2);
        }
      } else {
        const [cx, cy] = getViewportWorldCenter();
        const dims = getNodeDimensions(stencil.kind);
        const cascade = (doc.nodes.length % 5) * 24;
        addNodeAt(stencil.kind, cx - dims.width / 2 + cascade, cy - dims.height / 2 + cascade);
      }
    };

    btn.addEventListener('pointerup', (e) => finishStencilPointer(e, true));
    btn.addEventListener('pointercancel', (e) => finishStencilPointer(e, false));

    // Keyboard Enter / Space support when focused
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const [cx, cy] = getViewportWorldCenter();
        const dims = getNodeDimensions(stencil.kind);
        addNodeAt(stencil.kind, cx - dims.width / 2, cy - dims.height / 2);
      }
    });

    stencilGrid.appendChild(btn);
  }
}

function addNodeAt(kind: NodeKind, rawX: number, rawY: number): DiagramNode {
  pushHistory();
  const clampedX = Math.max(24, rawX);
  const clampedY = Math.max(32, rawY);
  const node = createNodeFromStencil(kind, clampedX, clampedY, doc.nodes.length);
  if (!snapToGrid) {
    node.x = Math.round(clampedX);
    node.y = Math.round(clampedY);
  }
  doc.nodes.push(node);
  expandStageToFit(doc);
  selection = { type: 'node', id: node.id };
  renderAll(true);
  return node;
}

// ---------------------------------------------------------------------------
// Port-to-Port Interactive Connection Wiring
// ---------------------------------------------------------------------------
interface ActiveWireDraft {
  sourceNodeId: string;
  sourcePort: PortSide;
  startPt: [number, number];
  hoveredPortBtn: HTMLElement | null;
}

let activeWireDraft: ActiveWireDraft | null = null;

function beginPortWireDrag(
  e: PointerEvent,
  sourceNode: DiagramNode,
  sourcePort: PortSide,
  captureEl: HTMLElement,
): void {
  e.stopPropagation();
  e.preventDefault();
  const startPt: [number, number] =
    sourcePort === 'auto'
      ? getNodeCenter(sourceNode)
      : getPortPoint(sourceNode, sourcePort);

  activeWireDraft = {
    sourceNodeId: sourceNode.id,
    sourcePort,
    startPt,
    hoveredPortBtn: null,
  };
  workspace.dataset.wiring = 'true';
  draftWire.removeAttribute('hidden');
  draftWire.setAttribute('d', `M ${startPt[0]} ${startPt[1]} L ${startPt[0]} ${startPt[1]}`);
  captureEl.setPointerCapture(e.pointerId);

  const onMove = (moveEv: PointerEvent) => {
    if (!activeWireDraft) return;
    const [wx, wy] = screenToWorld(moveEv.clientX, moveEv.clientY);

    // Check if pointer is hovering over a target port or target node
    const hitEl = document.elementFromPoint(moveEv.clientX, moveEv.clientY) as HTMLElement | null;
    const portBtn = hitEl?.closest('.node-port') as HTMLElement | null;

    if (activeWireDraft.hoveredPortBtn && activeWireDraft.hoveredPortBtn !== portBtn) {
      activeWireDraft.hoveredPortBtn.classList.remove('is-target-port');
    }
    if (portBtn && portBtn.dataset.nodeId !== activeWireDraft.sourceNodeId) {
      portBtn.classList.add('is-target-port');
      activeWireDraft.hoveredPortBtn = portBtn;
    } else {
      activeWireDraft.hoveredPortBtn = null;
    }

    const [sx, sy] = activeWireDraft.startPt;
    const midX = Math.round((sx + wx) / 2);
    draftWire.setAttribute('d', `M ${sx} ${sy} C ${midX} ${sy}, ${midX} ${wy}, ${wx} ${wy}`);
  };

  const onFinish = (upEv: PointerEvent, commit: boolean) => {
    upEv.stopPropagation();
    captureEl.removeEventListener('pointermove', onMove);
    captureEl.removeEventListener('pointerup', onUp);
    captureEl.removeEventListener('pointercancel', onCancel);

    if (activeWireDraft?.hoveredPortBtn) {
      activeWireDraft.hoveredPortBtn.classList.remove('is-target-port');
    }

    const draft = activeWireDraft;
    activeWireDraft = null;
    delete workspace.dataset.wiring;
    draftWire.setAttribute('hidden', '');

    if (!commit || !draft) return;

    const hitEl = document.elementFromPoint(upEv.clientX, upEv.clientY) as HTMLElement | null;
    const targetPortEl = hitEl?.closest('.node-port') as HTMLElement | null;
    const targetNodeEl = hitEl?.closest('.arch-node') as HTMLElement | null;

    if (targetPortEl && targetPortEl.dataset.nodeId && targetPortEl.dataset.nodeId !== draft.sourceNodeId) {
      createEdgeConnection(
        draft.sourceNodeId,
        targetPortEl.dataset.nodeId,
        draft.sourcePort,
        (targetPortEl.dataset.port as PortSide) || 'auto',
      );
    } else if (targetNodeEl && targetNodeEl.dataset.node && targetNodeEl.dataset.node !== draft.sourceNodeId) {
      createEdgeConnection(draft.sourceNodeId, targetNodeEl.dataset.node, draft.sourcePort, 'auto');
    }
  };

  const onUp = (upEv: PointerEvent) => onFinish(upEv, true);
  const onCancel = (cancelEv: PointerEvent) => onFinish(cancelEv, false);

  captureEl.addEventListener('pointermove', onMove);
  captureEl.addEventListener('pointerup', onUp);
  captureEl.addEventListener('pointercancel', onCancel);
}

function createEdgeConnection(
  fromId: string,
  toId: string,
  sourcePort: PortSide,
  targetPort: PortSide,
): void {
  if (fromId === toId) return;
  pushHistory();
  const newEdge: DiagramEdge = {
    id: nextUid('edge'),
    from: fromId,
    to: toId,
    sourcePort,
    targetPort,
    tone: 'blue',
    route: 'auto',
    label: '',
    animated: true,
  };
  doc.edges.push(newEdge);
  selection = { type: 'edge', id: newEdge.id };
  connectSourceNodeId = null;
  renderAll(true);
}

// ---------------------------------------------------------------------------
// Rendering Pipeline (Stage + Wires + Property Editor + Telemetry Inspector)
// ---------------------------------------------------------------------------
function renderAll(rebuildInspector = true): void {
  const isEmpty = doc.nodes.length === 0 && doc.zones.length === 0 && doc.notesCards.length === 0;
  emptyStageOverlay.hidden = !isEmpty;
  if (isEmpty && btnRestoreSession) {
    const saved = loadSavedSessionDoc();
    if (saved) {
      btnRestoreSession.hidden = false;
      btnRestoreSession.textContent = `↺ Restore Previous Session (${saved.nodes.length} ${saved.nodes.length === 1 ? 'node' : 'nodes'})`;
    } else {
      btnRestoreSession.hidden = true;
    }
  }

  docTitleHeadingEl.textContent = doc.title || 'Untitled Architecture';
  docSystemTagEl.textContent = doc.systemTag || 'CONDUITCRAFT';
  docStatusLabelEl.textContent = doc.statusLabel || 'LIVE TELEMETRY';
  canvasStatsPill.textContent = `${doc.nodes.length} ${doc.nodes.length === 1 ? 'NODE' : 'NODES'} · ${doc.edges.length} ${doc.edges.length === 1 ? 'WIRE' : 'WIRES'}`;

  stageWorld.style.width = `${doc.stageWidth}px`;
  stageWorld.style.height = `${doc.stageHeight}px`;
  wiresSvg.setAttribute('viewBox', `0 0 ${doc.stageWidth} ${doc.stageHeight}`);
  wiresSvg.setAttribute('width', String(doc.stageWidth));
  wiresSvg.setAttribute('height', String(doc.stageHeight));

  renderZones();
  renderNotesCards();
  renderWiresOnly();
  renderNodes();
  renderSimButtons();
  renderMatrixTable();
  updateVisualSelectionHighlights();

  if (rebuildInspector) {
    if (workspaceMode === 'design') {
      renderPropertyEditor();
    } else {
      syncDataViewInspector();
    }
  }
}

function renderZones(): void {
  zonesLayer.replaceChildren();
  for (const zone of doc.zones) {
    const banner = document.createElement('div');
    banner.className = 'zone-banner';
    if (selection.type === 'zone' && selection.id === zone.id) {
      banner.classList.add('is-selected');
    }
    banner.dataset.zoneId = zone.id;
    banner.style.setProperty('--zx', String(zone.x));
    banner.style.setProperty('--zw', String(zone.width));

    const left = document.createElement('span');
    const numSpan = document.createElement('span');
    numSpan.className = 'zone-num';
    numSpan.textContent = `${zone.number} `;
    left.append(numSpan, document.createTextNode(zone.title));

    const right = document.createElement('span');
    right.textContent = zone.subtitle;

    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'zone-resize-handle';
    resizeHandle.title = 'Drag to resize swimlane width';

    banner.append(left, right, resizeHandle);

    // Drag swimlane X position
    let dragStartX = 0;
    let origX = zone.x;
    let moved = false;
    banner.addEventListener('pointerdown', (e) => {
      if (workspaceMode !== 'design' || e.button !== 0 || e.target === resizeHandle) return;
      e.stopPropagation();
      selection = { type: 'zone', id: zone.id };
      updateVisualSelectionHighlights();
      renderPropertyEditor();

      dragStartX = e.clientX;
      origX = zone.x;
      moved = false;
      banner.setPointerCapture(e.pointerId);
    });
    banner.addEventListener('pointermove', (e) => {
      if (!banner.hasPointerCapture(e.pointerId)) return;
      const dx = (e.clientX - dragStartX) / scale;
      if (!moved && Math.abs(dx) > 3) {
        pushHistory();
        moved = true;
        banner.classList.add('dragging');
      }
      if (moved) {
        const rawX = Math.max(16, origX + dx);
        zone.x = snapToGrid ? Math.round(rawX / 16) * 16 : Math.round(rawX);
        banner.style.setProperty('--zx', String(zone.x));
        expandStageToFit(doc);
      }
    });
    const endZoneDrag = () => {
      const didMove = moved;
      moved = false;
      banner.classList.remove('dragging');
      if (didMove) renderPropertyEditor();
    };
    banner.addEventListener('pointerup', (e) => {
      e.stopPropagation();
      endZoneDrag();
    });
    banner.addEventListener('lostpointercapture', endZoneDrag);

    // Resize swimlane width
    let resizeStartX = 0;
    let origW = zone.width;
    let resized = false;
    resizeHandle.addEventListener('pointerdown', (e) => {
      if (workspaceMode !== 'design' || e.button !== 0) return;
      e.stopPropagation();
      if (selection.type !== 'zone' || selection.id !== zone.id) {
        selection = { type: 'zone', id: zone.id };
        updateVisualSelectionHighlights();
        renderPropertyEditor();
      }
      resizeStartX = e.clientX;
      origW = zone.width;
      resized = false;
      resizeHandle.setPointerCapture(e.pointerId);
    });
    resizeHandle.addEventListener('pointermove', (e) => {
      if (!resizeHandle.hasPointerCapture(e.pointerId)) return;
      const dw = (e.clientX - resizeStartX) / scale;
      if (!resized && Math.abs(dw) > 3) {
        pushHistory();
        resized = true;
      }
      if (resized) {
        const rawW = Math.max(160, origW + dw);
        zone.width = snapToGrid ? Math.round(rawW / 16) * 16 : Math.round(rawW);
        banner.style.setProperty('--zw', String(zone.width));
        expandStageToFit(doc);
      }
    });
    resizeHandle.addEventListener('pointerup', (e) => {
      e.stopPropagation();
      if (resized) {
        resized = false;
        renderPropertyEditor();
      }
    });

    zonesLayer.appendChild(banner);
  }
}

function renderNotesCards(): void {
  notesLayer.replaceChildren();
  for (const card of doc.notesCards) {
    const aside = document.createElement('aside');
    aside.className = 'blueprint-spec';
    if (selection.type === 'notes' && selection.id === card.id) {
      aside.classList.add('is-selected');
    }
    aside.dataset.notesId = card.id;
    aside.style.setProperty('--bx', String(card.x));
    aside.style.setProperty('--by', String(card.y));

    const header = document.createElement('div');
    header.className = 'blueprint-spec-header';
    const hTitle = document.createElement('span');
    hTitle.textContent = card.title;
    const hCode = document.createElement('span');
    hCode.textContent = card.code;
    header.append(hTitle, hCode);

    const list = document.createElement('ul');
    list.className = 'blueprint-spec-list';
    for (const item of card.items) {
      const li = document.createElement('li');
      const check = document.createElement('span');
      check.className = 'spec-check';
      check.setAttribute('aria-hidden', 'true');
      check.textContent = '✓';

      const body = document.createElement('span');
      const strong = document.createElement('strong');
      strong.textContent = `${item.title}: `;
      body.append(strong, document.createTextNode(item.text));
      li.append(check, body);
      list.appendChild(li);
    }

    aside.append(header, list);

    aside.addEventListener('pointerdown', (e) => {
      if (workspaceMode !== 'design' || e.button !== 0) return;
      e.stopPropagation();
      if (selection.type !== 'notes' || selection.id !== card.id) {
        selection = { type: 'notes', id: card.id };
        updateVisualSelectionHighlights();
        renderPropertyEditor();
      }
    });

    aside.addEventListener('pointerup', (e) => {
      if (workspaceMode === 'design') e.stopPropagation();
    });

    aside.addEventListener('click', (e) => {
      if (workspaceMode !== 'design') return;
      e.stopPropagation();
      if (selection.type !== 'notes' || selection.id !== card.id || propPanelHeading.textContent !== 'NOTES / SPEC CARD') {
        selection = { type: 'notes', id: card.id };
        updateVisualSelectionHighlights();
        renderPropertyEditor();
      }
    });

    // Drag Notes card via its header (`drag` guide)
    let startX = 0;
    let startY = 0;
    let origX = card.x;
    let origY = card.y;
    let moved = false;

    header.addEventListener('pointerdown', (e) => {
      if (workspaceMode !== 'design' || e.button !== 0) return;
      e.stopPropagation();
      if (selection.type !== 'notes' || selection.id !== card.id) {
        selection = { type: 'notes', id: card.id };
        updateVisualSelectionHighlights();
        renderPropertyEditor();
      }

      startX = e.clientX;
      startY = e.clientY;
      origX = card.x;
      origY = card.y;
      moved = false;
      header.setPointerCapture(e.pointerId);
    });

    header.addEventListener('pointermove', (e) => {
      if (!header.hasPointerCapture(e.pointerId)) return;
      const dx = (e.clientX - startX) / scale;
      const dy = (e.clientY - startY) / scale;
      if (!moved && Math.hypot(dx, dy) > 4) {
        pushHistory();
        moved = true;
        header.classList.add('dragging');
      }
      if (moved) {
        const nx = Math.max(16, origX + dx);
        const ny = Math.max(16, origY + dy);
        card.x = snapToGrid ? Math.round(nx / 16) * 16 : Math.round(nx);
        card.y = snapToGrid ? Math.round(ny / 16) * 16 : Math.round(ny);
        aside.style.setProperty('--bx', String(card.x));
        aside.style.setProperty('--by', String(card.y));
        expandStageToFit(doc);
      }
    });

    const endNotesDrag = () => {
      moved = false;
      header.classList.remove('dragging');
    };
    header.addEventListener('pointerup', (e) => {
      e.stopPropagation();
      endNotesDrag();
    });
    header.addEventListener('lostpointercapture', endNotesDrag);

    notesLayer.appendChild(aside);
  }
}

function renderWiresOnly(): void {
  wiresGroup.replaceChildren();
  const routed = routeDiagramEdges(doc);
  const nodeTitleMap = new Map(doc.nodes.map((n) => [n.id, n.title]));

  for (const edge of routed) {
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', 'conduit-group');
    const isSelectedEdge = selection.type === 'edge' && selection.id === edge.id;
    if (isSelectedEdge) {
      g.classList.add('is-selected');
    }
    g.dataset.edgeId = edge.id;
    g.dataset.tone = edge.tone;
    g.dataset.from = edge.from;
    g.dataset.to = edge.to;
    g.dataset.animated = edge.animated ? 'true' : 'false';

    // Keyboard & Screen-Reader Accessibility for Stream Wires
    const fromName = nodeTitleMap.get(edge.from) || edge.from;
    const toName = nodeTitleMap.get(edge.to) || edge.to;
    g.setAttribute('tabindex', '0');
    g.setAttribute('role', 'button');
    g.setAttribute(
      'aria-label',
      `Stream wire from ${fromName} to ${toName}${edge.label ? `, ${edge.label}` : ''}, ${edge.route} routing`,
    );

    const selectWire = (e: Event) => {
      e.stopPropagation();
      if (workspaceMode === 'design') {
        if (selection.type !== 'edge' || selection.id !== edge.id || propPanelHeading.textContent !== 'STREAM WIRE PROPERTIES') {
          selection = { type: 'edge', id: edge.id };
          updateVisualSelectionHighlights();
          renderWiresOnly();
          renderPropertyEditor();
        }
      } else {
        // In Data View, clicking a stream wire selects its target component!
        selection = { type: 'node', id: edge.to };
        updateVisualSelectionHighlights();
        syncDataViewInspector();
      }
    };

    g.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectWire(e);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && workspaceMode === 'design') {
        e.preventDefault();
        e.stopPropagation();
        selection = { type: 'edge', id: edge.id };
        deleteSelected();
      }
    });

    const laneTx =
      edge.laneOffset && (edge.laneOffset[0] !== 0 || edge.laneOffset[1] !== 0)
        ? `translate(${edge.laneOffset[0]}, ${edge.laneOffset[1]})`
        : null;

    // Wide invisible clickable hit target for effortless selection in Design Mode
    const hit = document.createElementNS(SVG_NS, 'path');
    hit.setAttribute('class', 'conduit-hit');
    hit.setAttribute('d', edge.pathD);
    if (laneTx) hit.setAttribute('transform', laneTx);
    hit.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      selectWire(e);
    });
    hit.addEventListener('pointerup', (e) => e.stopPropagation());
    hit.addEventListener('click', selectWire);

    const glow = document.createElementNS(SVG_NS, 'path');
    glow.setAttribute('class', 'conduit-glow');
    glow.setAttribute('d', edge.pathD);
    if (laneTx) glow.setAttribute('transform', laneTx);

    const rail = document.createElementNS(SVG_NS, 'path');
    rail.setAttribute('class', 'conduit-rail');
    rail.setAttribute('d', edge.pathD);
    if (laneTx) rail.setAttribute('transform', laneTx);

    const stream = document.createElementNS(SVG_NS, 'path');
    stream.setAttribute('class', 'conduit-stream');
    stream.setAttribute('d', edge.pathD);
    stream.setAttribute('marker-end', `url(#arrow-${edge.tone})`);
    if (laneTx) stream.setAttribute('transform', laneTx);

    const portDot = document.createElementNS(SVG_NS, 'circle');
    portDot.setAttribute('class', 'port-dot');
    portDot.setAttribute('cx', String(edge.startPoint[0]));
    portDot.setAttribute('cy', String(edge.startPoint[1]));
    portDot.setAttribute('r', '4');
    if (laneTx) portDot.setAttribute('transform', laneTx);

    g.append(hit, glow, rail, stream, portDot);

    if (edge.label && edge.badgePos && edge.badgeWidth) {
      const badgeG = document.createElementNS(SVG_NS, 'g');
      badgeG.setAttribute('class', 'conduit-badge-hit');
      badgeG.setAttribute('transform', `translate(${edge.badgePos[0]}, ${edge.badgePos[1]})`);

      const rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('class', 'route-pill-bg');
      const bw = Math.round(edge.badgeWidth);
      rect.setAttribute('x', String(-Math.round(bw / 2)));
      rect.setAttribute('y', '-13');
      rect.setAttribute('width', String(bw));
      rect.setAttribute('height', '26');
      rect.setAttribute('rx', '13');

      const txt = document.createElementNS(SVG_NS, 'text');
      txt.setAttribute('class', 'route-pill-text');
      txt.setAttribute('text-anchor', 'middle');
      txt.setAttribute('y', '4');
      txt.textContent = edge.label;

      badgeG.append(rect, txt);
      badgeG.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        selectWire(e);
      });
      badgeG.addEventListener('pointerup', (e) => e.stopPropagation());
      badgeG.addEventListener('click', selectWire);
      g.appendChild(badgeG);
    }

    // Draggable Wire Waypoint Handle in Design Mode when selected
    if (workspaceMode === 'design' && isSelectedEdge) {
      const wpPos = edge.waypoint ?? edge.badgePos ?? [
        Math.round((edge.startPoint[0] + edge.endPoint[0]) / 2),
        Math.round((edge.startPoint[1] + edge.endPoint[1]) / 2),
      ];
      const wpHandle = document.createElementNS(SVG_NS, 'circle');
      wpHandle.setAttribute('class', 'conduit-waypoint-handle');
      wpHandle.setAttribute('cx', String(wpPos[0]));
      wpHandle.setAttribute('cy', String(wpPos[1]));
      wpHandle.setAttribute('r', '5.5');
      wpHandle.setAttribute('aria-label', 'Drag to bend wire path, double-click to reset');

      let wpDragging = false;
      wpHandle.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        pushHistory();
        wpDragging = true;
        wpHandle.classList.add('is-dragging');
        wpHandle.setPointerCapture(e.pointerId);
      });
      wpHandle.addEventListener('pointermove', (e) => {
        if (!wpDragging || !wpHandle.hasPointerCapture(e.pointerId)) return;
        const [wx, wy] = screenToWorld(e.clientX, e.clientY);
        const targetEdge = doc.edges.find((ed) => ed.id === edge.id);
        if (targetEdge) {
          targetEdge.waypoint = [
            snapToGrid ? Math.round(wx / 8) * 8 : wx,
            snapToGrid ? Math.round(wy / 8) * 8 : wy,
          ];
          renderWiresOnly();
        }
      });
      const stopWpDrag = (e: PointerEvent) => {
        e.stopPropagation();
        if (wpDragging) {
          wpDragging = false;
          renderPropertyEditor();
        }
      };
      wpHandle.addEventListener('pointerup', stopWpDrag);
      wpHandle.addEventListener('lostpointercapture', () => {
        wpDragging = false;
      });
      wpHandle.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        const targetEdge = doc.edges.find((ed) => ed.id === edge.id);
        if (targetEdge && targetEdge.waypoint) {
          pushHistory();
          delete targetEdge.waypoint;
          renderWiresOnly();
          renderPropertyEditor();
        }
      });

      g.appendChild(wpHandle);
    }

    wiresGroup.appendChild(g);
  }
}

function computeSnappedPosition(
  movingNode: DiagramNode,
  rawX: number,
  rawY: number,
): [number, number] {
  let nextX = Math.max(16, rawX);
  let nextY = Math.max(24, rawY);

  alignGuideX.hidden = true;
  alignGuideY.hidden = true;

  if (!snapToGrid) {
    return [Math.round(nextX), Math.round(nextY)];
  }

  let snappedX = false;
  let snappedY = false;
  const tol = 8;
  const cx = nextX + movingNode.width / 2;
  const cy = nextY + movingNode.height / 2;

  for (const other of doc.nodes) {
    if (other.id === movingNode.id) continue;
    const ocx = other.x + other.width / 2;
    const ocy = other.y + other.height / 2;

    if (!snappedX && Math.abs(cx - ocx) <= tol) {
      nextX = Math.round(ocx - movingNode.width / 2);
      alignGuideX.hidden = false;
      alignGuideX.style.setProperty('--gx', String(Math.round(ocx)));
      snappedX = true;
    } else if (!snappedX && Math.abs(nextX - other.x) <= tol) {
      nextX = other.x;
      alignGuideX.hidden = false;
      alignGuideX.style.setProperty('--gx', String(other.x));
      snappedX = true;
    }

    if (!snappedY && Math.abs(cy - ocy) <= tol) {
      nextY = Math.round(ocy - movingNode.height / 2);
      alignGuideY.hidden = false;
      alignGuideY.style.setProperty('--gy', String(Math.round(ocy)));
      snappedY = true;
    } else if (!snappedY && Math.abs(nextY - other.y) <= tol) {
      nextY = other.y;
      alignGuideY.hidden = false;
      alignGuideY.style.setProperty('--gy', String(other.y));
      snappedY = true;
    }
  }

  if (!snappedX) nextX = Math.round(nextX / 16) * 16;
  if (!snappedY) nextY = Math.round(nextY / 16) * 16;

  return [nextX, nextY];
}

function renderNodes(): void {
  nodesLayer.replaceChildren();

  for (const node of doc.nodes) {
    const wrapper = document.createElement('div');
    wrapper.className = 'arch-node';
    wrapper.dataset.node = node.id;
    wrapper.dataset.kind = node.kind;
    wrapper.dataset.accent = node.accent;
    wrapper.style.setProperty('--nx', String(node.x));
    wrapper.style.setProperty('--ny', String(node.y));
    wrapper.style.setProperty('--nw', String(node.width));
    wrapper.style.setProperty('--nh', String(node.height));

    // 1. Primary Select / Drag Hit Button
    const selectBtn = document.createElement('button');
    selectBtn.type = 'button';
    selectBtn.className = 'node-select-hit';
    selectBtn.setAttribute(
      'aria-pressed',
      String(selection.type === 'node' && selection.id === node.id),
    );

    if (node.kind === 'actor') {
      const fig = document.createElement('span');
      fig.className = 'actor-figure';
      fig.appendChild(createHumanOutlineSvg(false));

      const cap = document.createElement('span');
      cap.className = 'actor-caption';
      const tSpan = document.createElement('span');
      tSpan.className = 'node-title';
      tSpan.textContent = node.title;
      cap.appendChild(tSpan);

      if (node.subtitle) {
        const rSpan = document.createElement('span');
        rSpan.className = 'actor-role';
        rSpan.textContent = node.subtitle;
        cap.appendChild(rSpan);
      }
      selectBtn.append(fig, cap);
    } else if (node.kind === 'client') {
      const top = document.createElement('div');
      top.className = 'node-top';
      const iconBox = document.createElement('span');
      iconBox.className = 'node-icon';
      iconBox.appendChild(createNodeIconSvg(node.icon, 16));
      const chip = document.createElement('span');
      chip.className = 'micro-chip';
      chip.textContent = node.chip;
      top.append(iconBox, chip);

      const mid = document.createElement('div');
      const titleSpan = document.createElement('span');
      titleSpan.className = 'node-title';
      titleSpan.textContent = node.title;
      const subSpan = document.createElement('span');
      subSpan.className = 'node-sub';
      subSpan.textContent = node.subtitle;
      mid.append(titleSpan, subSpan);

      selectBtn.append(top, mid);
    } else {
      const top = document.createElement('div');
      top.className = 'node-top';
      const iconBox = document.createElement('span');
      iconBox.className = 'node-icon';
      iconBox.appendChild(createNodeIconSvg(node.icon, 19));
      const eyebrow = document.createElement('span');
      eyebrow.className = 'node-eyebrow';
      eyebrow.textContent = node.eyebrow;
      top.append(iconBox, eyebrow);

      const mid = document.createElement('div');
      const titleSpan = document.createElement('span');
      titleSpan.className = 'node-title';
      titleSpan.textContent = node.title;
      const subSpan = document.createElement('span');
      subSpan.className = 'node-sub';
      subSpan.textContent = node.subtitle;
      mid.append(titleSpan, subSpan);

      const footer = document.createElement('div');
      footer.className = 'node-footer';
      const fLeft = document.createElement('span');
      fLeft.textContent = node.footerLeft;
      const chip = document.createElement('span');
      chip.className = 'micro-chip';
      chip.textContent = node.chip;
      footer.append(fLeft, chip);

      selectBtn.append(top, mid, footer);
    }

    // 2. Dedicated Keyboard & Pointer Drag Handle (`drag` guide)
    const dragHandle = document.createElement('button');
    dragHandle.type = 'button';
    dragHandle.className = 'node-drag-handle';
    dragHandle.setAttribute('aria-label', `Move ${node.title} with arrow keys or drag`);
    dragHandle.textContent = '⋮⋮';

    // Shared drag logic for both `.node-drag-handle` and `.node-select-hit` in Design Select mode
    let lastPointerWasDrag = false;
    const attachNodeMove = (triggerEl: HTMLElement, isHandle: boolean) => {
      let startClientX = 0;
      let startClientY = 0;
      let origX = 0;
      let origY = 0;
      let groupStartPositions: Map<string, [number, number]> | null = null;
      let hasMoved = false;

      triggerEl.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;

        // In Connect tool mode, dragging from the node body wires to another node!
        if (workspaceMode === 'design' && pointerTool === 'connect' && !isHandle) {
          beginPortWireDrag(e, node, 'auto', triggerEl);
          return;
        }

        // In Data View mode, clicking selects the node without dragging
        if (workspaceMode === 'data') {
          e.stopPropagation();
          return;
        }

        e.stopPropagation();
        lastPointerWasDrag = false;

        // Shift-click toggles node into/out of multi-selection
        if (e.shiftKey) {
          const currentIds = getSelectedNodeIds();
          const nextIds = currentIds.includes(node.id)
            ? currentIds.filter((id) => id !== node.id)
            : [...currentIds, node.id];
          selection =
            nextIds.length > 1
              ? { type: 'multi', ids: nextIds }
              : nextIds.length === 1
                ? { type: 'node', id: nextIds[0] }
                : { type: 'none' };
          updateVisualSelectionHighlights();
          renderPropertyEditor();
          return;
        }

        if (!isSelectedNode(node.id)) {
          selection = { type: 'node', id: node.id };
          updateVisualSelectionHighlights();
          renderPropertyEditor();
        } else if (
          selection.type === 'node' &&
          propPanelHeading.textContent !== 'COMPONENT PROPERTIES'
        ) {
          renderPropertyEditor();
        }

        startClientX = e.clientX;
        startClientY = e.clientY;
        origX = node.x;
        origY = node.y;
        if (selection.type === 'multi' && selection.ids.includes(node.id)) {
          groupStartPositions = new Map(
            doc.nodes
              .filter((n) => selection.type === 'multi' && selection.ids.includes(n.id))
              .map((n) => [n.id, [n.x, n.y] as [number, number]]),
          );
        } else {
          groupStartPositions = null;
        }
        hasMoved = false;
        triggerEl.setPointerCapture(e.pointerId);
      });

      triggerEl.addEventListener('pointermove', (e) => {
        if (!triggerEl.hasPointerCapture(e.pointerId)) return;
        const dx = (e.clientX - startClientX) / scale;
        const dy = (e.clientY - startClientY) / scale;

        if (!hasMoved && Math.hypot(dx, dy) > 4) {
          pushHistory();
          hasMoved = true;
          wrapper.classList.add('is-dragging-node');
          if (isHandle) dragHandle.classList.add('dragging');
          if (!isSelectedNode(node.id)) {
            selection = { type: 'node', id: node.id };
          }
          updateVisualSelectionHighlights();
        }

        if (hasMoved) {
          if (groupStartPositions && groupStartPositions.size > 1) {
            const stepDx = snapToGrid ? Math.round(dx / 16) * 16 : Math.round(dx);
            const stepDy = snapToGrid ? Math.round(dy / 16) * 16 : Math.round(dy);
            for (const [id, [sx, sy]] of groupStartPositions.entries()) {
              const member = doc.nodes.find((n) => n.id === id);
              if (member) {
                member.x = Math.max(16, sx + stepDx);
                member.y = Math.max(24, sy + stepDy);
                const el = nodesLayer.querySelector<HTMLElement>(`.arch-node[data-node="${id}"]`);
                if (el) {
                  el.style.setProperty('--nx', String(member.x));
                  el.style.setProperty('--ny', String(member.y));
                }
              }
            }
          } else {
            const [snappedX, snappedY] = computeSnappedPosition(node, origX + dx, origY + dy);
            node.x = snappedX;
            node.y = snappedY;
            wrapper.style.setProperty('--nx', String(node.x));
            wrapper.style.setProperty('--ny', String(node.y));
          }
          expandStageToFit(doc);
          renderWiresOnly();
          updateVisualSelectionHighlights();
        }
      });

      const endMove = () => {
        const movedDuringDrag = hasMoved;
        hasMoved = false;
        groupStartPositions = null;
        alignGuideX.hidden = true;
        alignGuideY.hidden = true;
        wrapper.classList.remove('is-dragging-node');
        dragHandle.classList.remove('dragging');
        if (movedDuringDrag) {
          renderPropertyEditor();
        }
      };

      triggerEl.addEventListener('pointerup', (e) => {
        e.stopPropagation();
        const wasMoved = hasMoved;
        lastPointerWasDrag = wasMoved;
        endMove();
        if (!wasMoved && !e.shiftKey) {
          if (workspaceMode === 'design') {
            if (
              selection.type !== 'node' ||
              selection.id !== node.id ||
              propPanelHeading.textContent !== 'COMPONENT PROPERTIES'
            ) {
              selection = { type: 'node', id: node.id };
              updateVisualSelectionHighlights();
              renderPropertyEditor();
            }
          } else {
            selection = { type: 'node', id: node.id };
            updateVisualSelectionHighlights();
            syncDataViewInspector();
          }
        }
      });
      triggerEl.addEventListener('lostpointercapture', endMove);
    };

    attachNodeMove(selectBtn, false);
    attachNodeMove(dragHandle, true);

    // Click handler for Data View, Connect mode, and keyboard activation in Design Select mode
    selectBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (lastPointerWasDrag) {
        lastPointerWasDrag = false;
        return;
      }
      if (workspaceMode === 'data') {
        selection = { type: 'node', id: node.id };
        updateVisualSelectionHighlights();
        syncDataViewInspector();
      } else if (pointerTool === 'connect') {
        if (connectSourceNodeId && connectSourceNodeId !== node.id) {
          createEdgeConnection(connectSourceNodeId, node.id, 'auto', 'auto');
        } else {
          connectSourceNodeId = node.id;
          selection = { type: 'node', id: node.id };
          updateVisualSelectionHighlights();
          renderPropertyEditor();
        }
      } else if (
        selection.type !== 'node' ||
        selection.id !== node.id ||
        propPanelHeading.textContent !== 'COMPONENT PROPERTIES'
      ) {
        selection = { type: 'node', id: node.id };
        updateVisualSelectionHighlights();
        renderPropertyEditor();
      }
    });

    // Keyboard Arrow-key movement on `.node-drag-handle` (`drag` guide)
    dragHandle.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 4 : 16;
      let dx = 0;
      let dy = 0;
      if (e.key === 'ArrowLeft') dx = -step;
      else if (e.key === 'ArrowRight') dx = step;
      else if (e.key === 'ArrowUp') dy = -step;
      else if (e.key === 'ArrowDown') dy = step;
      else return;

      e.preventDefault();
      pushHistory();
      node.x = Math.max(16, node.x + dx);
      node.y = Math.max(24, node.y + dy);
      wrapper.style.setProperty('--nx', String(node.x));
      wrapper.style.setProperty('--ny', String(node.y));
      expandStageToFit(doc);
      renderWiresOnly();
      selection = { type: 'node', id: node.id };
      updateVisualSelectionHighlights();
      renderPropertyEditor();
    });

    wrapper.append(selectBtn, dragHandle);

    // 3. Four Directional Connection Ports (`top`, `right`, `bottom`, `left`)
    const portSides: Array<Exclude<PortSide, 'auto'>> = ['top', 'right', 'bottom', 'left'];
    for (const side of portSides) {
      const portBtn = document.createElement('button');
      portBtn.type = 'button';
      portBtn.className = 'node-port';
      portBtn.dataset.port = side;
      portBtn.dataset.nodeId = node.id;
      portBtn.setAttribute('aria-label', `Connect from ${node.title} ${side} port`);

      portBtn.addEventListener('pointerdown', (e) => {
        if (workspaceMode !== 'design' || e.button !== 0) return;
        beginPortWireDrag(e, node, side, portBtn);
      });

      wrapper.appendChild(portBtn);
    }

    nodesLayer.appendChild(wrapper);
  }
}

function updateVisualSelectionHighlights(): void {
  const nodeWrappers = Array.from(nodesLayer.querySelectorAll<HTMLElement>('.arch-node'));
  const conduitGroups = Array.from(wiresGroup.querySelectorAll<SVGGElement>('.conduit-group'));
  const zoneBanners = Array.from(zonesLayer.querySelectorAll<HTMLElement>('.zone-banner'));
  const notesCards = Array.from(notesLayer.querySelectorAll<HTMLElement>('.blueprint-spec'));

  for (const zb of zoneBanners) {
    zb.classList.toggle('is-selected', selection.type === 'zone' && zb.dataset.zoneId === selection.id);
  }
  for (const nc of notesCards) {
    nc.classList.toggle('is-selected', selection.type === 'notes' && nc.dataset.notesId === selection.id);
  }

  if (workspaceMode === 'data' && selection.type === 'node') {
    const adj = getAdjacencyLists(doc, selection.id);
    const upIds = adj.upstream.map((u) => u.id);
    const downIds = adj.downstream.map((d) => d.id);

    for (const w of nodeWrappers) {
      const id = w.dataset.node || '';
      const hit = w.querySelector('.node-select-hit');
      const isSelected = id === selection.id;
      const connected = isSelected || upIds.includes(id) || downIds.includes(id);
      hit?.setAttribute('aria-pressed', String(isSelected));
      w.classList.toggle('is-dimmed', !connected);
    }
    for (const g of conduitGroups) {
      const touches = g.dataset.from === selection.id || g.dataset.to === selection.id;
      g.classList.toggle('is-highlighted', touches);
      g.classList.toggle('is-dimmed', !touches);
      g.classList.remove('is-selected');
    }
    return;
  }

  // Design Mode or Data View Overview
  for (const w of nodeWrappers) {
    const id = w.dataset.node || '';
    const hit = w.querySelector('.node-select-hit');
    hit?.setAttribute('aria-pressed', String(isSelectedNode(id)));
    w.classList.remove('is-dimmed');
  }
  for (const g of conduitGroups) {
    const isSel = selection.type === 'edge' && g.dataset.edgeId === selection.id;
    const fromId = g.dataset.from || '';
    const toId = g.dataset.to || '';
    const touchesNode = isSelectedNode(fromId) || isSelectedNode(toId);
    g.classList.toggle('is-selected', isSel);
    g.classList.toggle('is-highlighted', touchesNode || isSel);
    g.classList.remove('is-dimmed');
  }
}

// ---------------------------------------------------------------------------
// Design Mode: Right Contextual Property Editor
// ---------------------------------------------------------------------------
function makeField(
  id: string,
  labelText: string,
  control: HTMLElement,
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'prop-field';
  const lbl = document.createElement('label');
  lbl.htmlFor = id;
  lbl.textContent = labelText;
  control.id = id;
  wrap.append(lbl, control);
  return wrap;
}

function makeTextInput(
  value: string,
  onInput: (nextVal: string) => void,
  opts?: { identifier?: boolean },
): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'prop-input';
  input.value = value;
  if (opts?.identifier) {
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('autocapitalize', 'off');
    input.spellcheck = false;
  }
  let pushedThisFocus = false;
  input.addEventListener('focus', () => {
    pushedThisFocus = false;
  });
  input.addEventListener('input', () => {
    if (!pushedThisFocus) {
      pushHistory();
      pushedThisFocus = true;
    }
    onInput(input.value);
  });
  return input;
}

function makeTextarea(
  value: string,
  onInput: (nextVal: string) => void,
  isCode = false,
): HTMLTextAreaElement {
  const ta = document.createElement('textarea');
  ta.className = isCode ? 'prop-textarea prop-textarea-code' : 'prop-textarea';
  ta.value = value;
  if (isCode) {
    ta.spellcheck = false;
    ta.setAttribute('autocorrect', 'off');
    ta.setAttribute('autocapitalize', 'off');
  }
  let pushedThisFocus = false;
  ta.addEventListener('focus', () => {
    pushedThisFocus = false;
  });
  ta.addEventListener('input', () => {
    if (!pushedThisFocus) {
      pushHistory();
      pushedThisFocus = true;
    }
    onInput(ta.value);
  });
  return ta;
}

function makeTonePicker(
  groupName: string,
  current: StreamTone,
  onChange: (tone: StreamTone) => void,
): HTMLFieldSetElement {
  const fs = document.createElement('fieldset');
  fs.className = 'swatch-picker';
  const legend = document.createElement('legend');
  legend.className = 'visually-hidden';
  legend.textContent = 'Accent Color';
  fs.appendChild(legend);

  for (const opt of STREAM_TONE_OPTIONS) {
    const lbl = document.createElement('label');
    lbl.className = 'swatch-option';
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = groupName;
    radio.value = opt.id;
    radio.checked = opt.id === current;
    radio.className = 'visually-hidden';

    const dot = document.createElement('span');
    dot.className = 'pill-swatch';
    dot.style.background = opt.cssVar;

    const text = document.createElement('span');
    text.textContent = opt.id.charAt(0).toUpperCase() + opt.id.slice(1);

    radio.addEventListener('change', () => {
      if (radio.checked) {
        pushHistory();
        onChange(opt.id);
      }
    });

    lbl.append(radio, dot, text);
    fs.appendChild(lbl);
  }
  return fs;
}

function renderPropertyEditor(): void {
  propFormContainer.replaceChildren();
  const form = document.createElement('div');
  form.className = 'prop-form';
  const sel = selection;

  if (sel.type === 'node') {
    const node = doc.nodes.find((n) => n.id === sel.id);
    if (!node) {
      selection = { type: 'none' };
      renderPropertyEditor();
      return;
    }

    propPanelHeading.textContent = 'COMPONENT PROPERTIES';
    propSelectionActions.hidden = false;
    btnPropDuplicate.hidden = false;

    form.appendChild(
      makeField(
        'prop-node-title',
        'Title',
        makeTextInput(node.title, (v) => {
          node.title = v;
          renderAll(false);
        }),
      ),
    );

    form.appendChild(
      makeField(
        'prop-node-subtitle',
        'Subtitle / Role',
        makeTextInput(node.subtitle, (v) => {
          node.subtitle = v;
          renderAll(false);
        }),
      ),
    );

    // Component Kind + Icon Row
    const kindSelect = document.createElement('select');
    kindSelect.className = 'prop-select';
    for (const st of STENCIL_CATALOG) {
      const opt = document.createElement('option');
      opt.value = st.kind;
      opt.textContent = st.paletteTitle;
      opt.selected = st.kind === node.kind;
      kindSelect.appendChild(opt);
    }
    kindSelect.addEventListener('change', () => {
      pushHistory();
      node.kind = kindSelect.value as NodeKind;
      const dims = getNodeDimensions(node.kind);
      node.width = dims.width;
      node.height = dims.height;
      renderAll(true);
    });

    if (node.kind !== 'actor') {
      const iconSelect = document.createElement('select');
      iconSelect.className = 'prop-select';
      for (const ic of ICON_LIST) {
        const opt = document.createElement('option');
        opt.value = ic.id;
        opt.textContent = ic.label;
        opt.selected = ic.id === node.icon;
        iconSelect.appendChild(opt);
      }
      iconSelect.addEventListener('change', () => {
        pushHistory();
        node.icon = iconSelect.value as NodeIconName;
        renderAll(false);
      });

      const row = document.createElement('div');
      row.className = 'prop-row-2';
      row.append(
        makeField('prop-node-kind', 'Shape Kind', kindSelect),
        makeField('prop-node-icon', 'Icon', iconSelect),
      );
      form.appendChild(row);
    } else {
      form.appendChild(makeField('prop-node-kind', 'Shape Kind', kindSelect));
    }

    // Accent Swatch Picker
    const toneWrap = document.createElement('div');
    toneWrap.className = 'prop-field';
    const toneTitle = document.createElement('span');
    toneTitle.className = 'field-label';
    toneTitle.textContent = 'Accent Color';
    toneWrap.append(
      toneTitle,
      makeTonePicker('node-accent-tone', node.accent, (tone) => {
        node.accent = tone;
        renderAll(false);
      }),
    );
    form.appendChild(toneWrap);

    if (node.kind !== 'actor') {
      const rowBadges = document.createElement('div');
      rowBadges.className = 'prop-row-2';
      rowBadges.append(
        makeField(
          'prop-node-eyebrow',
          'Eyebrow Tag',
          makeTextInput(
            node.eyebrow,
            (v) => {
              node.eyebrow = v;
              renderAll(false);
            },
            { identifier: true },
          ),
        ),
        makeField(
          'prop-node-chip',
          'Badge Chip',
          makeTextInput(
            node.chip,
            (v) => {
              node.chip = v;
              renderAll(false);
            },
            { identifier: true },
          ),
        ),
      );
      form.appendChild(rowBadges);

      if (node.kind !== 'client') {
        form.appendChild(
          makeField(
            'prop-node-footer',
            'Card Footer Label',
            makeTextInput(node.footerLeft, (v) => {
              node.footerLeft = v;
              renderAll(false);
            }),
          ),
        );
      }
    }

    form.appendChild(
      makeField(
        'prop-node-interface',
        'Protocol / Interface (Matrix)',
        makeTextInput(node.interfaceLabel, (v) => {
          node.interfaceLabel = v;
          renderMatrixTable();
        }),
      ),
    );

    form.appendChild(
      makeField(
        'prop-node-summary',
        'Inspector Description',
        makeTextarea(node.summary, (v) => {
          node.summary = v;
        }),
      ),
    );

    // Telemetry Metrics Editor
    const metricsDiv = document.createElement('div');
    metricsDiv.className = 'prop-divider';
    const mHeader = document.createElement('div');
    mHeader.className = 'prop-list-header';
    const mTitle = document.createElement('span');
    mTitle.className = 'section-heading';
    mTitle.textContent = 'TELEMETRY METRICS';
    const btnAddMetric = document.createElement('button');
    btnAddMetric.type = 'button';
    btnAddMetric.className = 'btn btn-compact';
    btnAddMetric.style.flex = '0 0 auto';
    btnAddMetric.textContent = '+ Add';
    btnAddMetric.addEventListener('click', () => {
      pushHistory();
      node.metrics.push({ label: 'Metric', value: '100%' });
      renderPropertyEditor();
    });
    mHeader.append(mTitle, btnAddMetric);
    metricsDiv.appendChild(mHeader);

    node.metrics.forEach((m, idx) => {
      const row = document.createElement('div');
      row.className = 'kv-row';
      const kIn = makeTextInput(m.label, (v) => {
        m.label = v;
      });
      kIn.setAttribute('aria-label', `Metric ${idx + 1} label`);
      const vIn = makeTextInput(m.value, (v) => {
        m.value = v;
      });
      vIn.setAttribute('aria-label', `Metric ${idx + 1} value`);

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'btn btn-compact';
      delBtn.textContent = '×';
      delBtn.setAttribute('aria-label', `Remove metric ${m.label}`);
      delBtn.addEventListener('click', () => {
        pushHistory();
        node.metrics.splice(idx, 1);
        renderPropertyEditor();
      });

      row.append(kIn, vIn, delBtn);
      metricsDiv.appendChild(row);
    });
    form.appendChild(metricsDiv);

    // Sample Payload Editor
    const payloadDiv = document.createElement('div');
    payloadDiv.className = 'prop-divider';
    payloadDiv.appendChild(
      makeField(
        'prop-node-code',
        'Sample Payload / Contract (JSON or Text)',
        makeTextarea(
          node.code,
          (v) => {
            node.code = v;
          },
          true,
        ),
      ),
    );
    form.appendChild(payloadDiv);
  } else if (sel.type === 'edge') {
    const edge = doc.edges.find((e) => e.id === sel.id);
    if (!edge) {
      selection = { type: 'none' };
      renderPropertyEditor();
      return;
    }

    propPanelHeading.textContent = 'STREAM WIRE PROPERTIES';
    propSelectionActions.hidden = false;
    btnPropDuplicate.hidden = true;

    form.appendChild(
      makeField(
        'prop-edge-label',
        'Conduit Pill Label (optional)',
        makeTextInput(edge.label, (v) => {
          edge.label = v;
          renderWiresOnly();
        }),
      ),
    );

    const toneWrap = document.createElement('div');
    toneWrap.className = 'prop-field';
    const toneTitle = document.createElement('span');
    toneTitle.className = 'field-label';
    toneTitle.textContent = 'Stream Channel Color';
    toneWrap.append(
      toneTitle,
      makeTonePicker('edge-stream-tone', edge.tone, (tone) => {
        edge.tone = tone;
        renderWiresOnly();
        renderSimButtons();
      }),
    );
    form.appendChild(toneWrap);

    // Routing Style (Visual Schematic Picker)
    const routeFieldset = document.createElement('fieldset');
    routeFieldset.className = 'route-style-fieldset';
    const routeLegend = document.createElement('legend');
    routeLegend.className = 'field-label';
    routeLegend.textContent = 'Routing Style';
    routeFieldset.appendChild(routeLegend);

    const routeGrid = document.createElement('div');
    routeGrid.className = 'route-style-grid';

    const routeOptions: Array<{
      value: EdgeRouteMode;
      label: string;
      previewPath: string;
      fullSpan?: boolean;
    }> = [
      {
        value: 'auto',
        label: 'Smart Auto (Context-Aware)',
        previewPath: 'M 2 9 L 10 9 C 15 9, 13 5, 19 5 L 25 5',
        fullSpan: true,
      },
      {
        value: 'straight',
        label: 'Direct Line',
        previewPath: 'M 2 13 L 25 4',
      },
      {
        value: 'bezier',
        label: 'Smooth S-Curve',
        previewPath: 'M 2 9 C 10 1, 18 17, 25 9',
      },
      {
        value: 'arc',
        label: 'Curved Arc',
        previewPath: 'M 2 13 Q 14 1 25 13',
      },
      {
        value: 'fanout',
        label: 'Vertical Fan-out',
        previewPath: 'M 14 2 C 14 9, 23 8, 23 15',
      },
      {
        value: 'orthogonal',
        label: 'Rounded Elbow',
        previewPath: 'M 2 13 L 10 13 Q 14 13 14 9 L 14 7 Q 14 4 18 4 L 25 4',
      },
      {
        value: 'step',
        label: 'Sharp Step',
        previewPath: 'M 2 13 L 14 13 L 14 4 L 25 4',
      },
      {
        value: 'under',
        label: 'Under U-Loop',
        previewPath: 'M 4 4 L 4 12 Q 4 15 7 15 L 21 15 Q 24 15 24 12 L 24 4',
      },
      {
        value: 'over',
        label: 'Over U-Loop',
        previewPath: 'M 4 14 L 4 6 Q 4 3 7 3 L 21 3 Q 24 3 24 6 L 24 14',
      },
    ];

    for (const ro of routeOptions) {
      const lbl = document.createElement('label');
      lbl.className = ro.fullSpan ? 'route-style-option is-full-span' : 'route-style-option';

      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'edge-route-mode';
      radio.value = ro.value;
      radio.checked = ro.value === edge.route;
      radio.className = 'visually-hidden';

      const svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('class', 'route-style-icon');
      svg.setAttribute('width', '28');
      svg.setAttribute('height', '18');
      svg.setAttribute('viewBox', '0 0 28 18');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('aria-hidden', 'true');

      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', ro.previewPath);
      path.setAttribute('stroke', 'currentColor');
      path.setAttribute('stroke-width', '2');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(path);

      const txt = document.createElement('span');
      txt.textContent = ro.label;

      radio.addEventListener('change', () => {
        if (!radio.checked) return;
        pushHistory();
        edge.route = ro.value;
        renderWiresOnly();
        updateVisualSelectionHighlights();
      });

      lbl.append(radio, svg, txt);
      routeGrid.appendChild(lbl);
    }

    routeFieldset.appendChild(routeGrid);
    form.appendChild(routeFieldset);

    // Source & Target Port Overrides
    const makePortSelect = (current: PortSide, onChange: (p: PortSide) => void) => {
      const sel = document.createElement('select');
      sel.className = 'prop-select';
      for (const side of ['auto', 'top', 'right', 'bottom', 'left'] as PortSide[]) {
        const opt = document.createElement('option');
        opt.value = side;
        opt.textContent = side.toUpperCase();
        opt.selected = side === current;
        sel.appendChild(opt);
      }
      sel.addEventListener('change', () => {
        pushHistory();
        onChange(sel.value as PortSide);
        renderWiresOnly();
      });
      return sel;
    };

    const portRow = document.createElement('div');
    portRow.className = 'prop-row-2';
    portRow.append(
      makeField(
        'prop-edge-src-port',
        'Source Port',
        makePortSelect(edge.sourcePort, (p) => {
          edge.sourcePort = p;
        }),
      ),
      makeField(
        'prop-edge-dst-port',
        'Target Port',
        makePortSelect(edge.targetPort, (p) => {
          edge.targetPort = p;
        }),
      ),
    );
    form.appendChild(portRow);

    // Animated Pulse Toggle
    const animLabel = document.createElement('label');
    animLabel.className = 'checkbox-inline';
    const animChk = document.createElement('input');
    animChk.type = 'checkbox';
    animChk.checked = edge.animated;
    animChk.addEventListener('change', () => {
      pushHistory();
      edge.animated = animChk.checked;
      renderWiresOnly();
    });
    animLabel.append(animChk, document.createTextNode('Animated dashed telemetry stream'));
    form.appendChild(animLabel);

    // Reverse Direction Button
    const btnReverse = document.createElement('button');
    btnReverse.type = 'button';
    btnReverse.className = 'btn';
    btnReverse.textContent = '⇄ Reverse Flow Direction';
    btnReverse.addEventListener('click', () => {
      pushHistory();
      const tmpNode = edge.from;
      edge.from = edge.to;
      edge.to = tmpNode;
      const tmpPort = edge.sourcePort;
      edge.sourcePort = edge.targetPort;
      edge.targetPort = tmpPort;
      renderAll(true);
    });
    form.appendChild(btnReverse);

    if (edge.waypoint) {
      const btnResetWp = document.createElement('button');
      btnResetWp.type = 'button';
      btnResetWp.className = 'btn';
      btnResetWp.textContent = `↺ Reset Custom Waypoint (${edge.waypoint[0]}, ${edge.waypoint[1]})`;
      btnResetWp.addEventListener('click', () => {
        pushHistory();
        delete edge.waypoint;
        renderWiresOnly();
        renderPropertyEditor();
      });
      form.appendChild(btnResetWp);
    }
  } else if (sel.type === 'multi') {
    const selectedNodes = doc.nodes.filter((n) => sel.ids.includes(n.id));
    if (selectedNodes.length <= 1) {
      selection = selectedNodes.length === 1 ? { type: 'node', id: selectedNodes[0].id } : { type: 'none' };
      renderPropertyEditor();
      return;
    }

    propPanelHeading.textContent = `MULTI-SELECT (${selectedNodes.length} NODES)`;
    propSelectionActions.hidden = false;
    btnPropDuplicate.hidden = false;

    const alignSection = document.createElement('div');
    alignSection.className = 'prop-divider';
    const alignHeading = document.createElement('span');
    alignHeading.className = 'section-heading';
    alignHeading.textContent = 'ALIGN & DISTRIBUTE';
    alignSection.appendChild(alignHeading);

    const grid = document.createElement('div');
    grid.className = 'multi-action-grid';

    const makeAlignBtn = (label: string, fn: () => void) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn btn-compact';
      b.textContent = label;
      b.addEventListener('click', () => {
        pushHistory();
        fn();
        expandStageToFit(doc);
        renderAll(false);
      });
      return b;
    };

    grid.append(
      makeAlignBtn('left Align Left', () => {
        const minX = Math.min(...selectedNodes.map((n) => n.x));
        for (const n of selectedNodes) n.x = minX;
      }),
      makeAlignBtn('center Align Center X', () => {
        const avgCx =
          selectedNodes.reduce((acc, n) => acc + n.x + n.width / 2, 0) / selectedNodes.length;
        for (const n of selectedNodes) n.x = Math.round(avgCx - n.width / 2);
      }),
      makeAlignBtn('top Align Top', () => {
        const minY = Math.min(...selectedNodes.map((n) => n.y));
        for (const n of selectedNodes) n.y = minY;
      }),
      makeAlignBtn('middle Align Middle Y', () => {
        const avgCy =
          selectedNodes.reduce((acc, n) => acc + n.y + n.height / 2, 0) / selectedNodes.length;
        for (const n of selectedNodes) n.y = Math.round(avgCy - n.height / 2);
      }),
      makeAlignBtn('↔ Distribute Horiz', () => {
        if (selectedNodes.length < 3) return;
        const sorted = [...selectedNodes].sort((a, b) => a.x - b.x);
        const first = sorted[0].x;
        const last = sorted[sorted.length - 1].x;
        const step = (last - first) / (sorted.length - 1);
        sorted.forEach((n, idx) => {
          n.x = Math.round((first + step * idx) / 16) * 16;
        });
      }),
      makeAlignBtn('↕ Distribute Vert', () => {
        if (selectedNodes.length < 3) return;
        const sorted = [...selectedNodes].sort((a, b) => a.y - b.y);
        const first = sorted[0].y;
        const last = sorted[sorted.length - 1].y;
        const step = (last - first) / (sorted.length - 1);
        sorted.forEach((n, idx) => {
          n.y = Math.round((first + step * idx) / 16) * 16;
        });
      }),
    );

    alignSection.appendChild(grid);
    form.appendChild(alignSection);

    // Batch Accent Color Picker
    const toneWrap = document.createElement('div');
    toneWrap.className = 'prop-divider';
    const toneTitle = document.createElement('span');
    toneTitle.className = 'field-label';
    toneTitle.textContent = 'Batch Accent Color';
    toneWrap.append(
      toneTitle,
      makeTonePicker('multi-node-accent', selectedNodes[0].accent, (tone) => {
        for (const n of selectedNodes) n.accent = tone;
        renderAll(false);
      }),
    );
    form.appendChild(toneWrap);
  } else if (sel.type === 'zone') {
    const zone = doc.zones.find((z) => z.id === sel.id);
    if (!zone) {
      selection = { type: 'none' };
      renderPropertyEditor();
      return;
    }

    propPanelHeading.textContent = 'SWIMLANE STAGE';
    propSelectionActions.hidden = false;
    btnPropDuplicate.hidden = false;

    const rowTop = document.createElement('div');
    rowTop.className = 'prop-row-2';
    rowTop.append(
      makeField(
        'prop-zone-num',
        'Stage Number',
        makeTextInput(
          zone.number,
          (v) => {
            zone.number = v;
            renderZones();
          },
          { identifier: true },
        ),
      ),
      makeField(
        'prop-zone-width',
        'Width (px)',
        makeTextInput(
          String(zone.width),
          (v) => {
            const parsed = Number.parseInt(v, 10);
            if (!Number.isNaN(parsed) && parsed >= 140) {
              zone.width = parsed;
              expandStageToFit(doc);
              renderZones();
            }
          },
          { identifier: true },
        ),
      ),
    );
    form.appendChild(rowTop);

    form.appendChild(
      makeField(
        'prop-zone-title',
        'Stage Title',
        makeTextInput(zone.title, (v) => {
          zone.title = v;
          renderZones();
        }),
      ),
    );
    form.appendChild(
      makeField(
        'prop-zone-sub',
        'Stage Subtitle',
        makeTextInput(zone.subtitle, (v) => {
          zone.subtitle = v;
          renderZones();
        }),
      ),
    );
  } else if (sel.type === 'notes') {
    const card = doc.notesCards.find((c) => c.id === sel.id);
    if (!card) {
      selection = { type: 'none' };
      renderPropertyEditor();
      return;
    }

    propPanelHeading.textContent = 'NOTES / SPEC CARD';
    propSelectionActions.hidden = false;
    btnPropDuplicate.hidden = false;

    const rowTop = document.createElement('div');
    rowTop.className = 'prop-row-2';
    rowTop.append(
      makeField(
        'prop-notes-title',
        'Header Title',
        makeTextInput(card.title, (v) => {
          card.title = v;
          renderNotesCards();
        }),
      ),
      makeField(
        'prop-notes-code',
        'Spec Tag',
        makeTextInput(
          card.code,
          (v) => {
            card.code = v;
            renderNotesCards();
          },
          { identifier: true },
        ),
      ),
    );
    form.appendChild(rowTop);

    const itemsSection = document.createElement('div');
    itemsSection.className = 'prop-divider';
    const iHeader = document.createElement('div');
    iHeader.className = 'prop-list-header';
    const iTitle = document.createElement('span');
    iTitle.className = 'section-heading';
    iTitle.textContent = 'CHECKLIST ITEMS';
    const btnAddItem = document.createElement('button');
    btnAddItem.type = 'button';
    btnAddItem.className = 'btn btn-compact';
    btnAddItem.style.flex = '0 0 auto';
    btnAddItem.textContent = '+ Add Item';
    btnAddItem.addEventListener('click', () => {
      pushHistory();
      card.items.push({ title: `Item 0${card.items.length + 1}`, text: 'Describe architectural note.' });
      renderNotesCards();
      renderPropertyEditor();
    });
    iHeader.append(iTitle, btnAddItem);
    itemsSection.appendChild(iHeader);

    card.items.forEach((item, idx) => {
      const box = document.createElement('div');
      box.className = 'notes-item-editor';
      const topBar = document.createElement('div');
      topBar.className = 'prop-list-header';
      const tIn = makeTextInput(item.title, (v) => {
        item.title = v;
        renderNotesCards();
      });
      tIn.setAttribute('aria-label', `Note ${idx + 1} title`);
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'btn btn-compact';
      delBtn.style.flex = '0 0 auto';
      delBtn.textContent = '×';
      delBtn.addEventListener('click', () => {
        pushHistory();
        card.items.splice(idx, 1);
        renderNotesCards();
        renderPropertyEditor();
      });
      topBar.append(tIn, delBtn);

      const bodyIn = makeTextInput(item.text, (v) => {
        item.text = v;
        renderNotesCards();
      });
      bodyIn.setAttribute('aria-label', `Note ${idx + 1} description`);

      box.append(topBar, bodyIn);
      itemsSection.appendChild(box);
    });
    form.appendChild(itemsSection);
  } else {
    // Document Overview Properties
    propPanelHeading.textContent = 'DOCUMENT PROPERTIES';
    propSelectionActions.hidden = true;

    form.appendChild(
      makeField(
        'prop-doc-title',
        'Architecture Title',
        makeTextInput(doc.title, (v) => {
          doc.title = v;
          docTitleHeadingEl.textContent = v || 'Untitled Architecture';
        }),
      ),
    );

    const rowTags = document.createElement('div');
    rowTags.className = 'prop-row-2';
    rowTags.append(
      makeField(
        'prop-doc-systag',
        'System Tag',
        makeTextInput(
          doc.systemTag,
          (v) => {
            doc.systemTag = v;
            docSystemTagEl.textContent = v;
          },
          { identifier: true },
        ),
      ),
      makeField(
        'prop-doc-status',
        'Status Badge',
        makeTextInput(
          doc.statusLabel,
          (v) => {
            doc.statusLabel = v;
            docStatusLabelEl.textContent = v;
          },
          { identifier: true },
        ),
      ),
    );
    form.appendChild(rowTags);

    const dirSelect = document.createElement('select');
    dirSelect.className = 'prop-select';
    for (const d of [
      { value: 'LR', label: 'Left → Right (LR)' },
      { value: 'TD', label: 'Top → Down (TD)' },
    ]) {
      const opt = document.createElement('option');
      opt.value = d.value;
      opt.textContent = d.label;
      opt.selected = d.value === doc.direction;
      dirSelect.appendChild(opt);
    }
    dirSelect.addEventListener('change', () => {
      pushHistory();
      doc.direction = dirSelect.value as 'LR' | 'TD';
      autoLayoutDocument(doc);
      renderAll(true);
      fitToViewport();
    });
    form.appendChild(makeField('prop-doc-dir', 'Auto-Layout Flow Direction', dirSelect));

    form.appendChild(
      makeField(
        'prop-doc-summary',
        'Overview Summary',
        makeTextarea(doc.overviewSummary, (v) => {
          doc.overviewSummary = v;
        }),
      ),
    );

    const tipDiv = document.createElement('div');
    tipDiv.className = 'prop-divider';
    const tipText = document.createElement('p');
    tipText.style.fontSize = '0.78rem';
    tipText.style.color = 'var(--wl-ink-muted)';
    tipText.style.lineHeight = '1.5';
    tipText.textContent =
      'Tip: Select any component, wire, swimlane, or notes card on the canvas to customize its telemetry metrics, stream color, routing style, and JSON payload.';
    tipDiv.appendChild(tipText);
    form.appendChild(tipDiv);
  }

  propFormContainer.appendChild(form);
}

// ---------------------------------------------------------------------------
// Data View Mode: Telemetry Inspector & Live Simulation Runner
// ---------------------------------------------------------------------------
function renderMetricsBoxes(items: Array<{ label: string; value: string }>): void {
  inspMetrics.replaceChildren();
  for (const m of items) {
    const box = document.createElement('div');
    box.className = 'metric-box';
    const lbl = document.createElement('span');
    lbl.className = 'metric-label';
    lbl.textContent = m.label;
    const val = document.createElement('span');
    val.className = 'metric-value';
    val.textContent = m.value;
    box.append(lbl, val);
    inspMetrics.appendChild(box);
  }
}

function renderLineageRows(upstream: DiagramNode[], downstream: DiagramNode[]): void {
  inspLineage.replaceChildren();

  const buildGroup = (heading: string, list: DiagramNode[]) => {
    const wrap = document.createElement('div');
    const lbl = document.createElement('span');
    lbl.className = 'metric-label';
    lbl.style.marginBlockEnd = '0.25rem';
    lbl.textContent = heading;
    wrap.appendChild(lbl);

    const row = document.createElement('div');
    row.className = 'lineage-chips';
    if (list.length === 0) {
      const empty = document.createElement('span');
      empty.style.fontSize = '0.8rem';
      empty.style.color = 'var(--wl-ink-muted)';
      empty.textContent = 'None';
      row.appendChild(empty);
    } else {
      for (const item of list) {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'lineage-chip';
        chip.textContent = item.title;
        chip.addEventListener('click', () => {
          selection = { type: 'node', id: item.id };
          updateVisualSelectionHighlights();
          syncDataViewInspector();
        });
        row.appendChild(chip);
      }
    }
    wrap.appendChild(row);
    return wrap;
  };

  inspLineage.append(
    buildGroup('Upstream Sources', upstream),
    buildGroup('Downstream Consumers', downstream),
  );
}

function syncDataViewInspector(): void {
  const sel = selection;
  if (sel.type === 'node') {
    const node = doc.nodes.find((n) => n.id === sel.id);
    if (node) {
      const adj = getAdjacencyLists(doc, node.id);
      withInspectorTransition(() => {
        inspBadge.textContent = `${node.eyebrow} · ${node.zoneLabel}`;
        inspId.textContent = node.id.toUpperCase();
        inspTitle.textContent = node.subtitle ? `${node.title} — ${node.subtitle}` : node.title;
        inspSummary.textContent = node.summary;
        renderMetricsBoxes(node.metrics);
        renderLineageRows(adj.upstream, adj.downstream);
        inspCode.textContent = node.code;
      });
      return;
    }
  }

  withInspectorTransition(() => {
    inspBadge.textContent = 'SYSTEM OVERVIEW';
    inspId.textContent = 'ALL';
    inspTitle.textContent = doc.title;
    inspSummary.textContent = doc.overviewSummary;
    renderMetricsBoxes([
      { label: 'Components', value: `${doc.nodes.length} Active` },
      { label: 'Data Conduits', value: `${doc.edges.length} Streams` },
      { label: 'Swimlane Stages', value: `${doc.zones.length}` },
      { label: 'Flow Layout', value: doc.direction },
    ]);
    renderLineageRows([], doc.nodes);
    inspCode.textContent = JSON.stringify(
      {
        title: doc.title,
        direction: doc.direction,
        components: doc.nodes.length,
        streams: doc.edges.length,
      },
      null,
      2,
    );
  });
}

function renderSimButtons(): void {
  simButtonsSlot.replaceChildren();
  const scenarios = getEffectiveSimulations(doc);
  for (const sim of scenarios) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className =
      sim.tone === 'rose'
        ? 'btn btn-reject'
        : sim.tone === 'emerald'
          ? 'btn btn-approve'
          : 'btn';
    const [dotCss] = TONE_CSS[sim.tone] || TONE_CSS.emerald;
    const dot = document.createElement('span');
    dot.className = 'pill-swatch';
    dot.style.background = dotCss;
    const label = document.createElement('span');
    label.textContent = sim.name;
    btn.append(dot, label);
    btn.addEventListener('click', () => runSimulation(sim.id));
    simButtonsSlot.appendChild(btn);
  }
}

function clearSimulation(): void {
  if (simTimer !== null) {
    window.clearTimeout(simTimer);
    simTimer = null;
  }
  simPacket.hidden = true;
  for (const w of nodesLayer.querySelectorAll<HTMLElement>('.arch-node')) {
    delete w.dataset.simActive;
  }
}

function appendTraceEntry(stepLabel: string, message: string, tone: StreamTone): void {
  const li = document.createElement('li');
  li.className = 'trace-item';
  li.dataset.tone = tone;

  const meta = document.createElement('div');
  meta.className = 'trace-meta';
  const s1 = document.createElement('span');
  s1.textContent = stepLabel;
  const s2 = document.createElement('span');
  s2.textContent = new Date().toLocaleTimeString([], {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  meta.append(s1, s2);

  const body = document.createElement('p');
  body.className = 'trace-body';
  body.textContent = message;

  li.append(meta, body);
  traceList.prepend(li);
}

function switchDataViewTab(tab: 'inspector' | 'trace'): void {
  const isInsp = tab === 'inspector';
  tabInspector.setAttribute('aria-selected', String(isInsp));
  tabTrace.setAttribute('aria-selected', String(!isInsp));
  withInspectorTransition(() => {
    panelInspector.hidden = !isInsp;
    panelTrace.hidden = isInsp;
  });
}

function runSimulation(simId: string): void {
  const scenarios = getEffectiveSimulations(doc);
  const scenario = scenarios.find((s) => s.id === simId);
  if (!scenario || scenario.steps.length === 0) return;

  clearSimulation();
  if (workspaceMode === 'data') {
    switchDataViewTab('trace');
  }
  workspace.dataset.flow = 'all';
  const allFlowRadio = document.querySelector<HTMLInputElement>(
    'input[name="flow-filter"][value="all"]',
  );
  if (allFlowRadio) allFlowRadio.checked = true;

  const nodeMap = new Map(doc.nodes.map((n) => [n.id, n]));
  const wrappers = Array.from(nodesLayer.querySelectorAll<HTMLElement>('.arch-node'));
  let idx = 0;

  const stepNext = () => {
    if (idx >= scenario.steps.length) {
      simTimer = window.setTimeout(clearSimulation, 1100);
      return;
    }

    const step = scenario.steps[idx];
    const [accent, soft] = TONE_CSS[step.tone] || TONE_CSS.emerald;

    for (const w of wrappers) {
      const nid = w.dataset.node || '';
      if (step.nodes.includes(nid)) {
        w.dataset.simActive = 'true';
        w.style.setProperty('--sim-accent', accent);
        w.style.setProperty('--sim-accent-soft', soft);
      } else {
        delete w.dataset.simActive;
      }
    }

    const anchorNode = nodeMap.get(step.nodes[0]);
    if (anchorNode) {
      const [cx, cy] = getNodeCenter(anchorNode);
      simPacket.hidden = false;
      simPacket.dataset.tone = step.tone;
      simPacketDot.style.background = accent;
      simPacketLabel.textContent = step.label;
      simPacket.style.setProperty('--px', String(cx));
      simPacket.style.setProperty('--py', String(cy - 62));
    }

    appendTraceEntry(`STEP 0${idx + 1} · ${scenario.name.toUpperCase()}`, step.trace, step.tone);
    idx += 1;
    simTimer = window.setTimeout(stepNext, 950);
  };

  stepNext();
}

// ---------------------------------------------------------------------------
// Specification Matrix Table
// ---------------------------------------------------------------------------
function renderMatrixTable(): void {
  matrixTbody.replaceChildren();
  if (doc.nodes.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 5;
    td.style.color = 'var(--wl-ink-muted)';
    td.textContent = 'No components placed on the canvas yet.';
    tr.appendChild(td);
    matrixTbody.appendChild(tr);
    return;
  }

  for (const n of doc.nodes) {
    const adj = getAdjacencyLists(doc, n.id);
    const tr = document.createElement('tr');

    const tdComp = document.createElement('td');
    const strong = document.createElement('strong');
    strong.textContent = n.title;
    tdComp.appendChild(strong);
    if (n.subtitle) {
      tdComp.appendChild(document.createElement('br'));
      const sub = document.createElement('span');
      sub.style.fontSize = '0.78rem';
      sub.style.color = 'var(--wl-ink-muted)';
      sub.textContent = n.subtitle;
      tdComp.appendChild(sub);
    }

    const tdKind = document.createElement('td');
    const code = document.createElement('code');
    code.textContent = n.kind.toUpperCase();
    tdKind.appendChild(code);

    const tdUp = document.createElement('td');
    tdUp.textContent =
      adj.upstream.length > 0 ? adj.upstream.map((u) => u.title).join(', ') : 'Entry Point';

    const tdDown = document.createElement('td');
    tdDown.textContent =
      adj.downstream.length > 0 ? adj.downstream.map((d) => d.title).join(', ') : 'Terminal Sink';

    const tdProto = document.createElement('td');
    tdProto.textContent = n.interfaceLabel;

    tr.append(tdComp, tdKind, tdUp, tdDown, tdProto);
    matrixTbody.appendChild(tr);
  }
}

// ---------------------------------------------------------------------------
// Delete, Duplicate & Copy/Paste Selected Elements
// ---------------------------------------------------------------------------
function deleteSelected(): void {
  const sel = selection;
  if (sel.type === 'none') return;
  pushHistory();

  if (sel.type === 'node') {
    const targetId = sel.id;
    doc.nodes = doc.nodes.filter((n) => n.id !== targetId);
    doc.edges = doc.edges.filter((e) => e.from !== targetId && e.to !== targetId);
  } else if (sel.type === 'multi') {
    const idSet = new Set(sel.ids);
    doc.nodes = doc.nodes.filter((n) => !idSet.has(n.id));
    doc.edges = doc.edges.filter((e) => !idSet.has(e.from) && !idSet.has(e.to));
  } else if (sel.type === 'edge') {
    doc.edges = doc.edges.filter((e) => e.id !== sel.id);
  } else if (sel.type === 'zone') {
    doc.zones = doc.zones.filter((z) => z.id !== sel.id);
  } else if (sel.type === 'notes') {
    doc.notesCards = doc.notesCards.filter((c) => c.id !== sel.id);
  }

  selection = { type: 'none' };
  renderAll(true);
}

function duplicateSelected(): void {
  const sel = selection;
  if (sel.type === 'node') {
    const orig = doc.nodes.find((n) => n.id === sel.id);
    if (!orig) return;
    pushHistory();
    const copy: DiagramNode = structuredClone(orig);
    copy.id = nextUid(orig.kind);
    copy.title = `${orig.title} Copy`;
    copy.x += 32;
    copy.y += 32;
    doc.nodes.push(copy);
    expandStageToFit(doc);
    selection = { type: 'node', id: copy.id };
    renderAll(true);
  } else if (sel.type === 'multi') {
    const origNodes = doc.nodes.filter((n) => sel.ids.includes(n.id));
    if (origNodes.length === 0) return;
    pushHistory();
    const idMap = new Map<string, string>();
    const newIds: string[] = [];
    for (const orig of origNodes) {
      const copy: DiagramNode = structuredClone(orig);
      copy.id = nextUid(orig.kind);
      copy.title = `${orig.title} Copy`;
      copy.x += 32;
      copy.y += 32;
      idMap.set(orig.id, copy.id);
      newIds.push(copy.id);
      doc.nodes.push(copy);
    }
    for (const edge of doc.edges) {
      const nf = idMap.get(edge.from);
      const nt = idMap.get(edge.to);
      if (nf && nt) {
        const edgeCopy = structuredClone(edge);
        edgeCopy.id = nextUid('edge');
        edgeCopy.from = nf;
        edgeCopy.to = nt;
        doc.edges.push(edgeCopy);
      }
    }
    expandStageToFit(doc);
    selection = newIds.length > 1 ? { type: 'multi', ids: newIds } : { type: 'node', id: newIds[0] };
    renderAll(true);
  } else if (sel.type === 'zone') {
    const orig = doc.zones.find((z) => z.id === sel.id);
    if (!orig) return;
    pushHistory();
    const copy: DiagramZone = structuredClone(orig);
    copy.id = nextUid('zone');
    copy.x += orig.width + 24;
    doc.zones.push(copy);
    expandStageToFit(doc);
    selection = { type: 'zone', id: copy.id };
    renderAll(true);
  } else if (sel.type === 'notes') {
    const orig = doc.notesCards.find((c) => c.id === sel.id);
    if (!orig) return;
    pushHistory();
    const copy: DiagramNotesCard = structuredClone(orig);
    copy.id = nextUid('notes');
    copy.x += 32;
    copy.y += 32;
    doc.notesCards.push(copy);
    expandStageToFit(doc);
    selection = { type: 'notes', id: copy.id };
    renderAll(true);
  }
}

function copySelection(): void {
  const ids = getSelectedNodeIds();
  if (ids.length === 0) return;
  const idSet = new Set(ids);
  clipboardNodes = structuredClone(doc.nodes.filter((n) => idSet.has(n.id)));
  clipboardEdges = structuredClone(
    doc.edges.filter((e) => idSet.has(e.from) && idSet.has(e.to)),
  );
  hudStatusTip.textContent = `Copied ${clipboardNodes.length} ${clipboardNodes.length === 1 ? 'component' : 'components'} to studio clipboard`;
}

function pasteSelection(): void {
  if (clipboardNodes.length === 0) return;
  pushHistory();
  const idMap = new Map<string, string>();
  const newIds: string[] = [];
  for (const orig of clipboardNodes) {
    const copy = structuredClone(orig);
    copy.id = nextUid(orig.kind);
    copy.x += 32;
    copy.y += 32;
    orig.x += 32;
    orig.y += 32;
    idMap.set(orig.id, copy.id);
    newIds.push(copy.id);
    doc.nodes.push(copy);
  }
  for (const edge of clipboardEdges) {
    const nf = idMap.get(edge.from);
    const nt = idMap.get(edge.to);
    if (nf && nt) {
      const edgeCopy = structuredClone(edge);
      edgeCopy.id = nextUid('edge');
      edgeCopy.from = nf;
      edgeCopy.to = nt;
      doc.edges.push(edgeCopy);
    }
  }
  expandStageToFit(doc);
  selection =
    newIds.length > 1 ? { type: 'multi', ids: newIds } : { type: 'node', id: newIds[0] };
  renderAll(true);
}

// ---------------------------------------------------------------------------
// File Import, Drag-and-Drop, Code Sync, and Export
// ---------------------------------------------------------------------------
function applyImportedText(rawText: string, fallbackTitle?: string): boolean {
  const { doc: importedDoc, warnings, issues } = importMermaidOrBlueprint(rawText);
  const formatIssue = (idx = 0): string => {
    const issue = issues[idx];
    if (!issue) return warnings[idx] || '';
    return issue.line ? `[Line ${issue.line}] ${issue.message}` : issue.message;
  };

  if (importedDoc.nodes.length === 0 && importedDoc.zones.length === 0 && importedDoc.notesCards.length === 0) {
    codeSyncDiagnostics.dataset.tone = 'warn';
    codeSyncDiagnostics.textContent =
      formatIssue(0) || 'No Mermaid flowchart nodes or Blueprint definitions found in input.';
    return false;
  }

  pushHistory();
  if (fallbackTitle && importedDoc.title === 'Imported Architecture') {
    importedDoc.title = fallbackTitle;
  }
  doc = importedDoc;
  selection = doc.nodes.length > 0 ? { type: 'node', id: doc.nodes[0].id } : { type: 'none' };
  clearSimulation();
  renderAll(true);
  requestAnimationFrame(fitToViewport);

  if (issues.length > 0 || warnings.length > 0) {
    codeSyncDiagnostics.dataset.tone = 'warn';
    const summary = issues
      .slice(0, 3)
      .map((_, i) => formatIssue(i))
      .join(' · ');
    codeSyncDiagnostics.textContent = summary || warnings[0];
    hudStatusTip.textContent = `Imported ${doc.nodes.length} nodes (${issues.length || warnings.length} warning${(issues.length || warnings.length) === 1 ? '' : 's'}: ${formatIssue(0)})`;
  } else {
    codeSyncDiagnostics.dataset.tone = 'ok';
    codeSyncDiagnostics.textContent = `Imported ${doc.nodes.length} components and ${doc.edges.length} streams (0 issues).`;
    hudStatusTip.textContent = `Imported ${doc.nodes.length} components and ${doc.edges.length} animated telemetry streams`;
  }
  return true;
}

async function handleUploadedFile(file: File): Promise<void> {
  const text = await file.text();
  const baseName = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
  const titleFromFile = baseName
    ? baseName.replace(/\b\w/g, (ch) => ch.toUpperCase())
    : undefined;
  applyImportedText(text, titleFromFile);
}

function downloadBlob(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function getSafeFilenameSlug(): string {
  return (
    (doc.title || 'architecture-diagram')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'architecture-diagram'
  );
}

function getSelectedCodeFormat(): 'mermaid' | 'blueprint' {
  const checked = document.querySelector<HTMLInputElement>('input[name="code-format"]:checked');
  return checked?.value === 'blueprint' ? 'blueprint' : 'mermaid';
}

function refreshCodeModalTextarea(): void {
  const fmt = getSelectedCodeFormat();
  codeSyncTextarea.value =
    fmt === 'blueprint' ? serializeToBlueprintMarkdown(doc) : serializeToMermaid(doc);
  codeSyncDiagnostics.textContent =
    fmt === 'blueprint'
      ? 'Full Blueprint (.md): YAML metadata + positions + Mermaid flowchart.'
      : 'Standard Mermaid (.mmd): live-generated from your visual canvas.';
  delete codeSyncDiagnostics.dataset.tone;
}

function openCodeDialog(): void {
  refreshCodeModalTextarea();
  codeDialog.showModal();
}

// ---------------------------------------------------------------------------
// Event Wiring
// ---------------------------------------------------------------------------
function initEvents(): void {
  // Workspace Mode Switcher (Design vs Data View)
  for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="workspace-mode"]')) {
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      workspaceMode = radio.value === 'data' ? 'data' : 'design';
      workspace.dataset.mode = workspaceMode;
      designToolbar.hidden = workspaceMode !== 'design';
      dataToolbar.hidden = workspaceMode !== 'data';
      designInspectorPane.hidden = workspaceMode !== 'design';
      dataInspectorPane.hidden = workspaceMode !== 'data';

      hudStatusTip.textContent =
        workspaceMode === 'design'
          ? 'Drag stencils onto grid · Drag from any port dot to wire animated streams'
          : 'Data View · Select any component to inspect lineage & payload, or trigger a simulation above';

      if (workspaceMode === 'data' && selection.type !== 'node' && doc.nodes.length > 0) {
        selection = { type: 'node', id: doc.nodes[0].id };
      }

      updateVisualSelectionHighlights();
      if (workspaceMode === 'design') renderPropertyEditor();
      else syncDataViewInspector();
      requestAnimationFrame(fitToViewport);
    });
  }

  // Pointer Tool Switcher (Select vs Connect)
  for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="pointer-tool"]')) {
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      pointerTool = radio.value === 'connect' ? 'connect' : 'select';
      workspace.dataset.tool = pointerTool;
      connectSourceNodeId = null;
      hudStatusTip.textContent =
        pointerTool === 'connect'
          ? 'Connect Mode · Drag from any component or port to another component to wire an animated stream'
          : 'Drag stencils onto grid · Drag from any port dot to wire animated streams';
    });
  }

  // Stream Channel Filter (Data View Mode)
  for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="flow-filter"]')) {
    radio.addEventListener('change', () => {
      if (radio.checked) workspace.dataset.flow = radio.value;
    });
  }

  // Click Topbar Title -> Focus Document Title input in Property Panel
  btnFocusDocTitle.addEventListener('click', () => {
    selection = { type: 'none' };
    updateVisualSelectionHighlights();
    if (workspaceMode === 'design') {
      renderPropertyEditor();
      document.getElementById('prop-doc-title')?.focus();
    } else {
      syncDataViewInspector();
    }
  });

  // Undo / Redo / Auto-Layout / Delete / Duplicate
  btnUndo.addEventListener('click', performUndo);
  btnRedo.addEventListener('click', performRedo);
  btnAutoLayout.addEventListener('click', () => {
    if (doc.nodes.length === 0) return;
    pushHistory();
    autoLayoutDocument(doc);
    renderAll(true);
    fitToViewport();
  });
  btnPropDelete.addEventListener('click', deleteSelected);
  btnPropDuplicate.addEventListener('click', duplicateSelected);

  // Add Swimlane & Notes Card
  btnAddZone.addEventListener('click', () => {
    pushHistory();
    const nextX =
      doc.zones.length > 0
        ? Math.max(...doc.zones.map((z) => z.x + z.width)) + 24
        : 48;
    const zone = createSwimlaneZone(doc.zones.length, nextX);
    doc.zones.push(zone);
    expandStageToFit(doc);
    selection = { type: 'zone', id: zone.id };
    renderAll(true);
  });

  btnAddNotes.addEventListener('click', () => {
    pushHistory();
    const [cx, cy] = getViewportWorldCenter();
    const notes = createNotesCard(cx - 200, cy + 120);
    doc.notesCards.push(notes);
    expandStageToFit(doc);
    selection = { type: 'notes', id: notes.id };
    renderAll(true);
  });

  // Starter Pair on Blank Canvas (1 generic Actor -> 1 generic Core System)
  btnQuickStarter.addEventListener('click', () => {
    pushHistory();
    const actor = createNodeFromStencil('actor', 224, 304, 0);
    actor.title = 'Actor';
    actor.subtitle = 'Initiator';
    const core = createNodeFromStencil('core', 496, 288, 1);
    core.title = 'Core Service';
    core.subtitle = 'Primary Processor';
    doc.nodes.push(actor, core);
    doc.edges.push({
      id: nextUid('edge'),
      from: actor.id,
      to: core.id,
      sourcePort: 'right',
      targetPort: 'left',
      tone: 'blue',
      route: 'auto',
      label: 'Event Stream',
      animated: true,
    });
    expandStageToFit(doc);
    selection = { type: 'node', id: core.id };
    renderAll(true);
    fitToViewport();
  });

  // Restore Previous Autosaved Session
  btnRestoreSession?.addEventListener('click', () => {
    const saved = loadSavedSessionDoc();
    if (!saved) return;
    pushHistory();
    doc = saved;
    expandStageToFit(doc);
    selection = doc.nodes.length > 0 ? { type: 'node', id: doc.nodes[0].id } : { type: 'none' };
    renderAll(true);
    fitToViewport();
    hudStatusTip.textContent = `Restored previous session (${doc.nodes.length} components, ${doc.edges.length} streams)`;
  });

  // Flush pending autosave on page unload
  window.addEventListener('beforeunload', (e) => {
    if (hasPendingAutosave) {
      flushAutosave();
      e.preventDefault();
    }
  });

  // New Blank Canvas
  btnNewCanvas.addEventListener('click', () => {
    const isEmpty = doc.nodes.length === 0 && doc.zones.length === 0 && doc.notesCards.length === 0;
    if (!isEmpty) pushHistory();
    clearSimulation();
    doc = createBlankDocument();
    selection = { type: 'none' };
    traceList.replaceChildren();
    renderAll(true);
    fitToViewport();
  });

  // File Import Triggers
  const triggerFilePicker = () => fileUploadInput.click();
  btnImportFile.addEventListener('click', triggerFilePicker);
  btnPaletteImport.addEventListener('click', triggerFilePicker);
  btnEmptyImport.addEventListener('click', triggerFilePicker);

  fileUploadInput.addEventListener('change', () => {
    const file = fileUploadInput.files?.[0];
    if (file) {
      void handleUploadedFile(file);
      fileUploadInput.value = '';
    }
  });

  // Full-Window Drag-and-Drop File Import
  let dragDepth = 0;
  window.addEventListener('dragenter', (e) => {
    if (!e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    dragDepth += 1;
    windowDropVeil.hidden = false;
  });
  window.addEventListener('dragover', (e) => {
    if (!e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
  });
  window.addEventListener('dragleave', (e) => {
    if (!e.dataTransfer?.types.includes('Files')) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) windowDropVeil.hidden = true;
  });
  window.addEventListener('drop', (e) => {
    if (!e.dataTransfer?.files?.length) return;
    e.preventDefault();
    dragDepth = 0;
    windowDropVeil.hidden = true;
    void handleUploadedFile(e.dataTransfer.files[0]);
  });

  // Code Sync Modal (`Mermaid / MD`)
  btnOpenCode.addEventListener('click', openCodeDialog);
  btnPaletteCode.addEventListener('click', openCodeDialog);
  btnEmptyCode.addEventListener('click', openCodeDialog);

  for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="code-format"]')) {
    radio.addEventListener('change', () => {
      if (radio.checked) refreshCodeModalTextarea();
    });
  }

  btnCopyCode.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(codeSyncTextarea.value);
      btnCopyCode.textContent = 'Copied ✓';
      window.setTimeout(() => {
        btnCopyCode.textContent = 'Copy to Clipboard';
      }, 1500);
    } catch {
      codeSyncTextarea.select();
    }
  });

  btnApplyCode.addEventListener('click', () => {
    const ok = applyImportedText(codeSyncTextarea.value);
    if (ok) void closeDialogSmoothly(codeDialog);
  });

  // Export Modal & Actions
  btnOpenExport.addEventListener('click', () => exportDialog.showModal());
  btnExportHtml.addEventListener('click', () => {
    const html = generateStandaloneHtml(doc);
    downloadBlob(html, `${getSafeFilenameSlug()}.html`, 'text/html;charset=utf-8');
    void closeDialogSmoothly(exportDialog);
  });
  btnExportMd.addEventListener('click', () => {
    const md = serializeToBlueprintMarkdown(doc);
    downloadBlob(md, `${getSafeFilenameSlug()}.md`, 'text/markdown;charset=utf-8');
    void closeDialogSmoothly(exportDialog);
  });
  btnExportMmd.addEventListener('click', () => {
    const mmd = serializeToMermaid(doc);
    downloadBlob(mmd, `${getSafeFilenameSlug()}.mmd`, 'text/plain;charset=utf-8');
    void closeDialogSmoothly(exportDialog);
  });

  // Matrix & Settings Dialogs
  btnOpenMatrix.addEventListener('click', () => {
    renderMatrixTable();
    matrixDialog.showModal();
  });
  btnOpenSettings.addEventListener('click', () => settingsDialog.showModal());

  // Smooth Dialog Close & Reset `returnValue` (`dialog` guide)
  const allDialogs = [codeDialog, exportDialog, matrixDialog, settingsDialog];
  for (const dlg of allDialogs) {
    dlg.addEventListener('close', () => {
      dlg.returnValue = '';
    });
    const closeForm = dlg.querySelector('form[method="dialog"]');
    closeForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      void closeDialogSmoothly(dlg);
    });
  }

  // Fallback for `<dialog closedby="any">` (`dialog` guide)
  if (!('closedBy' in HTMLDialogElement.prototype)) {
    const isOutside = (e: PointerEvent, dlg: HTMLDialogElement) => {
      const r = dlg.getBoundingClientRect();
      return (
        e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom
      );
    };
    for (const dlg of allDialogs) {
      let pressedOutside = false;
      dlg.addEventListener('pointerdown', (e) => {
        pressedOutside = isOutside(e, dlg);
      });
      dlg.addEventListener('pointerup', (e) => {
        if (pressedOutside && isOutside(e, dlg)) {
          void closeDialogSmoothly(dlg);
        }
      });
    }
  }

  // Color Scheme Toggle (`dark-mode-toggle` guide)
  const metaScheme = document.querySelector('meta[name="color-scheme"]') as HTMLMetaElement;
  const themeRadios = Array.from(
    document.querySelectorAll<HTMLInputElement>('input[name="theme-choice"]'),
  );
  try {
    const saved = localStorage.getItem('blueprint-studio-color-scheme');
    const initial = saved === 'light' || saved === 'dark' ? saved : 'system';
    for (const r of themeRadios) r.checked = r.value === initial;
  } catch {
    // Ignore storage restrictions
  }
  for (const r of themeRadios) {
    r.addEventListener('change', () => {
      if (!r.checked) return;
      if (r.value === 'system') {
        metaScheme.content = 'light dark';
        try {
          localStorage.removeItem('blueprint-studio-color-scheme');
        } catch {
          // Ignore
        }
      } else {
        metaScheme.content = r.value;
        try {
          localStorage.setItem('blueprint-studio-color-scheme', r.value);
        } catch {
          // Ignore
        }
      }
    });
  }

  chkSnapGrid.addEventListener('change', () => {
    snapToGrid = chkSnapGrid.checked;
  });

  // Pause / Resume Stream Pulse Motion
  btnToggleMotion.addEventListener('click', () => {
    const paused = document.body.classList.toggle('motion-paused');
    btnToggleMotion.setAttribute('aria-pressed', String(paused));
    btnToggleMotion.textContent = paused ? 'Resume' : 'Pause';
  });

  // Data View Tabs & Overview Reset
  tabInspector.addEventListener('click', () => switchDataViewTab('inspector'));
  tabTrace.addEventListener('click', () => switchDataViewTab('trace'));
  btnResetSelection.addEventListener('click', () => {
    selection = { type: 'none' };
    updateVisualSelectionHighlights();
    syncDataViewInspector();
  });
  btnClearTrace.addEventListener('click', () => traceList.replaceChildren());

  // Canvas Background Pan, Shift-Marquee Multi-Select & Deselect
  let panDragStart: { x: number; y: number } | null = null;
  let marqueeStartWorld: [number, number] | null = null;
  let panPointerId: number | null = null;
  let panMoved = false;

  viewport.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    if (
      (e.target as Element).closest(
        '.arch-node, .zone-banner, .blueprint-spec, .conduit-hit, .conduit-badge-hit, .conduit-waypoint-handle, button',
      )
    ) {
      return;
    }

    if (e.shiftKey && workspaceMode === 'design') {
      marqueeStartWorld = screenToWorld(e.clientX, e.clientY);
      panPointerId = e.pointerId;
      panMoved = false;
      if (marqueeBox) {
        marqueeBox.hidden = false;
        marqueeBox.style.setProperty('--mx', String(marqueeStartWorld[0]));
        marqueeBox.style.setProperty('--my', String(marqueeStartWorld[1]));
        marqueeBox.style.setProperty('--mw', '0');
        marqueeBox.style.setProperty('--mh', '0');
      }
      viewport.setPointerCapture(e.pointerId);
      return;
    }

    panDragStart = { x: e.clientX - panX, y: e.clientY - panY };
    panPointerId = e.pointerId;
    panMoved = false;
    viewport.classList.add('is-dragging');
    viewport.setPointerCapture(e.pointerId);
  });

  viewport.addEventListener('pointermove', (e) => {
    if (e.pointerId !== panPointerId || !viewport.hasPointerCapture(e.pointerId)) {
      return;
    }
    if (marqueeStartWorld) {
      const [wx, wy] = screenToWorld(e.clientX, e.clientY);
      const x1 = Math.min(marqueeStartWorld[0], wx);
      const y1 = Math.min(marqueeStartWorld[1], wy);
      const w = Math.abs(wx - marqueeStartWorld[0]);
      const h = Math.abs(wy - marqueeStartWorld[1]);
      if (w > 4 || h > 4) panMoved = true;
      if (marqueeBox) {
        marqueeBox.style.setProperty('--mx', String(x1));
        marqueeBox.style.setProperty('--my', String(y1));
        marqueeBox.style.setProperty('--mw', String(w));
        marqueeBox.style.setProperty('--mh', String(h));
      }
      return;
    }
    if (!panDragStart) return;
    const nextPanX = e.clientX - panDragStart.x;
    const nextPanY = e.clientY - panDragStart.y;
    if (Math.hypot(nextPanX - panX, nextPanY - panY) > 3) {
      panMoved = true;
    }
    panX = nextPanX;
    panY = nextPanY;
    applyTransform();
  });

  const endPan = (e: PointerEvent) => {
    if (e.pointerId !== panPointerId) return;
    if (marqueeStartWorld) {
      const [wx, wy] = screenToWorld(e.clientX, e.clientY);
      const x1 = Math.min(marqueeStartWorld[0], wx);
      const y1 = Math.min(marqueeStartWorld[1], wy);
      const x2 = Math.max(marqueeStartWorld[0], wx);
      const y2 = Math.max(marqueeStartWorld[1], wy);
      marqueeStartWorld = null;
      panPointerId = null;
      panMoved = false;
      if (marqueeBox) marqueeBox.hidden = true;

      const hitIds = doc.nodes
        .filter((n) => n.x + n.width >= x1 && n.x <= x2 && n.y + n.height >= y1 && n.y <= y2)
        .map((n) => n.id);
      selection =
        hitIds.length > 1
          ? { type: 'multi', ids: hitIds }
          : hitIds.length === 1
            ? { type: 'node', id: hitIds[0] }
            : { type: 'none' };
      updateVisualSelectionHighlights();
      renderPropertyEditor();
      return;
    }

    if (!panDragStart) return;
    const didMove = panMoved;
    panDragStart = null;
    panPointerId = null;
    panMoved = false;
    viewport.classList.remove('is-dragging');
    if (e.type === 'pointerup' && !didMove && selection.type !== 'none') {
      selection = { type: 'none' };
      connectSourceNodeId = null;
      updateVisualSelectionHighlights();
      if (workspaceMode === 'design') renderPropertyEditor();
      else syncDataViewInspector();
    }
  };
  viewport.addEventListener('pointerup', endPan);
  viewport.addEventListener('pointercancel', endPan);
  viewport.addEventListener('lostpointercapture', () => {
    panDragStart = null;
    marqueeStartWorld = null;
    panPointerId = null;
    panMoved = false;
    if (marqueeBox) marqueeBox.hidden = true;
    viewport.classList.remove('is-dragging');
  });

  // Wheel Zoom & HUD Zoom Controls
  viewport.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const rect = viewport.getBoundingClientRect();
      const factor = e.deltaY < 0 ? 1.08 : 0.92;
      zoomAround(scale * factor, e.clientX - rect.left, e.clientY - rect.top);
    },
    { passive: false },
  );

  btnZoomIn.addEventListener('click', () => {
    const rect = viewport.getBoundingClientRect();
    zoomAround(scale * 1.16, rect.width / 2, rect.height / 2);
  });
  btnZoomOut.addEventListener('click', () => {
    const rect = viewport.getBoundingClientRect();
    zoomAround(scale / 1.16, rect.width / 2, rect.height / 2);
  });
  btnZoomFit.addEventListener('click', fitToViewport);
  window.addEventListener('resize', fitToViewport);

  // Global Keyboard Shortcuts (Undo, Redo, Duplicate, Delete, Escape)
  window.addEventListener('keydown', (e) => {
    const activeTag = (document.activeElement as HTMLElement | null)?.tagName;
    const inEditable =
      activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT';

    if ((e.metaKey || e.ctrlKey) && !inEditable) {
      if (e.key.toLowerCase() === 'z' && e.shiftKey) {
        e.preventDefault();
        performRedo();
        return;
      }
      if (e.key.toLowerCase() === 'z') {
        e.preventDefault();
        performUndo();
        return;
      }
      if (e.key.toLowerCase() === 'y') {
        e.preventDefault();
        performRedo();
        return;
      }
      if (e.key.toLowerCase() === 'd' && workspaceMode === 'design') {
        e.preventDefault();
        duplicateSelected();
        return;
      }
      if (e.key.toLowerCase() === 'c' && workspaceMode === 'design') {
        e.preventDefault();
        copySelection();
        return;
      }
      if (e.key.toLowerCase() === 'v' && workspaceMode === 'design') {
        e.preventDefault();
        pasteSelection();
        return;
      }
      if (e.key.toLowerCase() === 'a' && workspaceMode === 'design') {
        if (doc.nodes.length > 0) {
          e.preventDefault();
          selection =
            doc.nodes.length > 1
              ? { type: 'multi', ids: doc.nodes.map((n) => n.id) }
              : { type: 'node', id: doc.nodes[0].id };
          updateVisualSelectionHighlights();
          renderPropertyEditor();
        }
        return;
      }
    }

    if (!inEditable && workspaceMode === 'design') {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selection.type !== 'none') {
          e.preventDefault();
          deleteSelected();
        }
      } else if (e.key === 'Escape') {
        connectSourceNodeId = null;
        if (selection.type !== 'none') {
          selection = { type: 'none' };
          updateVisualSelectionHighlights();
          renderPropertyEditor();
        }
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Boot Studio (Starts 100% Blank From Scratch)
// ---------------------------------------------------------------------------
initStencilPalette();
initEvents();
renderAll(true);
requestAnimationFrame(fitToViewport);
