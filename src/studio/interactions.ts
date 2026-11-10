/** Pointer, keyboard, palette, wiring, import/export, and simulation controls. */
import { startFirstRunIfNew, type FirstRunDeps } from './firstRun';
import { initStorage, reportStorageFailure, setStorageFailureHandler } from './storage';
import {
  btnAddNotes,
  btnAddSimulation,
  btnAddZone,
  btnApplyCode,
  btnClearTrace,
  btnCopyCode,
  templateGalleryDialog,
  homeDialog,
  templateCategoryFilters,
  templateGalleryGrid,
  btnExportHtml,
  btnExportJson,
  btnExportGif,
  btnExportPng,
  btnExportSvg,
  btnExportSvgClone,
  exportPngScale,
  exportPngEstimate,
  exportPngButtonEstimate,
  btnFocusDocTitle,
  btnGifBack,
  btnGifView,
  btnGifWhole,
  snapshotsDialog,
  btnPaletteCode,
  btnPaletteImport,
  btnPropLock,
  btnPropGroup,
  btnPropDelete,
  btnPropDuplicate,
  btnResetSelection,
  btnRestoreOpen,
  btnRestoreDiscard,
  restoreSessionBanner,
  saveStatusPill,
  btnZoomFit,
  btnZoomFitSelection,
  btnZoomIn,
  btnZoomOut,
  chkSnapGrid,
  closeDialogSmoothly,
  codeDialog,
  codeSyncDiagnostics,
  codeSyncTextarea,
  dataInspectorPane,
  designInspectorPane,
  draftWire,
  exportCards,
  exportDialog,
  exportDialogTitle,
  shareLinkInput,
  btnCopyShareLink,
  btnCopyAltText,
  exportAltText,
  shareLinkSize,
  chkShareOmitImages,
  shareLinkOptions,
  shareImageSizes,
  btnShareDownloadFile,
  fileUploadInput,
  gifExportPanel,
  gifScenarioEmpty,
  gifScenarioList,
  hudStatusTip,
  hudSearchInput,
  hudSearchCount,
  btnClearSearch,
  marqueeBox,
  matrixDialog,
  panelInspector,
  panelSimulations,
  panelTrace,
  settingsDialog,
  shortcutsDialog,
  shortcutsDialogBody,
  stencilGrid,
  tabInspector,
  tabSimulations,
  tabTrace,
  traceList,
  viewport,
  windowDropVeil,
  workspace,
} from './dom';
import {
  app,
  applyTransform,
  clearPendingRestoreOffer,
  discardPendingRestoreOffer,
  fitSelection,
  fitToViewport,
  flushAutosave,
  getPendingRestoreOffer,
  getSaveState,
  getSelectedNodeIds,
  fullDocument,
  getViewportWorldCenter,
  goToLevel,
  goUpLevel,
  openPageDocument,
  loadSavedSessionDoc,
  panToNodeIfNeeded,
  performUndo,
  pushHistory,
  mutateWithHistory,
  screenToWorld,
  setPendingRestoreOffer,
  setSaveErrorHandler,
  setSaveState,
  setSelection,
  trackViewportResize,
  zoomAround,
} from './state';
import {
  applySelection,
  renderAll,
  requestInspectorRefresh,
  updateVisualSelectionHighlights,
} from './render';
import {
  addSimulationScenario,
  renderSimulationEditor,
  withInspectorTransition,
} from './inspector';
import type {
  DiagramDocument,
  SelectionTarget,
  DiagramEdge,
  DiagramNode,
  DiagramNotesCard,
  DiagramZone,
  NodeKind,
  PortSide,
  StreamTone,
} from '../types';
import {
  STENCIL_CATALOG,
  createBlankDocument,
  createNodeFromStencil,
  findStencil,
  createNotesCard,
  createTextCard,
  createSwimlaneZone,
  nextUid,
} from '../templates/presets';
import {
  expandStageToFit,
  getEffectiveSimulations,
  getNodeCenter,
  getNodeDimensions,
  getPortPoint,
} from '../core/layout';
import {
  importMermaidOrBlueprint,
  type ImportOptions,
  serializeToBlueprintMarkdown,
} from '../core/parser';
import { parseBlueprintJson, serializeBlueprintJson } from '../exporter/blueprintJson';
import { describeDiagramBrief } from '../core/describe';
import { renderDiagramSvg, estimatePngExport } from '../exporter/diagramSvg';
import { pageCount } from '../core/pages';
import { pinchBaseline, pinchTransform, type PinchSample } from './pinch';
import { selectionOfStage } from './selection';
import {
  deleteActiveDiagram,
  duplicateActiveDiagram,
  exportAllDiagrams,
  initLibrary,
  newDiagram,
  openAsNewDiagram,
  openLibraryDialog,
} from './libraryUi';
import { initHome, openHome, openHomeAtBootIfReturning } from './homeScreen';
import { restoreDiagram } from './library';
import { currentScheme, renderStagePictureSvg, type StagePictureOptions } from './stagePicture';
import { TONE_CSS, TONE_META } from '../shared/tones';
import { allTags, colourKey } from '../core/meta';
import { cutoutDrawing, renderCutoutMarkup } from '../ui/cutout';
import { notify } from './toast';
import { localizeStaticShortcuts, renderShortcutsHtml } from './commands';
import { initTooltips } from './tooltips';
import { renameNodeInline, renameNotesInline } from './inlineRename';
import { serializeClip, type Clip } from '../core/clipboard';
import { frameAndDescendantIds, notesInFrames } from '../core/frameOps';
import { isPanGesture, wheelPan, wheelZoomFactor } from './camera';
import { initCommandPalette, findPaletteCommand } from './palette';
import { setPointerTool } from './pointerTool';
import { matchBinding } from '../core/keymap';
import { allLevelNodes } from '../core/levels';
import { holdInspectorOpen } from './inspectorAutoShow';
import { createShareUrl, decodeSharedDiagramFromHash, describeShareSize, docHasImages } from './shareLink';
import { initNodeSearch } from './nodeSearch';
import { togglePresentation } from './presentationTrigger';
import { simulationPlayback, populateTraceRows, initSimulationPlaybackUi } from './simulationPlayback';
import { initRunBar, refreshRunBar } from './runBar';
import { initChaosPanel } from './chaosPanel';
import { initQueueBacklog } from './queueBacklog';
import { queueWireDefaults } from '../core/appearance';
import { initInsightsPanel } from './insights';
import { initHelp } from './helpPopover';
import { nodesLayer as chaosNodesLayer } from './dom';
import { initChaosPreview, setFailures } from './chaos';
import { applyGroup, applyLockToggle, applyUngroup, applyZOrder } from './zOrderActions';
import { canGroupSelection } from './zOrderLockGroup';
import { responsiveToolbar } from './responsiveToolbar';
import {
  getActiveFileHandle,
  getActiveFileName,
  initInstallPrompt,
  isFileDiskDirty,
  isFileSystemAccessSupported,
  isMermaidFileName,
  blueprintNameFor,
  openWithNativeFilePicker,
  promptInstallApp,
  registerServiceWorker,
  resetActiveFile,
  saveWithNativeFileSystem,
  serializeForFilename,
  setDiskDirty,
} from './pwa';
import { announceModeChange } from './a11y';
import {
  TEMPLATE_CATEGORIES,
  getStarterTemplates,
  getStarterTemplateById,
  loadTemplateRaw,
  fillTemplatePreviews,
  renderTemplateCardHtml,
  renderBlankCanvasCardHtml,
  type TemplateCategory,
  type TemplateDefinition,
} from './templatesGallery';

export function attachStencilDragAndDrop(
  btn: HTMLElement,
  stencilId: string,
  title: string,
): void {
  // Pointer drag onto canvas OR simple click to add at viewport center
  const kind = stencilId;
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
      const stencil = findStencil(kind);
      const host = btn.classList.contains('cut') ? btn : btn.querySelector<HTMLElement>('.cut');
      host?.classList.add('is-empty');
      ghostEl = document.createElement('div');
      ghostEl.className = 'stencil-drag-ghost cutout-carry';
      if (stencil) {
        const drawing = cutoutDrawing(stencil);
        ghostEl.style.setProperty('--t', TONE_CSS[stencil.accent][0]);
        ghostEl.style.setProperty('--carry-w', `${drawing.width}px`);
        ghostEl.style.setProperty('--carry-h', `${drawing.height}px`);
        ghostEl.innerHTML = renderCutoutMarkup(stencil, { carried: true });
      } else {
        ghostEl.textContent = `+ ${title}`;
      }
      document.body.appendChild(ghostEl);
      requestAnimationFrame(() => ghostEl?.classList.add('is-full'));
    }
    if (ghostEl) {
      ghostEl.style.setProperty('--gx', String(e.clientX));
      ghostEl.style.setProperty('--gy', String(e.clientY));
    }
  });

  const finishStencilPointer = (e: PointerEvent, commit: boolean) => {
    btn.classList.remove('is-empty');
    btn.querySelector('.cut')?.classList.remove('is-empty');
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
        const dims = getNodeDimensions(findStencil(kind)?.kind ?? 'service');
        addNodeAt(kind, wx - dims.width / 2, wy - dims.height / 2);
      }
    } else {
      const [cx, cy] = getViewportWorldCenter();
      const dims = getNodeDimensions(findStencil(kind)?.kind ?? 'service');
      const cascade = (app.doc.nodes.length % 5) * 24;
      addNodeAt(kind, cx - dims.width / 2 + cascade, cy - dims.height / 2 + cascade);
    }

    if (
      e.pointerType === 'touch' ||
      (typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches)
    ) {
      responsiveToolbar.togglePalette(true);
    }
  };

  btn.addEventListener('pointerup', (e) => finishStencilPointer(e, true));
  btn.addEventListener('pointercancel', (e) => finishStencilPointer(e, false));

  // Keyboard Enter / Space support when focused
  btn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const [cx, cy] = getViewportWorldCenter();
      const dims = getNodeDimensions(findStencil(kind)?.kind ?? 'service');
      addNodeAt(kind, cx - dims.width / 2, cy - dims.height / 2);
      if (typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches) {
        responsiveToolbar.togglePalette(true);
      }
    }
  });
}

export function initStencilPalette(): void {
  stencilGrid.replaceChildren();

  for (const stencil of STENCIL_CATALOG) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'stencil-card';
    btn.dataset.kind = stencil.kind;
    btn.dataset.stencilId = stencil.id;
    btn.setAttribute('role', 'listitem');
    const [accent, soft] = TONE_CSS[stencil.accent];
    btn.style.setProperty('--stencil-accent', accent);
    btn.style.setProperty('--stencil-soft', soft);

    const preview = document.createElement('span');
    preview.className = 'stencil-preview cut';
    preview.style.setProperty('--t', TONE_CSS[stencil.accent][0]);
    preview.innerHTML = renderCutoutMarkup(stencil);

    const title = document.createElement('span');
    title.className = 'stencil-title';
    title.textContent = stencil.paletteTitle;

    const sub = document.createElement('span');
    sub.className = 'stencil-sub';
    sub.textContent = stencil.paletteSub;

    btn.setAttribute('data-tip', `${stencil.paletteTitle} — ${stencil.paletteSub}`);
    btn.setAttribute('data-tip-pos', 'top');

    btn.append(preview, title, sub);

    attachStencilDragAndDrop(btn, stencil.id, stencil.paletteTitle);

    stencilGrid.appendChild(btn);
  }

  // Also wire drag-and-drop & click actions for collapsed palette rail buttons
  const railBtns = document.querySelectorAll<HTMLButtonElement>('.rail-stencil-btn[data-stencil-kind], .rail-stencil-btn[data-stencil-id]');
  railBtns.forEach((railBtn) => {
    const id = railBtn.getAttribute('data-stencil-id') ?? railBtn.getAttribute('data-stencil-kind');
    if (id && id !== 'zone' && id !== 'notes') {
      const stencil = findStencil(id);
      if (stencil) {
        railBtn.classList.add('cut');
        railBtn.style.setProperty('--t', TONE_CSS[stencil.accent][0]);
        railBtn.innerHTML = renderCutoutMarkup(stencil);
      }
      attachStencilDragAndDrop(railBtn, stencil?.id ?? id, stencil?.paletteTitle ?? id);
    }
  });
}

