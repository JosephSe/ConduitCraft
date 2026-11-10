/** Keyed stage rendering. Existing elements are updated in place; listeners stay bound. */
import type { DiagramNode, DiagramNotesCard, DiagramZone, PortSide, RoutedDiagramEdge } from '../types';
import { getNotesItemIconMeta } from '../types';
import { expandStageToFit, relatedNodeIds, routeDiagramEdges } from '../core/layout';
import { createHumanOutlineSvg, createNodeIconSvg } from '../ui/icons';
import {
  cylinderPlate,
  pipePlate,
  queueDrawsPipe,
  nodeShapeContentPadding,
  nodeShapePlate,
  drawnShape,
  balancerDrawsTrapezoid,
  sanitizeIconImage,
  storeDrawsBucket,
  storeDrawsCylinder,
} from '../core/nodeStyle';
import {
  SVG_NS,
  draftWire,
  nodesLayer,
  notesLayer,
  propPanelHeading,
  wireHandlesSvg,
  wiresGroup,
  workspace,
  framesLayer,
  zonesLayer,
} from './dom';
import {
  app,
  getSelectedNodeIds,
  isSelectedNode,
  isSelectedNotes,
  isSelectedZone,
  beginHistoryGesture,
  endHistoryGesture,
  pushHistory,
  pushHistoryNudge,
  screenToWorld,
  setSelection,
  openComponentLevel,
} from './state';
import { renderPropertyEditor } from './inspector';
import { applySelection, requestInspectorRefresh } from './render';
import {
  beginPortWireDrag,
  createEdgeConnection,
  deleteSelected,
  retargetEdgeEnd,
  wireDropTarget,
  type WireEnd,
} from './interactions';
import { renameNodeInline, renameNotesInline, renameWireInline, renameZoneInline } from './inlineRename';
import { reconcileKeyed } from './reconcile';
import { effectiveTone, matchesTag } from '../core/meta';
import { flowScale } from '../core/wire';
import { queueCardText, streamLanes } from '../core/queues';
import { paintBacklog, paintDlqLinks } from './queueBacklog';
import { chaosLensActive, chaosStatusOf, isPreview } from './chaos';
import { insightsFor, worstLevel } from './insights';
import { scheduleMinimapPaint } from './minimap';
import { clearGuides, paintGuides } from './guideOverlay';
import { distancesTo, snapToGuides } from './guides';
import {
  toggleEdgeInSelection,
  toggleNodeInSelection,
  toggleNotesInSelection,
  toggleZoneInSelection,
} from './selection';

export function toggleSelectedNode(id: string): void {
  const next = toggleNodeInSelection(app.selection, id);
  applySelection(next);
}

export function toggleSelectedZone(id: string): void {
  const next = toggleZoneInSelection(app.selection, id);
  applySelection(next);
}

export function toggleSelectedNotes(id: string): void {
  const next = toggleNotesInSelection(app.selection, id);
  applySelection(next);
}

export function toggleSelectedEdge(edgeId: string): void {
  const next = toggleEdgeInSelection(app.selection, edgeId, app.doc.edges);
  applySelection(next);
  renderWiresOnly();
}

function liveZone(id: string): DiagramZone | undefined {
  return app.doc.zones.find((zone) => zone.id === id);
}

function liveNotes(id: string): DiagramNotesCard | undefined {
  return app.doc.notesCards.find((card) => card.id === id);
}

function liveNode(id: string): DiagramNode | undefined {
  return app.doc.nodes.find((node) => node.id === id);
}

export function renderZones(): void {
  reconcileKeyed(
    zonesLayer,
    app.doc.zones,
    (zone) => zone.id,
    (el) => (el as HTMLElement).dataset.zoneId,
    () => 'zone',
    createZoneBanner,
    (el, zone) => paintZone(el as HTMLElement, zone),
  );
  scheduleMinimapPaint();
}

function createZoneBanner(zone: DiagramZone): HTMLElement {
  const banner = document.createElement('div');
  banner.className = 'zone-banner';
  banner.dataset.zoneId = zone.id;

  const left = document.createElement('span');
  const numSpan = document.createElement('span');
  numSpan.className = 'zone-num';
  const titleSpan = document.createElement('span');
  titleSpan.className = 'zone-title';
  left.append(numSpan, titleSpan);

  const right = document.createElement('span');
  right.className = 'zone-sub';

  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'zone-resize-handle';
  resizeHandle.title = 'Drag to resize swimlane width';
  banner.append(left, right, resizeHandle);

  let dragStartX = 0;
  let origX = zone.x;
  let moved = false;
  banner.addEventListener('pointerdown', (e) => {
    if (app.workspaceMode !== 'design' || e.button !== 0 || e.target === resizeHandle) return;
    const current = liveZone(banner.dataset.zoneId || '');
    if (!current) return;
    e.stopPropagation();

    const isToggleZone =
      e.shiftKey ||
      e.metaKey ||
      e.ctrlKey ||
      (app.selectionUnselectMode && isSelectedZone(current.id));

    if (isToggleZone) {
      toggleSelectedZone(current.id);
      return;
    }

    applySelection({ type: 'zone', id: current.id }, { refreshIfUnchanged: true });
    if (current.locked) return;
    dragStartX = e.clientX;
    origX = current.x;
    moved = false;
    banner.setPointerCapture(e.pointerId);
  });
  banner.addEventListener('click', (e) => {
    if (e.shiftKey || e.metaKey || e.ctrlKey || app.selectionUnselectMode) {
      e.stopPropagation();
    }
  });
  banner.addEventListener('dblclick', (e) => {
    if (app.workspaceMode !== 'design' || e.target === resizeHandle) return;
    e.stopPropagation();
    renameZoneInline(banner.dataset.zoneId || '');
  });
  banner.addEventListener('pointermove', (e) => {
    if (!banner.hasPointerCapture(e.pointerId)) return;
    const current = liveZone(banner.dataset.zoneId || '');
    if (!current) return;
    const dx = (e.clientX - dragStartX) / app.scale;
    if (!moved && Math.abs(dx) > 3) {
      beginHistoryGesture();
      pushHistory();
      moved = true;
      banner.classList.add('dragging');
    }
    if (moved) {
      const rawX = Math.max(16, origX + dx);
      current.x = app.snapToGrid ? Math.round(rawX / 16) * 16 : Math.round(rawX);
      banner.style.setProperty('--zx', String(current.x));
      expandStageToFit(app.doc);
      scheduleMinimapPaint();
    }
  });
  const endZoneDrag = () => {
    const didMove = moved;
    moved = false;
    banner.classList.remove('dragging');
    if (didMove) {
      endHistoryGesture();
      renderPropertyEditor();
    }
  };
  banner.addEventListener('pointerup', (e) => {
    e.stopPropagation();
    endZoneDrag();
  });
  banner.addEventListener('lostpointercapture', endZoneDrag);

  let resizeStartX = 0;
  let origW = zone.width;
  let resized = false;
  resizeHandle.addEventListener('pointerdown', (e) => {
    if (app.workspaceMode !== 'design' || e.button !== 0) return;
    const current = liveZone(banner.dataset.zoneId || '');
    if (!current || current.locked) return;
    e.stopPropagation();
    applySelection({ type: 'zone', id: current.id });
    resizeStartX = e.clientX;
    origW = current.width;
    resized = false;
    resizeHandle.setPointerCapture(e.pointerId);
  });
  resizeHandle.addEventListener('pointermove', (e) => {
    if (!resizeHandle.hasPointerCapture(e.pointerId)) return;
    const current = liveZone(banner.dataset.zoneId || '');
    if (!current) return;
    const dw = (e.clientX - resizeStartX) / app.scale;
    if (!resized && Math.abs(dw) > 3) {
      beginHistoryGesture();
      pushHistory();
      resized = true;
    }
    if (resized) {
      const rawW = Math.max(160, origW + dw);
      current.width = app.snapToGrid ? Math.round(rawW / 16) * 16 : Math.round(rawW);
      banner.style.setProperty('--zw', String(current.width));
      expandStageToFit(app.doc);
      scheduleMinimapPaint();
    }
  });
  const endZoneResize = () => {
    if (!resized) return;
    resized = false;
    endHistoryGesture();
    renderPropertyEditor();
  };
  resizeHandle.addEventListener('pointerup', (e) => {
    e.stopPropagation();
    endZoneResize();
  });
  resizeHandle.addEventListener('lostpointercapture', endZoneResize);

  return banner;
}

