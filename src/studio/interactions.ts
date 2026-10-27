/** Pointer, keyboard, palette, wiring, import/export, and simulation controls. */
import {
  btnAddNotes,
  btnAddZone,
  btnApplyCode,
  btnAutoLayout,
  btnClearTrace,
  btnCopyCode,
  btnEmptyCode,
  btnEmptyImport,
  btnExportHtml,
  btnExportMd,
  btnExportMmd,
  btnFocusDocTitle,
  btnImportFile,
  btnNewCanvas,
  btnOpenCode,
  btnOpenExport,
  btnOpenMatrix,
  btnOpenSettings,
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
  exportDialog,
  fileUploadInput,
  hudStatusTip,
  marqueeBox,
  matrixDialog,
  nodesLayer,
  panelInspector,
  panelTrace,
  settingsDialog,
  simButtonsSlot,
  simPacket,
  simPacketDot,
  simPacketLabel,
  stencilGrid,
  tabInspector,
  tabTrace,
  traceList,
  viewport,
  windowDropVeil,
  workspace,
} from './dom';
import {
  app,
  applyTransform,
  fitToViewport,
  flushAutosave,
  getSelectedNodeIds,
  getViewportWorldCenter,
  loadSavedSessionDoc,
  performRedo,
  performUndo,
  pushHistory,
  screenToWorld,
  zoomAround,
} from './state';
import {
  renderAll,
  renderMatrixTable,
  updateVisualSelectionHighlights,
} from './render';
import {
  renderPropertyEditor,
  syncDataViewInspector,
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
import { generateStandaloneHtml } from '../exporter/standaloneHtml';
import { createHumanOutlineSvg,
  createNodeIconSvg } from '../ui/icons';

// ---------------------------------------------------------------------------
// Palette Stencils (Click to Place OR Drag onto Stage)
// ---------------------------------------------------------------------------
export const TONE_CSS: Record<StreamTone, [string, string]> = {
  blue: ['var(--wl-blue)', 'var(--wl-blue-soft)'],
  emerald: ['var(--wl-emerald)', 'var(--wl-emerald-soft)'],
  rose: ['var(--wl-rose)', 'var(--wl-rose-soft)'],
  violet: ['var(--wl-violet)', 'var(--wl-violet-soft)'],
  amber: ['var(--wl-amber)', 'var(--wl-amber-soft)'],
};

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
  app.selection = { type: 'node', id: node.id };
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

  const onMove = (moveEv: PointerEvent) => {
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
  app.selection = { type: 'edge', id: newEdge.id };
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

export function switchDataViewTab(tab: 'inspector' | 'trace'): void {
  const isInsp = tab === 'inspector';
  tabInspector.setAttribute('aria-selected', String(isInsp));
  tabTrace.setAttribute('aria-selected', String(!isInsp));
  withInspectorTransition(() => {
    panelInspector.hidden = !isInsp;
    panelTrace.hidden = isInsp;
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

  if (sel.type === 'node') {
    const targetId = sel.id;
    app.doc.nodes = app.doc.nodes.filter((n) => n.id !== targetId);
    app.doc.edges = app.doc.edges.filter((e) => e.from !== targetId && e.to !== targetId);
  } else if (sel.type === 'multi') {
    const idSet = new Set(sel.ids);
    app.doc.nodes = app.doc.nodes.filter((n) => !idSet.has(n.id));
    app.doc.edges = app.doc.edges.filter((e) => !idSet.has(e.from) && !idSet.has(e.to));
  } else if (sel.type === 'edge') {
    app.doc.edges = app.doc.edges.filter((e) => e.id !== sel.id);
  } else if (sel.type === 'zone') {
    app.doc.zones = app.doc.zones.filter((z) => z.id !== sel.id);
  } else if (sel.type === 'notes') {
    app.doc.notesCards = app.doc.notesCards.filter((c) => c.id !== sel.id);
  }

  app.selection = { type: 'none' };
  renderAll(true);
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
    app.selection = { type: 'node', id: copy.id };
    renderAll(true);
  } else if (sel.type === 'multi') {
    const origNodes = app.doc.nodes.filter((n) => sel.ids.includes(n.id));
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
    expandStageToFit(app.doc);
    app.selection = newIds.length > 1 ? { type: 'multi', ids: newIds } : { type: 'node', id: newIds[0] };
    renderAll(true);
  } else if (sel.type === 'zone') {
    const orig = app.doc.zones.find((z) => z.id === sel.id);
    if (!orig) return;
    pushHistory();
    const copy: DiagramZone = structuredClone(orig);
    copy.id = nextUid('zone');
    copy.x += orig.width + 24;
    app.doc.zones.push(copy);
    expandStageToFit(app.doc);
    app.selection = { type: 'zone', id: copy.id };
    renderAll(true);
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
    app.selection = { type: 'notes', id: copy.id };
    renderAll(true);
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
  hudStatusTip.textContent = `Copied ${app.clipboardNodes.length} ${app.clipboardNodes.length === 1 ? 'component' : 'components'} to studio clipboard`;
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
  app.selection =
    newIds.length > 1 ? { type: 'multi', ids: newIds } : { type: 'node', id: newIds[0] };
  renderAll(true);
}

// ---------------------------------------------------------------------------
// File Import, Drag-and-Drop, Code Sync, and Export
// ---------------------------------------------------------------------------
export function applyImportedText(rawText: string, fallbackTitle?: string): boolean {
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
  app.doc = importedDoc;
  app.selection = app.doc.nodes.length > 0 ? { type: 'node', id: app.doc.nodes[0].id } : { type: 'none' };
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
    hudStatusTip.textContent = `Imported ${app.doc.nodes.length} nodes (${issues.length || warnings.length} warning${(issues.length || warnings.length) === 1 ? '' : 's'}: ${formatIssue(0)})`;
  } else {
    codeSyncDiagnostics.dataset.tone = 'ok';
    codeSyncDiagnostics.textContent = `Imported ${app.doc.nodes.length} components and ${app.doc.edges.length} streams (0 issues).`;
    hudStatusTip.textContent = `Imported ${app.doc.nodes.length} components and ${app.doc.edges.length} animated telemetry streams`;
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

export function downloadBlob(content: string, filename: string, mimeType: string): void {
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

export function getSafeFilenameSlug(): string {
  return (
    (app.doc.title || 'architecture-diagram')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'architecture-diagram'
  );
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
          : 'Data View · Select any component to inspect lineage & payload, or trigger a simulation above';

      if (app.workspaceMode === 'data' && app.selection.type !== 'node' && app.doc.nodes.length > 0) {
        app.selection = { type: 'node', id: app.doc.nodes[0].id };
      }

      updateVisualSelectionHighlights();
      if (app.workspaceMode === 'design') renderPropertyEditor();
      else syncDataViewInspector();
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
    app.selection = { type: 'none' };
    updateVisualSelectionHighlights();
    if (app.workspaceMode === 'design') {
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
    if (app.doc.nodes.length === 0) return;
    pushHistory();
    autoLayoutDocument(app.doc);
    renderAll(true);
    fitToViewport();
  });
  btnPropDelete.addEventListener('click', deleteSelected);
  btnPropDuplicate.addEventListener('click', duplicateSelected);

  // Add Swimlane & Notes Card
  btnAddZone.addEventListener('click', () => {
    pushHistory();
    const nextX =
      app.doc.zones.length > 0
        ? Math.max(...app.doc.zones.map((z) => z.x + z.width)) + 24
        : 48;
    const zone = createSwimlaneZone(app.doc.zones.length, nextX);
    app.doc.zones.push(zone);
    expandStageToFit(app.doc);
    app.selection = { type: 'zone', id: zone.id };
    renderAll(true);
  });

  btnAddNotes.addEventListener('click', () => {
    pushHistory();
    const [cx, cy] = getViewportWorldCenter();
    const notes = createNotesCard(cx - 200, cy + 120);
    app.doc.notesCards.push(notes);
    expandStageToFit(app.doc);
    app.selection = { type: 'notes', id: notes.id };
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
    app.selection = { type: 'node', id: core.id };
    renderAll(true);
    fitToViewport();
  });

  // Restore Previous Autosaved Session
  btnRestoreSession?.addEventListener('click', () => {
    const saved = loadSavedSessionDoc();
    if (!saved) return;
    pushHistory();
    app.doc = saved;
    expandStageToFit(app.doc);
    app.selection = app.doc.nodes.length > 0 ? { type: 'node', id: app.doc.nodes[0].id } : { type: 'none' };
    renderAll(true);
    fitToViewport();
    hudStatusTip.textContent = `Restored previous session (${app.doc.nodes.length} components, ${app.doc.edges.length} streams)`;
  });

  // Flush pending autosave on page unload
  window.addEventListener('beforeunload', (e) => {
    if (app.hasPendingAutosave) {
      flushAutosave();
      e.preventDefault();
    }
  });

  // New Blank Canvas
  btnNewCanvas.addEventListener('click', () => {
    const isEmpty = app.doc.nodes.length === 0 && app.doc.zones.length === 0 && app.doc.notesCards.length === 0;
    if (!isEmpty) pushHistory();
    clearSimulation();
    app.doc = createBlankDocument();
    app.selection = { type: 'none' };
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
    const html = generateStandaloneHtml(app.doc);
    downloadBlob(html, `${getSafeFilenameSlug()}.html`, 'text/html;charset=utf-8');
    void closeDialogSmoothly(exportDialog);
  });
  btnExportMd.addEventListener('click', () => {
    const md = serializeToBlueprintMarkdown(app.doc);
    downloadBlob(md, `${getSafeFilenameSlug()}.md`, 'text/markdown;charset=utf-8');
    void closeDialogSmoothly(exportDialog);
  });
  btnExportMmd.addEventListener('click', () => {
    const mmd = serializeToMermaid(app.doc);
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
  btnResetSelection.addEventListener('click', () => {
    app.selection = { type: 'none' };
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
      app.selection =
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
    if (e.type === 'pointerup' && !didMove && app.selection.type !== 'none') {
      app.selection = { type: 'none' };
      app.connectSourceNodeId = null;
      updateVisualSelectionHighlights();
      if (app.workspaceMode === 'design') renderPropertyEditor();
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
        if (app.doc.nodes.length > 0) {
          e.preventDefault();
          app.selection =
            app.doc.nodes.length > 1
              ? { type: 'multi', ids: app.doc.nodes.map((n) => n.id) }
              : { type: 'node', id: app.doc.nodes[0].id };
          updateVisualSelectionHighlights();
          renderPropertyEditor();
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
          app.selection = { type: 'none' };
          updateVisualSelectionHighlights();
          renderPropertyEditor();
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