export function tagEnteringNodes(ids: string[]): void {
  if (typeof document === 'undefined') return;
  requestAnimationFrame(() => {
    for (const id of ids) {
      const el = document.getElementById(`node-${id}`);
      if (el) {
        el.classList.add('is-entering');
        setTimeout(() => el.classList.remove('is-entering'), 350);
      }
    }
  });
}

export function addNodeAt(kind: NodeKind | string, rawX: number, rawY: number): DiagramNode {
  pushHistory();
  const clampedX = Math.max(24, rawX);
  const clampedY = Math.max(32, rawY);
  const node = createNodeFromStencil(kind, clampedX, clampedY, app.doc.nodes.length);
  if (!app.snapToGrid) {
    node.x = Math.round(clampedX);
    node.y = Math.round(clampedY);
  }
  app.doc.nodes.push(node);
  expandStageToFit(app.doc);
  setSelection({ type: 'node', id: node.id });
  renderAll(true);
  tagEnteringNodes([node.id]);
  return node;
}

export function beginPortWireDrag(
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

  const sourceNodeEl = document.getElementById(`node-${sourceNode.id}`);
  sourceNodeEl?.classList.add('is-wiring-source');

  app.activeWireDraft = {
    sourceNodeId: sourceNode.id,
    sourcePort,
    startPt,
    hoveredPortBtn: null,
    // Releasing capture fires `lostpointercapture`, whose handler tears the draft down without connecting.
    cancel: () => {
      if (captureEl.hasPointerCapture(e.pointerId)) captureEl.releasePointerCapture(e.pointerId);
    },
  };
  workspace.dataset.wiring = 'true';
  draftWire.removeAttribute('hidden');
  draftWire.setAttribute('d', `M ${startPt[0]} ${startPt[1]} L ${startPt[0]} ${startPt[1]}`);
  captureEl.setPointerCapture(e.pointerId);

  const onLost = () => {
    sourceNodeEl?.classList.remove('is-wiring-source');
    sourceNodeEl?.classList.remove('is-wiring-source');
    captureEl.removeEventListener('pointermove', onMove);
    captureEl.removeEventListener('pointerup', onUp);
    captureEl.removeEventListener('pointercancel', onCancel);
    captureEl.removeEventListener('lostpointercapture', onLost);
    if (app.activeWireDraft?.hoveredPortBtn) {
      app.activeWireDraft.hoveredPortBtn.classList.remove('is-target-port');
    }
    app.activeWireDraft = null;
    delete workspace.dataset.wiring;
    draftWire.setAttribute('hidden', '');
  };

  const onMove = (moveEv: PointerEvent) => {
    if (app.multiPointer) {
      onLost();
      return;
    }
    if (!app.activeWireDraft) return;
    const [wx, wy] = screenToWorld(moveEv.clientX, moveEv.clientY);

    // Check if pointer is hovering over a target port or target node
    const hitEl = document.elementFromPoint(moveEv.clientX, moveEv.clientY) as HTMLElement | null;
    const portBtn = hitEl?.closest('.node-port') as HTMLElement | null;

    if (app.activeWireDraft.hoveredPortBtn && app.activeWireDraft.hoveredPortBtn !== portBtn) {
      app.activeWireDraft.hoveredPortBtn.classList.remove('is-target-port');
    }
    if (portBtn && portBtn.dataset.nodeId !== app.activeWireDraft.sourceNodeId) {
      portBtn.classList.add('is-target-port');
      app.activeWireDraft.hoveredPortBtn = portBtn;
    } else {
      app.activeWireDraft.hoveredPortBtn = null;
    }

    const [sx, sy] = app.activeWireDraft.startPt;
    const midX = Math.round((sx + wx) / 2);
    draftWire.setAttribute('d', `M ${sx} ${sy} C ${midX} ${sy}, ${midX} ${wy}, ${wx} ${wy}`);
  };

  const onFinish = (upEv: PointerEvent, commit: boolean) => {
    upEv.stopPropagation();
    sourceNodeEl?.classList.remove('is-wiring-source');
    captureEl.removeEventListener('pointermove', onMove);
    captureEl.removeEventListener('pointerup', onUp);
    captureEl.removeEventListener('pointercancel', onCancel);

    if (app.activeWireDraft?.hoveredPortBtn) {
      app.activeWireDraft.hoveredPortBtn.classList.remove('is-target-port');
    }

    const draft = app.activeWireDraft;
    app.activeWireDraft = null;
    delete workspace.dataset.wiring;
    draftWire.setAttribute('hidden', '');
    captureEl.removeEventListener('lostpointercapture', onLost);

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
    } else if (
      isEmptyCanvasPoint(hitEl) &&
      Math.hypot(upEv.clientX - e.clientX, upEv.clientY - e.clientY) >= WIRE_DROP_MIN_DRAG_PX
    ) {
      // Dropping a wire on empty canvas creates a connected component there, ready to be named.
      const [wx, wy] = screenToWorld(upEv.clientX, upEv.clientY);
      const created = createNodeFromWireDrop(draft.sourceNodeId, draft.sourcePort, wx, wy);
      if (created) window.setTimeout(() => renameNodeInline(created.id), 0);
    }
  };

  const onUp = (upEv: PointerEvent) => onFinish(upEv, true);
  const onCancel = (cancelEv: PointerEvent) => onFinish(cancelEv, false);

  captureEl.addEventListener('pointermove', onMove);
  captureEl.addEventListener('pointerup', onUp);
  captureEl.addEventListener('pointercancel', onCancel);
  captureEl.addEventListener('lostpointercapture', onLost);
}

export type WireEnd = 'from' | 'to';

/** The component (and port) under a screen point, for dropping a wire end on. Null over bare canvas. */
export function wireDropTarget(clientX: number, clientY: number): { nodeId: string; port: PortSide } | null {
  const hit = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
  const portEl = hit?.closest('.node-port') as HTMLElement | null;
  if (portEl?.dataset.nodeId) return { nodeId: portEl.dataset.nodeId, port: (portEl.dataset.port as PortSide) || 'auto' };
  const nodeEl = hit?.closest('.arch-node') as HTMLElement | null;
  if (nodeEl?.dataset.node) return { nodeId: nodeEl.dataset.node, port: 'auto' };
  return null;
}

/**
 * Re-attach one end of a wire to another component (or another port of the same one). One undo step.
 * Returns false, changing nothing, if the wire is gone, nothing would change, or it would join a component to itself.
 */
export function retargetEdgeEnd(edgeId: string, end: WireEnd, nodeId: string, port: PortSide): boolean {
  const edge = app.doc.edges.find((e) => e.id === edgeId);
  if (!edge || !app.doc.nodes.some((n) => n.id === nodeId)) return false;
  const otherId = end === 'from' ? edge.to : edge.from;
  if (nodeId === otherId) {
    notify("A wire can't connect a component to itself");
    return false;
  }
  const changed = mutateWithHistory(() => {
    if (end === 'from') {
      edge.from = nodeId;
      edge.sourcePort = port;
    } else {
      edge.to = nodeId;
      edge.targetPort = port;
    }
  });
  if (!changed) return false;
  renderAll(true);
  notify('Wire reconnected');
  return true;
}

/** Shorter drags are almost certainly a slip, not a request for a new component. */
const WIRE_DROP_MIN_DRAG_PX = 32;

/** True for a point on bare canvas: inside the viewport, and not on a component, wire, note, swimlane or control. */
function isEmptyCanvasPoint(hitEl: Element | null): boolean {
  if (!hitEl || !viewport.contains(hitEl)) return false;
  return !hitEl.closest('.arch-node, .blueprint-spec, .zone-banner, .conduit-group, [data-island], button, input, a');
}

/**
 * Create a component centred on (worldX, worldY) and wire the dragged source to it, as one undo step.
 * Returns the new node, or null if the source no longer exists.
 */
export function createNodeFromWireDrop(
  sourceId: string,
  sourcePort: PortSide,
  worldX: number,
  worldY: number,
): DiagramNode | null {
  if (!app.doc.nodes.some((n) => n.id === sourceId)) return null;
  let created: DiagramNode | null = null;
  mutateWithHistory(() => {
    const node = createNodeFromStencil('service', 0, 0, app.doc.nodes.length);
    const snap = (v: number) => (app.snapToGrid ? Math.round(v / 16) * 16 : Math.round(v));
    node.x = Math.max(24, snap(worldX - node.width / 2));
    node.y = Math.max(32, snap(worldY - node.height / 2));
    app.doc.nodes.push(node);
    app.doc.edges.push({
      id: nextUid('edge'),
      from: sourceId,
      to: node.id,
      sourcePort,
      targetPort: 'auto',
      tone: 'blue',
      route: 'auto',
      label: '',
      animated: true,
      ...queueWireDefaults(app.doc.nodes, sourceId, node.id),
    });
    expandStageToFit(app.doc);
    created = node;
    return true;
  });
  if (!created) return null;
  const node: DiagramNode = created;
  app.connectSourceNodeId = null;
  setSelection({ type: 'node', id: node.id });
  renderAll(true);
  tagEnteringNodes([node.id]);
  return node;
}

export function createEdgeConnection(
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
    ...queueWireDefaults(app.doc.nodes, fromId, toId),
  };
  app.doc.edges.push(newEdge);
  setSelection({ type: 'edge', id: newEdge.id });
  app.connectSourceNodeId = null;
  renderAll(true);
}

const SHOW_LEGEND_KEY = 'conduitcraft:show-legend';

function legendCardWanted(): boolean {
  try {
    return localStorage.getItem(SHOW_LEGEND_KEY) !== 'false';
  } catch {
    return true;
  }
}

/** Fills the canvas legend card from the document's legend; hidden when there is none or the preference is off. */
function syncLegendCard(): void {
  const card = document.getElementById('legend-card');
  const list = document.getElementById('legend-card-list');
  if (!card || !list) return;
  // Under "Colour by status" or "tag" the card explains those colours; otherwise it shows the document's own legend.
  const key = colourKey(app.doc, app.colourBy);
  const entries = key.length ? key : (app.doc.legend ?? []);
  card.hidden = entries.length === 0 || !legendCardWanted();
  list.replaceChildren();
  for (const entry of entries) {
    const li = document.createElement('li');
    const dot = document.createElement('span');
    dot.className = 'pill-swatch';
    dot.style.background = TONE_META[entry.tone].cssVar;
    const text = document.createElement('span');
    text.textContent = 'description' in entry && entry.description ? `${entry.label} — ${entry.description}` : entry.label;
    li.append(dot, text);
    list.appendChild(li);
  }
}

/** The "show legend" preference in settings. */
export function bindLegendPreference(): void {
  const box = document.getElementById('chk-show-legend') as HTMLInputElement | null;
  if (!box) return;
  box.checked = legendCardWanted();
  box.addEventListener('change', () => {
    try {
      localStorage.setItem(SHOW_LEGEND_KEY, String(box.checked));
    } catch {
      // Storage unavailable: the preference lasts until the page reloads.
    }
    syncLegendCard();
  });
}

/** Keeps every tag filter's options in step with the tags in the document. */
function syncTagFilter(): void {
  const tags = allTags(app.doc);
  if (app.tagFilter && !tags.some((t) => t.toLowerCase() === app.tagFilter.toLowerCase())) app.tagFilter = '';
  const signature = tags.join('\u0000');
  for (const select of document.querySelectorAll<HTMLSelectElement>('.js-tag-filter')) {
    if (select.dataset.sig !== signature) {
      select.dataset.sig = signature;
      select.replaceChildren(
        Object.assign(document.createElement('option'), { value: '', textContent: 'All tags' }),
        ...tags.map((tag) => Object.assign(document.createElement('option'), { value: tag, textContent: tag })),
      );
    }
    select.value = app.tagFilter;
  }
  for (const select of document.querySelectorAll<HTMLSelectElement>('.js-colour-by')) select.value = app.colourBy;
}