function paintZone(banner: HTMLElement, zone: DiagramZone): void {
  banner.style.setProperty('--zx', String(zone.x));
  banner.style.setProperty('--zw', String(zone.width));
  const num = banner.querySelector('.zone-num');
  if (num) num.textContent = `${zone.number} `;
  const title = banner.querySelector('.zone-title');
  if (title) title.textContent = zone.title;
  const sub = banner.querySelector('.zone-sub');
  if (sub) sub.textContent = zone.subtitle;
}

export function renderNotesCards(): void {
  reconcileKeyed(
    notesLayer,
    app.doc.notesCards,
    (card) => card.id,
    (el) => (el as HTMLElement).dataset.notesId,
    () => 'notes',
    createNotesCard,
    (el, card) => paintNotesCard(el as HTMLElement, card),
  );
  scheduleMinimapPaint();
}

function createNotesCard(card: DiagramNotesCard): HTMLElement {
  const aside = document.createElement('aside');
  aside.className = 'blueprint-spec';
  aside.dataset.notesId = card.id;

  const header = document.createElement('div');
  header.className = 'blueprint-spec-header';
  const hTitle = document.createElement('span');
  hTitle.className = 'notes-title';
  const hCode = document.createElement('span');
  hCode.className = 'notes-code';
  header.append(hTitle, hCode);

  const list = document.createElement('ul');
  list.className = 'blueprint-spec-list';
  aside.append(header, list);

  const isToggleNotesEvent = (e: MouseEvent | PointerEvent) => {
    return (
      e.shiftKey ||
      e.metaKey ||
      e.ctrlKey ||
      (app.selectionUnselectMode && isSelectedNotes(card.id))
    );
  };

  aside.addEventListener('pointerdown', (e) => {
    if (app.workspaceMode !== 'design' || e.button !== 0) return;
    const current = liveNotes(aside.dataset.notesId || '');
    if (!current) return;
    e.stopPropagation();
    if (isToggleNotesEvent(e)) {
      toggleSelectedNotes(current.id);
      return;
    }
    applySelection({ type: 'notes', id: current.id });
  });
  aside.addEventListener('pointerup', (e) => {
    if (app.workspaceMode === 'design') e.stopPropagation();
  });
  aside.addEventListener('click', (e) => {
    if (app.blockPointerClick) return;
    if (app.workspaceMode !== 'design') return;
    const current = liveNotes(aside.dataset.notesId || '');
    if (!current) return;
    e.stopPropagation();
    if (isToggleNotesEvent(e)) return;
    applySelection({ type: 'notes', id: current.id }, { expectedHeading: 'NOTE' });
  });

  let startX = 0;
  let startY = 0;
  let origX = card.x;
  let origY = card.y;
  let moved = false;
  header.addEventListener('pointerdown', (e) => {
    if (app.workspaceMode !== 'design' || e.button !== 0) return;
    const current = liveNotes(aside.dataset.notesId || '');
    if (!current) return;
    e.stopPropagation();
    if (isToggleNotesEvent(e)) {
      toggleSelectedNotes(current.id);
      return;
    }
    if (current.groupId && !e.altKey) {
      const gNodeIds = app.doc.nodes.filter((n) => n.groupId === current.groupId).map((n) => n.id);
      const gNoteIds = app.doc.notesCards.filter((c) => c.groupId === current.groupId).map((c) => c.id);
      if (gNodeIds.length + gNoteIds.length > 1) {
        applySelection({ type: 'multi', ids: gNodeIds, notesIds: gNoteIds });
      } else {
        applySelection({ type: 'notes', id: current.id });
      }
    } else {
      applySelection({ type: 'notes', id: current.id });
    }
    if (current.locked) return;
    startX = e.clientX;
    startY = e.clientY;
    origX = current.x;
    origY = current.y;
    moved = false;
    header.setPointerCapture(e.pointerId);
  });
  header.addEventListener('pointermove', (e) => {
    if (!header.hasPointerCapture(e.pointerId)) return;
    const current = liveNotes(aside.dataset.notesId || '');
    if (!current) return;
    const dx = (e.clientX - startX) / app.scale;
    const dy = (e.clientY - startY) / app.scale;
    if (!moved && Math.hypot(dx, dy) > 4) {
      beginHistoryGesture();
      pushHistory();
      moved = true;
      header.classList.add('dragging');
    }
    if (moved) {
      const nx = Math.max(16, origX + dx);
      const ny = Math.max(16, origY + dy);
      current.x = app.snapToGrid ? Math.round(nx / 16) * 16 : Math.round(nx);
      current.y = app.snapToGrid ? Math.round(ny / 16) * 16 : Math.round(ny);
      aside.style.setProperty('--bx', String(current.x));
      aside.style.setProperty('--by', String(current.y));
      expandStageToFit(app.doc);
      scheduleMinimapPaint();
    }
  });
  const endNotesDrag = () => {
    const didMove = moved;
    moved = false;
    header.classList.remove('dragging');
    if (didMove) endHistoryGesture();
  };
  header.addEventListener('pointerup', (e) => {
    e.stopPropagation();
    endNotesDrag();
  });
  header.addEventListener('lostpointercapture', endNotesDrag);
  header.addEventListener('dblclick', (e) => {
    if (app.workspaceMode !== 'design') return;
    e.stopPropagation();
    renameNotesInline(aside.dataset.notesId || '');
  });

  return aside;
}

function paintNotesCard(aside: HTMLElement, card: DiagramNotesCard): void {
  aside.style.setProperty('--bx', String(card.x));
  aside.style.setProperty('--by', String(card.y));
  aside.classList.toggle('is-text', card.variant === 'text');
  const title = aside.querySelector('.notes-title');
  if (title) title.textContent = card.title;
  const code = aside.querySelector('.notes-code');
  if (code) code.textContent = card.code;

  const sig = JSON.stringify(card.items);
  if (aside.dataset.itemsSig === sig) return;
  aside.dataset.itemsSig = sig;
  const list = aside.querySelector('.blueprint-spec-list');
  if (!list) return;
  list.replaceChildren();
  for (const item of card.items) {
    const li = document.createElement('li');
    const iconMeta = getNotesItemIconMeta(item.icon);
    if (iconMeta.value !== 'none') {
      const iconSpan = document.createElement('span');
      iconSpan.className = `spec-icon spec-check icon-${iconMeta.value}`;
      iconSpan.setAttribute('aria-hidden', 'true');
      iconSpan.textContent = iconMeta.glyph;
      li.appendChild(iconSpan);
    }
    const body = document.createElement('span');
    if (item.title) {
      const strong = document.createElement('strong');
      strong.textContent = `${item.title}: `;
      body.append(strong);
    }
    body.append(document.createTextNode(item.text));
    li.append(body);
    list.appendChild(li);
  }
}

export function renderWiresOnly(): void {
  const routed = routeDiagramEdges(app.doc);
  reconcileKeyed(
    wiresGroup,
    routed,
    (edge) => edge.id,
    (el) => (el as SVGElement).dataset.edgeId,
    () => 'wire',
    (edge) => createWireGroup(edge.id),
    (el, edge) => paintWire(el as SVGGElement, edge),
  );
  pruneEndpointHandles();
  scheduleMinimapPaint();
}

/** Remove handles whose wire is no longer the selected one (or no longer exists). */
function pruneEndpointHandles(): void {
  const sel = app.selection;
  const selectedId =
    app.workspaceMode === 'design' && sel.type === 'edge' && app.doc.edges.some((e) => e.id === sel.id) ? sel.id : null;
  for (const handle of wireHandlesSvg.querySelectorAll<SVGCircleElement>('.conduit-endpoint-handle')) {
    if (handle.dataset.edgeId !== selectedId) handle.remove();
  }
}

const wirePainters = new WeakMap<SVGGElement, (edge: RoutedDiagramEdge) => void>();

/** A smooth curve between two world points, matching the preview drawn while creating a wire. */
function draftCurve(a: [number, number], b: [number, number]): string {
  const midX = Math.round((a[0] + b[0]) / 2);
  return `M ${a[0]} ${a[1]} C ${midX} ${a[1]}, ${midX} ${b[1]}, ${b[0]} ${b[1]}`;
}

