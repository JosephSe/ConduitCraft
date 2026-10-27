/** Pointer, keyboard, palette, wiring, import/export, and simulation controls. */
import {
  btnAddNotes,
  btnAddSimulation,
  btnAddZone,
  btnApplyCode,
  btnAutoLayout,
  btnClearTrace,
  btnCopyCode,
  btnEmptyCode,
  btnEmptyImport,
  btnEmptyShowcase,
  btnEmptyTemplates,
  emptyStageShelfSlot,
  templateGalleryDialog,
  templateCategoryFilters,
  templateGalleryGrid,
  btnExportHtml,
  btnExportJson,
  btnExportMmd,
  btnExportGif,
  btnExportPng,
  btnExportSvg,
  btnFocusDocTitle,
  btnGifBack,
  btnGifView,
  btnGifWhole,
  btnImportFile,
  btnNewCanvas,
  btnOpenCode,
  btnOpenExport,
  btnOpenMatrix,
  btnOpenSettings,
  btnOpenShortcuts,
  btnPaletteCode,
  btnPaletteImport,
  btnPropDelete,
  btnPropDuplicate,
  btnQuickStarter,
  btnRedo,
  btnResetSelection,
  btnRestoreSession,
  btnToggleMotion,
  btnUndo,
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
  dataToolbar,
  designInspectorPane,
  designToolbar,
  draftWire,
  exportCards,
  exportDialog,
  exportDialogTitle,
  fileUploadInput,
  gifExportPanel,
  gifScenarioEmpty,
  gifScenarioList,
  hudCoachCard,
  btnDismissHudCoach,
  hudStatusTip,
  marqueeBox,
  matrixDialog,
  nodesLayer,
  panelInspector,
  panelSimulations,
  panelTrace,
  settingsDialog,
  shortcutsDialog,
  shortcutsDialogBody,
  simButtonsSlot,
  simPacket,
  simPacketDot,
  simPacketLabel,
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
  fitSelection,
  fitToViewport,
  flushAutosave,
  getSelectedNodeIds,
  getViewportWorldCenter,
  loadSavedSessionDoc,
  performRedo,
  performUndo,
  pushHistory,
  screenToWorld,
  setSelection,
  zoomAround,
} from './state';
import {
  applySelection,
  renderAll,
  renderMatrixTable,
  requestInspectorRefresh,
  updateVisualSelectionHighlights,
} from './render';
import {
  addSimulationScenario,
  renderSimulationEditor,
  withInspectorTransition,
} from './inspector';
import type {
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
  createNotesCard,
  createSwimlaneZone,
  nextUid,
} from '../templates/presets';
import {
  autoLayoutDocument,
  expandStageToFit,
  getEffectiveSimulations,
  getNodeCenter,
  getNodeDimensions,
  getPortPoint,
} from '../core/layout';
import {
  importMermaidOrBlueprint,
  serializeToBlueprintMarkdown,
  serializeToMermaid,
} from '../core/parser';
import { GIF_MAX_EDGE, encodeGif, gifFrameCount, gifFrameDashOffset, gifPixelSize } from '../exporter/gif';
import { generateStandaloneHtml } from '../exporter/standaloneHtml';
import { parseBlueprintJson, serializeBlueprintJson } from '../exporter/blueprintJson';
import { pinchBaseline, pinchTransform, type PinchSample } from './pinch';
import { selectionOfStage } from './selection';
import { renderStagePictureSvg, type StagePictureOptions } from './stagePicture';
import { TONE_CSS } from '../shared/tones';
import { createHumanOutlineSvg,
  createNodeIconSvg } from '../ui/icons';
import { notify } from './toast';
import { renderShortcutsHtml } from './commands';
import { initCommandPalette } from './palette';
import {
  TEMPLATE_CATEGORIES,
  getStarterTemplates,
  getStarterTemplateById,
  renderTemplateCardHtml,
  renderBlankCanvasCardHtml,
  renderEmptyStageShelfHtml,
  type TemplateCategory,
  type TemplateDefinition,
} from './templatesGallery';