/** "Colour by" and "tag" controls: the run bar. */
export function bindViewFilters(): void {
  for (const colour of document.querySelectorAll<HTMLSelectElement>('.js-colour-by')) {
    colour.addEventListener('change', () => {
      app.colourBy = colour.value === 'status' || colour.value === 'tag' ? colour.value : 'tone';
      renderAll(false);
    });
  }
  for (const tag of document.querySelectorAll<HTMLSelectElement>('.js-tag-filter')) {
    tag.addEventListener('focus', syncTagFilter);
    tag.addEventListener('mousedown', syncTagFilter);
    tag.addEventListener('change', () => {
      app.tagFilter = tag.value;
      renderAll(false);
    });
  }
}

/** Shows the document's legend names on the colour filter chips and the legend card. */
function syncToneLabels(): void {
  syncLegendCard();
  syncTagFilter();
}

export function renderSimButtons(): void {
  refreshRunBar();
  syncToneLabels();
}

export function clearSimulation(): void {
  if (app.simTimer !== null) {
    window.clearTimeout(app.simTimer);
    app.simTimer = null;
  }
  simulationPlayback.clear();
}

export function appendTraceEntry(stepLabel: string, message: string, tone: StreamTone): void {
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

export function switchDataViewTab(tab: 'inspector' | 'trace' | 'simulations'): void {
  const tabs = [
    [tabInspector, panelInspector, tab === 'inspector'],
    [tabTrace, panelTrace, tab === 'trace'],
    [tabSimulations, panelSimulations, tab === 'simulations'],
  ] as const;
  withInspectorTransition(() => {
    for (const [button, panel, on] of tabs) {
      button.setAttribute('aria-selected', String(on));
      panel.hidden = !on;
    }
  });
}

export function runSimulation(simId: string): void {
  const scenarios = getEffectiveSimulations(app.doc);
  const scenario = scenarios.find((s) => s.id === simId);
  if (!scenario || scenario.steps.length === 0) return;

  clearSimulation();
  if (app.workspaceMode === 'data') {
    switchDataViewTab('trace');
  }
  workspace.dataset.flow = 'all';

  populateTraceRows(scenario);
  if (scenario.failures?.length) setFailures(scenario.failures);
  simulationPlayback.loadScenario(scenario, true);
}

// ---------------------------------------------------------------------------
// Delete, Duplicate & Copy/Paste Selected Elements
// ---------------------------------------------------------------------------
export function deleteSelected(): void {
  const sel = app.selection;
  if (sel.type === 'none') return;

  if (sel.type === 'node') {
    const targetId = sel.id;
    const node = app.doc.nodes.find((n) => n.id === targetId);
    if (node?.locked) {
      notify(`Cannot delete locked component "${node.title}"`);
      return;
    }
    pushHistory();
    const desc = node ? `"${node.title}"` : 'component';
    app.doc.nodes = app.doc.nodes.filter((n) => n.id !== targetId);
    app.doc.edges = app.doc.edges.filter((e) => e.from !== targetId && e.to !== targetId);
    dropNodesFromSimulations(new Set([targetId]));
    setSelection({ type: 'none' });
    renderAll(true);
    notify(`Deleted ${desc}`, { action: { label: 'Undo', onClick: () => performUndo() } });
    return;
  }

  if (sel.type === 'zone') {
    const zone = app.doc.zones.find((z) => z.id === sel.id);
    if (zone?.locked) {
      notify(`Cannot delete locked swimlane "${zone.title}"`);
      return;
    }
    pushHistory();
    app.doc.zones = app.doc.zones.filter((z) => z.id !== sel.id);
    setSelection({ type: 'none' });
    renderAll(true);
    notify('Deleted swimlane', { action: { label: 'Undo', onClick: () => performUndo() } });
    return;
  }

  if (sel.type === 'frame') {
    void import('./frameStage').then((m) => m.deleteFrame(sel.id));
    return;
  }

  if (sel.type === 'notes') {
    const card = app.doc.notesCards.find((c) => c.id === sel.id);
    if (card?.locked) {
      notify(`Cannot delete locked note "${card.title}"`);
      return;
    }
    pushHistory();
    app.doc.notesCards = app.doc.notesCards.filter((c) => c.id !== sel.id);
    setSelection({ type: 'none' });
    renderAll(true);
    notify('Deleted note card', { action: { label: 'Undo', onClick: () => performUndo() } });
    return;
  }

  if (sel.type === 'multi') {
    const unlockedNodeIds = sel.ids.filter((id) => !app.doc.nodes.find((n) => n.id === id)?.locked);
    const unlockedZoneIds = (sel.zoneIds ?? []).filter((id) => !app.doc.zones.find((z) => z.id === id)?.locked);
    const unlockedNoteIds = (sel.notesIds ?? []).filter((id) => !app.doc.notesCards.find((c) => c.id === id)?.locked);
    const unlockedEdgeIds = sel.edgeIds ?? [];

    if (unlockedNodeIds.length + unlockedZoneIds.length + unlockedNoteIds.length + unlockedEdgeIds.length === 0) {
      notify('Selected items are locked');
      return;
    }

    pushHistory();
    const count = unlockedNodeIds.length + unlockedZoneIds.length + unlockedNoteIds.length + unlockedEdgeIds.length;
    const desc = `${count} ${count === 1 ? 'item' : 'items'}`;
    const idSet = new Set(unlockedNodeIds);
    const zoneIds = new Set(unlockedZoneIds);
    const notesIds = new Set(unlockedNoteIds);
    const edgeIds = new Set(unlockedEdgeIds);
    app.doc.nodes = app.doc.nodes.filter((n) => !idSet.has(n.id));
    app.doc.edges = app.doc.edges.filter((e) => !idSet.has(e.from) && !idSet.has(e.to) && !edgeIds.has(e.id));
    if (zoneIds.size > 0) app.doc.zones = app.doc.zones.filter((zone) => !zoneIds.has(zone.id));
    if (notesIds.size > 0) app.doc.notesCards = app.doc.notesCards.filter((card) => !notesIds.has(card.id));
    dropNodesFromSimulations(idSet);
    setSelection({ type: 'none' });
    renderAll(true);
    notify(`Deleted ${desc}`, { action: { label: 'Undo', onClick: () => performUndo() } });
    return;
  }

  if (sel.type === 'edge') {
    pushHistory();
    app.doc.edges = app.doc.edges.filter((e) => e.id !== sel.id);
    setSelection({ type: 'none' });
    renderAll(true);
    notify('Deleted wire', { action: { label: 'Undo', onClick: () => performUndo() } });
  }
}

function dropNodesFromSimulations(ids: Set<string>): void {
  for (const scenario of app.doc.simulations) {
    for (const step of scenario.steps) {
      step.nodes = step.nodes.filter((id) => !ids.has(id));
    }
  }
}

export function duplicateSelected(): void {
  const sel = app.selection;
  if (sel.type === 'frame') {
    void import('./frameStage').then((m) => m.duplicateSelectedFrame());
  } else if (sel.type === 'node') {
    const orig = app.doc.nodes.find((n) => n.id === sel.id);
    if (!orig) return;
    pushHistory();
    const copy: DiagramNode = structuredClone(orig);
    copy.id = nextUid(orig.kind);
    copy.title = `${orig.title} Copy`;
    copy.x += 32;
    copy.y += 32;
    app.doc.nodes.push(copy);
    expandStageToFit(app.doc);
    setSelection({ type: 'node', id: copy.id });
    renderAll(true);
    tagEnteringNodes([copy.id]);
    notify('Duplicated component');
  } else if (sel.type === 'multi') {
    const origNodes = app.doc.nodes.filter((n) => sel.ids.includes(n.id));
    const origZones = app.doc.zones.filter((zone) => sel.zoneIds?.includes(zone.id));
    const origNotes = app.doc.notesCards.filter((card) => sel.notesIds?.includes(card.id));
    if (origNodes.length + origZones.length + origNotes.length === 0) return;
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
      app.doc.nodes.push(copy);
    }
    for (const edge of app.doc.edges) {
      const nf = idMap.get(edge.from);
      const nt = idMap.get(edge.to);
      if (nf && nt) {
        const edgeCopy = structuredClone(edge);
        edgeCopy.id = nextUid('edge');
        edgeCopy.from = nf;
        edgeCopy.to = nt;
        app.doc.edges.push(edgeCopy);
      }
    }
    const newZoneIds: string[] = [];
    for (const orig of origZones) {
      const copy: DiagramZone = structuredClone(orig);
      copy.id = nextUid('zone');
      copy.x += orig.width + 24;
      newZoneIds.push(copy.id);
      app.doc.zones.push(copy);
    }
    const newNoteIds: string[] = [];
    for (const orig of origNotes) {
      const copy: DiagramNotesCard = structuredClone(orig);
      copy.id = nextUid('notes');
      copy.x += 32;
      copy.y += 32;
      newNoteIds.push(copy.id);
      app.doc.notesCards.push(copy);
    }
    expandStageToFit(app.doc);
    setSelection(selectionOfStage({ nodes: newIds, zones: newZoneIds, notes: newNoteIds }));
    renderAll(true);
    tagEnteringNodes(newIds);
    notify(`Duplicated ${newIds.length + newZoneIds.length + newNoteIds.length} items`);
  } else if (sel.type === 'zone') {
    const orig = app.doc.zones.find((z) => z.id === sel.id);
    if (!orig) return;
    pushHistory();
    const copy: DiagramZone = structuredClone(orig);
    copy.id = nextUid('zone');
    copy.x += orig.width + 24;
    app.doc.zones.push(copy);
    expandStageToFit(app.doc);
    setSelection({ type: 'zone', id: copy.id });
    renderAll(true);
    notify('Duplicated swimlane');
  } else if (sel.type === 'notes') {
    const orig = app.doc.notesCards.find((c) => c.id === sel.id);
    if (!orig) return;
    pushHistory();
    const copy: DiagramNotesCard = structuredClone(orig);
    copy.id = nextUid('notes');
    copy.x += 32;
    copy.y += 32;
    app.doc.notesCards.push(copy);
    expandStageToFit(app.doc);
    setSelection({ type: 'notes', id: copy.id });
    renderAll(true);
    notify('Duplicated note card');
  }
}

/**
 * Copy the selected components and the wires between them. They go in the in-tab buffer and, as text with a
 * `conduitcraft` marker, on the system clipboard (through the `copy` event's data, so no permission is needed), which is
 * what lets another tab, window or diagram paste them.
 */
/** Something to copy is selected: a component, swimlane, frame or note (a lone wire has nothing to carry). */
function hasCopyableSelection(): boolean {
  const sel = app.selection;
  if (sel.type === 'node' || sel.type === 'zone' || sel.type === 'notes' || sel.type === 'frame') return true;
  return sel.type === 'multi' && (sel.ids.length > 0 || (sel.zoneIds?.length ?? 0) > 0 || (sel.notesIds?.length ?? 0) > 0);
}