/**
 * A grab handle on one end of the selected wire, drawn in an overlay above the nodes. Dragging it onto another component (or port) re-attaches that end;
 * releasing anywhere else, or pressing Escape, leaves the wire as it was.
 */
function createEndpointHandle(edgeId: string, end: WireEnd): SVGCircleElement {
  const handle = document.createElementNS(SVG_NS, 'circle');
  handle.setAttribute('class', 'conduit-endpoint-handle');
  handle.setAttribute('r', '6.5');
  handle.dataset.end = end;
  handle.dataset.edgeId = edgeId;
  // Pointer-only affordance: the wire inspector offers Source and Target selectors for keyboard users.
  handle.setAttribute('aria-hidden', 'true');
  let dragging = false;
  let fixedPt: [number, number] = [0, 0];
  let hoveredPort: HTMLElement | null = null;

  const finish = (commit: boolean, ev?: PointerEvent): void => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('is-dragging');
    hoveredPort?.classList.remove('is-target-port');
    hoveredPort = null;
    app.activeWireDraft = null;
    delete workspace.dataset.wiring;
    draftWire.setAttribute('hidden', '');
    if (!commit || !ev) return;
    const target = wireDropTarget(ev.clientX, ev.clientY);
    if (target) retargetEdgeEnd(edgeId, end, target.nodeId, target.port);
  };

  handle.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || app.workspaceMode !== 'design') return;
    e.stopPropagation();
    e.preventDefault();
    const routed = routeDiagramEdges(app.doc).find((r) => r.id === edgeId);
    if (!routed) return;
    fixedPt = end === 'to' ? routed.startPoint : routed.endPoint;
    dragging = true;
    handle.classList.add('is-dragging');
    handle.setPointerCapture(e.pointerId);
    workspace.dataset.wiring = 'true';
    draftWire.removeAttribute('hidden');
    draftWire.setAttribute('d', draftCurve(fixedPt, fixedPt));
    // Registering as the active draft lets Escape cancel it, exactly like a wire being drawn.
    app.activeWireDraft = {
      sourceNodeId: end === 'to' ? routed.from : routed.to,
      sourcePort: 'auto',
      startPt: fixedPt,
      hoveredPortBtn: null,
      cancel: () => {
        if (handle.hasPointerCapture(e.pointerId)) handle.releasePointerCapture(e.pointerId);
      },
    };
  });

  handle.addEventListener('pointermove', (e) => {
    if (!dragging || !handle.hasPointerCapture(e.pointerId)) return;
    const [wx, wy] = screenToWorld(e.clientX, e.clientY);
    const hit = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const port = hit?.closest('.node-port') as HTMLElement | null;
    if (hoveredPort && hoveredPort !== port) hoveredPort.classList.remove('is-target-port');
    hoveredPort = port;
    port?.classList.add('is-target-port');
    draftWire.setAttribute('d', end === 'to' ? draftCurve(fixedPt, [wx, wy]) : draftCurve([wx, wy], fixedPt));
  });
  handle.addEventListener('pointerup', (e) => {
    e.stopPropagation();
    finish(true, e);
  });
  // Escape (and any interruption) releases pointer capture, which lands here without a commit.
  handle.addEventListener('lostpointercapture', () => finish(false));
  return handle;
}

