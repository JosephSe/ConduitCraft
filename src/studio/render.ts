/** Stage rendering for zones, notes, wires, and components. */
import {
  SVG_NS,
  alignGuideX,
  alignGuideY,
  btnRestoreSession,
  canvasStatsPill,
  docStatusLabelEl,
  docSystemTagEl,
  docTitleHeadingEl,
  emptyStageOverlay,
  matrixTbody,
  nodesLayer,
  notesLayer,
  propPanelHeading,
  stageWorld,
  wiresGroup,
  wiresSvg,
  zonesLayer,
} from './dom';
import {
  app,
  getSelectedNodeIds,
  isSelectedNode,
  loadSavedSessionDoc,
  pushHistory,
  screenToWorld,
} from './state';
import {
  renderPropertyEditor,
  syncDataViewInspector,
} from './inspector';
import {
  beginPortWireDrag,
  createEdgeConnection,
  deleteSelected,
  renderSimButtons,
} from './interactions';
import type {
  DiagramNode,
  PortSide,
} from '../types';
import {
  expandStageToFit,
  getAdjacencyLists,
  routeDiagramEdges,
} from '../core/layout';

import { createHumanOutlineSvg,
  createNodeIconSvg } from '../ui/icons';

// ---------------------------------------------------------------------------
// Rendering Pipeline (Stage + Wires + Property Editor + Telemetry Inspector)
// ---------------------------------------------------------------------------
export function renderAll(rebuildInspector = true): void {
  const isEmpty = app.doc.nodes.length === 0 && app.doc.zones.length === 0 && app.doc.notesCards.length === 0;
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

  docTitleHeadingEl.textContent = app.doc.title || 'Untitled Architecture';
  docSystemTagEl.textContent = app.doc.systemTag || 'CONDUITCRAFT';
  docStatusLabelEl.textContent = app.doc.statusLabel || 'LIVE TELEMETRY';
  canvasStatsPill.textContent = `${app.doc.nodes.length} ${app.doc.nodes.length === 1 ? 'NODE' : 'NODES'} · ${app.doc.edges.length} ${app.doc.edges.length === 1 ? 'WIRE' : 'WIRES'}`;

  stageWorld.style.width = `${app.doc.stageWidth}px`;
  stageWorld.style.height = `${app.doc.stageHeight}px`;
  wiresSvg.setAttribute('viewBox', `0 0 ${app.doc.stageWidth} ${app.doc.stageHeight}`);
  wiresSvg.setAttribute('width', String(app.doc.stageWidth));
  wiresSvg.setAttribute('height', String(app.doc.stageHeight));

  renderZones();
  renderNotesCards();
  renderWiresOnly();
  renderNodes();
  renderSimButtons();
  renderMatrixTable();
  updateVisualSelectionHighlights();

  if (rebuildInspector) {
    if (app.workspaceMode === 'design') {
      renderPropertyEditor();
    } else {
      syncDataViewInspector();
    }
  }
}