export function copySelection(data?: DataTransfer | null): void {
  const sel = app.selection;
  const nodeIds = new Set(getSelectedNodeIds());
  const zoneIds = new Set<string>();
  const noteIds = new Set<string>();
  const frameIds = new Set<string>();
  if (sel.type === 'zone') zoneIds.add(sel.id);
  else if (sel.type === 'notes') noteIds.add(sel.id);
  else if (sel.type === 'multi') {
    for (const id of sel.zoneIds ?? []) zoneIds.add(id);
    for (const id of sel.notesIds ?? []) noteIds.add(id);
    // A multi-selection cannot hold a frame, so a frame goes along when everything in it is selected (and all of
    // them with Select All), keeping its components owned by it in the paste.
    const doc = app.doc;
    const everything =
      doc.nodes.every((n) => nodeIds.has(n.id)) &&
      doc.zones.every((z) => zoneIds.has(z.id)) &&
      doc.notesCards.every((c) => noteIds.has(c.id));
    for (const f of doc.frames ?? []) {
      const inside = frameAndDescendantIds(doc.frames ?? [], f.id);
      const owned = doc.nodes.filter((n) => n.frameId && inside.has(n.frameId));
      if (everything || (owned.length > 0 && owned.every((n) => nodeIds.has(n.id)))) frameIds.add(f.id);
    }
  } else if (sel.type === 'frame') {
    // A frame goes with the frames inside it, what it owns, and the notes sitting in it.
    const all = frameAndDescendantIds(app.doc.frames ?? [], sel.id);
    for (const id of all) frameIds.add(id);
    for (const n of app.doc.nodes) if (n.frameId && all.has(n.frameId)) nodeIds.add(n.id);
    for (const c of notesInFrames(app.doc, all)) noteIds.add(c.id);
  }
  if (nodeIds.size + zoneIds.size + noteIds.size + frameIds.size === 0) return;
  const nodes = structuredClone(app.doc.nodes.filter((n) => nodeIds.has(n.id)));
  const edges = structuredClone(app.doc.edges.filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to)));
  const zones = structuredClone(app.doc.zones.filter((z) => zoneIds.has(z.id)));
  const frames = structuredClone((app.doc.frames ?? []).filter((f) => frameIds.has(f.id)));
  const notes = structuredClone(app.doc.notesCards.filter((c) => noteIds.has(c.id)));
  app.clipboard = { nodes, edges, zones, frames, notes, droppedImages: false };
  const { text, droppedImages } = serializeClip(nodes, edges, { zones, frames, notes });
  if (data) data.setData('text/plain', text);
  else void navigator.clipboard?.writeText(text).catch(() => undefined);
  const count = nodes.length + zones.length + frames.length + notes.length;
  const only = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
  const msg =
    count === nodes.length
      ? `Copied ${only(count, 'component', 'components')} to clipboard`
      : `Copied ${only(count, 'item', 'items')} to clipboard`;
  const full = droppedImages ? `${msg} (pictures left out: too large)` : msg;
  hudStatusTip.textContent = full;
  notify(full);
}

/** Paste what the clipboard text carries; with nothing of ours there, fall back to the in-tab buffer. */
export async function pasteSelection(clipboardText = ''): Promise<void> {
  let clip: Clip | null = null;
  const { parseClip, materializeClip } = await import('../core/clipboardPaste');
  if (clipboardText.trim()) {
    const parsed = parseClip(clipboardText);
    if (parsed.ok) clip = parsed.clip;
    else if (parsed.reason === 'invalid') {
      notify(parsed.message, { tone: 'error' });
      return;
    }
  }
  if (!clip && app.clipboard) clip = app.clipboard;
  if (!clip) {
    if (clipboardText.trim()) notify('The clipboard does not hold components.');
    return;
  }
  pushHistory();
  const doc = app.doc;
  const made = materializeClip(
    clip,
    [...doc.nodes, ...(doc.frames ?? []), ...doc.notesCards],
    nextUid,
    32,
    doc.zones.map((z) => z.x),
  );
  doc.nodes.push(...made.nodes);
  doc.edges.push(...made.edges);
  doc.zones.push(...made.zones);
  doc.notesCards.push(...made.notes);
  if (made.frames.length > 0) doc.frames = [...(doc.frames ?? []), ...made.frames];
  const newIds = made.nodes.map((n) => n.id);
  const newZoneIds = made.zones.map((z) => z.id);
  const newNoteIds = made.notes.map((c) => c.id);
  const topFrames = made.frames.filter((f) => !f.parentId);
  expandStageToFit(doc);
  if (topFrames.length === 1 && newZoneIds.length === 0) {
    // A pasted frame is selected as a frame, the way a duplicated one is.
    setSelection({ type: 'frame', id: topFrames[0].id });
  } else {
    setSelection(selectionOfStage({ nodes: newIds, zones: newZoneIds, notes: newNoteIds }));
  }
  renderAll(true);
  tagEnteringNodes(newIds);
  const count = newIds.length + newZoneIds.length + newNoteIds.length + made.frames.length;
  const msg =
    count === newIds.length
      ? `Pasted ${count} ${count === 1 ? 'component' : 'components'}`
      : `Pasted ${count} ${count === 1 ? 'item' : 'items'}`;
  hudStatusTip.textContent = msg;
  notify(msg);
}

// ---------------------------------------------------------------------------
// File Import, Drag-and-Drop, Code Sync, and Export
// ---------------------------------------------------------------------------
const firstNodeSelection = (doc: DiagramDocument): SelectionTarget =>
  doc.nodes.length > 0 ? { type: 'node', id: doc.nodes[0].id } : { type: 'none' };

/**
 * Read Blueprint JSON or Mermaid text into the open diagram, or (`asNewDiagram`, for files) into a new library entry
 * so the open diagram stays as it was.
 */
export function applyImportedText(
  rawText: string,
  fallbackTitle?: string,
  importOptions?: ImportOptions,
  asNewDiagram = false,
): boolean {
  const trimmed = rawText.trim();
  if (trimmed.startsWith('{')) {
    const parsed = parseBlueprintJson(trimmed);
    if (!parsed.ok) {
      codeSyncDiagnostics.dataset.tone = 'warn';
      codeSyncDiagnostics.textContent = parsed.error;
      hudStatusTip.textContent = parsed.error;
      notify(parsed.error, { tone: 'error' });
      return false;
    }
    if (fallbackTitle && parsed.doc.title === 'Untitled Architecture') parsed.doc.title = fallbackTitle;
    const jsonMsg = `Imported Blueprint JSON (${parsed.doc.nodes.length} components, ${parsed.doc.edges.length} wires)`;
    codeSyncDiagnostics.dataset.tone = 'ok';
    codeSyncDiagnostics.textContent = `Imported ${parsed.doc.nodes.length} components from Blueprint JSON.`;
    hudStatusTip.textContent = jsonMsg;
    if (asNewDiagram) {
      void openAsNewDiagram(parsed.doc, jsonMsg, { pickSelection: firstNodeSelection, keepFile: true });
      return true;
    }
    pushHistory();
    app.doc = parsed.doc;
    setSelection(firstNodeSelection(app.doc));
    clearSimulation();
    renderAll(true);
    requestAnimationFrame(fitToViewport);
    notify(jsonMsg, { action: { label: 'Undo', onClick: () => performUndo() } });
    return true;
  }

  const { doc: importedDoc, warnings, issues } = importMermaidOrBlueprint(rawText, importOptions);
  const formatIssue = (idx = 0): string => {
    const issue = issues[idx];
    if (!issue) return warnings[idx] || '';
    return issue.line ? `[Line ${issue.line}] ${issue.message}` : issue.message;
  };

  if (importedDoc.nodes.length === 0 && importedDoc.zones.length === 0 && importedDoc.notesCards.length === 0) {
    codeSyncDiagnostics.dataset.tone = 'warn';
    const err = formatIssue(0) || 'No Mermaid flowchart nodes or Blueprint definitions found in input.';
    codeSyncDiagnostics.textContent = err;
    notify(err, { tone: 'error' });
    return false;
  }

  if (fallbackTitle && importedDoc.title === 'Imported Architecture') {
    importedDoc.title = fallbackTitle;
  }
  const finishImport = (message: string): void => {
    if (asNewDiagram) void openAsNewDiagram(importedDoc, message, { pickSelection: firstNodeSelection, keepFile: true });
    else notify(message, { action: { label: 'Undo', onClick: () => performUndo() } });
  };
  if (!asNewDiagram) {
    pushHistory();
    app.doc = importedDoc;
    setSelection(firstNodeSelection(app.doc));
    clearSimulation();
    renderAll(true);
    requestAnimationFrame(fitToViewport);
  }

  if (issues.length > 0 || warnings.length > 0) {
    codeSyncDiagnostics.dataset.tone = 'warn';
    const summary = issues
      .slice(0, 3)
      .map((_, i) => formatIssue(i))
      .join(' · ');
    codeSyncDiagnostics.textContent = summary || warnings[0];
    const msg = `Imported ${importedDoc.nodes.length} nodes (${issues.length || warnings.length} warning${(issues.length || warnings.length) === 1 ? '' : 's'}: ${formatIssue(0)})`;
    hudStatusTip.textContent = msg;
    finishImport(`Imported ${importedDoc.nodes.length} components with warnings`);
  } else {
    codeSyncDiagnostics.dataset.tone = 'ok';
    codeSyncDiagnostics.textContent = `Imported ${importedDoc.nodes.length} components and ${importedDoc.edges.length} wires (0 issues).`;
    const msg = `Imported ${importedDoc.nodes.length} components and ${importedDoc.edges.length} animated wires`;
    hudStatusTip.textContent = msg;
    finishImport(`Imported ${importedDoc.nodes.length} components and ${importedDoc.edges.length} wires`);
  }
  return true;
}

export async function handleUploadedFile(file: File): Promise<void> {
  resetActiveFile();
  const text = await file.text();
  const baseName = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
  const titleFromFile = baseName
    ? baseName.replace(/\b\w/g, (ch) => ch.toUpperCase())
    : undefined;
  await importFileText(file.name, text, titleFromFile);
}

/**
 * A file one of the importers recognises (draw.io, Excalidraw, OpenAPI, AsyncAPI, Kubernetes, Compose) goes to it; the
 * routing and the importers load on demand. Everything else is Blueprint JSON, a Blueprint file or Mermaid. If the
 * router cannot load (offline and not cached), the file is read as one of those.
 */
async function importFileText(fileName: string, text: string, title: string | undefined): Promise<void> {
  try {
    const { routeImportedFile } = await import('./importRouter');
    if (routeImportedFile(fileName, text, title)) return;
  } catch {
    // Not available right now: fall through to the built-in formats.
  }
  applyImportedText(text, title, undefined, true);
}

function downloadUrl(url: string, filename: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function downloadBlob(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  downloadUrl(url, filename);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadDiagramPng(svg: string, width: number, height: number, filename: string): void {
  // A blob URL taints the canvas when the SVG embeds the live stage. A data URL does not.
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const image = new Image();
  image.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, image.naturalWidth || width);
    canvas.height = Math.max(1, image.naturalHeight || height);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      hudStatusTip.textContent = 'Could not render a PNG of this diagram.';
      return;
    }
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((png) => {
      if (!png) {
        hudStatusTip.textContent = 'Could not render a PNG of this diagram.';
        notify('Could not render a PNG of this diagram.', { tone: 'error' });
        return;
      }
      const pngUrl = URL.createObjectURL(png);
      downloadUrl(pngUrl, filename);
      window.setTimeout(() => URL.revokeObjectURL(pngUrl), 1000);
      hudStatusTip.textContent = 'Saved a picture of the canvas.';
      notify(`Exported ${filename}`);
    }, 'image/png');
  };
  image.onerror = () => {
    hudStatusTip.textContent = 'Could not render a PNG of this diagram.';
    notify('Could not render a PNG of this diagram.', { tone: 'error' });
  };
  image.src = url;
}

function downloadBytes(bytes: Uint8Array, filename: string, mimeType: string): void {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy.buffer], { type: mimeType });
  const url = URL.createObjectURL(blob);
  downloadUrl(url, filename);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function rasterizeSvg(svg: string, width: number, height: number): Promise<Uint8ClampedArray> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        reject(new Error('canvas'));
        return;
      }
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(image, 0, 0, width, height);
      resolve(ctx.getImageData(0, 0, width, height).data);
    };
    image.onerror = () => reject(new Error('svg'));
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

type GifExport = { kind: 'whole' } | { kind: 'view' } | { kind: 'scenario'; id: string };

function filenameSlug(value: string, fallback: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || fallback
  );
}