function createWireGroup(edgeId: string): SVGGElement {
  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('class', 'conduit-group');
  g.dataset.edgeId = edgeId;
  g.setAttribute('tabindex', '0');
  g.setAttribute('role', 'button');

  const isToggleWireEvent = (e: MouseEvent | PointerEvent) => {
    return (
      e.shiftKey ||
      e.metaKey ||
      e.ctrlKey ||
      (app.selectionUnselectMode && (app.selection.type === 'multi' || app.selection.type === 'node'))
    );
  };

  const selectWire = (e: Event) => {
    e.stopPropagation();
    const id = g.dataset.edgeId || '';
    if (app.workspaceMode === 'design') {
      if (
        app.selection.type !== 'edge' ||
        app.selection.id !== id ||
        propPanelHeading.textContent !== 'Wire properties'
      ) {
        applySelection({ type: 'edge', id }, { expectedHeading: 'Wire properties' });
        renderWiresOnly();
      }
    } else {
      applySelection({ type: 'node', id: g.dataset.to || '' }, { refreshIfUnchanged: true });
    }
  };

  // Double-click a wire to edit its label where you clicked. (The waypoint handle's own double-click, which
  // resets the bend, stops propagation, so it never reaches here.)
  g.addEventListener('dblclick', (e) => {
    if (app.workspaceMode !== 'design') return;
    e.stopPropagation();
    renameWireInline(g.dataset.edgeId || '', { x: e.clientX, y: e.clientY });
  });

  g.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (e.shiftKey) {
        toggleSelectedEdge(edgeId);
        return;
      }
      selectWire(e);
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && app.workspaceMode === 'design') {
      e.preventDefault();
      e.stopPropagation();
      setSelection({ type: 'edge', id: g.dataset.edgeId || '' });
      deleteSelected();
    }
  });

  const hit = document.createElementNS(SVG_NS, 'path');
  hit.setAttribute('class', 'conduit-hit');
  hit.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    if (isToggleWireEvent(e)) {
      e.stopPropagation();
      toggleSelectedEdge(edgeId);
      return;
    }
    selectWire(e);
  });
  hit.addEventListener('pointerup', (e) => e.stopPropagation());
  hit.addEventListener('click', (e) => {
    if (isToggleWireEvent(e as MouseEvent)) {
      e.stopPropagation();
      return;
    }
    selectWire(e);
  });

  const glow = document.createElementNS(SVG_NS, 'path');
  glow.setAttribute('class', 'conduit-glow');
  const rail = document.createElementNS(SVG_NS, 'path');
  rail.setAttribute('class', 'conduit-rail');
  const stream = document.createElementNS(SVG_NS, 'path');
  stream.setAttribute('class', 'conduit-stream');
  const streamRev = document.createElementNS(SVG_NS, 'path');
  streamRev.setAttribute('class', 'conduit-stream-reverse');
  const portDot = document.createElementNS(SVG_NS, 'circle');
  portDot.setAttribute('class', 'port-dot');
  portDot.setAttribute('r', '4');
  g.append(hit, glow, rail, stream, streamRev, portDot);

  const ensureBadge = (edge: RoutedDiagramEdge) => {
    let badge = g.querySelector<SVGGElement>('.conduit-badge-hit');
    if (!edge.label || !edge.badgePos || !edge.badgeWidth) {
      badge?.remove();
      return;
    }
    if (!badge) {
      badge = document.createElementNS(SVG_NS, 'g');
      badge.setAttribute('class', 'conduit-badge-hit');
      const rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('class', 'route-pill-bg');
      rect.setAttribute('y', '-13');
      rect.setAttribute('height', '26');
      rect.setAttribute('rx', '13');
      const txt = document.createElementNS(SVG_NS, 'text');
      txt.setAttribute('class', 'route-pill-text');
      txt.setAttribute('text-anchor', 'middle');
      txt.setAttribute('y', '4');
      badge.append(rect, txt);
      badge.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        if (isToggleWireEvent(e)) {
          e.stopPropagation();
          toggleSelectedEdge(edgeId);
          return;
        }
        selectWire(e);
      });
      badge.addEventListener('pointerup', (e) => e.stopPropagation());
      badge.addEventListener('click', (e) => {
        if (isToggleWireEvent(e as MouseEvent)) {
          e.stopPropagation();
          return;
        }
        selectWire(e);
      });
      g.appendChild(badge);
    }
    const bw = Math.round(edge.badgeWidth);
    const rect = badge.querySelector('rect');
    rect?.setAttribute('x', String(-Math.round(bw / 2)));
    rect?.setAttribute('width', String(bw));
    const txt = badge.querySelector('text');
    if (txt) txt.textContent = edge.label;
    badge.setAttribute('transform', `translate(${edge.badgePos[0]}, ${edge.badgePos[1]})`);
  };

  const ensureComment = (edge: RoutedDiagramEdge) => {
    let commentG = g.querySelector<SVGGElement>('.conduit-comment-badge');
    if (!edge.comment) {
      commentG?.remove();
      return;
    }
    if (!commentG) {
      commentG = document.createElementNS(SVG_NS, 'g');
      commentG.setAttribute('class', 'conduit-comment-badge');
      const circ = document.createElementNS(SVG_NS, 'circle');
      circ.setAttribute('r', '7.5');
      circ.setAttribute('class', 'conduit-comment-bg');
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', 'M -3.5 -2.5 h 7 v 5 h -4.5 l -2.5 2 z');
      path.setAttribute('class', 'conduit-comment-icon');
      commentG.append(circ, path);
      g.appendChild(commentG);
    }
    const pos = edge.badgePos || [
      Math.round((edge.startPoint[0] + edge.endPoint[0]) / 2),
      Math.round((edge.startPoint[1] + edge.endPoint[1]) / 2),
    ];
    const offset = edge.badgeWidth ? Math.round(edge.badgeWidth / 2) + 12 : 0;
    commentG.setAttribute('transform', `translate(${pos[0] + offset}, ${pos[1] - 8})`);
    commentG.setAttribute('data-tip', edge.comment.length > 70 ? `${edge.comment.slice(0, 67)}…` : edge.comment);
    commentG.setAttribute('aria-label', `Review comment: ${edge.comment}`);
  };

  const ensureWaypoint = (edge: RoutedDiagramEdge) => {
    const selected = app.workspaceMode === 'design' && app.selection.type === 'edge' && app.selection.id === edge.id;
    let handle = g.querySelector<SVGCircleElement>('.conduit-waypoint-handle');
    if (!selected) {
      handle?.remove();
      return;
    }
    if (!handle) {
      handle = document.createElementNS(SVG_NS, 'circle');
      handle.setAttribute('class', 'conduit-waypoint-handle');
      handle.setAttribute('r', '5.5');
      handle.setAttribute('aria-label', 'Drag to bend wire path, double-click to reset');
      let wpDragging = false;
      handle.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        beginHistoryGesture();
        wpDragging = true;
        handle?.classList.add('is-dragging');
        handle?.setPointerCapture(e.pointerId);
      });
      handle.addEventListener('pointermove', (e) => {
        if (!wpDragging || !handle?.hasPointerCapture(e.pointerId)) return;
        const [wx, wy] = screenToWorld(e.clientX, e.clientY);
        const targetEdge = app.doc.edges.find((ed) => ed.id === g.dataset.edgeId);
        if (!targetEdge) return;
        pushHistory();
        targetEdge.waypoint = [
          app.snapToGrid ? Math.round(wx / 8) * 8 : wx,
          app.snapToGrid ? Math.round(wy / 8) * 8 : wy,
        ];
        renderWiresOnly();
      });
      const stopWpDrag = (e: PointerEvent) => {
        e.stopPropagation();
        if (!wpDragging) return;
        wpDragging = false;
        handle?.classList.remove('is-dragging');
        endHistoryGesture();
        renderPropertyEditor();
      };
      handle.addEventListener('pointerup', stopWpDrag);
      handle.addEventListener('lostpointercapture', () => {
        if (!wpDragging) return;
        wpDragging = false;
        handle?.classList.remove('is-dragging');
        endHistoryGesture();
      });
      handle.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        const targetEdge = app.doc.edges.find((ed) => ed.id === g.dataset.edgeId);
        if (!targetEdge?.waypoint) return;
        pushHistory();
        delete targetEdge.waypoint;
        renderWiresOnly();
        renderPropertyEditor();
      });
      g.appendChild(handle);
    }
    const wpPos = edge.waypoint ?? edge.badgePos ?? [
      Math.round((edge.startPoint[0] + edge.endPoint[0]) / 2),
      Math.round((edge.startPoint[1] + edge.endPoint[1]) / 2),
    ];
    handle.setAttribute('cx', String(wpPos[0]));
    handle.setAttribute('cy', String(wpPos[1]));
  };

  const ensureEndpoints = (edge: RoutedDiagramEdge) => {
    const selected = app.workspaceMode === 'design' && app.selection.type === 'edge' && app.selection.id === edge.id;
    if (!selected) return; // handles of unselected wires are removed by pruneEndpointHandles()
    const laneTx =
      edge.laneOffset && (edge.laneOffset[0] !== 0 || edge.laneOffset[1] !== 0)
        ? `translate(${edge.laneOffset[0]}, ${edge.laneOffset[1]})`
        : null;
    for (const end of ['from', 'to'] as const) {
      let handle = Array.from(wireHandlesSvg.querySelectorAll<SVGCircleElement>('.conduit-endpoint-handle')).find(
        (h) => h.dataset.edgeId === edge.id && h.dataset.end === end,
      );
      if (!handle) {
        handle = createEndpointHandle(edge.id, end);
        wireHandlesSvg.appendChild(handle);
      }
      const pt = end === 'from' ? edge.startPoint : edge.endPoint;
      handle.setAttribute('cx', String(pt[0]));
      handle.setAttribute('cy', String(pt[1]));
      if (laneTx) handle.setAttribute('transform', laneTx);
      else handle.removeAttribute('transform');
    }
  };

  wirePainters.set(g, (edge) => {
    const titles = new Map(app.doc.nodes.map((n) => [n.id, n.title]));
    const fromName = titles.get(edge.from) || edge.from;
    const toName = titles.get(edge.to) || edge.to;
    g.dataset.tone = edge.tone;
    g.dataset.from = edge.from;
    g.dataset.to = edge.to;
    g.dataset.animated = edge.animated ? 'true' : 'false';
    g.dataset.sync = edge.sync === 'async' ? 'async' : 'sync';
    // A slower call makes the dashes flow more slowly (and a faster one more quickly), from the latency.
    g.style.setProperty('--flow-scale', String(flowScale(edge.latencyMs)));
    // With a tag filter on, a wire stays bright when it has the tag or both of the components it joins do.
    const byId = new Map(app.doc.nodes.map((n) => [n.id, n]));
    const endsMatch = [byId.get(edge.from), byId.get(edge.to)].every((n) => n && matchesTag(n, app.tagFilter));
    g.classList.toggle('is-tag-dimmed', !(matchesTag(edge, app.tagFilter) || endsMatch));
    const cut = chaosLensActive() && [edge.from, edge.to].some((id) => chaosStatusOf(id) === 'failed');
    g.classList.toggle('is-chaos-cut', cut);
    const wireLevel = worstLevel(insightsFor('edge', edge.id));
    if (wireLevel) g.dataset.insight = wireLevel;
    else delete g.dataset.insight;
    g.dataset.flow = edge.flow || 'forward';
    g.classList.toggle('is-selected', app.selection.type === 'edge' && app.selection.id === edge.id);
    const flowText = edge.flow === 'both' ? 'bidirectional' : `from ${fromName} to ${toName}`;
    g.setAttribute(
      'aria-label',
      `Wire ${flowText}${edge.label ? `, ${edge.label}` : ''}, ${edge.route} routing`,
    );
    const laneTx =
      edge.laneOffset && (edge.laneOffset[0] !== 0 || edge.laneOffset[1] !== 0)
        ? `translate(${edge.laneOffset[0]}, ${edge.laneOffset[1]})`
        : null;
    for (const path of g.querySelectorAll<SVGPathElement>('.conduit-hit, .conduit-glow, .conduit-rail, .conduit-stream, .conduit-stream-reverse')) {
      path.setAttribute('d', edge.pathD);
      if (laneTx) path.setAttribute('transform', laneTx);
      else path.removeAttribute('transform');
    }
    const stream = g.querySelector('.conduit-stream');
    if (edge.flow === 'both') {
      stream?.removeAttribute('marker-end');
    } else {
      stream?.setAttribute('marker-end', `url(#arrow-${edge.tone})`);
    }
    const dot = g.querySelector('.port-dot');
    dot?.setAttribute('cx', String(edge.startPoint[0]));
    dot?.setAttribute('cy', String(edge.startPoint[1]));
    if (laneTx) dot?.setAttribute('transform', laneTx);
    else dot?.removeAttribute('transform');
    ensureBadge(edge);
    ensureComment(edge);
    ensureWaypoint(edge);
    ensureEndpoints(edge);
  });

  return g;
}

function paintWire(g: SVGGElement, edge: RoutedDiagramEdge): void {
  wirePainters.get(g)?.(edge);
}

export function renderNodes(): void {
  reconcileKeyed(
    nodesLayer,
    app.doc.nodes,
    (node) => node.id,
    (el) => (el as HTMLElement).dataset.node,
    (node) => node.kind,
    createNodeElement,
    (el, node) => paintNode(el as HTMLElement, node),
  );
  scheduleMinimapPaint();
}