export function initStencilPalette(): void {
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

    btn.setAttribute('data-tip', `${stencil.paletteTitle} — ${stencil.paletteSub}`);
    btn.setAttribute('data-tip-pos', 'right');

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
        const cascade = (app.doc.nodes.length % 5) * 24;
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

export function addNodeAt(kind: NodeKind, rawX: number, rawY: number): DiagramNode {
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

  app.activeWireDraft = {
    sourceNodeId: sourceNode.id,
    sourcePort,
    startPt,
    hoveredPortBtn: null,
  };
  workspace.dataset.wiring = 'true';
  draftWire.removeAttribute('hidden');
  draftWire.setAttribute('d', `M ${startPt[0]} ${startPt[1]} L ${startPt[0]} ${startPt[1]}`);
  captureEl.setPointerCapture(e.pointerId);

  const onLost = () => {
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
    }
  };

  const onUp = (upEv: PointerEvent) => onFinish(upEv, true);
  const onCancel = (cancelEv: PointerEvent) => onFinish(cancelEv, false);

  captureEl.addEventListener('pointermove', onMove);
  captureEl.addEventListener('pointerup', onUp);
  captureEl.addEventListener('pointercancel', onCancel);
  captureEl.addEventListener('lostpointercapture', onLost);
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
  };
  app.doc.edges.push(newEdge);
  setSelection({ type: 'edge', id: newEdge.id });
  app.connectSourceNodeId = null;
  renderAll(true);
}

export function renderSimButtons(): void {
  const scenarios = getEffectiveSimulations(app.doc);
  const existing = new Map<string, HTMLButtonElement>();
  for (const child of Array.from(simButtonsSlot.children)) {
    if (child instanceof HTMLButtonElement && child.dataset.simId) {
      existing.set(child.dataset.simId, child);
    }
  }
  const seen = new Set<string>();
  for (const sim of scenarios) {
    seen.add(sim.id);
    let btn = existing.get(sim.id);
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.simId = sim.id;
      const dot = document.createElement('span');
      dot.className = 'pill-swatch';
      const label = document.createElement('span');
      label.className = 'sim-label';
      btn.append(dot, label);
      btn.addEventListener('click', () => runSimulation(btn?.dataset.simId || ''));
    }
    btn.className =
      sim.tone === 'rose' ? 'btn btn-reject' : sim.tone === 'emerald' ? 'btn btn-approve' : 'btn';
    const [dotCss] = TONE_CSS[sim.tone] || TONE_CSS.emerald;
    const dot = btn.querySelector<HTMLElement>('.pill-swatch');
    if (dot) dot.style.background = dotCss;
    const label = btn.querySelector('.sim-label');
    if (label) label.textContent = sim.name;
    simButtonsSlot.appendChild(btn);
  }
  for (const [id, btn] of existing) {
    if (!seen.has(id)) btn.remove();
  }
}