function showGifChoices(): void {
  const scenarios = getEffectiveSimulations(app.doc).filter((scenario) => scenario.steps.length > 0);
  gifScenarioList.replaceChildren();
  for (const scenario of scenarios) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'export-option-card';
    const title = document.createElement('strong');
    title.textContent = scenario.name;
    const detail = document.createElement('span');
    const hops = scenario.steps.length;
    detail.textContent = hops === 1 ? '1 hop' : `${hops} hops`;
    button.append(title, detail);
    button.addEventListener('click', () => {
      void downloadDiagramGif({ kind: 'scenario', id: scenario.id });
      void closeDialogSmoothly(exportDialog);
    });
    gifScenarioList.append(button);
  }
  gifScenarioEmpty.hidden = scenarios.length > 0;
  exportCards.hidden = true;
  gifExportPanel.hidden = false;
  exportDialogTitle.textContent = 'Animation';
  btnGifWhole.focus();
}

function resetGifChoices(): void {
  gifExportPanel.hidden = true;
  exportCards.hidden = false;
  exportDialogTitle.textContent = 'Export Architecture';
  gifScenarioList.replaceChildren();
  gifScenarioEmpty.hidden = true;
}

async function downloadDiagramGif(target: GifExport): Promise<void> {
  expandStageToFit(app.doc);
  const doc = app.doc;
  hudStatusTip.textContent = 'Rendering a short animation…';
  try {
    // Loaded on demand so the encoder stays out of the initial bundle.
    const { GIF_MAX_EDGE, encodeGifAsync, gifFrameCount, gifFrameDashOffset, gifPixelSize } = await import(
      '../exporter/gif'
    );
    if (target.kind === 'scenario') {
      const scenario = getEffectiveSimulations(doc).find((item) => item.id === target.id);
      if (!scenario || scenario.steps.length === 0) {
        hudStatusTip.textContent = 'That scenario has no hops to record.';
        return;
      }
      const size = gifPixelSize(doc.stageWidth, doc.stageHeight);
      const frames: Uint8ClampedArray[] = [];
      for (const step of scenario.steps) {
        const svg = renderStagePictureSvg(size.width, size.height, {
          activeNodes: step.nodes,
          tone: step.tone,
          packetLabel: step.label,
          preserveSelection: false,
        });
        frames.push(await rasterizeSvg(svg, size.width, size.height));
      }
      const gif = await encodeGifAsync({
        width: size.width,
        height: size.height,
        frames,
        delayCs: 95,
        maxColors: 256,
      });
      const scenarioSlug = filenameSlug(scenario.name, 'scenario');
      const filename = `${getSafeFilenameSlug()}-${scenarioSlug}.gif`;
      downloadBytes(gif, filename, 'image/gif');
      hudStatusTip.textContent = `Saved the ${scenario.name} scenario.`;
      notify(`Exported ${filename}`);
      return;
    }

    const viewRect = target.kind === 'view' ? viewport.getBoundingClientRect() : null;
    const view =
      viewRect && viewRect.width >= 1 && viewRect.height >= 1
        ? { width: viewRect.width, height: viewRect.height }
        : null;
    const animated = doc.edges.filter((edge) => edge.animated !== false).length;
    const frameCount = gifFrameCount(animated);
    const viewScale = view ? Math.min(2, GIF_MAX_EDGE / Math.max(view.width, view.height, 1)) : 1;
    const size = view
      ? {
          width: Math.max(1, Math.round(view.width * viewScale)),
          height: Math.max(1, Math.round(view.height * viewScale)),
        }
      : gifPixelSize(doc.stageWidth, doc.stageHeight);
    // The studio dash travels 36px in 1.35s. One 18px cycle across the frames is 8 centiseconds.
    const delayCs = 8;
    const frames: Uint8ClampedArray[] = [];
    for (let index = 0; index < frameCount; index += 1) {
      const dash: StagePictureOptions | undefined =
        frameCount === 1 ? undefined : { dashOffset: gifFrameDashOffset(index) };
      const options: StagePictureOptions | undefined = {
        preserveSelection: app.selection.type === 'multi',
        ...(view ? { currentView: true } : {}),
        ...dash,
      };
      const svg = renderStagePictureSvg(size.width, size.height, options);
      frames.push(await rasterizeSvg(svg, size.width, size.height));
    }
    const gif = await encodeGifAsync({
      width: size.width,
      height: size.height,
      frames,
      delayCs,
      maxColors: 256,
    });
    const filename = view ? `${getSafeFilenameSlug()}-view.gif` : `${getSafeFilenameSlug()}.gif`;
    downloadBytes(gif, filename, 'image/gif');
    notify(`Exported ${filename}`);
    if (view) {
      hudStatusTip.textContent = 'Saved the current view.';
      return;
    }
    hudStatusTip.textContent =
      animated > 0
        ? 'Saved a short animation of the wires.'
        : 'Saved a still picture. No wires on this diagram are animated.';
  } catch {
    hudStatusTip.textContent = 'Could not render a GIF of this diagram.';
  }
}

export function getSafeFilenameSlug(): string {
  return filenameSlug(app.doc.title || 'architecture-diagram', 'architecture-diagram');
}

export function getSubgraphMode(): 'swimlanes' | 'levels' | 'frames' {
  const checked = document.querySelector<HTMLInputElement>('input[name="subgraph-mode"]:checked');
  return checked?.value === 'levels' || checked?.value === 'frames' ? checked.value : 'swimlanes';
}

export function refreshCodeModalTextarea(): void {
  // Applying this text replaces the whole diagram, so on a later page it shows the whole file, not just that page (D10).
  codeSyncTextarea.value = serializeToBlueprintMarkdown(app.pageIndex > 0 ? fullDocument() : app.doc);
  codeSyncDiagnostics.textContent =
    'Blueprint file (.md): YAML metadata, positions and a Mermaid block. Paste Mermaid or a Blueprint file to import it.';
  delete codeSyncDiagnostics.dataset.tone;
}

export function openCodeDialog(): void {
  refreshCodeModalTextarea();
  codeDialog.showModal();
}

// ---------------------------------------------------------------------------
// Event Wiring
// ---------------------------------------------------------------------------
let shortcutStyles: Promise<unknown> | null = null;
export async function openShortcutsDialog(): Promise<void> {
  if (!shortcutsDialog) return;
  shortcutStyles ??= import('../styles/shortcuts.css').catch(() => undefined);
  await shortcutStyles;
  if (shortcutsDialogBody) {
    shortcutsDialogBody.innerHTML = renderShortcutsHtml();
  }
  shortcutsDialog.showModal();
}

// Re-export serialization helper
export { serializeForFilename } from './pwa';

/** Copy and paste through the browser's own events, so the clipboard text works across tabs and needs no permission. */
function initClipboardEvents(): void {
  const editing = (target: EventTarget | null) => {
    const el = target as HTMLElement | null;
    return !!el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable);
  };
  document.addEventListener('copy', (e) => {
    if (app.workspaceMode !== 'design' || editing(e.target) || !hasCopyableSelection()) return;
    e.preventDefault();
    copySelection(e.clipboardData);
  });
  document.addEventListener('paste', (e) => {
    if (app.workspaceMode !== 'design' || editing(e.target)) return;
    e.preventDefault();
    void pasteSelection(e.clipboardData?.getData('text/plain') ?? '');
  });
}