function createNodeElement(node: DiagramNode): HTMLElement {
  const nodeId = node.id;
  const wrapper = document.createElement('div');
  wrapper.id = 'node-' + nodeId;
  wrapper.className = 'arch-node';
  wrapper.dataset.node = nodeId;
  wrapper.dataset.nodeId = nodeId;
  wrapper.dataset.kind = node.kind;

  const selectBtn = document.createElement('button');
  selectBtn.type = 'button';
  selectBtn.className = 'node-select-hit';

  if (node.kind === 'actor') {
    const fig = document.createElement('span');
    fig.className = 'actor-figure';
    fig.appendChild(createHumanOutlineSvg(false));
    const cap = document.createElement('span');
    cap.className = 'actor-caption';
    const tSpan = document.createElement('span');
    tSpan.className = 'node-title';
    cap.appendChild(tSpan);
    selectBtn.append(fig, cap);
  } else if (node.kind === 'client') {
    const top = document.createElement('div');
    top.className = 'node-top';
    const iconBox = document.createElement('span');
    iconBox.className = 'node-icon';
    const chip = document.createElement('span');
    chip.className = 'micro-chip';
    top.append(iconBox, chip);
    const mid = document.createElement('div');
    const titleSpan = document.createElement('span');
    titleSpan.className = 'node-title';
    const subSpan = document.createElement('span');
    subSpan.className = 'node-sub';
    mid.append(titleSpan, subSpan);
    selectBtn.append(top, mid);
  } else {
    const top = document.createElement('div');
    top.className = 'node-top';
    const iconBox = document.createElement('span');
    iconBox.className = 'node-icon';
    const eyebrow = document.createElement('span');
    eyebrow.className = 'node-eyebrow';
    top.append(iconBox, eyebrow);
    const mid = document.createElement('div');
    const titleSpan = document.createElement('span');
    titleSpan.className = 'node-title';
    const subSpan = document.createElement('span');
    subSpan.className = 'node-sub';
    mid.append(titleSpan, subSpan);
    const footer = document.createElement('div');
    footer.className = 'node-footer';
    const fLeft = document.createElement('span');
    fLeft.className = 'node-footer-label';
    const chip = document.createElement('span');
    chip.className = 'micro-chip';
    footer.append(fLeft, chip);
    selectBtn.append(top, mid, footer);
  }

  const dragHandle = document.createElement('button');
  dragHandle.type = 'button';
  dragHandle.className = 'node-drag-handle';
  dragHandle.textContent = '⋮⋮';

  let lastPointerWasDrag = false;
  const isToggleNodeEvent = (e: MouseEvent | PointerEvent) => {
    return (
      e.shiftKey ||
      e.metaKey ||
      e.ctrlKey ||
      (app.selectionUnselectMode && isSelectedNode(nodeId))
    );
  };

  const attachNodeMove = (triggerEl: HTMLElement, isHandle: boolean) => {
    let startClientX = 0;
    let startClientY = 0;
    let origX = 0;
    let origY = 0;
    let groupStartPositions: Map<string, [number, number]> | null = null;
    let groupZonePositions: Map<string, number> | null = null;
    let groupNotesPositions: Map<string, [number, number]> | null = null;
    let hasMoved = false;

    triggerEl.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const current = liveNode(nodeId);
      if (!current) return;

      if (app.workspaceMode === 'design' && app.pointerTool === 'connect' && !isHandle) {
        beginPortWireDrag(e, current, 'auto', triggerEl);
        return;
      }
      if (app.workspaceMode === 'data') {
        e.stopPropagation();
        return;
      }

      e.stopPropagation();
      lastPointerWasDrag = false;

      if (isToggleNodeEvent(e)) {
        toggleSelectedNode(current.id);
        return;
      }

      if (!isSelectedNode(current.id)) {
        if (current.groupId && !e.altKey) {
          const gNodeIds = app.doc.nodes.filter((n) => n.groupId === current.groupId).map((n) => n.id);
          const gNoteIds = app.doc.notesCards.filter((c) => c.groupId === current.groupId).map((c) => c.id);
          if (gNodeIds.length + gNoteIds.length > 1) {
            applySelection({ type: 'multi', ids: gNodeIds, notesIds: gNoteIds });
          } else {
            applySelection({ type: 'node', id: current.id });
          }
        } else {
          applySelection({ type: 'node', id: current.id });
        }
      } else if (app.selection.type === 'node' && propPanelHeading.textContent !== 'Component properties') {
        requestInspectorRefresh();
      }

      if (current.locked) {
        return;
      }

      startClientX = e.clientX;
      startClientY = e.clientY;
      origX = current.x;
      origY = current.y;
      if (app.selection.type === 'multi' && app.selection.ids.includes(current.id)) {
        const ids = app.selection.ids;
        groupStartPositions = new Map(
          app.doc.nodes.filter((n) => ids.includes(n.id)).map((n) => [n.id, [n.x, n.y] as [number, number]]),
        );
        const zoneIds = app.selection.zoneIds ?? [];
        groupZonePositions = zoneIds.length
          ? new Map(app.doc.zones.filter((zone) => zoneIds.includes(zone.id)).map((zone) => [zone.id, zone.x]))
          : null;
        const notesIds = app.selection.notesIds ?? [];
        groupNotesPositions = notesIds.length
          ? new Map(
              app.doc.notesCards
                .filter((card) => notesIds.includes(card.id))
                .map((card) => [card.id, [card.x, card.y] as [number, number]]),
            )
          : null;
      } else {
        groupStartPositions = null;
        groupZonePositions = null;
        groupNotesPositions = null;
      }
      hasMoved = false;
      triggerEl.setPointerCapture(e.pointerId);
    });

    triggerEl.addEventListener('pointermove', (e) => {
      if (!triggerEl.hasPointerCapture(e.pointerId)) return;
      // In Connect mode this element holds pointer capture for the wire being drawn. Its drag origin was
      // never set, so without this guard the node would jump to the pointer and add a spurious undo step.
      if (app.activeWireDraft) return;
      const current = liveNode(nodeId);
      if (!current) return;
      const dx = (e.clientX - startClientX) / app.scale;
      const dy = (e.clientY - startClientY) / app.scale;

      if (!hasMoved && Math.hypot(dx, dy) > 4) {
        beginHistoryGesture();
        pushHistory();
        hasMoved = true;
        wrapper.classList.add('is-dragging-node');
        if (isHandle) dragHandle.classList.add('dragging');
        if (!isSelectedNode(current.id)) setSelection({ type: 'node', id: current.id });
        updateVisualSelectionHighlights();
      }

      if (!hasMoved) return;
      const groupSize =
        (groupStartPositions?.size ?? 0) + (groupZonePositions?.size ?? 0) + (groupNotesPositions?.size ?? 0);
      if (groupStartPositions && groupSize > 1) {
        const stepDx = app.snapToGrid ? Math.round(dx / 16) * 16 : Math.round(dx);
        const stepDy = app.snapToGrid ? Math.round(dy / 16) * 16 : Math.round(dy);
        for (const [id, [sx, sy]] of groupStartPositions.entries()) {
          const member = liveNode(id);
          if (!member) continue;
          member.x = Math.max(16, sx + stepDx);
          member.y = Math.max(24, sy + stepDy);
          const el = Array.from(nodesLayer.children).find(
            (child): child is HTMLElement =>
              child instanceof HTMLElement && child.dataset.node === id,
          );
          if (el) {
            el.style.setProperty('--nx', String(member.x));
            el.style.setProperty('--ny', String(member.y));
          }
        }
        if (groupZonePositions) {
          for (const [id, sx] of groupZonePositions) {
            const zone = liveZone(id);
            if (!zone) continue;
            zone.x = Math.max(16, sx + stepDx);
            const banner = Array.from(zonesLayer.children).find(
              (child): child is HTMLElement =>
                child instanceof HTMLElement && child.dataset.zoneId === id,
            );
            banner?.style.setProperty('--zx', String(zone.x));
          }
        }
        if (groupNotesPositions) {
          for (const [id, [sx, sy]] of groupNotesPositions) {
            const card = liveNotes(id);
            if (!card) continue;
            card.x = Math.max(16, sx + stepDx);
            card.y = Math.max(16, sy + stepDy);
            const el = Array.from(notesLayer.children).find(
              (child): child is HTMLElement =>
                child instanceof HTMLElement && child.dataset.notesId === id,
            );
            if (el) {
              el.style.setProperty('--bx', String(card.x));
              el.style.setProperty('--by', String(card.y));
            }
          }
        }
      } else {
        const [snappedX, snappedY] = computeSnappedPosition(current, origX + dx, origY + dy, {
          suspend: e.metaKey || e.ctrlKey,
          distances: e.altKey,
        });
        current.x = snappedX;
        current.y = snappedY;
        wrapper.style.setProperty('--nx', String(current.x));
        wrapper.style.setProperty('--ny', String(current.y));
      }
      expandStageToFit(app.doc);
      renderWiresOnly();
      updateVisualSelectionHighlights();
      scheduleMinimapPaint();
    });

    const endMove = () => {
      const movedDuringDrag = hasMoved;
      hasMoved = false;
      groupStartPositions = null;
      groupZonePositions = null;
      groupNotesPositions = null;
      clearGuides();
      wrapper.classList.remove('is-dragging-node');
      dragHandle.classList.remove('dragging');
      if (movedDuringDrag) {
        // A component dropped inside (or pulled out of) a frame joins (or leaves) it.
        if (app.doc.frames?.length) void import('./frameStage').then((m) => m.settleFrames());
        endHistoryGesture();
        renderPropertyEditor();
      }
    };

    triggerEl.addEventListener('pointerup', (e) => {
      e.stopPropagation();
      if (app.blockPointerClick || app.multiPointer) {
        endMove();
        return;
      }
      const wasMoved = hasMoved;
      lastPointerWasDrag = wasMoved;
      endMove();
      const current = liveNode(nodeId);
      if (!current || wasMoved || isToggleNodeEvent(e)) return;
      if (app.workspaceMode === 'design') {
        applySelection({ type: 'node', id: current.id }, { expectedHeading: 'Component properties' });
      } else {
        applySelection({ type: 'node', id: current.id }, { refreshIfUnchanged: true });
      }
    });
    triggerEl.addEventListener('lostpointercapture', endMove);
  };

  attachNodeMove(selectBtn, false);
  attachNodeMove(dragHandle, true);
  selectBtn.addEventListener('dblclick', (e) => {
    if (app.workspaceMode !== 'design' || app.pointerTool !== 'select') return;
    if (e.shiftKey || e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    e.stopPropagation();
    renameNodeInline(nodeId);
  });

  selectBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (app.blockPointerClick) return;
    if (lastPointerWasDrag) {
      lastPointerWasDrag = false;
      return;
    }
    const current = liveNode(nodeId);
    if (!current) return;
    if (isToggleNodeEvent(e)) {
      if (app.workspaceMode === 'data') toggleSelectedNode(current.id);
      return;
    }
    if (app.workspaceMode === 'data') {
      applySelection({ type: 'node', id: current.id }, { refreshIfUnchanged: true });
    } else if (app.pointerTool === 'connect') {
      if (app.connectSourceNodeId && app.connectSourceNodeId !== current.id) {
        createEdgeConnection(app.connectSourceNodeId, current.id, 'auto', 'auto');
      } else {
        app.connectSourceNodeId = current.id;
        applySelection({ type: 'node', id: current.id }, { refreshIfUnchanged: true });
      }
    } else {
      applySelection({ type: 'node', id: current.id }, { expectedHeading: 'Component properties' });
    }
  });

  dragHandle.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 4 : 16;
    let dx = 0;
    let dy = 0;
    if (e.key === 'ArrowLeft') dx = -step;
    else if (e.key === 'ArrowRight') dx = step;
    else if (e.key === 'ArrowUp') dy = -step;
    else if (e.key === 'ArrowDown') dy = step;
    else return;
    const current = liveNode(nodeId);
    if (!current) return;
    e.preventDefault();
    pushHistoryNudge();
    current.x = Math.max(16, current.x + dx);
    current.y = Math.max(24, current.y + dy);
    wrapper.style.setProperty('--nx', String(current.x));
    wrapper.style.setProperty('--ny', String(current.y));
    expandStageToFit(app.doc);
    renderWiresOnly();
    applySelection({ type: 'node', id: current.id }, { refreshIfUnchanged: true });
  });

  wrapper.append(selectBtn, dragHandle);

  const portSides: Array<Exclude<PortSide, 'auto'>> = ['top', 'right', 'bottom', 'left'];
  for (const side of portSides) {
    const portBtn = document.createElement('button');
    portBtn.type = 'button';
    portBtn.className = 'node-port';
    portBtn.dataset.port = side;
    portBtn.dataset.nodeId = nodeId;
    portBtn.addEventListener('pointerdown', (e) => {
      if (app.workspaceMode !== 'design' || e.button !== 0) return;
      const current = liveNode(nodeId);
      if (!current) return;
      beginPortWireDrag(e, current, side, portBtn);
    });
    wrapper.appendChild(portBtn);
  }

  return wrapper;
}