export function renderZones(): void {
  zonesLayer.replaceChildren();
  for (const zone of app.doc.zones) {
    const banner = document.createElement('div');
    banner.className = 'zone-banner';
    if (app.selection.type === 'zone' && app.selection.id === zone.id) {
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
      if (app.workspaceMode !== 'design' || e.button !== 0 || e.target === resizeHandle) return;
      e.stopPropagation();
      app.selection = { type: 'zone', id: zone.id };
      updateVisualSelectionHighlights();
      renderPropertyEditor();

      dragStartX = e.clientX;
      origX = zone.x;
      moved = false;
      banner.setPointerCapture(e.pointerId);
    });
    banner.addEventListener('pointermove', (e) => {
      if (!banner.hasPointerCapture(e.pointerId)) return;
      const dx = (e.clientX - dragStartX) / app.scale;
      if (!moved && Math.abs(dx) > 3) {
        pushHistory();
        moved = true;
        banner.classList.add('dragging');
      }
      if (moved) {
        const rawX = Math.max(16, origX + dx);
        zone.x = app.snapToGrid ? Math.round(rawX / 16) * 16 : Math.round(rawX);
        banner.style.setProperty('--zx', String(zone.x));
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

    // Resize swimlane width
    let resizeStartX = 0;
    let origW = zone.width;
    let resized = false;
    resizeHandle.addEventListener('pointerdown', (e) => {
      if (app.workspaceMode !== 'design' || e.button !== 0) return;
      e.stopPropagation();
      if (app.selection.type !== 'zone' || app.selection.id !== zone.id) {
        app.selection = { type: 'zone', id: zone.id };
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
      const dw = (e.clientX - resizeStartX) / app.scale;
      if (!resized && Math.abs(dw) > 3) {
        pushHistory();
        resized = true;
      }
      if (resized) {
        const rawW = Math.max(160, origW + dw);
        zone.width = app.snapToGrid ? Math.round(rawW / 16) * 16 : Math.round(rawW);
        banner.style.setProperty('--zw', String(zone.width));
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

    zonesLayer.appendChild(banner);
  }
}

export function renderNotesCards(): void {
  notesLayer.replaceChildren();
  for (const card of app.doc.notesCards) {
    const aside = document.createElement('aside');
    aside.className = 'blueprint-spec';
    if (app.selection.type === 'notes' && app.selection.id === card.id) {
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
      if (app.workspaceMode !== 'design' || e.button !== 0) return;
      e.stopPropagation();
      if (app.selection.type !== 'notes' || app.selection.id !== card.id) {
        app.selection = { type: 'notes', id: card.id };
        updateVisualSelectionHighlights();
        renderPropertyEditor();
      }
    });

    aside.addEventListener('pointerup', (e) => {
      if (app.workspaceMode === 'design') e.stopPropagation();
    });

    aside.addEventListener('click', (e) => {
      if (app.workspaceMode !== 'design') return;
      e.stopPropagation();
      if (app.selection.type !== 'notes' || app.selection.id !== card.id || propPanelHeading.textContent !== 'NOTES / SPEC CARD') {
        app.selection = { type: 'notes', id: card.id };
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
      if (app.workspaceMode !== 'design' || e.button !== 0) return;
      e.stopPropagation();
      if (app.selection.type !== 'notes' || app.selection.id !== card.id) {
        app.selection = { type: 'notes', id: card.id };
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
        card.x = app.snapToGrid ? Math.round(nx / 16) * 16 : Math.round(nx);
        card.y = app.snapToGrid ? Math.round(ny / 16) * 16 : Math.round(ny);
        aside.style.setProperty('--bx', String(card.x));
        aside.style.setProperty('--by', String(card.y));
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

    notesLayer.appendChild(aside);
  }
}

export function renderWiresOnly(): void {
  wiresGroup.replaceChildren();
  const routed = routeDiagramEdges(app.doc);
  const nodeTitleMap = new Map(app.doc.nodes.map((n) => [n.id, n.title]));

  for (const edge of routed) {
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', 'conduit-group');
    const isSelectedEdge = app.selection.type === 'edge' && app.selection.id === edge.id;
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
      if (app.workspaceMode === 'design') {
        if (app.selection.type !== 'edge' || app.selection.id !== edge.id || propPanelHeading.textContent !== 'STREAM WIRE PROPERTIES') {
          app.selection = { type: 'edge', id: edge.id };
          updateVisualSelectionHighlights();
          renderWiresOnly();
          renderPropertyEditor();
        }
      } else {
        // In Data View, clicking a stream wire selects its target component!
        app.selection = { type: 'node', id: edge.to };
        updateVisualSelectionHighlights();
        syncDataViewInspector();
      }
    };

    g.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectWire(e);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && app.workspaceMode === 'design') {
        e.preventDefault();
        e.stopPropagation();
        app.selection = { type: 'edge', id: edge.id };
        deleteSelected();
      }
    });

    const laneTx =
      edge.laneOffset && (edge.laneOffset[0] !== 0 || edge.laneOffset[1] !== 0)
        ? `translate(${edge.laneOffset[0]}, ${edge.laneOffset[1]})`
        : null;

    // Wide invisible clickable hit target for effortless app.selection in Design Mode
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
    if (app.workspaceMode === 'design' && isSelectedEdge) {
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
        const targetEdge = app.doc.edges.find((ed) => ed.id === edge.id);
        if (targetEdge) {
          targetEdge.waypoint = [
            app.snapToGrid ? Math.round(wx / 8) * 8 : wx,
            app.snapToGrid ? Math.round(wy / 8) * 8 : wy,
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
        const targetEdge = app.doc.edges.find((ed) => ed.id === edge.id);
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

export function computeSnappedPosition(
  movingNode: DiagramNode,
  rawX: number,
  rawY: number,
): [number, number] {
  let nextX = Math.max(16, rawX);
  let nextY = Math.max(24, rawY);

  alignGuideX.hidden = true;
  alignGuideY.hidden = true;

  if (!app.snapToGrid) {
    return [Math.round(nextX), Math.round(nextY)];
  }

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

export function renderNodes(): void {
  nodesLayer.replaceChildren();

  for (const node of app.doc.nodes) {
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
      String(app.selection.type === 'node' && app.selection.id === node.id),
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
        if (app.workspaceMode === 'design' && app.pointerTool === 'connect' && !isHandle) {
          beginPortWireDrag(e, node, 'auto', triggerEl);
          return;
        }

        // In Data View mode, clicking selects the node without dragging
        if (app.workspaceMode === 'data') {
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
          app.selection =
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
          app.selection = { type: 'node', id: node.id };
          updateVisualSelectionHighlights();
          renderPropertyEditor();
        } else if (
          app.selection.type === 'node' &&
          propPanelHeading.textContent !== 'COMPONENT PROPERTIES'
        ) {
          renderPropertyEditor();
        }

        startClientX = e.clientX;
        startClientY = e.clientY;
        origX = node.x;
        origY = node.y;
        if (app.selection.type === 'multi' && app.selection.ids.includes(node.id)) {
          groupStartPositions = new Map(
            app.doc.nodes
              .filter((n) => app.selection.type === 'multi' && app.selection.ids.includes(n.id))
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
        const dx = (e.clientX - startClientX) / app.scale;
        const dy = (e.clientY - startClientY) / app.scale;

        if (!hasMoved && Math.hypot(dx, dy) > 4) {
          pushHistory();
          hasMoved = true;
          wrapper.classList.add('is-dragging-node');
          if (isHandle) dragHandle.classList.add('dragging');
          if (!isSelectedNode(node.id)) {
            app.selection = { type: 'node', id: node.id };
          }
          updateVisualSelectionHighlights();
        }

        if (hasMoved) {
          if (groupStartPositions && groupStartPositions.size > 1) {
            const stepDx = app.snapToGrid ? Math.round(dx / 16) * 16 : Math.round(dx);
            const stepDy = app.snapToGrid ? Math.round(dy / 16) * 16 : Math.round(dy);
            for (const [id, [sx, sy]] of groupStartPositions.entries()) {
              const member = app.doc.nodes.find((n) => n.id === id);
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
          expandStageToFit(app.doc);
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
          if (app.workspaceMode === 'design') {
            if (
              app.selection.type !== 'node' ||
              app.selection.id !== node.id ||
              propPanelHeading.textContent !== 'COMPONENT PROPERTIES'
            ) {
              app.selection = { type: 'node', id: node.id };
              updateVisualSelectionHighlights();
              renderPropertyEditor();
            }
          } else {
            app.selection = { type: 'node', id: node.id };
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
      if (app.workspaceMode === 'data') {
        app.selection = { type: 'node', id: node.id };
        updateVisualSelectionHighlights();
        syncDataViewInspector();
      } else if (app.pointerTool === 'connect') {
        if (app.connectSourceNodeId && app.connectSourceNodeId !== node.id) {
          createEdgeConnection(app.connectSourceNodeId, node.id, 'auto', 'auto');
        } else {
          app.connectSourceNodeId = node.id;
          app.selection = { type: 'node', id: node.id };
          updateVisualSelectionHighlights();
          renderPropertyEditor();
        }
      } else if (
        app.selection.type !== 'node' ||
        app.selection.id !== node.id ||
        propPanelHeading.textContent !== 'COMPONENT PROPERTIES'
      ) {
        app.selection = { type: 'node', id: node.id };
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
      expandStageToFit(app.doc);
      renderWiresOnly();
      app.selection = { type: 'node', id: node.id };
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
        if (app.workspaceMode !== 'design' || e.button !== 0) return;
        beginPortWireDrag(e, node, side, portBtn);
      });

      wrapper.appendChild(portBtn);
    }

    nodesLayer.appendChild(wrapper);
  }
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

  // Design Mode or Data View Overview
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

// ---------------------------------------------------------------------------
// Specification Matrix Table
// ---------------------------------------------------------------------------
export function renderMatrixTable(): void {
  matrixTbody.replaceChildren();
  if (app.doc.nodes.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 5;
    td.style.color = 'var(--wl-ink-muted)';
    td.textContent = 'No components placed on the canvas yet.';
    tr.appendChild(td);
    matrixTbody.appendChild(tr);
    return;
  }

  for (const n of app.doc.nodes) {
    const adj = getAdjacencyLists(app.doc, n.id);
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