export function initEvents(): void {
  initClipboardEvents();
  // Workspace Mode Switcher (Design vs Data View with View Transitions)
  for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="workspace-mode"]')) {
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      const targetMode = radio.value === 'data' || radio.value === 'review' ? 'data' : 'design';

      const applyMode = () => {
        // Review is a second flavour of the read-only mode: the same panes as Traffic with its own panels.
        app.lens = radio.value === 'review' ? 'review' : targetMode === 'data' ? 'traffic' : 'design';
        workspace.dataset.mode = app.workspaceMode;
        workspace.dataset.lens = app.lens;
        designInspectorPane.hidden = app.workspaceMode !== 'design';
        dataInspectorPane.hidden = app.workspaceMode !== 'data';

        hudStatusTip.textContent =
          app.workspaceMode === 'design'
            ? 'Drag stencils onto the grid · Drag from any port dot to draw an animated wire'
            : app.lens === 'review'
              ? 'Review · Insights flag single points of failure, cycles, orphans and latency overruns · Click an issue to jump to it'
              : 'Traffic · Select a component and press X (or right-click) to fail it · Alt-hover previews the blast radius';

        if (app.workspaceMode === 'data' && app.selection.type !== 'node' && app.doc.nodes.length > 0) {
          const live = new Set(app.doc.nodes.map((node) => node.id));
          const kept = app.selection.type === 'multi' ? app.selection.ids.filter((id) => live.has(id)) : [];
          setSelection(
            kept.length > 0
              ? selectionOfStage({ nodes: kept, zones: [], notes: [] })
              : { type: 'node', id: app.doc.nodes[0].id },
          );
        }

        updateVisualSelectionHighlights();
        requestInspectorRefresh();
        // No refit here: switching modes keeps the user's zoom and position (see trackViewportResize).
        announceModeChange(app.lens === 'review' ? 'review' : targetMode);
      };

      if (
        typeof document !== 'undefined' &&
        'startViewTransition' in document &&
        typeof window !== 'undefined' &&
        !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      ) {
        (document as any).startViewTransition(applyMode);
      } else {
        applyMode();
      }
    });
  }

  // Click Topbar Title -> Focus Document Title input in Property Panel
  btnFocusDocTitle.addEventListener('click', () => {
    holdInspectorOpen();
    applySelection({ type: 'none' }, { refreshIfUnchanged: true });
    if (app.workspaceMode === 'design') {
      document.getElementById('prop-doc-title')?.focus();
    }
  });

  // Undo / Redo / Delete / Duplicate
  btnPropDelete.addEventListener('click', deleteSelected);
  btnPropDuplicate.addEventListener('click', duplicateSelected);

  btnPropLock?.addEventListener('click', applyLockToggle);

  // The one Group button groups a multi-selection, and otherwise tries to ungroup what is selected.
  btnPropGroup?.addEventListener('click', () => {
    if (canGroupSelection(app.selection)) applyGroup();
    else applyUngroup();
  });

  // Add Swimlane & Notes Card
  btnAddZone.setAttribute('data-tip', 'Create a swimlane stage banner');
  btnAddZone.setAttribute('data-tip-pos', 'top');
  btnAddZone.addEventListener('click', () => {
    pushHistory();
    const nextX =
      app.doc.zones.length > 0
        ? Math.max(...app.doc.zones.map((z) => z.x + z.width)) + 24
        : 48;
    const zone = createSwimlaneZone(app.doc.zones.length, nextX);
    app.doc.zones.push(zone);
    expandStageToFit(app.doc);
    setSelection({ type: 'zone', id: zone.id });
    renderAll(true);
    if (typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches) {
      responsiveToolbar.togglePalette(true);
    }
  });

  btnAddNotes.setAttribute('data-tip', 'Add a checklist specification card');
  btnAddNotes.setAttribute('data-tip-pos', 'top');
  btnAddNotes.addEventListener('click', () => {
    pushHistory();
    const [cx, cy] = getViewportWorldCenter();
    const notes = createNotesCard(cx - 200, cy + 120);
    app.doc.notesCards.push(notes);
    expandStageToFit(app.doc);
    setSelection({ type: 'notes', id: notes.id });
    renderAll(true);
    if (typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches) {
      responsiveToolbar.togglePalette(true);
    }
  });

  let currentGalleryCategory: TemplateCategory = 'all';

  const renderGalleryGrid = (): void => {
    if (!templateCategoryFilters || !templateGalleryGrid) return;

    templateCategoryFilters.innerHTML = TEMPLATE_CATEGORIES.map(
      (cat) => `
      <button type="button" class="template-filter-btn ${cat.id === currentGalleryCategory ? 'is-active' : ''}" data-cat="${cat.id}">
        ${cat.label}
      </button>
    `,
    ).join('');

    const templates = getStarterTemplates(currentGalleryCategory);
    const blankCard =
      currentGalleryCategory === 'all' || currentGalleryCategory === 'cloud'
        ? renderBlankCanvasCardHtml()
        : '';
    const templateCards = templates.map((t) => renderTemplateCardHtml(t)).join('');

    templateGalleryGrid.innerHTML = `${blankCard}${templateCards}`;
    fillTemplatePreviews(templateGalleryGrid, templates);
  };

  const loadTemplateDoc = async (template: TemplateDefinition): Promise<void> => {
    let raw: string;
    try {
      raw = await loadTemplateRaw(template);
    } catch {
      const msg = `Could not load ${template.title}. Check your connection and try again.`;
      hudStatusTip.textContent = msg;
      notify(msg, { tone: 'error' });
      return;
    }
    resetActiveFile();
    clearPendingRestoreOffer();
    const parsed = parseBlueprintJson(raw);
    if (!parsed.ok) {
      hudStatusTip.textContent = parsed.error;
      notify(parsed.error, { tone: 'error' });
      return;
    }
    const msg = `Loaded ${template.title}`;
    hudStatusTip.textContent = msg;
    await openAsNewDiagram(parsed.doc, msg, {
      pickSelection: (doc) => {
        const focus = doc.nodes.find((node) => node.id === 'night-desk') ?? doc.nodes[0];
        return focus ? { type: 'node', id: focus.id } : { type: 'none' };
      },
    });
  };

  const createBlankCanvas = (): void => {
    resetActiveFile();
    clearPendingRestoreOffer();
    void openAsNewDiagram(createBlankDocument(), 'Created blank canvas');
  };

  const openTemplateGallery = (): void => {
    if (!templateGalleryDialog) return;
    renderGalleryGrid();
    templateGalleryDialog.showModal();
  };

  // Template Gallery Category Filters
  templateCategoryFilters?.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.template-filter-btn');
    if (!btn) return;
    const cat = btn.getAttribute('data-cat') as TemplateCategory;
    if (cat) {
      currentGalleryCategory = cat;
      renderGalleryGrid();
    }
  });

  // Template Gallery Grid Selection (Card clicks & Use Template buttons)
  templateGalleryGrid?.addEventListener('click', (e) => {
    const trigger = (e.target as HTMLElement).closest<HTMLElement>('[data-template-id]');
    if (!trigger) return;
    const templateId = trigger.getAttribute('data-template-id');
    if (!templateId) return;

    if (templateId === 'blank') {
      createBlankCanvas();
      if (templateGalleryDialog) void closeDialogSmoothly(templateGalleryDialog);
    } else {
      const template = getStarterTemplateById(templateId);
      if (template) {
        void loadTemplateDoc(template);
        if (templateGalleryDialog) void closeDialogSmoothly(templateGalleryDialog);
      }
    }
  });

  // Restore Previous Autosaved Session (Banner & Empty Stage Button)
  const openRestoredSession = () => {
    const saved = getPendingRestoreOffer() || loadSavedSessionDoc();
    if (!saved) return;
    pushHistory();
    resetActiveFile();
    clearPendingRestoreOffer();
    app.doc = saved;
    expandStageToFit(app.doc);
    setSelection(app.doc.nodes.length > 0 ? { type: 'node', id: app.doc.nodes[0].id } : { type: 'none' });
    renderAll(true);
    fitToViewport();
    const msg = `Restored previous session (${app.doc.nodes.length} components, ${app.doc.edges.length} wires)`;
    hudStatusTip.textContent = msg;
    notify(msg, { action: { label: 'Undo', onClick: () => performUndo() } });
  };
  btnRestoreOpen?.addEventListener('click', openRestoredSession);

  btnRestoreDiscard?.addEventListener('click', () => {
    const removed = discardPendingRestoreOffer();
    if (restoreSessionBanner) restoreSessionBanner.hidden = true;
    notify('Discarded previous session', {
      duration: 10_000,
      action: removed
        ? {
            label: 'Undo',
            onClick: () => {
              restoreDiagram(removed).catch((err) => reportStorageFailure(err, 'restored session'));
              notify('Brought back the previous session');
            },
          }
        : undefined,
    });
  });

  initLibrary({ clearSimulation, downloadBytes });
  initHome({
    useTemplate: (id) => {
      if (id === 'blank') return createBlankCanvas();
      const template = getStarterTemplateById(id);
      if (template) void loadTemplateDoc(template);
    },
    openFile: () => void handleOpenFile(),
    pasteMermaid: openCodeDialog,
    importFile: () => triggerFilePicker(),
  });

  // Other writes (snapshots, discarding a session) report here. Autosave has its own handler above.
  setStorageFailureHandler(({ quota, what }) => {
    notify(quota ? `Browser storage is full, so the ${what} was not saved` : `The ${what} could not be saved`, {
      tone: 'error',
    });
  });

  // Start the write as the tab is hidden or closed: IndexedDB finishes a write that has begun.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && app.hasPendingAutosave) flushAutosave();
  });

  // Flush pending autosave on page unload, and prompt on unsaved disk changes
  window.addEventListener('beforeunload', (e) => {
    if (app.hasPendingAutosave) {
      flushAutosave();
    }
    const hasUnsavedDiskChanges = isFileDiskDirty() && Boolean(getActiveFileHandle());
    const isAutosaveFailing = getSaveState() === 'error';
    if (hasUnsavedDiskChanges || isAutosaveFailing) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  // New Blueprint opens the template gallery
  const newBlueprint = (): void => {
    resetActiveFile();
    openTemplateGallery();
  };

  // Native File System & PWA actions

  async function handleSaveDiagram(forceSaveAs = false): Promise<void> {
    const activeName = getActiveFileName();
    // D8: an opened .mmd is never written; saving offers a Blueprint file beside it.
    const fromMermaid = isMermaidFileName(activeName);
    const defaultName =
      (activeName && (fromMermaid ? blueprintNameFor(activeName) : activeName)) ||
      `${getSafeFilenameSlug()}.blueprint.json`;
    const serializer = (name: string) => serializeForFilename(fullDocument(), name).content;

    const res = await saveWithNativeFileSystem(serializer, defaultName, forceSaveAs);
    if (res.success) {
      setDiskDirty(false);
      setSaveState('saved');
      notify(
        fromMermaid
          ? `Saved ${res.filename}. ConduitCraft reads Mermaid but doesn't write it, so ${activeName} is unchanged.`
          : `Saved ${res.filename}`,
      );
    } else if (res.refusedMermaid) {
      notify(`ConduitCraft doesn't write Mermaid files. Save as .md or .json instead.`, { tone: 'error' });
    } else if (!isFileSystemAccessSupported()) {
      const { content, mime } = serializeForFilename(fullDocument(), defaultName);
      downloadBlob(content, defaultName, mime);
      setDiskDirty(false);
      setSaveState('saved');
      notify(`Downloaded ${defaultName}`);
    }
  }

  // Save State Pill Click -> Quick Save
  saveStatusPill?.addEventListener('click', () => {
    void handleSaveDiagram(false);
  });

  // Register honest storage quota error notification
  setSaveErrorHandler((quota) => {
    notify(quota ? 'Browser storage is full, so autosave failed' : 'Autosave failed, so your latest changes are not saved', {
      tone: 'error',
      action: {
        label: 'Save to file',
        onClick: () => {
          void handleSaveDiagram(true);
        },
      },
    });
  });

  async function handleOpenFile(): Promise<void> {
    if (isFileSystemAccessSupported()) {
      try {
        const fileData = await openWithNativeFilePicker();
        if (fileData) {
          const baseName = fileData.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
          const titleFromFile = baseName
            ? baseName.replace(/\b\w/g, (ch) => ch.toUpperCase())
            : undefined;
          await importFileText(fileData.name, fileData.content, titleFromFile);
          return;
        }
      } catch (err) {
        console.warn('Native open error, fallback to upload input:', err);
      }
    }
    fileUploadInput.click();
  }

  let canInstallApp = false;
  const installApp = async (): Promise<void> => {
    if (!canInstallApp) {
      notify('Installing is not available in this browser right now');
      return;
    }
    const accepted = await promptInstallApp();
    if (accepted) {
      notify('ConduitCraft installed!');
    }
  };

  // PWA Service Worker & Install prompt setup
  void registerServiceWorker();
  initInstallPrompt((canInstall) => {
    canInstallApp = canInstall;
  });

  // Pause / Resume Stream Pulse Motion
  const toggleMotion = (): void => {
    document.body.classList.toggle('motion-paused');
  };

  // File Import Triggers
  const triggerFilePicker = () => fileUploadInput.click();
  btnPaletteImport.addEventListener('click', triggerFilePicker);

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

  // Blueprint file dialog (shows the Blueprint file; Apply imports Mermaid or Blueprint)
  btnPaletteCode.addEventListener('click', openCodeDialog);

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
    const ok = applyImportedText(codeSyncTextarea.value, undefined, { subgraphs: getSubgraphMode() });
    if (ok) void closeDialogSmoothly(codeDialog);
  });

  // Shareable Link in Export Modal
  const updateShareLinkPreview = async (): Promise<void> => {
    if (!shareLinkInput || !shareLinkSize) return;
    if (btnCopyShareLink) btnCopyShareLink.disabled = true;
    if (app.doc.nodes.length === 0) {
      shareLinkInput.value = 'Add components to canvas to generate link';
      shareLinkSize.textContent = '';
      shareLinkSize.classList.remove('is-warning');
      return;
    }

    shareLinkInput.value = 'Generating shareable link…';
    let timeoutId: any;
    try {
      const omitImages = Boolean(chkShareOmitImages?.checked);
      const shareDoc = fullDocument();
      const hasImages = docHasImages(shareDoc);
      const sharePromise = createShareUrl(shareDoc, { omitImages: hasImages && omitImages });
      // The other size, so the dialog can show the link with and without images.
      const otherPromise = hasImages ? createShareUrl(shareDoc, { omitImages: !omitImages }) : sharePromise;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Timed out generating share link (5s)')), 5000);
      });
      const [result, other] = await Promise.race([Promise.all([sharePromise, otherPromise]), timeoutPromise]);
      clearTimeout(timeoutId);
      shareLinkInput.value = result.url;
      const origin = typeof window !== 'undefined' && window.location ? window.location.origin : '';
      if (btnCopyShareLink) {
        btnCopyShareLink.disabled = !origin || !result.url.startsWith(origin);
      }
      const notice = describeShareSize({
        withImages: (omitImages ? other : result).url.length,
        withoutImages: (omitImages ? result : other).url.length,
        hasImages,
        omitting: omitImages,
      });
      shareLinkSize.textContent = notice.size;
      shareLinkSize.classList.toggle('is-warning', notice.preferFile);
      if (shareLinkOptions) shareLinkOptions.hidden = !hasImages;
      if (shareImageSizes) shareImageSizes.textContent = notice.images;
      // Too long: the file is the main action and the link is still there as a smaller one.
      btnShareDownloadFile?.classList.toggle('solid', notice.preferFile);
      btnCopyShareLink?.classList.toggle('solid', !notice.preferFile);
    } catch {
      clearTimeout(timeoutId);
      shareLinkInput.value = 'Error generating link';
      shareLinkSize.textContent = '';
      if (btnCopyShareLink) btnCopyShareLink.disabled = true;
    }
  };

  const copyBtn = btnCopyShareLink;
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      const origin = typeof window !== 'undefined' && window.location ? window.location.origin : '';
      if (!shareLinkInput?.value || !origin || !shareLinkInput.value.startsWith(origin)) return;
      try {
        await navigator.clipboard.writeText(shareLinkInput.value);
        const span = copyBtn.querySelector('span');
        if (span) {
          const orig = span.textContent;
          span.textContent = 'Copied!';
          setTimeout(() => {
            if (span) span.textContent = orig;
          }, 2000);
        }
        notify('Copied shareable diagram link to clipboard');
      } catch {
        shareLinkInput.select();
        document.execCommand('copy');
        notify('Copied shareable diagram link');
      }
    });
  }

  chkShareOmitImages?.addEventListener('change', () => {
    void updateShareLinkPreview();
  });

  // Export Modal & Actions
  const getSelectedPngScale = (): number => {
    const raw = exportPngScale?.value;
    const num = Number(raw);
    return num === 1 || num === 2 || num === 4 ? num : 2;
  };

  const updatePngExportEstimate = (): void => {
    const scale = getSelectedPngScale();
    const estimate = estimatePngExport(app.doc.stageWidth, app.doc.stageHeight, scale);
    if (exportPngEstimate) {
      exportPngEstimate.textContent = estimate.summary;
    }
    if (exportPngButtonEstimate) {
      exportPngButtonEstimate.textContent = estimate.formattedSize;
    }
    if (exportPngScale) {
      const opt1 = exportPngScale.querySelector('option[value="1"]');
      const opt2 = exportPngScale.querySelector('option[value="2"]');
      const opt4 = exportPngScale.querySelector('option[value="4"]');
      const est1 = estimatePngExport(app.doc.stageWidth, app.doc.stageHeight, 1);
      const est2 = estimatePngExport(app.doc.stageWidth, app.doc.stageHeight, 2);
      const est4 = estimatePngExport(app.doc.stageWidth, app.doc.stageHeight, 4);
      if (opt1) opt1.textContent = `1× (${est1.width} × ${est1.height} px — ${est1.formattedSize})`;
      if (opt2) opt2.textContent = `2× (${est2.width} × ${est2.height} px — ${est2.formattedSize})`;
      if (opt4) opt4.textContent = `4× (${est4.width} × ${est4.height} px — ${est4.formattedSize})`;
    }
  };

  exportPngScale?.addEventListener('change', updatePngExportEstimate);
  exportPngScale?.addEventListener('input', updatePngExportEstimate);
  updatePngExportEstimate();

  const openExportDialog = (): void => {
    expandStageToFit(app.doc);
    renderAll(false);
    resetGifChoices();
    updatePngExportEstimate();
    if (exportAltText) exportAltText.value = describeDiagramBrief(app.doc);
    void updateShareLinkPreview();
    const allPages = document.getElementById('btn-export-svg-pages');
    if (allPages) allPages.hidden = pageCount(app.pageRoot ?? app.levelRoot ?? app.doc) < 2;
    exportDialog.showModal();
  };
  btnCopyAltText?.addEventListener('click', () => {
    void navigator.clipboard.writeText(exportAltText?.value ?? '').then(
      () => notify('Copied alt text'),
      () => notify('Could not copy. Select the text and copy it by hand.', { tone: 'error' }),
    );
  });
  btnExportHtml.addEventListener('click', async () => {
    expandStageToFit(app.doc);
    renderAll(false);
    const { generateStandaloneHtmlWithLevels } = await import('../exporter/standaloneHtml');
    // The whole tree, so the page keeps the drill-down. At the root this is `app.doc` itself.
    const html = generateStandaloneHtmlWithLevels(fullDocument(), {
      initialSelection: app.selection.type === 'multi' ? app.selection : undefined,
    });
    const filename = `${getSafeFilenameSlug()}.html`;
    downloadBlob(html, filename, 'text/html;charset=utf-8');
    void closeDialogSmoothly(exportDialog);
    notify(`Exported ${filename}`);
  });
  btnExportSvg.addEventListener('click', () => {
    expandStageToFit(app.doc);
    renderAll(false);
    const filename = `${getSafeFilenameSlug()}.svg`;
    downloadBlob(
      renderDiagramSvg(
        app.doc,
        undefined,
        app.selection.type === 'multi' ? app.selection : undefined,
        currentScheme(),
      ),
      filename,
      'image/svg+xml;charset=utf-8',
    );
    void closeDialogSmoothly(exportDialog);
    notify(`Exported ${filename}`);
  });
  document.getElementById('btn-export-svg-pages')?.addEventListener('click', () => {
    void import('./exportAllPages').then((m) => {
      const filename = m.downloadPagesZip(getSafeFilenameSlug());
      void closeDialogSmoothly(exportDialog);
      notify(`Exported ${filename}`);
    });
  });
  btnExportSvgClone?.addEventListener('click', () => {
    expandStageToFit(app.doc);
    renderAll(false);
    const filename = `${getSafeFilenameSlug()}-dom.svg`;
    downloadBlob(
      renderStagePictureSvg(undefined, undefined, { preserveSelection: app.selection.type === 'multi' }),
      filename,
      'image/svg+xml;charset=utf-8',
    );
    void closeDialogSmoothly(exportDialog);
    notify(`Exported ${filename}`);
  });
  btnExportPng.addEventListener('click', () => {
    expandStageToFit(app.doc);
    renderAll(false);
    const scale = getSelectedPngScale();
    const width = Math.max(1, Math.round(app.doc.stageWidth * scale));
    const height = Math.max(1, Math.round(app.doc.stageHeight * scale));
    hudStatusTip.textContent = 'Rendering the canvas…';
    const filename = `${getSafeFilenameSlug()}.png`;
    downloadDiagramPng(
      renderStagePictureSvg(width, height, { preserveSelection: app.selection.type === 'multi' }),
      width,
      height,
      filename,
    );
    void closeDialogSmoothly(exportDialog);
  });
  btnExportGif.addEventListener('click', () => {
    showGifChoices();
  });
  btnGifBack.addEventListener('click', () => {
    resetGifChoices();
    btnExportGif.focus();
  });
  btnGifWhole.addEventListener('click', () => {
    void downloadDiagramGif({ kind: 'whole' });
    void closeDialogSmoothly(exportDialog);
  });
  btnGifView.addEventListener('click', () => {
    void downloadDiagramGif({ kind: 'view' });
    void closeDialogSmoothly(exportDialog);
  });
  const downloadBlueprintFile = (): void => {
    const filename = `${getSafeFilenameSlug()}.blueprint.json`;
    downloadBlob(
      serializeBlueprintJson(fullDocument()),
      filename,
      'application/json;charset=utf-8',
    );
    void closeDialogSmoothly(exportDialog);
    notify(`Exported ${filename}`);
  };
  btnExportJson.addEventListener('click', downloadBlueprintFile);
  btnShareDownloadFile?.addEventListener('click', downloadBlueprintFile);

  // Version Snapshots & Diff Controller: loads on first use.
  const openSnapshotsDialog = (): Promise<void> => import('./snapshotsDialog').then((m) => m.openSnapshotsDialog());

  // Matrix & Settings Dialogs

  firstRunDeps = {
    createBlank: createBlankCanvas,
    openTemplateGallery,
    openCodeDialog,
    runScenario: (id) => runSimulation(id),
    fitToViewport,
  };

  // Command Palette
  initCommandPalette({
    openCodeDialog,
    openExportDialog,
    openSettingsDialog: () => settingsDialog.showModal(),
    openShortcutsDialog,
    openTemplateGallery,
    loadTemplateById: (id) => {
      const template = getStarterTemplateById(id);
      if (template) void loadTemplateDoc(template);
    },
    deleteSelected,
    duplicateSelected,
    loadShowcase: () => {
      const showcase = getStarterTemplateById('flash-sale-ticketing');
      if (showcase) void loadTemplateDoc(showcase);
    },
    loadLumenRelay: () => {
      const lumen = getStarterTemplateById('lumen-relay');
      if (lumen) void loadTemplateDoc(lumen);
    },
    runSimulationById: (id) => runSimulation(id),
    saveFile: () => void handleSaveDiagram(false),
    saveFileAs: () => void handleSaveDiagram(true),
    openFile: () => void handleOpenFile(),
    openSnapshotsDialog,
    openLibrary: () => void openLibraryDialog(),
    openHome: () => void openHome(),
    newDiagram: () => void newDiagram(),
    duplicateDiagram: () => void duplicateActiveDiagram(),
    deleteDiagram: deleteActiveDiagram,
    exportAllDiagrams,
    newBlueprint,
    importFile: triggerFilePicker,
    toggleMotion,
    installApp: () => void installApp(),
  });

  // Find a component (Cmd/Ctrl+F), a popover over the SE slot
  if (hudSearchInput && hudSearchCount && btnClearSearch) {
    initNodeSearch({
      popover: document.getElementById('hud-search-card') ?? undefined,
      searchInput: hudSearchInput,
      searchCount: hudSearchCount,
      clearButton: btnClearSearch,
      getDoc: () => app.doc,
      getOtherLevels: () => {
        const here = app.levelPath.join('/');
        return allLevelNodes(openPageDocument()).filter((e) => e.path.join('/') !== here);
      },
      onFocusNode: (node, frame = false, path) => {
        if (path) goToLevel(path);
        setSelection({ type: 'node', id: node.id });
        renderAll(false);
        if (frame) {
          fitSelection();
        } else {
          panToNodeIfNeeded(node);
        }
      },
      onClearSearch: () => {
        renderAll(false);
      },
    });
  }

  // Simulation Playback Deck & Trace Scrubbing
  initSimulationPlaybackUi();
  initRunBar({ run: runSimulation });
  initChaosPanel();
  initQueueBacklog();
  initInsightsPanel();
  initHelp();
  initChaosPreview(chaosNodesLayer);

  // Smooth Dialog Close & Reset `returnValue` (`dialog` guide)
  const allDialogs = [codeDialog, exportDialog, matrixDialog, settingsDialog];
  if (shortcutsDialog) allDialogs.push(shortcutsDialog);
  if (templateGalleryDialog) allDialogs.push(templateGalleryDialog);
  if (homeDialog) allDialogs.push(homeDialog);
  if (snapshotsDialog) allDialogs.push(snapshotsDialog);
  const cmdPaletteDialog = document.getElementById('command-palette-dialog') as HTMLDialogElement | null;
  if (cmdPaletteDialog) allDialogs.push(cmdPaletteDialog);
  for (const dlg of allDialogs) {
    dlg.addEventListener('close', () => {
      dlg.returnValue = '';
      if (dlg === exportDialog) resetGifChoices();
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

  // Color scheme radios share the boot script used by exported pages.
  const bindColorScheme = (
    window as Window & {
      conduitBindColorScheme?: (meta: HTMLMetaElement | null) => void;
    }
  ).conduitBindColorScheme;
  bindColorScheme?.(document.querySelector('meta[name="color-scheme"]'));

  chkSnapGrid.addEventListener('change', () => {
    app.snapToGrid = chkSnapGrid.checked;
  });

  // Data View Tabs & Overview Reset
  tabInspector.addEventListener('click', () => switchDataViewTab('inspector'));
  tabTrace.addEventListener('click', () => switchDataViewTab('trace'));
  tabSimulations.addEventListener('click', () => {
    switchDataViewTab('simulations');
    renderSimulationEditor();
  });
  btnAddSimulation.addEventListener('click', () => addSimulationScenario());
  btnResetSelection.addEventListener('click', () => {
    applySelection({ type: 'none' }, { refreshIfUnchanged: true });
  });
  btnClearTrace.addEventListener('click', () => {
    clearSimulation();
    traceList.replaceChildren();
  });

  // Canvas Background Pan, Shift-Marquee Multi-Select & Deselect
  let panDragStart: { x: number; y: number } | null = null;
  let marqueeStartWorld: [number, number] | null = null;
  let panPointerId: number | null = null;
  let panMoved = false;

  // Hold Space to pan from anywhere, even starting on a component. Space is never swallowed, so it still
  // activates a focused button; this only records that it is held.
  let spaceHeld = false;
  let panWithSpace = false;
  const setSpaceHeld = (held: boolean) => {
    spaceHeld = held;
    viewport.classList.toggle('is-space-pan', held);
  };
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' || e.repeat) return;
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement | null)?.isContentEditable) {
      return;
    }
    setSpaceHeld(true);
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') setSpaceHeld(false);
  });
  window.addEventListener('blur', () => setSpaceHeld(false));
  viewport.addEventListener(
    'pointerdown',
    (e) => {
      if ((!spaceHeld && app.pointerTool !== 'hand') || e.button !== 0) return;
      // Capture phase, ahead of the component under the pointer, so Space-drag (or the Hand tool) never moves or selects it.
      e.stopImmediatePropagation();
      e.preventDefault();
      panWithSpace = true;
      panDragStart = { x: e.clientX - app.panX, y: e.clientY - app.panY };
      panPointerId = e.pointerId;
      panMoved = false;
      viewport.classList.add('is-dragging');
      viewport.setPointerCapture(e.pointerId);
    },
    true,
  );

  viewport.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    if (
      (e.target as Element).closest(
        '.arch-node, .zone-banner, .blueprint-spec, .conduit-hit, .conduit-badge-hit, .conduit-waypoint-handle, button',
      )
    ) {
      return;
    }

    if (app.pointerTool === 'text' && app.workspaceMode === 'design') {
      // The Text tool: a click on bare canvas puts a text label there and opens it for typing.
      e.preventDefault();
      const [wx, wy] = screenToWorld(e.clientX, e.clientY);
      pushHistory();
      const label = createTextCard(wx, wy);
      app.doc.notesCards.push(label);
      expandStageToFit(app.doc);
      setSelection({ type: 'notes', id: label.id });
      setPointerTool('select');
      renderAll(true);
      window.setTimeout(() => renameNotesInline(label.id), 0);
      return;
    }

    if (e.shiftKey && app.workspaceMode === 'design') {
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

    panDragStart = { x: e.clientX - app.panX, y: e.clientY - app.panY };
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
    if (Math.hypot(nextPanX - app.panX, nextPanY - app.panY) > 3) {
      panMoved = true;
    }
    app.panX = nextPanX;
    app.panY = nextPanY;
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

      const hitIds = app.doc.nodes
        .filter((n) => n.x + n.width >= x1 && n.x <= x2 && n.y + n.height >= y1 && n.y <= y2)
        .map((n) => n.id);
      applySelection(
        hitIds.length > 1
          ? { type: 'multi', ids: hitIds }
          : hitIds.length === 1
            ? { type: 'node', id: hitIds[0] }
            : { type: 'none' },
      );
      return;
    }

    if (!panDragStart) return;
    const didMove = panMoved;
    panDragStart = null;
    panPointerId = null;
    panMoved = false;
    viewport.classList.remove('is-dragging');
    const wasSpacePan = panWithSpace;
    panWithSpace = false;
    if (e.type === 'pointerup' && !didMove && !wasSpacePan && app.selection.type !== 'none') {
      app.connectSourceNodeId = null;
      applySelection({ type: 'none' });
    }
  };
  viewport.addEventListener('pointerup', endPan);
  viewport.addEventListener('pointercancel', endPan);
  viewport.addEventListener('lostpointercapture', (e) => {
    if (app.multiPointer) return;
    if (panPointerId !== null && e.pointerId !== panPointerId) return;
    panDragStart = null;
    marqueeStartWorld = null;
    panPointerId = null;
    panMoved = false;
    panWithSpace = false;
    if (marqueeBox) marqueeBox.hidden = true;
    viewport.classList.remove('is-dragging');
  });

  // Touch and pen: pinch to zoom, or slide two pointers together to pan.
  const contacts = new Map<number, PinchSample>();
  let pinch: ReturnType<typeof pinchBaseline> | null = null;

  const viewportLocal = (e: PointerEvent): PinchSample => {
    const rect = viewport.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const isLooseControl = (target: EventTarget | null): boolean => {
    if (!(target instanceof Element)) return false;
    if (target.closest('.arch-node, .zone-banner, .blueprint-spec, .conduit-hit, .conduit-waypoint-handle')) {
      return false;
    }
    return !!target.closest('button, a, input, textarea, select, label');
  };

  const engagePinch = () => {
    const pts = [...contacts.values()];
    if (pts.length < 2) return;
    pinch = pinchBaseline(app.scale, app.panX, app.panY, pts[0], pts[1]);
    app.multiPointer = true;
    app.blockPointerClick = true;
    panDragStart = null;
    marqueeStartWorld = null;
    panPointerId = null;
    panMoved = false;
    if (marqueeBox) marqueeBox.hidden = true;
    viewport.classList.add('is-dragging');
    for (const id of contacts.keys()) {
      try {
        viewport.setPointerCapture(id);
      } catch {
        /* The pointer is no longer active. */
      }
    }
  };

  const applyPinch = () => {
    if (!pinch) return;
    const pts = [...contacts.values()];
    if (pts.length < 2) return;
    const next = pinchTransform(pinch, pts[0], pts[1], 0.35, 1.9);
    app.scale = next.scale;
    app.panX = next.panX;
    app.panY = next.panY;
    applyTransform();
  };

  const releaseContact = (e: PointerEvent) => {
    if (!contacts.has(e.pointerId)) return;
    contacts.delete(e.pointerId);
    if (contacts.size >= 2) {
      engagePinch();
      return;
    }
    pinch = null;
    if (app.multiPointer && contacts.size < 2) app.multiPointer = false;
    if (contacts.size === 0) {
      viewport.classList.remove('is-dragging');
      window.setTimeout(() => {
        app.blockPointerClick = false;
      }, 0);
    }
  };

  viewport.addEventListener(
    'pointerdown',
    (e) => {
      if (e.button !== 0) return;
      if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
      if (isLooseControl(e.target)) return;
      contacts.set(e.pointerId, viewportLocal(e));
      if (contacts.size >= 2) {
        engagePinch();
        e.preventDefault();
        e.stopPropagation();
      }
    },
    true,
  );
  viewport.addEventListener(
    'pointermove',
    (e) => {
      if (!contacts.has(e.pointerId)) return;
      contacts.set(e.pointerId, viewportLocal(e));
      if (!pinch) return;
      applyPinch();
      e.stopPropagation();
    },
    true,
  );
  viewport.addEventListener('pointerup', releaseContact, true);
  viewport.addEventListener('pointercancel', releaseContact, true);

  // Wheel Zoom & HUD Zoom Controls
  viewport.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const input = { deltaX: e.deltaX, deltaY: e.deltaY, deltaMode: e.deltaMode, ctrlKey: e.ctrlKey };
      if (isPanGesture(input)) {
        const { dx, dy } = wheelPan(input);
        app.panX += dx;
        app.panY += dy;
        applyTransform();
        return;
      }
      const rect = viewport.getBoundingClientRect();
      zoomAround(app.scale * wheelZoomFactor(input), e.clientX - rect.left, e.clientY - rect.top);
    },
    { passive: false },
  );

  btnZoomIn.addEventListener('click', () => {
    const rect = viewport.getBoundingClientRect();
    zoomAround(app.scale * 1.16, rect.width / 2, rect.height / 2);
  });
  btnZoomOut.addEventListener('click', () => {
    const rect = viewport.getBoundingClientRect();
    zoomAround(app.scale / 1.16, rect.width / 2, rect.height / 2);
  });
  btnZoomFit.addEventListener('click', fitToViewport);
  btnZoomFitSelection.addEventListener('click', fitSelection);
  trackViewportResize();

  // Global Keyboard Shortcuts (Undo, Redo, Duplicate, Delete, Escape)
  window.addEventListener('keydown', (e) => {
    const activeTag = (document.activeElement as HTMLElement | null)?.tagName;
    const inEditable =
      activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT';

    if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey && !inEditable) {
      e.preventDefault();
      openShortcutsDialog();
      return;
    }

    // A selected frame moves with Alt+Arrow, like a component does; the frame code loads when it is first needed.
    if (app.selection.type === 'frame' && e.altKey && !e.metaKey && !e.ctrlKey && !inEditable && e.key.startsWith('Arrow')) {
      const id = app.selection.id;
      const step = e.shiftKey ? 4 : 16;
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
      e.preventDefault();
      void import('./frameStage').then((m) => m.nudgeFrame(id, dx, dy));
      return;
    }

    if (e.key.toLowerCase() === 'p' && !e.metaKey && !e.ctrlKey && !e.altKey && !inEditable) {
      e.preventDefault();
      void togglePresentation(app.doc);
      return;
    }

    // Save diagram to disk (Cmd/Ctrl+S or Cmd/Ctrl+Shift+S)
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      void handleSaveDiagram(e.shiftKey);
      return;
    }

    // Registry shortcuts: the chord maps to an action id and the action runs exactly as from the palette or menu.
    if (!inEditable) {
      const actionId = matchBinding(e, {
        mode: app.workspaceMode,
        hasSelection: app.selection.type !== 'none',
      });
      const action = actionId ? findPaletteCommand(actionId) : undefined;
      if (action) {
        e.preventDefault();
        action.run();
        return;
      }
    }

    if ((e.metaKey || e.ctrlKey) && !inEditable) {
      if (e.key.toLowerCase() === 'o') {
        e.preventDefault();
        void openHome();
        return;
      }
      // Copy and paste go through the browser's own `copy` and `paste` events (see initClipboardEvents).
    }

    if (!inEditable) {
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault();
        responsiveToolbar.togglePalette();
        return;
      }
    }

    if (!inEditable && app.workspaceMode === 'design') {
      if (e.key === ']' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        if (app.selection.type !== 'none') {
          applyZOrder('front');
        } else {
          responsiveToolbar.toggleInspector();
        }
        return;
      }
      if (e.key === '[' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        if (app.selection.type !== 'none') {
          applyZOrder('back');
        } else {
          responsiveToolbar.togglePalette();
        }
        return;
      }
      if (e.key === 'Escape') {
        // Each press backs out one level: the wire being drawn, then a pending click-to-connect source,
        // then Connect mode itself, and only then the selection.
        if (app.activeWireDraft) {
          app.activeWireDraft.cancel?.();
        } else if (app.connectSourceNodeId) {
          app.connectSourceNodeId = null;
          hudStatusTip.textContent = 'Connection cancelled';
        } else if (app.pointerTool === 'connect') {
          setPointerTool('select');
        } else if (app.selection.type !== 'none') {
          applySelection({ type: 'none' });
        } else if (app.levelPath.length > 0) {
          goUpLevel();
        }
      }
    }
  });
}