function glyphKey(image: string | undefined, fallback: string): string {
  return image ? `img:${image.length}:${image.slice(-32)}` : fallback;
}

function ensureShapePlate(hit: HTMLElement, plateKind: string): SVGSVGElement {
  let svg = hit.querySelector<SVGSVGElement>('.node-shape-plate');
  if (!svg || svg.dataset.plate !== plateKind) {
    svg?.remove();
    svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'node-shape-plate');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('overflow', 'visible');
    svg.dataset.plate = plateKind;
    hit.prepend(svg);
  }
  return svg;
}

function paintShapePlate(hit: HTMLElement, node: DiagramNode): void {
  hit.style.padding = nodeShapeContentPadding(node.kind, node.shape, node.width, node.height);
  const cylinder = storeDrawsCylinder(node.kind, node.shape)
    ? cylinderPlate(node.width, node.height, storeDrawsBucket(node.kind, node.shape))
    : null;
  const pipe = queueDrawsPipe(node.kind, node.shape) ? pipePlate(node.width, node.height, streamLanes(node)) : null;
  const plate = cylinder || pipe
    ? null
    : nodeShapePlate(drawnShape(node.kind, node.shape), node.width, node.height, app.doc.direction);
  if (!cylinder && !pipe && !plate) {
    hit.querySelector('.node-shape-plate')?.remove();
    return;
  }
  if (pipe) {
    const pipeSvg = ensureShapePlate(hit, 'pipe');
    pipeSvg.setAttribute('viewBox', `0 0 ${pipe.width} ${pipe.height}`);
    let body = pipeSvg.querySelector<SVGPathElement>('.pipe-body');
    let cap = pipeSvg.querySelector<SVGEllipseElement>('.pipe-cap');
    if (!body || !cap) {
      pipeSvg.replaceChildren();
      body = document.createElementNS(SVG_NS, 'path');
      body.setAttribute('class', 'node-shape-geom pipe-body');
      cap = document.createElementNS(SVG_NS, 'ellipse');
      cap.setAttribute('class', 'node-shape-geom pipe-cap');
      pipeSvg.append(body, cap);
    }
    body.setAttribute('d', pipe.body);
    // A stream shows its partitions as thin lanes (K6).
    let lanes = pipeSvg.querySelector<SVGPathElement>('.node-shape-lanes');
    if (pipe.lanes) {
      if (!lanes) {
        lanes = document.createElementNS(SVG_NS, 'path');
        lanes.setAttribute('class', 'node-shape-lanes');
        body.after(lanes);
      }
      lanes.setAttribute('d', pipe.lanes);
    } else {
      lanes?.remove();
    }
    cap.setAttribute('cx', String(pipe.cx));
    cap.setAttribute('cy', String(pipe.cy));
    cap.setAttribute('rx', String(pipe.rx));
    cap.setAttribute('ry', String(pipe.ry));
    return;
  }
  const svg = ensureShapePlate(hit, cylinder ? 'cylinder' : plate!.kind);
  const w = cylinder ? cylinder.width : Math.max(1, Math.round(node.width));
  const h = cylinder ? cylinder.height : Math.max(1, Math.round(node.height));
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  if (cylinder) {
    let body = svg.querySelector<SVGPathElement>('.cylinder-body');
    let lid = svg.querySelector<SVGEllipseElement>('.cylinder-lid');
    if (!body || !lid) {
      svg.replaceChildren();
      body = document.createElementNS(SVG_NS, 'path');
      body.setAttribute('class', 'node-shape-geom cylinder-body');
      lid = document.createElementNS(SVG_NS, 'ellipse');
      lid.setAttribute('class', 'node-shape-geom cylinder-lid');
      svg.append(body, lid);
    }
    body.setAttribute('d', cylinder.body);
    lid.setAttribute('cx', String(cylinder.cx));
    lid.setAttribute('cy', String(cylinder.cy));
    lid.setAttribute('rx', String(cylinder.rx));
    lid.setAttribute('ry', String(cylinder.ry));
    return;
  }
  const tag = plate!.kind === 'ellipse' ? 'ellipse' : 'polygon';
  let geom = svg.querySelector<SVGElement>('.node-shape-geom');
  if (!geom || geom.localName !== tag) {
    geom?.remove();
    geom = document.createElementNS(SVG_NS, tag);
    geom.setAttribute('class', 'node-shape-geom');
    svg.appendChild(geom);
  }
  if (plate!.kind === 'ellipse') {
    geom.setAttribute('cx', String(plate!.cx));
    geom.setAttribute('cy', String(plate!.cy));
    geom.setAttribute('rx', String(plate!.rx));
    geom.setAttribute('ry', String(plate!.ry));
    geom.removeAttribute('points');
  } else {
    geom.setAttribute('points', plate!.points);
  }
}

