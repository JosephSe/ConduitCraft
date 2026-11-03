/** Stage rendering for zones, notes, wires, and components. */
import { invalidateChaos } from './chaos';
import { paintGroupOutlines } from './groupOutlines';
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
  restoreBannerText,
  restoreSessionBanner,
  stageWorld,
  wireHandlesSvg,
  wiresSvg,
} from './dom';
import { app, getPendingRestoreOffer, setSelection, updateDocumentTitle } from './state';
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

/** Assigning textContent replaces the text node even when the value is unchanged, dirtying layout. */
function setText(el: Element, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

function paintDocumentBrand(): void {
  const name = (app.doc.brand?.name || '').trim();
  const accent = normalizeBrandAccent(app.doc.brand?.accent);
  const logo = sanitizeIconImage(app.doc.brand?.logo);
  docBrandName.hidden = !name;
  setText(docBrandName, name);
  if (accent) {
    docBrandCluster.dataset.brand = 'true';
    docBrandCluster.style.setProperty('--brand-accent', accent);
  } else {
    delete docBrandCluster.dataset.brand;
    docBrandCluster.style.removeProperty('--brand-accent');
  }
  if (logo) {
    docBrandLogo.hidden = false;
    // Re-assigning an identical src re-runs the image load algorithm.
    if (docBrandLogo.getAttribute('src') !== logo) docBrandLogo.src = logo;
    docBrandGlyph.style.display = 'none';
  } else {
    docBrandLogo.hidden = true;
    if (docBrandLogo.hasAttribute('src')) docBrandLogo.removeAttribute('src');
    docBrandGlyph.style.display = '';
  }
}

export function renderAll(rebuildInspector = true): void {
  invalidateChaos();
  const isEmpty = app.doc.nodes.length === 0 && app.doc.zones.length === 0 && app.doc.notesCards.length === 0;
  emptyStageOverlay.hidden = !isEmpty;
  const pending = getPendingRestoreOffer();
  const hasPending = Boolean(
    pending &&
      (pending.nodes.length > 0 ||
        (pending.zones && pending.zones.length > 0) ||
        (pending.notesCards && pending.notesCards.length > 0))
  );

  if (hasPending && pending) {
    const count = pending.nodes.length;
    const countLabel = `${count} ${count === 1 ? 'component' : 'components'}`;
    if (restoreBannerText) {
      setText(restoreBannerText, `Previous session (${countLabel}) available from this browser`);
    }
    if (restoreSessionBanner) {
      restoreSessionBanner.hidden = false;
    }
    if (btnRestoreSession) {
      btnRestoreSession.hidden = !isEmpty;
      setText(btnRestoreSession, `↺ Restore Previous Session (${count} ${count === 1 ? 'component' : 'components'})`);
    }
  } else {
    if (restoreSessionBanner) {
      restoreSessionBanner.hidden = true;
    }
    if (btnRestoreSession) {
      btnRestoreSession.hidden = true;
    }
  }

  setText(docTitleHeadingEl, app.doc.title || 'Untitled Architecture');
  updateDocumentTitle();
  setText(docSystemTagEl, app.doc.systemTag || 'CONDUITCRAFT');
  setText(docStatusLabelEl, app.doc.statusLabel || 'TRAFFIC DIAGRAM');
  paintDocumentBrand();
  setText(
    canvasStatsPill,
    `${app.doc.nodes.length} ${app.doc.nodes.length === 1 ? 'NODE' : 'NODES'} · ${app.doc.edges.length} ${app.doc.edges.length === 1 ? 'WIRE' : 'WIRES'}`,
  );

  stageWorld.style.width = `${app.doc.stageWidth}px`;
  stageWorld.style.height = `${app.doc.stageHeight}px`;
  wiresSvg.setAttribute('viewBox', `0 0 ${app.doc.stageWidth} ${app.doc.stageHeight}`);
  wiresSvg.setAttribute('width', String(app.doc.stageWidth));
  wiresSvg.setAttribute('height', String(app.doc.stageHeight));
  wireHandlesSvg.setAttribute('viewBox', `0 0 ${app.doc.stageWidth} ${app.doc.stageHeight}`);
  wireHandlesSvg.setAttribute('width', String(app.doc.stageWidth));
  wireHandlesSvg.setAttribute('height', String(app.doc.stageHeight));

  renderZones();
  renderNotesCards();
  renderWiresOnly();
  renderNodes();
  renderSimButtons();
  renderMatrixTable();
  updateVisualSelectionHighlights();
  paintGroupOutlines();

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
      const adj = getAdjacencyLists(app.doc, node.id);
      // Rows are only ever written here, so an unchanged signature means the cells are current.
      const signature = JSON.stringify([
        node.title,
        node.subtitle,
        node.kind,
        node.interfaceLabel,
        adj.upstream.map((u) => u.title),
        adj.downstream.map((d) => d.title),
      ]);
      if (tr.dataset.sig === signature) return;
      tr.dataset.sig = signature;
      const cells = tr.querySelectorAll('td');
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
