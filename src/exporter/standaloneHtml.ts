import type { DiagramDocument, DiagramNode, StreamTone } from '../types';
import { getNotesItemIconMeta } from '../types';
import { getAdjacencyLists, getEffectiveSimulations, routeDiagramEdges } from '../core/layout';
import { renderHumanOutlineMarkup, renderIconMarkup } from '../ui/icons';
import { normalizeBrand } from '../core/brand';
import {
  nodeShapeContentPadding,
  renderCylinderPlate,
  renderNodeShapePlate,
  sanitizeIconImage,
  storeDrawsCylinder,
} from '../core/nodeStyle';
import { TONE_CSS, TONE_META } from '../shared/tones';
import sharedCss from '../styles/shared.css?raw';
import viewerCss from '../styles/viewer.css?raw';
import colorSchemeBoot from '../shared/colorSchemeBoot.js?raw';

function escapeHtml(value?: string | null): string {
  if (!value) return '';
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function serializeScriptJson(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

function nodeShapeAttr(node: DiagramNode): string {
  if (storeDrawsCylinder(node.kind, node.shape)) return ' data-shape="cylinder"';
  if (!node.shape || node.shape === 'card') return '';
  return ` data-shape="${escapeHtml(node.shape)}"`;
}

function nodePlateMarkup(node: DiagramNode): string {
  if (storeDrawsCylinder(node.kind, node.shape)) return renderCylinderPlate(node.width, node.height);
  return renderNodeShapePlate(node.shape, node.width, node.height);
}

function exportedIconMarkup(node: DiagramNode, size: number, fallback: string): string {
  const image = sanitizeIconImage(node.iconImage);
  if (image) return `<img class="node-custom-icon" alt="" src="${escapeHtml(image)}">`;
  return fallback || renderIconMarkup(node.icon, size);
}

function nodeBoxStyle(node: DiagramNode): string {
  const padding = nodeShapeContentPadding(node.kind, node.shape, node.width, node.height);
  const pad = padding ? `; padding: ${padding}` : '';
  return `--nx: ${node.x}; --ny: ${node.y}; --nw: ${node.width}; --nh: ${node.height}${pad}`;
}

function renderNodeBadges(node: DiagramNode): string {
  let html = '';
  if (node.status) {
    const label = node.status === 'at-risk' ? 'At Risk' : node.status.charAt(0).toUpperCase() + node.status.slice(1);
    html += `<span class="node-status-badge" data-status="${escapeHtml(node.status)}"><span class="status-dot"></span><span class="status-text">${escapeHtml(label)}</span></span>`;
  }
  if (node.comment) {
    html += `<span class="node-comment-badge" title="${escapeHtml(node.comment)}"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></span>`;
  }
  return html;
}

function renderExportedNode(node: DiagramNode, index: number): string {
  const pressed = index === 0 ? 'true' : 'false';
  const shape = nodeShapeAttr(node);
  const box = nodeBoxStyle(node);
  const plate = nodePlateMarkup(node);
  const badges = renderNodeBadges(node);
  if (node.kind === 'actor') {
    return `
      <button type="button" class="arch-node" data-node="${escapeHtml(node.id)}" data-kind="actor" data-accent="${escapeHtml(node.accent)}"${shape} aria-pressed="${pressed}" style="${box}">
        ${plate}
        ${badges}
        <span class="actor-figure">${exportedIconMarkup(node, 0, renderHumanOutlineMarkup())}</span>
        <span class="actor-caption">
          <span class="node-title">${escapeHtml(node.title)}</span>
          ${node.subtitle ? `<span class="actor-role">${escapeHtml(node.subtitle)}</span>` : ''}
        </span>
      </button>`;
  }

  if (node.kind === 'client') {
    return `
      <button type="button" class="arch-node" data-node="${escapeHtml(node.id)}" data-kind="client" data-accent="${escapeHtml(node.accent)}"${shape} aria-pressed="${pressed}" style="${box}">
        ${plate}
        ${badges}
        <div class="node-top">
          <span class="node-icon">${exportedIconMarkup(node, 16, '')}</span>
          <span class="micro-chip">${escapeHtml(node.chip)}</span>
        </div>
        <div>
          <span class="node-title">${escapeHtml(node.title)}</span>
          <span class="node-sub">${escapeHtml(node.subtitle)}</span>
        </div>
      </button>`;
  }

  return `
    <button type="button" class="arch-node" data-node="${escapeHtml(node.id)}" data-kind="${escapeHtml(node.kind)}" data-accent="${escapeHtml(node.accent)}"${shape} aria-pressed="${pressed}" style="${box}">
      ${plate}
      ${badges}
      <div class="node-top">
        <span class="node-icon">${exportedIconMarkup(node, 19, '')}</span>
        <span class="node-eyebrow">${escapeHtml(node.eyebrow)}</span>
      </div>
      <div>
        <span class="node-title">${escapeHtml(node.title)}</span>
        <span class="node-sub">${escapeHtml(node.subtitle)}</span>
      </div>
      <div class="node-footer">
        <span>${escapeHtml(node.footerLeft)}</span>
        <span class="micro-chip">${escapeHtml(node.chip)}</span>
      </div>
    </button>`;
}

export function generateStandaloneHtml(doc: DiagramDocument): string {
  const routedEdges = routeDiagramEdges(doc);
  const simulations = getEffectiveSimulations(doc);

  const presentTones = Array.from(new Set(routedEdges.map((e) => e.tone)));
  const filterPillsMarkup =
    presentTones.length > 1
      ? `<fieldset class="segmented-group" aria-label="Filter stream channels" style="border: none;">
          <legend class="visually-hidden">Stream Channel Filter</legend>
          <label class="segmented-label">
            <input type="radio" name="flow-filter" value="all" class="visually-hidden" checked>
            <span>All</span>
          </label>
          ${presentTones
            .map(
              (tone) => `<label class="segmented-label">
            <input type="radio" name="flow-filter" value="${tone}" class="visually-hidden">
            <span class="pill-swatch" style="background: ${TONE_META[tone].cssVar};"></span>
            <span>${escapeHtml(TONE_META[tone].shortLabel)}</span>
          </label>`,
            )
            .join('')}
        </fieldset>`
      : '';

  const zonesMarkup = doc.zones
    .map(
      (z) => `
      <div class="zone-banner" style="--zx: ${z.x}; --zw: ${z.width};" aria-hidden="true">
        <span><span class="zone-num">${escapeHtml(z.number)}</span> ${escapeHtml(z.title)}</span>
        <span>${escapeHtml(z.subtitle)}</span>
      </div>`,
    )
    .join('\n');

  const notesMarkup = doc.notesCards
    .map(
      (card) => `
      <aside class="blueprint-spec" style="--bx: ${card.x}; --by: ${card.y};" aria-label="${escapeHtml(card.title)}">
        <div class="blueprint-spec-header">
          <span>${escapeHtml(card.title)}</span>
          <span>${escapeHtml(card.code)}</span>
        </div>
        <ul class="blueprint-spec-list">
          ${card.items
            .map((item) => {
              const iconMeta = getNotesItemIconMeta(item.icon);
              const iconMarkup =
                iconMeta.value !== 'none'
                  ? `<span class="spec-icon spec-check icon-${escapeHtml(iconMeta.value)}" aria-hidden="true">${escapeHtml(iconMeta.glyph)}</span>`
                  : '';
              const titleMarkup = item.title ? `<strong>${escapeHtml(item.title)}:</strong> ` : '';
              return `<li>
            ${iconMarkup}
            <span>${titleMarkup}${escapeHtml(item.text)}</span>
          </li>`;
            })
            .join('\n')}
        </ul>
      </aside>`,
    )
    .join('\n');

  const edgesMarkup = routedEdges
    .map((e) => {
      const markerUrl = `url(#arrow-${e.tone})`;
      const badgeMarkup =
        e.label && e.badgePos && e.badgeWidth
          ? `<g transform="translate(${e.badgePos[0]}, ${e.badgePos[1]})">
              <rect class="route-pill-bg" x="${-Math.round(e.badgeWidth / 2)}" y="-13" width="${Math.round(e.badgeWidth)}" height="26" rx="13"/>
              <text class="route-pill-text" text-anchor="middle" y="4">${escapeHtml(e.label)}</text>
            </g>`
          : '';

      return `
        <g class="conduit-group" data-edge="${escapeHtml(e.id)}" data-tone="${escapeHtml(e.tone)}" data-from="${escapeHtml(e.from)}" data-to="${escapeHtml(e.to)}" data-animated="${e.animated ? 'true' : 'false'}">
          <path class="conduit-glow" d="${e.pathD}"/>
          <path class="conduit-rail" d="${e.pathD}"/>
          <path class="conduit-stream" d="${e.pathD}" marker-end="${markerUrl}"/>
          <circle class="port-dot" cx="${e.startPoint[0]}" cy="${e.startPoint[1]}" r="4"/>
          ${badgeMarkup}
        </g>`;
    })
    .join('\n');

  const nodesMarkup = doc.nodes.map((n, idx) => renderExportedNode(n, idx)).join('\n');

  const simButtonsMarkup = simulations
    .map((sim) => {
      const cls =
        sim.tone === 'rose'
          ? 'btn btn-reject'
          : sim.tone === 'emerald'
            ? 'btn btn-approve'
            : 'btn';
      const dotColor = TONE_META[sim.tone]?.cssVar || 'var(--wl-blue)';
      return `<button type="button" class="${cls}" data-sim-id="${escapeHtml(sim.id)}">
        <span class="pill-swatch" style="background: ${dotColor};"></span>
        <span>${escapeHtml(sim.name)}</span>
      </button>`;
    })
    .join('\n');

  const matrixRowsMarkup = doc.nodes
    .map((n) => {
      const adj = getAdjacencyLists(doc, n.id);
      const upStr = adj.upstream.length > 0 ? adj.upstream.map((u) => u.title).join(', ') : 'Entry Point';
      const downStr = adj.downstream.length > 0 ? adj.downstream.map((d) => d.title).join(', ') : 'Terminal Sink';
      return `<tr>
        <td><strong>${escapeHtml(n.title)}</strong><br><span style="color: var(--wl-ink-muted); font-size: 0.78rem;">${escapeHtml(n.subtitle)}</span></td>
        <td><code>${escapeHtml(n.kind.toUpperCase())}</code></td>
        <td>${escapeHtml(upStr)}</td>
        <td>${escapeHtml(downStr)}</td>
        <td>${escapeHtml(n.interfaceLabel)}</td>
      </tr>`;
    })
    .join('\n');

  const runtimeNodes: Record<
    string,
    {
      title: string;
      tierLabel: string;
      accent: StreamTone;
      summary: string;
      metrics: Array<{ label: string; value: string }>;
      upstream: string[];
      downstream: string[];
      code: string;
      center: [number, number];
    }
  > = {};

  for (const n of doc.nodes) {
    const adj = getAdjacencyLists(doc, n.id);
    runtimeNodes[n.id] = {
      title: `${n.title}${n.subtitle ? ` — ${n.subtitle}` : ''}`,
      tierLabel: `${n.eyebrow} · ${n.zoneLabel}`,
      accent: n.accent,
      summary: n.summary,
      metrics: n.metrics,
      upstream: adj.upstream.map((u) => u.id),
      downstream: adj.downstream.map((d) => d.id),
      code: n.code,
      center: [Math.round(n.x + n.width / 2), Math.round(n.y + n.height / 2)],
    };
  }

  const runtimePayload = {
    overviewSummary: doc.overviewSummary,
    nodes: runtimeNodes,
    nodeShortLabels: Object.fromEntries(doc.nodes.map((n) => [n.id, n.title])),
    simulations,
  };

  const exportedStyleTag = `<style>
@layer reset, tokens, layout, stage, components, dialogs, utilities;

${sharedCss}
${viewerCss}
</style>`;

  const brand = normalizeBrand(doc.brand);
  const brandAttrs = brand.accent ? ` data-brand style="--brand-accent: ${brand.accent}"` : '';
  const brandNameMarkup = brand.name
    ? `<span class="brand-name">${escapeHtml(brand.name)}</span><span aria-hidden="true">·</span>`
    : '';
  const brandMark = brand.logo
    ? `<div class="brand-mark" aria-hidden="true"><img class="brand-logo" alt="" src="${escapeHtml(brand.logo)}"></div>`
    : `<div class="brand-mark" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3"/><path d="M3 12h6m6 0h6M12 3v6m0 6v6"/>
        </svg>
      </div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <script>
${colorSchemeBoot}
  </script>
  <title>${escapeHtml(doc.title)}</title>
  ${exportedStyleTag}
</head>
<body>
  <header class="topbar"${brandAttrs}>
    <div class="brand-cluster">
      ${brandMark}
      <div>
        <div class="eyebrow-row">
          ${brandNameMarkup}
          <span class="live-dot" aria-hidden="true"></span>
          <span>${escapeHtml(doc.systemTag)}</span>
          <span aria-hidden="true">·</span>
          <span>${escapeHtml(doc.statusLabel)}</span>
        </div>
        <h1>${escapeHtml(doc.title)}</h1>
      </div>
    </div>

    <div class="toolbar-actions" role="toolbar" aria-label="Architecture controls">
      ${filterPillsMarkup}
      ${simButtonsMarkup}
      <button type="button" class="btn" id="btn-toggle-motion" aria-pressed="false">Pause</button>
      <button type="button" class="btn" id="btn-enter-presentation" aria-label="Presentation mode (P)" data-tip="Present (P)">Present</button>
      <button type="button" class="btn" id="btn-open-matrix">Matrix</button>
      <button type="button" class="btn btn-icon-only" id="btn-open-settings" aria-label="Display settings">⚙</button>
    </div>
  </header>

  <main class="workspace" id="workspace" data-flow="all">
    <section class="canvas-shell" aria-label="Interactive architecture diagram">
      <div class="canvas-viewport" id="canvas-viewport" tabindex="0" role="region" aria-label="Interactive architecture canvas. Drag to pan, scroll to zoom.">
        <div class="stage-world" id="stage-world" style="--stage-w: ${doc.stageWidth}px; --stage-h: ${doc.stageHeight}px">
          ${zonesMarkup}
          ${notesMarkup}
          <svg class="wires-layer" viewBox="0 0 ${doc.stageWidth} ${doc.stageHeight}" width="${doc.stageWidth}" height="${doc.stageHeight}" aria-hidden="true">
            <defs>
              ${(Object.keys(TONE_META) as StreamTone[])
                .map(
                  (tone) =>
                    `<marker id="arrow-${tone}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse"><path d="M 0 1.5 L 8.5 5 L 0 8.5 z" fill="${TONE_META[tone].cssVar}"/></marker>`,
                )
                .join('\n              ')}
            </defs>
            ${edgesMarkup}
          </svg>
          <div class="sim-packet" id="sim-packet" hidden aria-hidden="true">
            <span class="pill-swatch" id="sim-packet-dot" style="background: var(--wl-emerald);"></span>
            <span id="sim-packet-label">PACKET</span>
          </div>
          ${nodesMarkup}
        </div>
      </div>

      <div class="canvas-hud">
        <div class="hud-card"><span>Drag to pan · Wheel to zoom · Select any component to inspect</span></div>
        <div class="hud-card" role="group" aria-label="Zoom controls">
          <button type="button" class="btn btn-icon-only" id="btn-zoom-out" aria-label="Zoom out">−</button>
          <span class="zoom-readout" id="zoom-readout" aria-live="polite">100%</span>
          <button type="button" class="btn btn-icon-only" id="btn-zoom-in" aria-label="Zoom in">+</button>
          <button type="button" class="btn" id="btn-zoom-fit">Fit</button>
        </div>
      </div>
    </section>

    <aside class="inspector" aria-label="Component telemetry inspector">
      <div class="inspector-tabs">
        <div class="tablist" role="tablist" aria-label="Inspector views">
          <button type="button" class="tab-btn" role="tab" id="tab-inspector" aria-selected="true" aria-controls="panel-inspector">Inspector</button>
          <button type="button" class="tab-btn" role="tab" id="tab-trace" aria-selected="false" aria-controls="panel-trace">Live Trace</button>
        </div>
        <button type="button" class="btn" id="btn-reset-selection" style="padding: 0.25rem 0.55rem; min-block-size: 1.85rem; font-size: 0.75rem;">Overview</button>
      </div>

      <div class="inspector-scroll" id="inspector-scope">
        <div id="panel-inspector" role="tabpanel" aria-labelledby="tab-inspector">
          <div class="inspector-badge-row">
            <span class="tier-badge" id="insp-badge">OVERVIEW</span>
            <span id="insp-id" style="font-family: var(--wl-font-mono); font-size: 0.75rem; color: var(--wl-ink-muted);">SYS</span>
          </div>
          <h2 class="inspector-title" id="insp-title">${escapeHtml(doc.title)}</h2>
          <p class="inspector-summary" id="insp-summary">${escapeHtml(doc.overviewSummary)}</p>
          <div class="inspector-section">
            <h3 class="section-heading">TELEMETRY &amp; METRICS</h3>
            <div class="metrics-grid" id="insp-metrics"></div>
          </div>
          <div class="inspector-section">
            <h3 class="section-heading">CONNECTED LINEAGE</h3>
            <div class="lineage-group" id="insp-lineage"></div>
          </div>
          <div class="inspector-section">
            <h3 class="section-heading">INTERFACE PAYLOAD</h3>
            <pre class="code-card" tabindex="0"><code id="insp-code"></code></pre>
          </div>
        </div>

        <div id="panel-trace" role="tabpanel" aria-labelledby="tab-trace" hidden>
          <div class="inspector-badge-row">
            <span class="tier-badge">EXECUTION TRACE</span>
            <button type="button" class="btn" id="btn-clear-trace" style="padding: 0.2rem 0.5rem; min-block-size: 1.75rem; font-size: 0.75rem;">Clear</button>
          </div>
          <p class="inspector-summary">Trigger a simulation flow above to watch real-time packet hops across the architecture.</p>
          <ol class="trace-list" id="trace-list" aria-live="polite"></ol>
        </div>
      </div>
    </aside>
  </main>

  <div class="presentation-bar" id="presentation-bar" hidden>
    <button type="button" class="btn btn-icon-only" id="btn-pres-prev" aria-label="Previous step">←</button>
    <div class="presentation-pill-info" id="pres-pill-info">Overview</div>
    <button type="button" class="btn btn-icon-only" id="btn-pres-next" aria-label="Next step">→</button>
    <div class="presentation-bar-divider" aria-hidden="true"></div>
    <button type="button" class="btn btn-icon-only" id="btn-pres-play" aria-label="Auto-play tour">▶</button>
    <button type="button" class="btn btn-pres-exit" id="btn-pres-exit" aria-label="Exit presentation">Exit</button>
  </div>
  <aside class="presentation-caption" id="presentation-caption" aria-live="polite" hidden>
    <div class="presentation-caption-header">
      <div class="presentation-caption-badge-row">
        <span class="presentation-caption-badge" id="pres-caption-badge">OVERVIEW</span>
        <span class="presentation-caption-step" id="pres-caption-step">0 of 0</span>
      </div>
      <h2 class="presentation-caption-title" id="pres-caption-title"></h2>
      <div class="presentation-caption-subtitle" id="pres-caption-subtitle"></div>
    </div>
    <p class="presentation-caption-body" id="pres-caption-body"></p>
  </aside>

  <dialog id="matrix-dialog" closedby="any" aria-labelledby="matrix-dialog-title">
    <div class="dialog-shell">
      <div class="dialog-header">
        <h2 id="matrix-dialog-title">Architecture Specification Matrix</h2>
        <form method="dialog"><button type="submit" class="btn" autofocus>Close</button></form>
      </div>
      <div class="dialog-body">
        <table class="matrix-table">
          <caption>Complete inventory of components, upstream sources, downstream targets, and interfaces.</caption>
          <thead>
            <tr><th scope="col">Component</th><th scope="col">Kind</th><th scope="col">Upstream</th><th scope="col">Downstream</th><th scope="col">Interface</th></tr>
          </thead>
          <tbody>${matrixRowsMarkup}</tbody>
        </table>
      </div>
    </div>
  </dialog>

  <dialog id="settings-dialog" closedby="any" aria-labelledby="settings-dialog-title">
    <div class="dialog-shell">
      <div class="dialog-header">
        <h2 id="settings-dialog-title">Display Preferences</h2>
        <form method="dialog"><button type="submit" class="btn" autofocus>Done</button></form>
      </div>
      <div class="dialog-body">
        <fieldset class="theme-fieldset">
          <legend style="font-weight: 700; padding-inline: 0.35rem; font-size: 0.85rem;">Color Scheme</legend>
          <label class="theme-option">
            <span><strong>System Default</strong><span class="theme-option-sub">Follow OS appearance</span></span>
            <input type="radio" name="theme-choice" value="system" checked>
          </label>
          <label class="theme-option">
            <span><strong>Dark Slate</strong><span class="theme-option-sub">High-contrast dark canvas</span></span>
            <input type="radio" name="theme-choice" value="dark">
          </label>
          <label class="theme-option">
            <span><strong>Light Blueprint</strong><span class="theme-option-sub">Daylight architectural drafting paper</span></span>
            <input type="radio" name="theme-choice" value="light">
          </label>
        </fieldset>
      </div>
    </div>
  </dialog>

  <script>
    (() => {
      const DATA = ${serializeScriptJson(runtimePayload)};
      const STAGE_W = ${doc.stageWidth};
      const STAGE_H = ${doc.stageHeight};

      const workspace = document.getElementById('workspace');
      const viewport = document.getElementById('canvas-viewport');
      const stageWorld = document.getElementById('stage-world');
      const zoomReadout = document.getElementById('zoom-readout');
      const nodeButtons = Array.from(document.querySelectorAll('.arch-node'));
      const conduitGroups = Array.from(document.querySelectorAll('.conduit-group'));
      const inspectorScope = document.getElementById('inspector-scope');

      const inspBadge = document.getElementById('insp-badge');
      const inspId = document.getElementById('insp-id');
      const inspTitle = document.getElementById('insp-title');
      const inspSummary = document.getElementById('insp-summary');
      const inspMetrics = document.getElementById('insp-metrics');
      const inspLineage = document.getElementById('insp-lineage');
      const inspCode = document.getElementById('insp-code');
      const traceList = document.getElementById('trace-list');
      const simPacket = document.getElementById('sim-packet');
      const simPacketDot = document.getElementById('sim-packet-dot');
      const simPacketLabel = document.getElementById('sim-packet-label');

      const supportsScopedVT = 'startViewTransition' in Element.prototype;
      function withInspectorTransition(fn) {
        if (!supportsScopedVT) { fn(); return; }
        const vt = inspectorScope.startViewTransition(() => fn());
        vt.ready.catch(() => {});
      }

      let scale = 1, panX = 0, panY = 0;
      function applyTransform() {
        var safe = scale || 1;
        stageWorld.style.zoom = safe;
        stageWorld.style.transform = 'translate(' + (panX / safe) + 'px, ' + (panY / safe) + 'px)';
        zoomReadout.textContent = Math.round(safe * 100) + '%';
      }
      function fitToViewport() {
        const r = viewport.getBoundingClientRect();
        if (!r.width || !r.height) return;
        scale = Math.max(0.4, Math.min(1.15, Math.min((r.width - 36) / STAGE_W, (r.height - 64) / STAGE_H)));
        panX = Math.round((r.width - STAGE_W * scale) / 2);
        panY = Math.max(12, Math.round((r.height - STAGE_H * scale) / 2 - 10));
        applyTransform();
      }
      function zoomAround(next, cx, cy) {
        const clamped = Math.min(1.85, Math.max(0.38, next));
        const wx = (cx - panX) / scale, wy = (cy - panY) / scale;
        scale = clamped;
        panX = cx - wx * scale;
        panY = cy - wy * scale;
        applyTransform();
      }

      let dragStart = null;
      const contacts = new Map();
      let pinch = null;
      let blockClick = false;
      function localOf(e) {
        const r = viewport.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
      }
      function pinchFrom(pts) {
        const midX = (pts[0].x + pts[1].x) / 2;
        const midY = (pts[0].y + pts[1].y) / 2;
        const distance = Math.max(Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y), 1);
        return { scale: scale, panX: panX, panY: panY, distance: distance, midX: midX, midY: midY };
      }
      function applyPinch(pts) {
        if (!pinch) return;
        const midX = (pts[0].x + pts[1].x) / 2;
        const midY = (pts[0].y + pts[1].y) / 2;
        const distance = Math.max(Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y), 1);
        const next = Math.min(1.85, Math.max(0.38, pinch.scale * (distance / pinch.distance)));
        const worldX = (pinch.midX - pinch.panX) / pinch.scale;
        const worldY = (pinch.midY - pinch.panY) / pinch.scale;
        scale = next;
        panX = midX - worldX * scale;
        panY = midY - worldY * scale;
        applyTransform();
      }
      viewport.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || e.target.closest('.arch-node, button')) return;
        dragStart = { x: e.clientX - panX, y: e.clientY - panY };
        viewport.classList.add('is-dragging');
        viewport.setPointerCapture(e.pointerId);
      });
      viewport.addEventListener('pointermove', (e) => {
        if (pinch || !dragStart || !viewport.hasPointerCapture(e.pointerId)) return;
        panX = e.clientX - dragStart.x;
        panY = e.clientY - dragStart.y;
        applyTransform();
      });
      const endDrag = () => {
        if (pinch) return;
        dragStart = null;
        viewport.classList.remove('is-dragging');
      };
      viewport.addEventListener('pointerup', endDrag);
      viewport.addEventListener('pointercancel', endDrag);
      viewport.addEventListener('lostpointercapture', endDrag);

      viewport.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || (e.pointerType !== 'touch' && e.pointerType !== 'pen')) return;
        const target = e.target;
        if (target.closest && target.closest('button, a, input, textarea, select') && !target.closest('.arch-node')) return;
        contacts.set(e.pointerId, localOf(e));
        if (contacts.size < 2) return;
        pinch = pinchFrom([...contacts.values()]);
        blockClick = true;
        dragStart = null;
        for (const id of contacts.keys()) {
          try { viewport.setPointerCapture(id); } catch (err) { /* pointer already ended */ }
        }
        e.preventDefault();
        e.stopPropagation();
      }, true);
      viewport.addEventListener('pointermove', (e) => {
        if (!contacts.has(e.pointerId)) return;
        contacts.set(e.pointerId, localOf(e));
        if (pinch && contacts.size >= 2) applyPinch([...contacts.values()]);
      }, true);
      function forgetContact(e) {
        if (!contacts.has(e.pointerId)) return;
        contacts.delete(e.pointerId);
        if (contacts.size >= 2) pinch = pinchFrom([...contacts.values()]);
        else pinch = null;
        if (contacts.size === 0) window.setTimeout(() => { blockClick = false; }, 0);
      }
      viewport.addEventListener('pointerup', forgetContact, true);
      viewport.addEventListener('pointercancel', forgetContact, true);
      document.addEventListener('click', (e) => {
        if (!blockClick) return;
        e.preventDefault();
        e.stopPropagation();
      }, true);

      viewport.addEventListener('wheel', (e) => {
        e.preventDefault();
        const r = viewport.getBoundingClientRect();
        zoomAround(scale * (e.deltaY < 0 ? 1.08 : 0.92), e.clientX - r.left, e.clientY - r.top);
      }, { passive: false });

      document.getElementById('btn-zoom-in').addEventListener('click', () => {
        const r = viewport.getBoundingClientRect(); zoomAround(scale * 1.15, r.width / 2, r.height / 2);
      });
      document.getElementById('btn-zoom-out').addEventListener('click', () => {
        const r = viewport.getBoundingClientRect(); zoomAround(scale / 1.15, r.width / 2, r.height / 2);
      });
      document.getElementById('btn-zoom-fit').addEventListener('click', fitToViewport);
      window.addEventListener('resize', fitToViewport);

      function renderMetrics(items) {
        inspMetrics.replaceChildren();
        for (const m of items) {
          const box = document.createElement('div'); box.className = 'metric-box';
          const l = document.createElement('span'); l.className = 'metric-label'; l.textContent = m.label;
          const v = document.createElement('span'); v.className = 'metric-value'; v.textContent = m.value;
          box.append(l, v); inspMetrics.appendChild(box);
        }
      }
      function renderLineage(up, down) {
        inspLineage.replaceChildren();
        const buildRow = (title, ids) => {
          const wrap = document.createElement('div');
          const lbl = document.createElement('span'); lbl.className = 'metric-label'; lbl.style.marginBlockEnd = '0.25rem'; lbl.textContent = title;
          wrap.appendChild(lbl);
          const row = document.createElement('div'); row.className = 'lineage-chips';
          if (!ids.length) {
            const none = document.createElement('span'); none.style.fontSize = '0.8rem'; none.style.color = 'var(--wl-ink-muted)'; none.textContent = 'None';
            row.appendChild(none);
          } else {
            for (const id of ids) {
              const b = document.createElement('button'); b.type = 'button'; b.className = 'lineage-chip';
              b.textContent = DATA.nodeShortLabels[id] || id;
              b.addEventListener('click', () => selectNode(id));
              row.appendChild(b);
            }
          }
          wrap.appendChild(row);
          return wrap;
        };
        inspLineage.append(buildRow('Upstream Sources', up), buildRow('Downstream Consumers', down));
      }

      function selectNode(nodeId) {
        const data = DATA.nodes[nodeId];
        if (!data) return;
        for (const btn of nodeButtons) {
          const id = btn.dataset.node;
          const connected = id === nodeId || data.upstream.includes(id) || data.downstream.includes(id);
          btn.setAttribute('aria-pressed', String(id === nodeId));
          btn.classList.toggle('is-dimmed', !connected);
        }
        for (const g of conduitGroups) {
          const touches = g.dataset.from === nodeId || g.dataset.to === nodeId;
          g.classList.toggle('is-highlighted', touches);
          g.classList.toggle('is-dimmed', !touches);
        }
        withInspectorTransition(() => {
          inspBadge.textContent = data.tierLabel;
          inspId.textContent = nodeId.toUpperCase();
          inspTitle.textContent = data.title;
          inspSummary.textContent = data.summary;
          renderMetrics(data.metrics);
          renderLineage(data.upstream, data.downstream);
          inspCode.textContent = data.code;
        });
      }

      function showOverview() {
        for (const btn of nodeButtons) { btn.setAttribute('aria-pressed', 'false'); btn.classList.remove('is-dimmed'); }
        for (const g of conduitGroups) g.classList.remove('is-highlighted', 'is-dimmed');
        withInspectorTransition(() => {
          inspBadge.textContent = 'SYSTEM OVERVIEW';
          inspId.textContent = 'ALL';
          inspTitle.textContent = ${serializeScriptJson(doc.title)};
          inspSummary.textContent = DATA.overviewSummary;
          renderMetrics([
            { label: 'Components', value: String(Object.keys(DATA.nodes).length) },
            { label: 'Streams', value: String(conduitGroups.length) }
          ]);
          renderLineage([], Object.keys(DATA.nodes));
          inspCode.textContent = JSON.stringify({ title: ${serializeScriptJson(doc.title)}, nodes: Object.keys(DATA.nodes).length, streams: conduitGroups.length }, null, 2);
        });
      }

      for (const btn of nodeButtons) btn.addEventListener('click', () => selectNode(btn.dataset.node));
      document.getElementById('btn-reset-selection').addEventListener('click', showOverview);

      for (const radio of document.querySelectorAll('input[name="flow-filter"]')) {
        radio.addEventListener('change', () => { if (radio.checked) workspace.dataset.flow = radio.value; });
      }

      const tabInsp = document.getElementById('tab-inspector');
      const tabTrace = document.getElementById('tab-trace');
      const panelInsp = document.getElementById('panel-inspector');
      const panelTrace = document.getElementById('panel-trace');
      function switchTab(mode) {
        const isInsp = mode === 'inspector';
        tabInsp.setAttribute('aria-selected', String(isInsp));
        tabTrace.setAttribute('aria-selected', String(!isInsp));
        withInspectorTransition(() => { panelInsp.hidden = !isInsp; panelTrace.hidden = isInsp; });
      }
      tabInsp.addEventListener('click', () => switchTab('inspector'));
      tabTrace.addEventListener('click', () => switchTab('trace'));

      function appendTrace(stepLabel, message, tone) {
        const li = document.createElement('li'); li.className = 'trace-item'; li.dataset.tone = tone;
        const meta = document.createElement('div'); meta.className = 'trace-meta';
        const s1 = document.createElement('span'); s1.textContent = stepLabel;
        const s2 = document.createElement('span'); s2.textContent = new Date().toLocaleTimeString([], { hour12: false });
        meta.append(s1, s2);
        const body = document.createElement('p'); body.className = 'trace-body'; body.textContent = message;
        li.append(meta, body);
        traceList.prepend(li);
      }

      const TONE_CSS = ${serializeScriptJson(TONE_CSS)};

      let simTimer = null;
      function clearSim() {
        if (simTimer) { clearTimeout(simTimer); simTimer = null; }
        simPacket.hidden = true;
        for (const btn of nodeButtons) delete btn.dataset.simActive;
      }

      function runSim(simId) {
        const scenario = DATA.simulations.find((s) => s.id === simId);
        if (!scenario || !scenario.steps.length) return;
        clearSim();
        switchTab('trace');
        workspace.dataset.flow = 'all';
        const allRadio = document.querySelector('input[name="flow-filter"][value="all"]');
        if (allRadio) allRadio.checked = true;

        let idx = 0;
        const stepNext = () => {
          if (idx >= scenario.steps.length) {
            simTimer = setTimeout(clearSim, 1100);
            return;
          }
          const st = scenario.steps[idx];
          const [accent, soft] = TONE_CSS[st.tone] || TONE_CSS.emerald;
          for (const btn of nodeButtons) {
            if (st.nodes.includes(btn.dataset.node)) {
              btn.dataset.simActive = 'true';
              btn.style.setProperty('--sim-accent', accent);
              btn.style.setProperty('--sim-accent-soft', soft);
            } else {
              delete btn.dataset.simActive;
            }
          }
          const anchor = DATA.nodes[st.nodes[0]];
          if (anchor) {
            simPacket.hidden = false;
            simPacket.dataset.tone = st.tone;
            simPacketDot.style.background = accent;
            simPacketLabel.textContent = st.label;
            simPacket.style.setProperty('--px', String(anchor.center[0]));
            simPacket.style.setProperty('--py', String(anchor.center[1] - 64));
          }
          appendTrace('STEP 0' + (idx + 1), st.trace, st.tone);
          idx++;
          simTimer = setTimeout(stepNext, 950);
        };
        stepNext();
      }

      for (const btn of document.querySelectorAll('[data-sim-id]')) {
        btn.addEventListener('click', () => runSim(btn.dataset.simId));
      }
      document.getElementById('btn-clear-trace').addEventListener('click', () => traceList.replaceChildren());

      const btnMotion = document.getElementById('btn-toggle-motion');
      btnMotion.addEventListener('click', () => {
        const paused = document.body.classList.toggle('motion-paused');
        btnMotion.setAttribute('aria-pressed', String(paused));
        btnMotion.textContent = paused ? 'Resume' : 'Pause';
      });

      const matrixDialog = document.getElementById('matrix-dialog');
      const settingsDialog = document.getElementById('settings-dialog');
      document.getElementById('btn-open-matrix').addEventListener('click', () => matrixDialog.showModal());
      document.getElementById('btn-open-settings').addEventListener('click', () => settingsDialog.showModal());

      if (!('closedBy' in HTMLDialogElement.prototype)) {
        const outside = (e, d) => {
          const r = d.getBoundingClientRect();
          return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
        };
        for (const d of [matrixDialog, settingsDialog]) {
          let downOut = false;
          d.addEventListener('pointerdown', (e) => { downOut = outside(e, d); });
          d.addEventListener('pointerup', (e) => { if (downOut && outside(e, d)) d.close(); });
        }
      }

      // Presentation Mode & Guided Tour
      const presBar = document.getElementById('presentation-bar');
      const presCaption = document.getElementById('presentation-caption');
      const presPill = document.getElementById('pres-pill-info');
      const presBadge = document.getElementById('pres-caption-badge');
      const presStep = document.getElementById('pres-caption-step');
      const presTitle = document.getElementById('pres-caption-title');
      const presSubtitle = document.getElementById('pres-caption-subtitle');
      const presBody = document.getElementById('pres-caption-body');
      const btnPresPlay = document.getElementById('btn-pres-play');

      const tourNodes = Object.entries(DATA.nodes);
      let presActive = false;
      let presIndex = 0;
      let presAutoPlayTimer = null;

      function updatePresUi() {
        if (!presActive) return;
        presBar.hidden = false;
        presCaption.hidden = false;
        if (presIndex === 0) {
          presPill.textContent = 'Overview (' + tourNodes.length + ' nodes)';
          presBadge.textContent = 'ARCHITECTURE';
          presStep.textContent = 'System Overview';
          presTitle.textContent = ${serializeScriptJson(doc.title || 'Architecture Overview')};
          presSubtitle.textContent = 'System Architecture';
          presBody.textContent = ${serializeScriptJson(doc.overviewSummary || 'Comprehensive view of system components, boundaries, and real-time event telemetry.')};
          showOverview();
          fitToViewport();
        } else {
          const entry = tourNodes[presIndex - 1];
          const nId = entry[0];
          const n = entry[1];
          presPill.textContent = presIndex + ' of ' + tourNodes.length;
          presBadge.textContent = 'COMPONENT';
          presStep.textContent = 'Step ' + presIndex + ' of ' + tourNodes.length;
          presTitle.textContent = n.title || nId;
          presSubtitle.textContent = n.subtitle || ('Component 0' + presIndex);
          presBody.textContent = n.summary || ('Active component in system architecture transmitting ' + n.tone + ' telemetry.');
          selectNode(nId);
          const r = viewport.getBoundingClientRect();
          scale = 1.05;
          panX = Math.round((r.width / 2) - n.center[0] * scale);
          panY = Math.round((r.height / 2) - n.center[1] * scale - 40);
          applyTransform();
        }
      }

      function enterPresentation(idx) {
        presActive = true;
        document.body.dataset.presenting = 'true';
        presIndex = idx || 0;
        updatePresUi();
      }

      function exitPresentation() {
        presActive = false;
        delete document.body.dataset.presenting;
        presBar.hidden = true;
        presCaption.hidden = true;
        if (presAutoPlayTimer) { clearInterval(presAutoPlayTimer); presAutoPlayTimer = null; }
        fitToViewport();
      }

      function presNext() {
        if (!presActive) return;
        presIndex = (tourNodes.length === 0) ? 0 : (presIndex + 1) % (tourNodes.length + 1);
        updatePresUi();
      }

      function presPrev() {
        if (!presActive) return;
        presIndex = (tourNodes.length === 0) ? 0 : (presIndex - 1 + tourNodes.length + 1) % (tourNodes.length + 1);
        updatePresUi();
      }

      function togglePresAutoPlay() {
        if (presAutoPlayTimer) {
          clearInterval(presAutoPlayTimer);
          presAutoPlayTimer = null;
          btnPresPlay.textContent = '▶';
        } else {
          btnPresPlay.textContent = '⏸';
          presAutoPlayTimer = setInterval(presNext, 4500);
        }
      }

      document.getElementById('btn-enter-presentation')?.addEventListener('click', () => {
        if (presActive) exitPresentation(); else enterPresentation(0);
      });
      document.getElementById('btn-pres-exit')?.addEventListener('click', exitPresentation);
      document.getElementById('btn-pres-next')?.addEventListener('click', () => {
        if (presAutoPlayTimer) togglePresAutoPlay();
        presNext();
      });
      document.getElementById('btn-pres-prev')?.addEventListener('click', () => {
        if (presAutoPlayTimer) togglePresAutoPlay();
        presPrev();
      });
      btnPresPlay?.addEventListener('click', togglePresAutoPlay);

      window.addEventListener('keydown', (e) => {
        if (presActive) {
          if (e.key === 'Escape' || e.key.toLowerCase() === 'p') { e.preventDefault(); exitPresentation(); return; }
          if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); presNext(); return; }
          if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); presPrev(); return; }
          if (e.key === 'Home') { e.preventDefault(); presIndex = 0; updatePresUi(); return; }
        } else if (e.key.toLowerCase() === 'p' && !e.metaKey && !e.ctrlKey) {
          const activeTag = (document.activeElement || {}).tagName;
          if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') return;
          e.preventDefault();
          enterPresentation(0);
        }
      });

      window.conduitBindColorScheme(document.querySelector('meta[name="color-scheme"]'));

      const firstId = Object.keys(DATA.nodes)[0];
      if (firstId) selectNode(firstId);
      else showOverview();
      requestAnimationFrame(fitToViewport);
    })();
  </script>
</body>
</html>`;
}