function paintCustomImage(slot: HTMLElement, image: string): void {
  const img = document.createElement('img');
  img.className = 'node-custom-icon';
  img.alt = '';
  img.src = image;
  slot.replaceChildren(img);
}

/** Last content painted into each node element, so unchanged nodes can skip the text/badge/icon work. */
const paintedNodeContent = new WeakMap<HTMLElement, { sig: string; image: string | undefined }>();

const CHAOS_BADGES: Record<string, string> = {
  failed: 'Failed',
  degraded: 'Degraded',
  unreachable: '⛓ Unreachable',
  rerouted: '↪ Rerouted',
  'at-risk': '⚠ Potential disruption',
  buffering: '⏸ Buffering',
  delayed: '⏳ Delayed',
  slowed: '🐢 Slowed',
  bypassed: '↷ Bypassed',
};

/** Failure state from a chaos run (F-01): a data attribute for the styles and a small badge for the words. */
function paintChaos(wrapper: HTMLElement, nodeId: string): void {
  const status = chaosLensActive() ? chaosStatusOf(nodeId) : null;
  const before = wrapper.dataset.chaos;
  if (status) wrapper.dataset.chaos = status;
  else delete wrapper.dataset.chaos;
  if (status && isPreview()) wrapper.dataset.chaosPreview = 'true';
  else delete wrapper.dataset.chaosPreview;
  let badge = wrapper.querySelector<HTMLElement>(':scope > .chaos-badge');
  if (!status) {
    badge?.remove();
    return;
  }
  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'chaos-badge';
    wrapper.appendChild(badge);
  }
  if (before !== status) badge.textContent = CHAOS_BADGES[status];
}

/** Review lens only (F-02): a small badge with the number of issues on this component, coloured by the worst. */
function paintInsights(wrapper: HTMLElement, nodeId: string): void {
  const issues = insightsFor('node', nodeId);
  const level = worstLevel(issues);
  let badge = wrapper.querySelector<HTMLElement>(':scope > .insight-badge');
  if (!level) {
    delete wrapper.dataset.insight;
    badge?.remove();
    return;
  }
  wrapper.dataset.insight = level;
  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'insight-badge';
    badge.setAttribute('aria-hidden', 'true');
    wrapper.appendChild(badge);
  }
  badge.textContent = `⚠ ${issues.length}`;
}

function paintNode(wrapper: HTMLElement, node: DiagramNode): void {
  wrapper.id = 'node-' + node.id;
  wrapper.dataset.node = node.id;
  wrapper.dataset.nodeId = node.id;
  wrapper.dataset.kind = node.kind;
  wrapper.dataset.accent = effectiveTone(app.doc, node, app.colourBy);
  wrapper.classList.toggle('is-tag-dimmed', !matchesTag(node, app.tagFilter));
  paintChaos(wrapper, node.id);
  paintInsights(wrapper, node.id);
  paintBacklog(wrapper, node);
  if (node.external) wrapper.dataset.external = 'true';
  else delete wrapper.dataset.external;
  if (storeDrawsCylinder(node.kind, node.shape)) {
    wrapper.dataset.shape = 'cylinder';
    if (storeDrawsBucket(node.kind, node.shape)) wrapper.dataset.bucket = 'true';
    else delete wrapper.dataset.bucket;
  }
  else if (queueDrawsPipe(node.kind, node.shape)) wrapper.dataset.shape = 'pipe';
  else if (balancerDrawsTrapezoid(node.kind, node.shape)) wrapper.dataset.shape = 'trapezoid';
  else if (node.shape && node.shape !== 'card') wrapper.dataset.shape = node.shape;
  else delete wrapper.dataset.shape;
  wrapper.style.setProperty('--nx', String(node.x));
  wrapper.style.setProperty('--ny', String(node.y));
  wrapper.style.setProperty('--nw', String(node.width));
  wrapper.style.setProperty('--nh', String(node.height));
  const hit = wrapper.querySelector<HTMLElement>('.node-select-hit');
  if (hit) paintShapePlate(hit, node);

  const isLocked = Boolean(node.locked);
  wrapper.dataset.locked = String(isLocked);

  // Everything above is geometry and always re-applied, so a cancelled drag or resize is restored.
  // The text, badges and icon below are only ever written here, so skip them when nothing changed;
  // replacing text nodes dirties layout for every node on every render.
  const contentSig = JSON.stringify([
    node.kind,
    node.locked,
    node.status,
    node.comment,
    node.title,
    node.subtitle,
    node.chip,
    node.icon,
    node.eyebrow,
    node.footerLeft,
    node.queue,
    node.balancer,
    node.cache,
    node.limiter,
    node.schedule,
  ]);
  const painted = paintedNodeContent.get(wrapper);
  if (painted && painted.sig === contentSig && painted.image === node.iconImage) return;
  paintedNodeContent.set(wrapper, { sig: contentSig, image: node.iconImage });
  let lockBadge = wrapper.querySelector<HTMLElement>('.node-lock-badge');
  if (isLocked) {
    if (!lockBadge) {
      lockBadge = document.createElement('span');
      lockBadge.className = 'node-lock-badge';
      lockBadge.setAttribute('aria-label', 'Locked component');
      lockBadge.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
      wrapper.appendChild(lockBadge);
    }
  } else {
    lockBadge?.remove();
  }

  // Status badge
  let statusBadge = wrapper.querySelector<HTMLElement>('.node-status-badge');
  if (node.status) {
    wrapper.dataset.status = node.status;
    if (!statusBadge) {
      statusBadge = document.createElement('span');
      statusBadge.className = 'node-status-badge';
      wrapper.appendChild(statusBadge);
    }
    statusBadge.dataset.status = node.status;
    const label = node.status === 'at-risk' ? 'At Risk' : node.status.charAt(0).toUpperCase() + node.status.slice(1);
    statusBadge.setAttribute('data-tip', `Status: ${label}`);
    statusBadge.setAttribute('aria-label', `Component status: ${label}`);
    statusBadge.innerHTML = `<span class="status-dot"></span><span class="status-text">${label}</span>`;
  } else {
    delete wrapper.dataset.status;
    statusBadge?.remove();
  }

  // Level badge (F-03): opens the component as a nested level. Always shown once it has one.
  let levelBadge = wrapper.querySelector<HTMLButtonElement>('.node-level-badge');
  if (!levelBadge) {
    levelBadge = document.createElement('button');
    levelBadge.type = 'button';
    levelBadge.className = 'node-level-badge';
    levelBadge.addEventListener('pointerdown', (e) => e.stopPropagation());
    levelBadge.addEventListener('click', (e) => {
      e.stopPropagation();
      openComponentLevel(wrapper.dataset.node || wrapper.dataset.nodeId || '');
    });
    wrapper.appendChild(levelBadge);
  }
  const innerCount = node.child ? node.child.nodes.length : 0;
  levelBadge.textContent = node.child ? `⤵ ${innerCount}` : '⤵';
  levelBadge.dataset.hasChild = node.child ? 'true' : 'false';
  levelBadge.setAttribute('data-tip', node.child ? `Open level (${innerCount} inside) · ⌘↵` : 'Open as a level · ⌘↵');
  // The visible count is part of the name, so speech input ("click 4") and screen readers agree with the screen.
  levelBadge.setAttribute('aria-label', node.child ? `Open ${node.title} as a level, ${innerCount} inside` : `Open ${node.title} as a level`);

  // Comment badge
  let commentBadge = wrapper.querySelector<HTMLElement>('.node-comment-badge');
  if (node.comment) {
    if (!commentBadge) {
      commentBadge = document.createElement('span');
      commentBadge.className = 'node-comment-badge';
      // A plain span may not carry a label; as an image it can, and screen readers read the comment.
      commentBadge.setAttribute('role', 'img');
      commentBadge.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
      wrapper.appendChild(commentBadge);
    }
    commentBadge.setAttribute('data-tip', node.comment.length > 70 ? `${node.comment.slice(0, 67)}…` : node.comment);
    commentBadge.setAttribute('aria-label', `Review comment: ${node.comment}`);
  } else {
    commentBadge?.remove();
  }

  const title = wrapper.querySelector('.node-title');
  if (title) title.textContent = node.title;
  const dragHandle = wrapper.querySelector('.node-drag-handle');
  dragHandle?.setAttribute('aria-label', `Move ${node.title} with arrow keys or drag`);
  for (const port of wrapper.querySelectorAll<HTMLElement>('.node-port')) {
    port.setAttribute('aria-label', `Connect from ${node.title} ${port.dataset.port} port`);
  }

  const customIcon = sanitizeIconImage(node.iconImage);

  if (node.kind === 'actor') {
    const cap = wrapper.querySelector('.actor-caption');
    let role = cap?.querySelector('.actor-role');
    if (node.subtitle) {
      if (!role && cap) {
        role = document.createElement('span');
        role.className = 'actor-role';
        cap.appendChild(role);
      }
      if (role) role.textContent = node.subtitle;
    } else {
      role?.remove();
    }
    const figure = wrapper.querySelector<HTMLElement>('.actor-figure');
    if (figure) {
      const key = glyphKey(customIcon, 'outline');
      if (figure.dataset.glyph !== key) {
        figure.dataset.glyph = key;
        if (customIcon) paintCustomImage(figure, customIcon);
        else figure.replaceChildren(createHumanOutlineSvg(false));
      }
    }
    return;
  }

  const sub = wrapper.querySelector('.node-sub');
  if (sub) sub.textContent = node.subtitle;
  const chip = wrapper.querySelector('.micro-chip');
  const cardText = queueCardText(node);
  if (chip) chip.textContent = cardText.chip;
  const iconBox = wrapper.querySelector<HTMLElement>('.node-icon');
  if (iconBox) {
    const key = glyphKey(customIcon, node.icon);
    if (iconBox.dataset.icon !== key) {
      iconBox.dataset.icon = key;
      if (customIcon) paintCustomImage(iconBox, customIcon);
      else iconBox.replaceChildren(createNodeIconSvg(node.icon, node.kind === 'client' ? 16 : 19));
    }
  }
  if (node.kind !== 'client') {
    const eyebrow = wrapper.querySelector('.node-eyebrow');
    if (eyebrow) eyebrow.textContent = node.eyebrow;
    const footer = wrapper.querySelector('.node-footer-label');
    if (footer) footer.textContent = cardText.footer;
  }
}

