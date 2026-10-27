/** Stage rendering for zones, notes, wires, and components. */
import {
  btnRestoreSession,
  canvasStatsPill,
  docBrandCluster,
  docBrandGlyph,
  docBrandLogo,
  docBrandName,
  docStatusLabelEl,
  docSystemTagEl,
  docTitleHeadingEl,
  emptyStageOverlay,
  matrixTbody,
  propPanelHeading,
  stageWorld,
  wiresSvg,
} from './dom';
import { app, loadSavedSessionDoc, setSelection } from './state';
import type { SelectionTarget } from '../types';
import { renderPropertyEditor, syncDataViewInspector } from './inspector';
import { renderSimButtons } from './interactions';
import { normalizeBrandAccent } from '../core/brand';
import { sanitizeIconImage } from '../core/nodeStyle';
import { getAdjacencyLists } from '../core/layout';
import {
  renderNodes,
  renderNotesCards,
  renderWiresOnly,
  renderZones,
  updateVisualSelectionHighlights,
} from './keyedStage';
import { reconcileKeyed } from './reconcile';
import { scheduleMinimapPaint } from './minimap';

export {
  renderNodes,
  renderNotesCards,
  renderWiresOnly,
  renderZones,
  updateVisualSelectionHighlights,
};

// ---------------------------------------------------------------------------
// Rendering Pipeline (Stage + Wires + Property Editor + Telemetry Inspector)
// ---------------------------------------------------------------------------
export function requestInspectorRefresh(): void {
  if (app.workspaceMode === 'design') renderPropertyEditor();
  else syncDataViewInspector();
}

/**
 * Change the selection through the controller.
 * An unchanged key skips the inspector rebuild unless the panel heading is stale
 * or the caller asks for a refresh.
 */
export function applySelection(
  next: SelectionTarget,
  options?: { refreshIfUnchanged?: boolean; expectedHeading?: string },
): void {
  const changed = setSelection(next);
  if (changed) return;
  const headingStale =
    options?.expectedHeading !== undefined &&
    propPanelHeading.textContent !== options.expectedHeading;
  if (options?.refreshIfUnchanged || headingStale) requestInspectorRefresh();
}

function paintDocumentBrand(): void {
  const name = (app.doc.brand?.name || '').trim();
  const accent = normalizeBrandAccent(app.doc.brand?.accent);
  const logo = sanitizeIconImage(app.doc.brand?.logo);
  docBrandName.hidden = !name;
  docBrandName.textContent = name;
  if (accent) {
    docBrandCluster.dataset.brand = 'true';
    docBrandCluster.style.setProperty('--brand-accent', accent);
  } else {
    delete docBrandCluster.dataset.brand;
    docBrandCluster.style.removeProperty('--brand-accent');
  }
  if (logo) {
    docBrandLogo.hidden = false;
    docBrandLogo.src = logo;
    docBrandGlyph.style.display = 'none';
  } else {
    docBrandLogo.hidden = true;
    docBrandLogo.removeAttribute('src');
    docBrandGlyph.style.display = '';
  }
}

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
  paintDocumentBrand();
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
  scheduleMinimapPaint();
}

// ---------------------------------------------------------------------------
// Specification Matrix Table
// ---------------------------------------------------------------------------
export function renderMatrixTable(): void {
  if (app.doc.nodes.length === 0) {
    matrixTbody.replaceChildren();
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 5;
    td.style.color = 'var(--wl-ink-muted)';
    td.textContent = 'No components placed on the canvas yet.';
    tr.appendChild(td);
    matrixTbody.appendChild(tr);
    return;
  }

  reconcileKeyed(
    matrixTbody,
    app.doc.nodes,
    (node) => node.id,
    (el) => (el as HTMLElement).dataset.nodeId,
    () => 'matrix-row',
    (node) => {
      const tr = document.createElement('tr');
      tr.dataset.nodeId = node.id;
      for (let i = 0; i < 5; i += 1) tr.appendChild(document.createElement('td'));
      return tr;
    },
    (el, node) => {
      const tr = el as HTMLTableRowElement;
      const cells = tr.querySelectorAll('td');
      const adj = getAdjacencyLists(app.doc, node.id);
      cells[0].replaceChildren();
      const strong = document.createElement('strong');
      strong.textContent = node.title;
      cells[0].appendChild(strong);
      if (node.subtitle) {
        cells[0].appendChild(document.createElement('br'));
        const sub = document.createElement('span');
        sub.style.fontSize = '0.78rem';
        sub.style.color = 'var(--wl-ink-muted)';
        sub.textContent = node.subtitle;
        cells[0].appendChild(sub);
      }
      cells[1].replaceChildren();
      const code = document.createElement('code');
      code.textContent = node.kind.toUpperCase();
      cells[1].appendChild(code);
      cells[2].textContent =
        adj.upstream.length > 0 ? adj.upstream.map((u) => u.title).join(', ') : 'Entry Point';
      cells[3].textContent =
        adj.downstream.length > 0 ? adj.downstream.map((d) => d.title).join(', ') : 'Terminal Sink';
      cells[4].textContent = node.interfaceLabel;
    },
  );
}