export function clearSimulation(): void {
  if (app.simTimer !== null) {
    window.clearTimeout(app.simTimer);
    app.simTimer = null;
  }
  simPacket.hidden = true;
  for (const w of nodesLayer.querySelectorAll<HTMLElement>('.arch-node')) {
    delete w.dataset.simActive;
  }
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
  const allFlowRadio = document.querySelector<HTMLInputElement>(
    'input[name="flow-filter"][value="all"]',
  );
  if (allFlowRadio) allFlowRadio.checked = true;

  const nodeMap = new Map(app.doc.nodes.map((n) => [n.id, n]));
  const wrappers = Array.from(nodesLayer.querySelectorAll<HTMLElement>('.arch-node'));
  let idx = 0;

  const stepNext = () => {
    if (idx >= scenario.steps.length) {
      app.simTimer = window.setTimeout(clearSimulation, 1100);
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
    app.simTimer = window.setTimeout(stepNext, 950);
  };

  stepNext();
}

// ---------------------------------------------------------------------------
// Delete, Duplicate & Copy/Paste Selected Elements
// ---------------------------------------------------------------------------
export function deleteSelected(): void {
  const sel = app.selection;
  if (sel.type === 'none') return;
  pushHistory();

  let desc = 'element';
  if (sel.type === 'node') {
    const targetId = sel.id;
    const node = app.doc.nodes.find((n) => n.id === targetId);
    desc = node ? `"${node.title}"` : 'component';
    app.doc.nodes = app.doc.nodes.filter((n) => n.id !== targetId);
    app.doc.edges = app.doc.edges.filter((e) => e.from !== targetId && e.to !== targetId);
    dropNodesFromSimulations(new Set([targetId]));
  } else if (sel.type === 'multi') {
    const count = sel.ids.length + (sel.zoneIds?.length ?? 0) + (sel.notesIds?.length ?? 0);
    desc = `${count} ${count === 1 ? 'item' : 'items'}`;
    const idSet = new Set(sel.ids);
    const zoneIds = new Set(sel.zoneIds ?? []);
    const notesIds = new Set(sel.notesIds ?? []);
    app.doc.nodes = app.doc.nodes.filter((n) => !idSet.has(n.id));
    app.doc.edges = app.doc.edges.filter((e) => !idSet.has(e.from) && !idSet.has(e.to));
    if (zoneIds.size > 0) app.doc.zones = app.doc.zones.filter((zone) => !zoneIds.has(zone.id));
    if (notesIds.size > 0) app.doc.notesCards = app.doc.notesCards.filter((card) => !notesIds.has(card.id));
    dropNodesFromSimulations(idSet);
  } else if (sel.type === 'edge') {
    desc = 'stream';
    app.doc.edges = app.doc.edges.filter((e) => e.id !== sel.id);
  } else if (sel.type === 'zone') {
    desc = 'swimlane';
    app.doc.zones = app.doc.zones.filter((z) => z.id !== sel.id);
  } else if (sel.type === 'notes') {
    desc = 'note card';
    app.doc.notesCards = app.doc.notesCards.filter((c) => c.id !== sel.id);
  }

  setSelection({ type: 'none' });
  renderAll(true);
  notify(`Deleted ${desc}`, { action: { label: 'Undo', onClick: () => performUndo() } });
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
  if (sel.type === 'node') {
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

export function copySelection(): void {
  const ids = getSelectedNodeIds();
  if (ids.length === 0) return;
  const idSet = new Set(ids);
  app.clipboardNodes = structuredClone(app.doc.nodes.filter((n) => idSet.has(n.id)));
  app.clipboardEdges = structuredClone(
    app.doc.edges.filter((e) => idSet.has(e.from) && idSet.has(e.to)),
  );
  const count = app.clipboardNodes.length;
  const msg = `Copied ${count} ${count === 1 ? 'component' : 'components'} to clipboard`;
  hudStatusTip.textContent = msg;
  notify(msg);
}

export function pasteSelection(): void {
  if (app.clipboardNodes.length === 0) return;
  pushHistory();
  const idMap = new Map<string, string>();
  const newIds: string[] = [];
  for (const orig of app.clipboardNodes) {
    const copy = structuredClone(orig);
    copy.id = nextUid(orig.kind);
    copy.x += 32;
    copy.y += 32;
    orig.x += 32;
    orig.y += 32;
    idMap.set(orig.id, copy.id);
    newIds.push(copy.id);
    app.doc.nodes.push(copy);
  }
  for (const edge of app.clipboardEdges) {
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
  expandStageToFit(app.doc);
  setSelection(newIds.length > 1 ? { type: 'multi', ids: newIds } : { type: 'node', id: newIds[0] });
  renderAll(true);
  const msg = `Pasted ${newIds.length} ${newIds.length === 1 ? 'component' : 'components'}`;
  hudStatusTip.textContent = msg;
  notify(msg);
}

// ---------------------------------------------------------------------------
// File Import, Drag-and-Drop, Code Sync, and Export
// ---------------------------------------------------------------------------
export function applyImportedText(rawText: string, fallbackTitle?: string): boolean {
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
    pushHistory();
    if (fallbackTitle && parsed.doc.title === 'Untitled Architecture') parsed.doc.title = fallbackTitle;
    app.doc = parsed.doc;
    setSelection(app.doc.nodes.length > 0 ? { type: 'node', id: app.doc.nodes[0].id } : { type: 'none' });
    clearSimulation();
    renderAll(true);
    requestAnimationFrame(fitToViewport);
    codeSyncDiagnostics.dataset.tone = 'ok';
    codeSyncDiagnostics.textContent = `Imported ${app.doc.nodes.length} components from Blueprint JSON.`;
    const msg = `Imported Blueprint JSON (${app.doc.nodes.length} components, ${app.doc.edges.length} streams)`;
    hudStatusTip.textContent = msg;
    notify(msg, { action: { label: 'Undo', onClick: () => performUndo() } });
    return true;
  }

  const { doc: importedDoc, warnings, issues } = importMermaidOrBlueprint(rawText);
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

  pushHistory();
  if (fallbackTitle && importedDoc.title === 'Imported Architecture') {
    importedDoc.title = fallbackTitle;
  }
  app.doc = importedDoc;
  setSelection(app.doc.nodes.length > 0 ? { type: 'node', id: app.doc.nodes[0].id } : { type: 'none' });
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
    const msg = `Imported ${app.doc.nodes.length} nodes (${issues.length || warnings.length} warning${(issues.length || warnings.length) === 1 ? '' : 's'}: ${formatIssue(0)})`;
    hudStatusTip.textContent = msg;
    notify(`Imported ${app.doc.nodes.length} nodes with warnings`, { action: { label: 'Undo', onClick: () => performUndo() } });
  } else {
    codeSyncDiagnostics.dataset.tone = 'ok';
    codeSyncDiagnostics.textContent = `Imported ${app.doc.nodes.length} components and ${app.doc.edges.length} streams (0 issues).`;
    const msg = `Imported ${app.doc.nodes.length} components and ${app.doc.edges.length} animated telemetry streams`;
    hudStatusTip.textContent = msg;
    notify(`Imported ${app.doc.nodes.length} components and ${app.doc.edges.length} streams`, { action: { label: 'Undo', onClick: () => performUndo() } });
  }
  return true;
}

export async function handleUploadedFile(file: File): Promise<void> {
  const text = await file.text();
  const baseName = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
  const titleFromFile = baseName
    ? baseName.replace(/\b\w/g, (ch) => ch.toUpperCase())
    : undefined;
  applyImportedText(text, titleFromFile);
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
  const doc = app.doc;
  hudStatusTip.textContent = 'Rendering a short animation…';
  try {
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
        });
        frames.push(await rasterizeSvg(svg, size.width, size.height));
      }
      const gif = encodeGif({
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
      const options: StagePictureOptions | undefined = view ? { currentView: true, ...dash } : dash;
      const svg = renderStagePictureSvg(size.width, size.height, options);
      frames.push(await rasterizeSvg(svg, size.width, size.height));
    }
    const gif = encodeGif({
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
        ? 'Saved a short animation of the telemetry wires.'
        : 'Saved a still picture. No wires on this diagram are animated.';
  } catch {
    hudStatusTip.textContent = 'Could not render a GIF of this diagram.';
  }
}

export function getSafeFilenameSlug(): string {
  return filenameSlug(app.doc.title || 'architecture-diagram', 'architecture-diagram');
}

export function getSelectedCodeFormat(): 'mermaid' | 'blueprint' {
  const checked = document.querySelector<HTMLInputElement>('input[name="code-format"]:checked');
  return checked?.value === 'blueprint' ? 'blueprint' : 'mermaid';
}

export function refreshCodeModalTextarea(): void {
  const fmt = getSelectedCodeFormat();
  codeSyncTextarea.value =
    fmt === 'blueprint' ? serializeToBlueprintMarkdown(app.doc) : serializeToMermaid(app.doc);
  codeSyncDiagnostics.textContent =
    fmt === 'blueprint'
      ? 'Full Blueprint (.md): YAML metadata + positions + Mermaid flowchart.'
      : 'Standard Mermaid (.mmd): live-generated from your visual canvas.';
  delete codeSyncDiagnostics.dataset.tone;
}

export function openCodeDialog(): void {
  refreshCodeModalTextarea();
  codeDialog.showModal();
}

// ---------------------------------------------------------------------------
// Event Wiring
// ---------------------------------------------------------------------------
export function openShortcutsDialog(): void {
  if (!shortcutsDialog) return;
  if (shortcutsDialogBody) {
    shortcutsDialogBody.innerHTML = renderShortcutsHtml();
  }
  shortcutsDialog.showModal();
}

export function initEvents(): void {
  // Workspace Mode Switcher (Design vs Data View)
  for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="workspace-mode"]')) {
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      app.workspaceMode = radio.value === 'data' ? 'data' : 'design';
      workspace.dataset.mode = app.workspaceMode;
      designToolbar.hidden = app.workspaceMode !== 'design';
      dataToolbar.hidden = app.workspaceMode !== 'data';
      designInspectorPane.hidden = app.workspaceMode !== 'design';
      dataInspectorPane.hidden = app.workspaceMode !== 'data';

      hudStatusTip.textContent =
        app.workspaceMode === 'design'
          ? 'Drag stencils onto grid · Drag from any port dot to wire animated streams'
          : 'Data View · Shift-click to select several components. Connected components stay highlighted.';

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
      requestAnimationFrame(fitToViewport);
    });
  }

  // Pointer Tool Switcher (Select vs Connect)
  for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="pointer-tool"]')) {
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      app.pointerTool = radio.value === 'connect' ? 'connect' : 'select';
      workspace.dataset.tool = app.pointerTool;
      app.connectSourceNodeId = null;
      hudStatusTip.textContent =
        app.pointerTool === 'connect'
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
    applySelection({ type: 'none' }, { refreshIfUnchanged: true });
    if (app.workspaceMode === 'design') {
      document.getElementById('prop-doc-title')?.focus();
    }
  });

  // Undo / Redo / Auto-Layout / Delete / Duplicate
  btnUndo.addEventListener('click', performUndo);
  btnRedo.addEventListener('click', performRedo);
  btnAutoLayout.addEventListener('click', () => {
    if (app.doc.nodes.length === 0) return;
    pushHistory();
    autoLayoutDocument(app.doc);
    renderAll(true);
    fitToViewport();
    notify('Applied auto-layout', { action: { label: 'Undo', onClick: () => performUndo() } });
  });
  btnPropDelete.addEventListener('click', deleteSelected);
  btnPropDuplicate.addEventListener('click', duplicateSelected);

  // Add Swimlane & Notes Card
  btnAddZone.setAttribute('data-tip', 'Create a swimlane stage banner');
  btnAddZone.setAttribute('data-tip-pos', 'right');
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
  });

  btnAddNotes.setAttribute('data-tip', 'Add a checklist specification card');
  btnAddNotes.setAttribute('data-tip-pos', 'right');
  btnAddNotes.addEventListener('click', () => {
    pushHistory();
    const [cx, cy] = getViewportWorldCenter();
    const notes = createNotesCard(cx - 200, cy + 120);
    app.doc.notesCards.push(notes);
    expandStageToFit(app.doc);
    setSelection({ type: 'notes', id: notes.id });
    renderAll(true);
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
  };

  const loadTemplateDoc = (template: TemplateDefinition): void => {
    const parsed = parseBlueprintJson(template.rawJson);
    if (!parsed.ok) {
      hudStatusTip.textContent = parsed.error;
      notify(parsed.error, { tone: 'error' });
      return;
    }
    pushHistory();
    clearSimulation();
    app.doc = parsed.doc;
    const focus = app.doc.nodes.find((node) => node.id === 'night-desk') ?? app.doc.nodes[0];
    setSelection(focus ? { type: 'node', id: focus.id } : { type: 'none' });
    renderAll(true);
    requestAnimationFrame(fitToViewport);
    const msg = `Loaded ${template.title}`;
    hudStatusTip.textContent = msg;
    notify(msg, { action: { label: 'Undo', onClick: () => performUndo() } });
  };

  const createBlankCanvas = (): void => {
    const isEmpty = app.doc.nodes.length === 0 && app.doc.zones.length === 0 && app.doc.notesCards.length === 0;
    if (!isEmpty) pushHistory();
    clearSimulation();
    app.doc = createBlankDocument();
    setSelection({ type: 'none' });
    traceList.replaceChildren();
    renderAll(true);
    fitToViewport();
    if (!isEmpty) {
      notify('Created blank canvas', { action: { label: 'Undo', onClick: () => performUndo() } });
    }
  };

  const openTemplateGallery = (): void => {
    if (!templateGalleryDialog) return;
    renderGalleryGrid();
    templateGalleryDialog.showModal();
  };

  btnEmptyShowcase.addEventListener('click', () => {
    const showcase = getStarterTemplateById('lumen-relay');
    if (showcase) {
      loadTemplateDoc(showcase);
    }
  });

  // Empty state "Browse Templates" button
  btnEmptyTemplates?.addEventListener('click', openTemplateGallery);

  // Empty state Quick Template Shelf
  if (emptyStageShelfSlot) {
    emptyStageShelfSlot.innerHTML = renderEmptyStageShelfHtml();
    emptyStageShelfSlot.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>('.empty-shelf-pill');
      if (!target) return;
      if (target.id === 'btn-empty-more-templates') {
        openTemplateGallery();
        return;
      }
      const templateId = target.getAttribute('data-template-id');
      if (templateId) {
        const template = getStarterTemplateById(templateId);
        if (template) {
          loadTemplateDoc(template);
        }
      }
    });
  }

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
        loadTemplateDoc(template);
        if (templateGalleryDialog) void closeDialogSmoothly(templateGalleryDialog);
      }
    }
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
    app.doc.nodes.push(actor, core);
    app.doc.edges.push({
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
    expandStageToFit(app.doc);
    setSelection({ type: 'node', id: core.id });
    renderAll(true);
    fitToViewport();
    notify('Added starter pair', { action: { label: 'Undo', onClick: () => performUndo() } });
  });

  // Restore Previous Autosaved Session
  btnRestoreSession?.addEventListener('click', () => {
    const saved = loadSavedSessionDoc();
    if (!saved) return;
    pushHistory();
    app.doc = saved;
    expandStageToFit(app.doc);
    setSelection(app.doc.nodes.length > 0 ? { type: 'node', id: app.doc.nodes[0].id } : { type: 'none' });
    renderAll(true);
    fitToViewport();
    const msg = `Restored previous session (${app.doc.nodes.length} components, ${app.doc.edges.length} streams)`;
    hudStatusTip.textContent = msg;
    notify(msg, { action: { label: 'Undo', onClick: () => performUndo() } });
  });

  // Flush pending autosave on page unload
  window.addEventListener('beforeunload', (e) => {
    if (app.hasPendingAutosave) {
      flushAutosave();
      e.preventDefault();
    }
  });

  // New Canvas button opens Template Gallery
  btnNewCanvas.addEventListener('click', openTemplateGallery);

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
  btnOpenExport.addEventListener('click', () => {
    resetGifChoices();
    exportDialog.showModal();
  });
  btnExportHtml.addEventListener('click', () => {
    const html = generateStandaloneHtml(app.doc);
    const filename = `${getSafeFilenameSlug()}.html`;
    downloadBlob(html, filename, 'text/html;charset=utf-8');
    void closeDialogSmoothly(exportDialog);
    notify(`Exported ${filename}`);
  });
  btnExportMmd.addEventListener('click', () => {
    const mmd = serializeToMermaid(app.doc);
    const filename = `${getSafeFilenameSlug()}.mmd`;
    downloadBlob(mmd, filename, 'text/plain;charset=utf-8');
    void closeDialogSmoothly(exportDialog);
    notify(`Exported ${filename}`);
  });
  btnExportSvg.addEventListener('click', () => {
    const filename = `${getSafeFilenameSlug()}.svg`;
    downloadBlob(renderStagePictureSvg(), filename, 'image/svg+xml;charset=utf-8');
    void closeDialogSmoothly(exportDialog);
    notify(`Exported ${filename}`);
  });
  btnExportPng.addEventListener('click', () => {
    const scale = Math.min(2, 4096 / Math.max(app.doc.stageWidth, app.doc.stageHeight, 1));
    const width = Math.max(1, Math.round(app.doc.stageWidth * scale));
    const height = Math.max(1, Math.round(app.doc.stageHeight * scale));
    hudStatusTip.textContent = 'Rendering the canvas…';
    const filename = `${getSafeFilenameSlug()}.png`;
    downloadDiagramPng(renderStagePictureSvg(width, height), width, height, filename);
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
  btnExportJson.addEventListener('click', () => {
    const filename = `${getSafeFilenameSlug()}.blueprint.json`;
    downloadBlob(
      serializeBlueprintJson(app.doc),
      filename,
      'application/json;charset=utf-8',
    );
    void closeDialogSmoothly(exportDialog);
    notify(`Exported ${filename}`);
  });

  // Matrix & Settings Dialogs
  btnOpenMatrix.addEventListener('click', () => {
    renderMatrixTable();
    matrixDialog.showModal();
  });
  btnOpenSettings.addEventListener('click', () => settingsDialog.showModal());
  btnOpenShortcuts?.addEventListener('click', openShortcutsDialog);

  // Command Palette
  initCommandPalette({
    openCodeDialog,
    openExportDialog: () => {
      resetGifChoices();
      exportDialog.showModal();
    },
    openSettingsDialog: () => settingsDialog.showModal(),
    openShortcutsDialog,
    openTemplateGallery,
    loadTemplateById: (id) => {
      const template = getStarterTemplateById(id);
      if (template) loadTemplateDoc(template);
    },
    deleteSelected,
    duplicateSelected,
    loadShowcase: () => {
      const showcase = getStarterTemplateById('lumen-relay');
      if (showcase) loadTemplateDoc(showcase);
    },
    runSimulationById: (id) => runSimulation(id),
  });

  // Dismissible Coach Mark Card
  try {
    if (localStorage.getItem('conduitcraft-coach-dismissed') === '1' && hudCoachCard) {
      hudCoachCard.hidden = true;
    }
  } catch {
    // Ignore storage issues
  }
  btnDismissHudCoach?.addEventListener('click', () => {
    if (hudCoachCard) hudCoachCard.hidden = true;
    try {
      localStorage.setItem('conduitcraft-coach-dismissed', '1');
    } catch {
      // Ignore storage issues
    }
  });

  // Smooth Dialog Close & Reset `returnValue` (`dialog` guide)
  const allDialogs = [codeDialog, exportDialog, matrixDialog, settingsDialog];
  if (shortcutsDialog) allDialogs.push(shortcutsDialog);
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

  // Pause / Resume Stream Pulse Motion
  btnToggleMotion.addEventListener('click', () => {
    const paused = document.body.classList.toggle('motion-paused');
    btnToggleMotion.setAttribute('aria-pressed', String(paused));
    btnToggleMotion.textContent = paused ? 'Resume' : 'Pause';
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
    if (e.type === 'pointerup' && !didMove && app.selection.type !== 'none') {
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
      const rect = viewport.getBoundingClientRect();
      const factor = e.deltaY < 0 ? 1.08 : 0.92;
      zoomAround(app.scale * factor, e.clientX - rect.left, e.clientY - rect.top);
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
  window.addEventListener('resize', fitToViewport);

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
      if (e.key.toLowerCase() === 'd' && app.workspaceMode === 'design') {
        e.preventDefault();
        duplicateSelected();
        return;
      }
      if (e.key.toLowerCase() === 'c' && app.workspaceMode === 'design') {
        e.preventDefault();
        copySelection();
        return;
      }
      if (e.key.toLowerCase() === 'v' && app.workspaceMode === 'design') {
        e.preventDefault();
        pasteSelection();
        return;
      }
      if (e.key.toLowerCase() === 'a' && app.workspaceMode === 'design') {
        const next = selectionOfStage({
          nodes: app.doc.nodes.map((node) => node.id),
          zones: app.doc.zones.map((zone) => zone.id),
          notes: app.doc.notesCards.map((card) => card.id),
        });
        if (next.type !== 'none') {
          e.preventDefault();
          applySelection(next);
        }
        return;
      }
    }

    if (!inEditable && app.workspaceMode === 'design') {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (app.selection.type !== 'none') {
          e.preventDefault();
          deleteSelected();
        }
      } else if (e.key === 'Escape') {
        app.connectSourceNodeId = null;
        if (app.selection.type !== 'none') {
          applySelection({ type: 'none' });
        }
      }
    }
  });
}

export function bootStudio(): void {
  initStencilPalette();
  initEvents();
  renderAll(true);
  requestAnimationFrame(fitToViewport);
}