/** How close, in screen pixels, an edge or centre must be to another component's before it snaps. */
const SNAP_SCREEN_PX = 6;

/**
 * Where a dragged component lands: snapped to the other components' edges and centres (and to equal spacing), else to
 * the grid. Holding Cmd or Ctrl suspends snapping; holding Alt shows the distance to the nearest neighbours.
 */
function computeSnappedPosition(
  movingNode: DiagramNode,
  rawX: number,
  rawY: number,
  modifiers: { suspend: boolean; distances: boolean },
): [number, number] {
  const nextX = Math.max(16, rawX);
  const nextY = Math.max(24, rawY);
  const grid = (v: number) => (app.snapToGrid ? Math.round(v / 16) * 16 : Math.round(v));
  if (modifiers.suspend) {
    clearGuides();
    return [grid(nextX), grid(nextY)];
  }
  const others = app.doc.nodes.filter((n) => n.id !== movingNode.id);
  const rect = { x: nextX, y: nextY, width: movingNode.width, height: movingNode.height };
  const result = snapToGuides(rect, others, SNAP_SCREEN_PX / app.scale);
  const x = result.snappedX ? Math.round(result.x) : grid(nextX);
  const y = result.snappedY ? Math.round(result.y) : grid(nextY);
  paintGuides(result, modifiers.distances ? distancesTo({ ...rect, x, y }, others) : []);
  return [x, y];
}

export function updateVisualSelectionHighlights(): void {
  paintDlqLinks();
  const nodeWrappers = Array.from(nodesLayer.querySelectorAll<HTMLElement>('.arch-node'));
  const conduitGroups = Array.from(wiresGroup.querySelectorAll<SVGGElement>('.conduit-group'));
  const zoneBanners = Array.from(zonesLayer.querySelectorAll<HTMLElement>('.zone-banner'));
  const notesCards = Array.from(notesLayer.querySelectorAll<HTMLElement>('.blueprint-spec'));

  for (const fb of framesLayer.querySelectorAll<HTMLElement>('.frame-box')) {
    fb.classList.toggle('is-selected', app.selection.type === 'frame' && fb.dataset.frameId === app.selection.id);
  }
  for (const zb of zoneBanners) {
    const zoneSelected =
      (app.selection.type === 'zone' && zb.dataset.zoneId === app.selection.id) ||
      (app.selection.type === 'multi' && (app.selection.zoneIds ?? []).includes(zb.dataset.zoneId || ''));
    zb.classList.toggle('is-selected', zoneSelected);
  }
  for (const nc of notesCards) {
    const notesSelected =
      (app.selection.type === 'notes' && nc.dataset.notesId === app.selection.id) ||
      (app.selection.type === 'multi' && (app.selection.notesIds ?? []).includes(nc.dataset.notesId || ''));
    nc.classList.toggle('is-selected', notesSelected);
  }

  const selectedIds = getSelectedNodeIds();
  const multiEdges = app.selection.type === 'multi' ? (app.selection.edgeIds ?? []) : [];
  const excludedEdges =
    app.selection.type === 'multi' ? new Set(app.selection.excludedEdgeIds ?? []) : new Set<string>();
  const hasEdges = multiEdges.length > 0;
  const spotlight =
    (selectedIds.length > 0 || hasEdges) &&
    (app.workspaceMode === 'data' || selectedIds.length > 1 || hasEdges || excludedEdges.size > 0);
  if (spotlight) {
    const selected = new Set(selectedIds);
    const related = relatedNodeIds(app.doc, selectedIds);
    for (const w of nodeWrappers) {
      const id = w.dataset.node || '';
      const hit = w.querySelector('.node-select-hit');
      const isSelected = selected.has(id);
      hit?.setAttribute('aria-pressed', String(isSelected));
      w.classList.toggle('is-related', related.has(id) && !isSelected);
      w.classList.toggle('is-dimmed', !related.has(id));
    }
    for (const g of conduitGroups) {
      const edgeId = g.dataset.edgeId || '';
      const fromId = g.dataset.from || '';
      const toId = g.dataset.to || '';
      const touches = selected.has(fromId) || selected.has(toId);
      const isExplicit = multiEdges.includes(edgeId);
      const isExcluded = excludedEdges.has(edgeId);
      const active = (touches || isExplicit) && !isExcluded;
      g.classList.toggle('is-highlighted', active);
      g.classList.toggle('is-dimmed', !active);
      g.classList.toggle('is-selected', isExplicit && !isExcluded);
    }
    return;
  }

  for (const w of nodeWrappers) {
    const id = w.dataset.node || '';
    const hit = w.querySelector('.node-select-hit');
    hit?.setAttribute('aria-pressed', String(isSelectedNode(id)));
    w.classList.remove('is-dimmed', 'is-related');
  }
  for (const g of conduitGroups) {
    const isSel = app.selection.type === 'edge' && g.dataset.edgeId === app.selection.id;
    const fromId = g.dataset.from || '';
    const toId = g.dataset.to || '';
    const touchesNode = isSelectedNode(fromId) || isSelectedNode(toId);
    g.classList.toggle('is-selected', isSel);
    g.classList.toggle('is-highlighted', touchesNode || isSel);
    g.classList.remove('is-dimmed');
  }
}
