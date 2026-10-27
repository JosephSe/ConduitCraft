/** Keyed stage rendering. Existing elements are updated in place; listeners stay bound. */
import type { DiagramNode, DiagramNotesCard, DiagramZone, PortSide, RoutedDiagramEdge } from '../types';
import { expandStageToFit, getAdjacencyLists, routeDiagramEdges } from '../core/layout';
import { createHumanOutlineSvg, createNodeIconSvg } from '../ui/icons';
import {
  SVG_NS,
  alignGuideX,
  alignGuideY,
  nodesLayer,
  notesLayer,
  propPanelHeading,
  wiresGroup,
  zonesLayer,
} from './dom';
import {
  app,
  getSelectedNodeIds,
  isSelectedNode,
  pushHistory,
  screenToWorld,
  setSelection,
} from './state';
import { renderPropertyEditor } from './inspector';
import { applySelection, requestInspectorRefresh } from './render';
import { beginPortWireDrag, createEdgeConnection, deleteSelected } from './interactions';
import { reconcileKeyed } from './reconcile';

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
    applySelection({ type: 'zone', id: current.id }, { refreshIfUnchanged: true });
    dragStartX = e.clientX;
    origX = current.x;
    moved = false;
    banner.setPointerCapture(e.pointerId);
  });
  banner.addEventListener('pointermove', (e) => {
    if (!banner.hasPointerCapture(e.pointerId)) return;
    const current = liveZone(banner.dataset.zoneId || '');
    if (!current) return;
    const dx = (e.clientX - dragStartX) / app.scale;
    if (!moved && Math.abs(dx) > 3) {
      pushHistory();
      moved = true;
      banner.classList.add('dragging');
    }
    if (moved) {
      const rawX = Math.max(16, origX + dx);
      current.x = app.snapToGrid ? Math.round(rawX / 16) * 16 : Math.round(rawX);
      banner.style.setProperty('--zx', String(current.x));
      expandStageToFit(app.doc);
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

  let resizeStartX = 0;
  let origW = zone.width;
  let resized = false;
  resizeHandle.addEventListener('pointerdown', (e) => {
    if (app.workspaceMode !== 'design' || e.button !== 0) return;
    const current = liveZone(banner.dataset.zoneId || '');
    if (!current) return;
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
      pushHistory();
      resized = true;
    }
    if (resized) {
      const rawW = Math.max(160, origW + dw);
      current.width = app.snapToGrid ? Math.round(rawW / 16) * 16 : Math.round(rawW);
      banner.style.setProperty('--zw', String(current.width));
      expandStageToFit(app.doc);
    }
  });
  resizeHandle.addEventListener('pointerup', (e) => {
    e.stopPropagation();
    if (resized) {
      resized = false;
      renderPropertyEditor();
    }
  });

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

  aside.addEventListener('pointerdown', (e) => {
    if (app.workspaceMode !== 'design' || e.button !== 0) return;
    const current = liveNotes(aside.dataset.notesId || '');
    if (!current) return;
    e.stopPropagation();
    applySelection({ type: 'notes', id: current.id });
  });
  aside.addEventListener('pointerup', (e) => {
    if (app.workspaceMode === 'design') e.stopPropagation();
  });
  aside.addEventListener('click', (e) => {
    if (app.workspaceMode !== 'design') return;
    const current = liveNotes(aside.dataset.notesId || '');
    if (!current) return;
    e.stopPropagation();
    applySelection({ type: 'notes', id: current.id }, { expectedHeading: 'NOTES / SPEC CARD' });
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
    applySelection({ type: 'notes', id: current.id });
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

  return aside;
}

function paintNotesCard(aside: HTMLElement, card: DiagramNotesCard): void {
  aside.style.setProperty('--bx', String(card.x));
  aside.style.setProperty('--by', String(card.y));
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
}

const wirePainters = new WeakMap<SVGGElement, (edge: RoutedDiagramEdge) => void>();

function createWireGroup(edgeId: string): SVGGElement {
  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('class', 'conduit-group');
  g.dataset.edgeId = edgeId;
  g.setAttribute('tabindex', '0');
  g.setAttribute('role', 'button');

  const selectWire = (e: Event) => {
    e.stopPropagation();
    const id = g.dataset.edgeId || '';
    if (app.workspaceMode === 'design') {
      if (
        app.selection.type !== 'edge' ||
        app.selection.id !== id ||
        propPanelHeading.textContent !== 'STREAM WIRE PROPERTIES'
      ) {
        applySelection({ type: 'edge', id }, { expectedHeading: 'STREAM WIRE PROPERTIES' });
        renderWiresOnly();
      }
    } else {
      applySelection({ type: 'node', id: g.dataset.to || '' }, { refreshIfUnchanged: true });
    }
  };

  g.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
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
    selectWire(e);
  });
  hit.addEventListener('pointerup', (e) => e.stopPropagation());
  hit.addEventListener('click', selectWire);

  const glow = document.createElementNS(SVG_NS, 'path');
  glow.setAttribute('class', 'conduit-glow');
  const rail = document.createElementNS(SVG_NS, 'path');
  rail.setAttribute('class', 'conduit-rail');
  const stream = document.createElementNS(SVG_NS, 'path');
  stream.setAttribute('class', 'conduit-stream');
  const portDot = document.createElementNS(SVG_NS, 'circle');
  portDot.setAttribute('class', 'port-dot');
  portDot.setAttribute('r', '4');
  g.append(hit, glow, rail, stream, portDot);

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
        selectWire(e);
      });
      badge.addEventListener('pointerup', (e) => e.stopPropagation());
      badge.addEventListener('click', selectWire);
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
        pushHistory();
        wpDragging = true;
        handle?.classList.add('is-dragging');
        handle?.setPointerCapture(e.pointerId);
      });
      handle.addEventListener('pointermove', (e) => {
        if (!wpDragging || !handle?.hasPointerCapture(e.pointerId)) return;
        const [wx, wy] = screenToWorld(e.clientX, e.clientY);
        const targetEdge = app.doc.edges.find((ed) => ed.id === g.dataset.edgeId);
        if (!targetEdge) return;
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
        renderPropertyEditor();
      };
      handle.addEventListener('pointerup', stopWpDrag);
      handle.addEventListener('lostpointercapture', () => {
        wpDragging = false;
        handle?.classList.remove('is-dragging');
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

  wirePainters.set(g, (edge) => {
    const titles = new Map(app.doc.nodes.map((n) => [n.id, n.title]));
    const fromName = titles.get(edge.from) || edge.from;
    const toName = titles.get(edge.to) || edge.to;
    g.dataset.tone = edge.tone;
    g.dataset.from = edge.from;
    g.dataset.to = edge.to;
    g.dataset.animated = edge.animated ? 'true' : 'false';
    g.classList.toggle('is-selected', app.selection.type === 'edge' && app.selection.id === edge.id);
    g.setAttribute(
      'aria-label',
      `Stream wire from ${fromName} to ${toName}${edge.label ? `, ${edge.label}` : ''}, ${edge.route} routing`,
    );
    const laneTx =
      edge.laneOffset && (edge.laneOffset[0] !== 0 || edge.laneOffset[1] !== 0)
        ? `translate(${edge.laneOffset[0]}, ${edge.laneOffset[1]})`
        : null;
    for (const path of g.querySelectorAll<SVGPathElement>('.conduit-hit, .conduit-glow, .conduit-rail, .conduit-stream')) {
      path.setAttribute('d', edge.pathD);
      if (laneTx) path.setAttribute('transform', laneTx);
      else path.removeAttribute('transform');
    }
    const stream = g.querySelector('.conduit-stream');
    stream?.setAttribute('marker-end', `url(#arrow-${edge.tone})`);
    const dot = g.querySelector('.port-dot');
    dot?.setAttribute('cx', String(edge.startPoint[0]));
    dot?.setAttribute('cy', String(edge.startPoint[1]));
    if (laneTx) dot?.setAttribute('transform', laneTx);
    else dot?.removeAttribute('transform');
    ensureBadge(edge);
    ensureWaypoint(edge);
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
}

function createNodeElement(node: DiagramNode): HTMLElement {
  const nodeId = node.id;
  const wrapper = document.createElement('div');
  wrapper.className = 'arch-node';
  wrapper.dataset.node = nodeId;
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
  const attachNodeMove = (triggerEl: HTMLElement, isHandle: boolean) => {
    let startClientX = 0;
    let startClientY = 0;
    let origX = 0;
    let origY = 0;
    let groupStartPositions: Map<string, [number, number]> | null = null;
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

      if (e.shiftKey) {
        const currentIds = getSelectedNodeIds();
        const nextIds = currentIds.includes(current.id)
          ? currentIds.filter((id) => id !== current.id)
          : [...currentIds, current.id];
        applySelection(
          nextIds.length > 1
            ? { type: 'multi', ids: nextIds }
            : nextIds.length === 1
              ? { type: 'node', id: nextIds[0] }
              : { type: 'none' },
        );
        return;
      }

      if (!isSelectedNode(current.id)) {
        applySelection({ type: 'node', id: current.id });
      } else if (app.selection.type === 'node' && propPanelHeading.textContent !== 'COMPONENT PROPERTIES') {
        requestInspectorRefresh();
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
      } else {
        groupStartPositions = null;
      }
      hasMoved = false;
      triggerEl.setPointerCapture(e.pointerId);
    });

    triggerEl.addEventListener('pointermove', (e) => {
      if (!triggerEl.hasPointerCapture(e.pointerId)) return;
      const current = liveNode(nodeId);
      if (!current) return;
      const dx = (e.clientX - startClientX) / app.scale;
      const dy = (e.clientY - startClientY) / app.scale;

      if (!hasMoved && Math.hypot(dx, dy) > 4) {
        pushHistory();
        hasMoved = true;
        wrapper.classList.add('is-dragging-node');
        if (isHandle) dragHandle.classList.add('dragging');
        if (!isSelectedNode(current.id)) setSelection({ type: 'node', id: current.id });
        updateVisualSelectionHighlights();
      }

      if (!hasMoved) return;
      if (groupStartPositions && groupStartPositions.size > 1) {
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
      } else {
        const [snappedX, snappedY] = computeSnappedPosition(current, origX + dx, origY + dy);
        current.x = snappedX;
        current.y = snappedY;
        wrapper.style.setProperty('--nx', String(current.x));
        wrapper.style.setProperty('--ny', String(current.y));
      }
      expandStageToFit(app.doc);
      renderWiresOnly();
      updateVisualSelectionHighlights();
    });

    const endMove = () => {
      const movedDuringDrag = hasMoved;
      hasMoved = false;
      groupStartPositions = null;
      alignGuideX.hidden = true;
      alignGuideY.hidden = true;
      wrapper.classList.remove('is-dragging-node');
      dragHandle.classList.remove('dragging');
      if (movedDuringDrag) renderPropertyEditor();
    };

    triggerEl.addEventListener('pointerup', (e) => {
      e.stopPropagation();
      const wasMoved = hasMoved;
      lastPointerWasDrag = wasMoved;
      endMove();
      const current = liveNode(nodeId);
      if (!current || wasMoved || e.shiftKey) return;
      if (app.workspaceMode === 'design') {
        applySelection({ type: 'node', id: current.id }, { expectedHeading: 'COMPONENT PROPERTIES' });
      } else {
        applySelection({ type: 'node', id: current.id }, { refreshIfUnchanged: true });
      }
    });
    triggerEl.addEventListener('lostpointercapture', endMove);
  };

  attachNodeMove(selectBtn, false);
  attachNodeMove(dragHandle, true);

  selectBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (lastPointerWasDrag) {
      lastPointerWasDrag = false;
      return;
    }
    const current = liveNode(nodeId);
    if (!current) return;
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
      applySelection({ type: 'node', id: current.id }, { expectedHeading: 'COMPONENT PROPERTIES' });
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
    pushHistory();
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

function paintNode(wrapper: HTMLElement, node: DiagramNode): void {
  wrapper.dataset.kind = node.kind;
  wrapper.dataset.accent = node.accent;
  wrapper.style.setProperty('--nx', String(node.x));
  wrapper.style.setProperty('--ny', String(node.y));
  wrapper.style.setProperty('--nw', String(node.width));
  wrapper.style.setProperty('--nh', String(node.height));

  const title = wrapper.querySelector('.node-title');
  if (title) title.textContent = node.title;
  const dragHandle = wrapper.querySelector('.node-drag-handle');
  dragHandle?.setAttribute('aria-label', `Move ${node.title} with arrow keys or drag`);
  for (const port of wrapper.querySelectorAll<HTMLElement>('.node-port')) {
    port.setAttribute('aria-label', `Connect from ${node.title} ${port.dataset.port} port`);
  }

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
    return;
  }

  const sub = wrapper.querySelector('.node-sub');
  if (sub) sub.textContent = node.subtitle;
  const chip = wrapper.querySelector('.micro-chip');
  if (chip) chip.textContent = node.chip;
  const iconBox = wrapper.querySelector<HTMLElement>('.node-icon');
  if (iconBox && iconBox.dataset.icon !== node.icon) {
    iconBox.dataset.icon = node.icon;
    iconBox.replaceChildren(createNodeIconSvg(node.icon, node.kind === 'client' ? 16 : 19));
  }
  if (node.kind !== 'client') {
    const eyebrow = wrapper.querySelector('.node-eyebrow');
    if (eyebrow) eyebrow.textContent = node.eyebrow;
    const footer = wrapper.querySelector('.node-footer-label');
    if (footer) footer.textContent = node.footerLeft;
  }
}

function computeSnappedPosition(movingNode: DiagramNode, rawX: number, rawY: number): [number, number] {
  let nextX = Math.max(16, rawX);
  let nextY = Math.max(24, rawY);
  alignGuideX.hidden = true;
  alignGuideY.hidden = true;
  if (!app.snapToGrid) return [Math.round(nextX), Math.round(nextY)];

  let snappedX = false;
  let snappedY = false;
  const tol = 8;
  const cx = nextX + movingNode.width / 2;
  const cy = nextY + movingNode.height / 2;

  for (const other of app.doc.nodes) {
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

export function updateVisualSelectionHighlights(): void {
  const nodeWrappers = Array.from(nodesLayer.querySelectorAll<HTMLElement>('.arch-node'));
  const conduitGroups = Array.from(wiresGroup.querySelectorAll<SVGGElement>('.conduit-group'));
  const zoneBanners = Array.from(zonesLayer.querySelectorAll<HTMLElement>('.zone-banner'));
  const notesCards = Array.from(notesLayer.querySelectorAll<HTMLElement>('.blueprint-spec'));

  for (const zb of zoneBanners) {
    zb.classList.toggle('is-selected', app.selection.type === 'zone' && zb.dataset.zoneId === app.selection.id);
  }
  for (const nc of notesCards) {
    nc.classList.toggle('is-selected', app.selection.type === 'notes' && nc.dataset.notesId === app.selection.id);
  }

  if (app.workspaceMode === 'data' && app.selection.type === 'node') {
    const adj = getAdjacencyLists(app.doc, app.selection.id);
    const upIds = adj.upstream.map((u) => u.id);
    const downIds = adj.downstream.map((d) => d.id);
    for (const w of nodeWrappers) {
      const id = w.dataset.node || '';
      const hit = w.querySelector('.node-select-hit');
      const isSelected = id === app.selection.id;
      const connected = isSelected || upIds.includes(id) || downIds.includes(id);
      hit?.setAttribute('aria-pressed', String(isSelected));
      w.classList.toggle('is-dimmed', !connected);
    }
    for (const g of conduitGroups) {
      const touches = g.dataset.from === app.selection.id || g.dataset.to === app.selection.id;
      g.classList.toggle('is-highlighted', touches);
      g.classList.toggle('is-dimmed', !touches);
      g.classList.remove('is-selected');
    }
    return;
  }

  for (const w of nodeWrappers) {
    const id = w.dataset.node || '';
    const hit = w.querySelector('.node-select-hit');
    hit?.setAttribute('aria-pressed', String(isSelectedNode(id)));
    w.classList.remove('is-dimmed');
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