let firstRunDeps: FirstRunDeps | null = null;

export function bootStudio(): void {
  localizeStaticShortcuts();
  initTooltips();
  initStencilPalette();
  responsiveToolbar.init(undefined, {
    onAddZone: () => {
      btnAddZone.click();
    },
    onAddNotes: () => {
      btnAddNotes.click();
    },
  });
  initEvents();

  // Saved work is read from storage first; the offer to restore it and first run both wait for that.
  void initStorage().then((status) => {
    if (status.notice) notify(status.notice, { tone: 'error', duration: 12000 });
    const saved = loadSavedSessionDoc();
    if (
      saved &&
      app.doc.nodes.length === 0 &&
      app.doc.zones.length === 0 &&
      app.doc.notesCards.length === 0
    ) {
      setPendingRestoreOffer(saved);
      renderAll(true);
    }
    if (firstRunDeps) startFirstRunIfNew(firstRunDeps);
    openHomeAtBootIfReturning();
  });

  renderAll(true);
  requestAnimationFrame(fitToViewport);

  // Check for shared diagram in URL hash on boot
  if (typeof window !== 'undefined' && window.location?.hash) {
    void (async () => {
      const sharedDoc = await decodeSharedDiagramFromHash(window.location.hash);
      if (sharedDoc) {
        resetActiveFile();
        clearPendingRestoreOffer();
        if (app.doc.nodes.length === 0 && app.doc.zones.length === 0 && app.doc.notesCards.length === 0) {
          app.doc = sharedDoc;
          setSelection(app.doc.nodes.length > 0 ? { type: 'node', id: app.doc.nodes[0].id } : { type: 'none' });
          renderAll(true);
          requestAnimationFrame(fitToViewport);
          notify(`Loaded shared architecture: "${sharedDoc.title}"`, {
            action: {
              label: 'Undo',
              onClick: () => {
                app.doc = createBlankDocument();
                setSelection({ type: 'none' });
                renderAll(true);
                fitToViewport();
              },
            },
          });
        } else {
          notify(`Shared architecture in URL: "${sharedDoc.title}"`, {
            action: {
              label: 'Open',
              onClick: () => {
                // A new library entry, so the diagram that was open is kept and Undo returns to it.
                void openAsNewDiagram(sharedDoc, `Opened shared architecture "${sharedDoc.title}"`, {
                  pickSelection: firstNodeSelection,
                });
              },
            },
          });
        }
      }
    })();
  }
}
