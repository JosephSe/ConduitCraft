import type { DiagramDocument, DiagramNode, StreamTone } from '../types';
import { getAdjacencyLists, getEffectiveSimulations, routeDiagramEdges } from '../core/layout';
import { renderHumanOutlineMarkup, renderIconMarkup } from '../ui/icons';

function escapeHtml(value: string): string {
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

const TONE_META: Record<StreamTone, { shortLabel: string; cssVar: string }> = {
  blue: { shortLabel: 'Primary', cssVar: 'var(--wl-blue)' },
  emerald: { shortLabel: 'Success', cssVar: 'var(--wl-emerald)' },
  rose: { shortLabel: 'Exception', cssVar: 'var(--wl-rose)' },
  violet: { shortLabel: 'Control', cssVar: 'var(--wl-violet)' },
  amber: { shortLabel: 'Async', cssVar: 'var(--wl-amber)' },
};

function renderExportedNode(node: DiagramNode, index: number): string {
  const pressed = index === 0 ? 'true' : 'false';
  if (node.kind === 'actor') {
    return `
      <button type="button" class="arch-node" data-node="${escapeHtml(node.id)}" data-kind="actor" data-accent="${escapeHtml(node.accent)}" aria-pressed="${pressed}" style="--nx: ${node.x}; --ny: ${node.y}; --nw: ${node.width}; --nh: ${node.height};">
        <span class="actor-figure">${renderHumanOutlineMarkup()}</span>
        <span class="actor-caption">
          <span class="node-title">${escapeHtml(node.title)}</span>
          ${node.subtitle ? `<span class="actor-role">${escapeHtml(node.subtitle)}</span>` : ''}
        </span>
      </button>`;
  }

  if (node.kind === 'client') {
    return `
      <button type="button" class="arch-node" data-node="${escapeHtml(node.id)}" data-kind="client" data-accent="${escapeHtml(node.accent)}" aria-pressed="${pressed}" style="--nx: ${node.x}; --ny: ${node.y}; --nw: ${node.width}; --nh: ${node.height};">
        <div class="node-top">
          <span class="node-icon">${renderIconMarkup(node.icon, 16)}</span>
          <span class="micro-chip">${escapeHtml(node.chip)}</span>
        </div>
        <div>
          <span class="node-title">${escapeHtml(node.title)}</span>
          <span class="node-sub">${escapeHtml(node.subtitle)}</span>
        </div>
      </button>`;
  }

  return `
    <button type="button" class="arch-node" data-node="${escapeHtml(node.id)}" data-kind="${escapeHtml(node.kind)}" data-accent="${escapeHtml(node.accent)}" aria-pressed="${pressed}" style="--nx: ${node.x}; --ny: ${node.y}; --nw: ${node.width}; --nh: ${node.height};">
      <div class="node-top">
        <span class="node-icon">${renderIconMarkup(node.icon, 19)}</span>
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
            .map(
              (item) => `<li>
            <span class="spec-check" aria-hidden="true">✓</span>
            <span><strong>${escapeHtml(item.title)}:</strong> ${escapeHtml(item.text)}</span>
          </li>`,
            )
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

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <script>
    try {
      const savedScheme = localStorage.getItem("blueprint-studio-color-scheme");
      if (savedScheme === "light" || savedScheme === "dark") {
        document.querySelector('meta[name="color-scheme"]').content = savedScheme;
      }
    } catch (_) {}
  </script>
  <title>${escapeHtml(doc.title)}</title>
  <style>
    @layer reset, tokens, layout, stage, components, dialogs, utilities;

    @layer reset {
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      html, body { height: 100%; overflow: hidden; }
      button, input, select, textarea { font: inherit; color: inherit; }
      ul, ol { list-style: none; }
    }

    @layer tokens {
      :root {
        --in-oklab: ;
        --wl-canvas-light: #f4f7fb;
        --wl-canvas-dark: #070b14;
        --wl-panel-light: rgba(255, 255, 255, 0.88);
        --wl-panel-dark: rgba(13, 19, 34, 0.86);
        --wl-surface-light: #ffffff;
        --wl-surface-dark: #101829;
        --wl-surface-elevated-light: #eef3fa;
        --wl-surface-elevated-dark: #17223a;
        --wl-surface-code-light: #0f172a;
        --wl-surface-code-dark: #060912;
        --wl-ink-light: #0b1324;
        --wl-ink-dark: #f1f5f9;
        --wl-ink-secondary-light: #3e4e68;
        --wl-ink-secondary-dark: #9fb0ca;
        --wl-ink-muted-light: #596b87;
        --wl-ink-muted-dark: #7e92b2;
        --wl-border-ui-light: #b6c5db;
        --wl-border-ui-dark: #2a3b5c;
        --wl-border-subtle-light: #dce5f2;
        --wl-border-subtle-dark: #1b2842;
        --wl-grid-dot-light: rgba(51, 78, 122, 0.18);
        --wl-grid-dot-dark: rgba(125, 158, 214, 0.16);
        --wl-blue-light: #1d4ed8;
        --wl-blue-dark: #60a5fa;
        --wl-blue-soft-light: rgba(29, 78, 216, 0.12);
        --wl-blue-soft-dark: rgba(96, 165, 250, 0.16);
        --wl-emerald-light: #047857;
        --wl-emerald-dark: #34d399;
        --wl-emerald-soft-light: rgba(4, 120, 87, 0.12);
        --wl-emerald-soft-dark: rgba(52, 211, 153, 0.16);
        --wl-rose-light: #be123c;
        --wl-rose-dark: #fb7185;
        --wl-rose-soft-light: rgba(190, 18, 60, 0.11);
        --wl-rose-soft-dark: rgba(251, 113, 133, 0.16);
        --wl-amber-light: #b45309;
        --wl-amber-dark: #fbbf24;
        --wl-amber-soft-light: rgba(180, 83, 9, 0.12);
        --wl-amber-soft-dark: rgba(251, 191, 36, 0.16);
        --wl-violet-light: #5b21b6;
        --wl-violet-dark: #a78bfa;
        --wl-violet-soft-light: rgba(91, 33, 182, 0.12);
        --wl-violet-soft-dark: rgba(167, 139, 250, 0.2);
        --wl-scroll-thumb-light: #7c8fa9;
        --wl-scroll-thumb-dark: #4c6185;
        --wl-scroll-track-light: #e2e8f2;
        --wl-scroll-track-dark: #0a101f;

        --wl-canvas: var(--wl-canvas-light);
        --wl-panel: var(--wl-panel-light);
        --wl-surface: var(--wl-surface-light);
        --wl-surface-elevated: var(--wl-surface-elevated-light);
        --wl-surface-code: var(--wl-surface-code-light);
        --wl-ink: var(--wl-ink-light);
        --wl-ink-secondary: var(--wl-ink-secondary-light);
        --wl-ink-muted: var(--wl-ink-muted-light);
        --wl-border-ui: var(--wl-border-ui-light);
        --wl-border-subtle: var(--wl-border-subtle-light);
        --wl-grid-dot: var(--wl-grid-dot-light);
        --wl-blue: var(--wl-blue-light);
        --wl-blue-soft: var(--wl-blue-soft-light);
        --wl-emerald: var(--wl-emerald-light);
        --wl-emerald-soft: var(--wl-emerald-soft-light);
        --wl-rose: var(--wl-rose-light);
        --wl-rose-soft: var(--wl-rose-soft-light);
        --wl-amber: var(--wl-amber-light);
        --wl-amber-soft: var(--wl-amber-soft-light);
        --wl-violet: var(--wl-violet-light);
        --wl-violet-soft: var(--wl-violet-soft-light);
        --wl-scroll-thumb: var(--wl-scroll-thumb-light);
        --wl-scroll-track: var(--wl-scroll-track-light);

        --wl-font-sans: 'Inter', 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
        --wl-font-mono: 'JetBrains Mono', 'SF Mono', ui-monospace, Menlo, Consolas, monospace;
        --wl-shadow-card: 0 1px 2px rgba(2, 6, 23, 0.12), 0 10px 28px -6px rgba(2, 6, 23, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.12);
        --wl-shadow-elevated: 0 4px 12px rgba(2, 6, 23, 0.2), 0 24px 48px -12px rgba(2, 6, 23, 0.42), inset 0 1px 0 rgba(255, 255, 255, 0.18);

        color-scheme: light dark;
        accent-color: var(--wl-blue);
        scrollbar-width: thin;
        scrollbar-color: var(--wl-scroll-thumb) var(--wl-scroll-track);

        @media (prefers-color-scheme: dark) {
          --wl-canvas: var(--wl-canvas-dark);
          --wl-panel: var(--wl-panel-dark);
          --wl-surface: var(--wl-surface-dark);
          --wl-surface-elevated: var(--wl-surface-elevated-dark);
          --wl-surface-code: var(--wl-surface-code-dark);
          --wl-ink: var(--wl-ink-dark);
          --wl-ink-secondary: var(--wl-ink-secondary-dark);
          --wl-ink-muted: var(--wl-ink-muted-dark);
          --wl-border-ui: var(--wl-border-ui-dark);
          --wl-border-subtle: var(--wl-border-subtle-dark);
          --wl-grid-dot: var(--wl-grid-dot-dark);
          --wl-blue: var(--wl-blue-dark);
          --wl-blue-soft: var(--wl-blue-soft-dark);
          --wl-emerald: var(--wl-emerald-dark);
          --wl-emerald-soft: var(--wl-emerald-soft-dark);
          --wl-rose: var(--wl-rose-dark);
          --wl-rose-soft: var(--wl-rose-soft-dark);
          --wl-amber: var(--wl-amber-dark);
          --wl-amber-soft: var(--wl-amber-soft-dark);
          --wl-violet: var(--wl-violet-dark);
          --wl-violet-soft: var(--wl-violet-soft-dark);
          --wl-scroll-thumb: var(--wl-scroll-thumb-dark);
          --wl-scroll-track: var(--wl-scroll-track-dark);
        }

        &:has(> head > meta[name="color-scheme"][content="dark"]) {
          color-scheme: dark;
          --wl-canvas: var(--wl-canvas-dark);
          --wl-panel: var(--wl-panel-dark);
          --wl-surface: var(--wl-surface-dark);
          --wl-surface-elevated: var(--wl-surface-elevated-dark);
          --wl-surface-code: var(--wl-surface-code-dark);
          --wl-ink: var(--wl-ink-dark);
          --wl-ink-secondary: var(--wl-ink-secondary-dark);
          --wl-ink-muted: var(--wl-ink-muted-dark);
          --wl-border-ui: var(--wl-border-ui-dark);
          --wl-border-subtle: var(--wl-border-subtle-dark);
          --wl-grid-dot: var(--wl-grid-dot-dark);
          --wl-blue: var(--wl-blue-dark);
          --wl-blue-soft: var(--wl-blue-soft-dark);
          --wl-emerald: var(--wl-emerald-dark);
          --wl-emerald-soft: var(--wl-emerald-soft-dark);
          --wl-rose: var(--wl-rose-dark);
          --wl-rose-soft: var(--wl-rose-soft-dark);
          --wl-amber: var(--wl-amber-dark);
          --wl-amber-soft: var(--wl-amber-soft-dark);
          --wl-violet: var(--wl-violet-dark);
          --wl-violet-soft: var(--wl-violet-soft-dark);
          --wl-scroll-thumb: var(--wl-scroll-thumb-dark);
          --wl-scroll-track: var(--wl-scroll-track-dark);
        }

        &:has(> head > meta[name="color-scheme"][content="light"]) {
          color-scheme: light;
          --wl-canvas: var(--wl-canvas-light);
          --wl-panel: var(--wl-panel-light);
          --wl-surface: var(--wl-surface-light);
          --wl-surface-elevated: var(--wl-surface-elevated-light);
          --wl-surface-code: var(--wl-surface-code-light);
          --wl-ink: var(--wl-ink-light);
          --wl-ink-secondary: var(--wl-ink-secondary-light);
          --wl-ink-muted: var(--wl-ink-muted-light);
          --wl-border-ui: var(--wl-border-ui-light);
          --wl-border-subtle: var(--wl-border-subtle-light);
          --wl-grid-dot: var(--wl-grid-dot-light);
          --wl-blue: var(--wl-blue-light);
          --wl-blue-soft: var(--wl-blue-soft-light);
          --wl-emerald: var(--wl-emerald-light);
          --wl-emerald-soft: var(--wl-emerald-soft-light);
          --wl-rose: var(--wl-rose-light);
          --wl-rose-soft: var(--wl-rose-soft-light);
          --wl-amber: var(--wl-amber-light);
          --wl-amber-soft: var(--wl-amber-soft-light);
          --wl-violet: var(--wl-violet-light);
          --wl-violet-soft: var(--wl-violet-soft-light);
          --wl-scroll-thumb: var(--wl-scroll-thumb-light);
          --wl-scroll-track: var(--wl-scroll-track-light);
        }
      }

      @supports (background: linear-gradient(in oklab, white, black)) {
        :root { --in-oklab: in oklab; }
      }
    }

    @layer layout {
      body {
        font-family: var(--wl-font-sans);
        font-size: 0.9375rem;
        line-height: 1.5;
        background-color: var(--wl-canvas);
        color: var(--wl-ink);
        display: grid;
        grid-template-rows: auto minmax(0, 1fr);
        height: 100dvh;
        -webkit-font-smoothing: antialiased;
      }

      .topbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        padding-inline: 1.25rem;
        padding-block: 0.75rem;
        background: var(--wl-panel);
        backdrop-filter: blur(18px);
        border-block-end: 1px solid var(--wl-border-subtle);
        z-index: 20;
        flex-wrap: wrap;
      }

      .brand-cluster { display: flex; align-items: center; gap: 0.875rem; min-inline-size: 0; }
      .brand-mark {
        inline-size: 2.35rem; block-size: 2.35rem; border-radius: 0.7rem;
        display: grid; place-items: center;
        background: linear-gradient(135deg var(--in-oklab), var(--wl-blue), var(--wl-emerald));
        color: #fff; box-shadow: 0 6px 18px rgba(37, 99, 235, 0.32); flex-shrink: 0;
      }
      .eyebrow-row {
        display: flex; align-items: center; gap: 0.5rem;
        font-family: var(--wl-font-mono); font-size: 0.75rem; letter-spacing: 0.04em; color: var(--wl-ink-muted);
      }
      .live-dot {
        inline-size: 0.5rem; block-size: 0.5rem; border-radius: 999px;
        background: var(--wl-emerald); box-shadow: 0 0 0 3px var(--wl-emerald-soft);
      }
      h1 { font-size: clamp(1rem, 1.35vw, 1.2rem); font-weight: 700; letter-spacing: -0.02em; line-height: 1.2; }
      .toolbar-actions { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
      .workspace { display: grid; grid-template-columns: minmax(0, 1fr) 24rem; min-block-size: 0; position: relative; }
      @media (max-width: 68rem) {
        .workspace { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) 20rem; }
      }
    }

    @layer components {
      .segmented-group {
        display: inline-flex; align-items: center; background: var(--wl-surface-elevated);
        padding: 0.1875rem; border-radius: 0.625rem; border: 1px solid var(--wl-border-subtle); gap: 0.125rem;
      }
      .segmented-label {
        display: inline-flex; align-items: center; gap: 0.35rem; padding-inline: 0.625rem; padding-block: 0.3rem;
        border-radius: 0.45rem; font-size: 0.8125rem; font-weight: 600; color: var(--wl-ink-secondary);
        cursor: pointer; user-select: none; -webkit-user-select: none;
      }
      .segmented-label:has(input:checked) { background: var(--wl-surface); color: var(--wl-ink); box-shadow: 0 1px 3px rgba(2, 6, 23, 0.14); }
      .pill-swatch { inline-size: 0.5rem; block-size: 0.5rem; border-radius: 999px; }

      .btn {
        display: inline-flex; align-items: center; justify-content: center; gap: 0.425rem;
        padding-inline: 0.8rem; padding-block: 0.425rem; min-block-size: 2.25rem;
        border-radius: 0.625rem; border: 1px solid var(--wl-border-ui);
        background: var(--wl-surface); color: var(--wl-ink); font-size: 0.8125rem; font-weight: 600;
        cursor: pointer; user-select: none; -webkit-user-select: none;
        transition: transform 0.15s ease, border-color 0.15s ease, background-color 0.15s ease;
      }
      .btn:hover { background: var(--wl-surface-elevated); }
      .btn:focus-visible { outline: 2px solid var(--wl-blue); outline-offset: 2px; }
      .btn-approve { border-color: var(--wl-emerald); background: var(--wl-emerald-soft); }
      .btn-reject { border-color: var(--wl-rose); background: var(--wl-rose-soft); }
      .btn-icon-only { padding-inline: 0.55rem; min-inline-size: 2.25rem; }

      .inspector {
        background: var(--wl-panel); backdrop-filter: blur(20px); border-inline-start: 1px solid var(--wl-border-subtle);
        display: grid; grid-template-rows: auto minmax(0, 1fr); min-block-size: 0; z-index: 12;
      }
      .inspector-tabs { display: flex; align-items: center; justify-content: space-between; padding: 0.625rem 1rem; border-block-end: 1px solid var(--wl-border-subtle); }
      .tablist { display: inline-flex; background: var(--wl-surface-elevated); padding: 0.1875rem; border-radius: 0.55rem; border: 1px solid var(--wl-border-subtle); }
      .tab-btn { border: none; background: transparent; padding: 0.3rem 0.75rem; border-radius: 0.4rem; font-size: 0.8125rem; font-weight: 600; color: var(--wl-ink-secondary); cursor: pointer; }
      .tab-btn[aria-selected="true"] { background: var(--wl-surface); color: var(--wl-ink); }
      .inspector-scroll { overflow-y: auto; padding: 1.125rem; contain: layout; }
      .inspector-badge-row { display: flex; align-items: center; justify-content: space-between; margin-block-end: 0.5rem; }
      .tier-badge { display: inline-flex; align-items: center; gap: 0.375rem; padding: 0.2rem 0.6rem; border-radius: 999px; font-family: var(--wl-font-mono); font-size: 0.75rem; font-weight: 600; background: var(--wl-blue-soft); color: var(--wl-blue); border: 1px solid var(--wl-border-subtle); }
      .inspector-title { font-size: 1.25rem; font-weight: 700; letter-spacing: -0.02em; line-height: 1.25; margin-block-end: 0.375rem; }
      .inspector-summary { font-size: 0.875rem; color: var(--wl-ink-secondary); line-height: 1.55; margin-block-end: 1rem; }
      .inspector-section { margin-block-start: 1rem; padding-block-start: 0.875rem; border-block-start: 1px solid var(--wl-border-subtle); }
      .section-heading { font-family: var(--wl-font-mono); font-size: 0.75rem; font-weight: 700; letter-spacing: 0.06em; color: var(--wl-ink-muted); margin-block-end: 0.55rem; }
      .metrics-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.5rem; }
      .metric-box { background: var(--wl-surface); border: 1px solid var(--wl-border-subtle); border-radius: 0.625rem; padding: 0.625rem 0.75rem; }
      .metric-label { font-size: 0.75rem; color: var(--wl-ink-muted); display: block; }
      .metric-value { font-family: var(--wl-font-mono); font-size: 0.875rem; font-weight: 700; color: var(--wl-ink); margin-block-start: 0.125rem; display: block; }
      .lineage-group { display: flex; flex-direction: column; gap: 0.5rem; }
      .lineage-chips { display: flex; flex-wrap: wrap; gap: 0.375rem; }
      .lineage-chip { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.3rem 0.625rem; border-radius: 0.5rem; border: 1px solid var(--wl-border-ui); background: var(--wl-surface); font-size: 0.8125rem; font-weight: 600; cursor: pointer; }
      .lineage-chip:hover { border-color: var(--wl-blue); background: var(--wl-blue-soft); }
      .code-card { background: var(--wl-surface-code); color: #e2e8f0; border: 1px solid #1e293b; border-radius: 0.625rem; padding: 0.75rem; font-family: var(--wl-font-mono); font-size: 0.75rem; line-height: 1.55; overflow-x: auto; }
      .trace-list { display: flex; flex-direction: column; gap: 0.625rem; }
      .trace-item { background: var(--wl-surface); border: 1px solid var(--wl-border-subtle); border-inline-start: 3px solid var(--wl-blue); border-radius: 0.55rem; padding: 0.625rem 0.75rem; }
      .trace-item[data-tone="emerald"] { border-inline-start-color: var(--wl-emerald); }
      .trace-item[data-tone="rose"] { border-inline-start-color: var(--wl-rose); }
      .trace-item[data-tone="violet"] { border-inline-start-color: var(--wl-violet); }
      .trace-item[data-tone="amber"] { border-inline-start-color: var(--wl-amber); }
      .trace-meta { display: flex; justify-content: space-between; font-family: var(--wl-font-mono); font-size: 0.75rem; color: var(--wl-ink-muted); margin-block-end: 0.2rem; }
      .trace-body { font-size: 0.8125rem; font-weight: 500; color: var(--wl-ink); }
    }

    @layer stage {
      .canvas-shell {
        position: relative; overflow: hidden; background-color: var(--wl-canvas);
        background-image:
          radial-gradient(circle at 18% 22%, var(--wl-blue-soft), transparent 42%),
          radial-gradient(circle at 80% 72%, var(--wl-emerald-soft), transparent 45%),
          radial-gradient(var(--wl-grid-dot) 1.25px, transparent 1.25px);
        background-size: 100% 100%, 100% 100%, 24px 24px;
        isolation: isolate;
      }
      .canvas-viewport { inline-size: 100%; block-size: 100%; position: relative; overflow: hidden; cursor: grab; touch-action: none; }
      .canvas-viewport.is-dragging { cursor: grabbing; }
      .canvas-viewport:focus-visible { outline: 3px solid var(--wl-blue); outline-offset: -3px; }
      .stage-world { position: absolute; top: 0; left: 0; width: ${doc.stageWidth}px; height: ${doc.stageHeight}px; transform-origin: 0 0; will-change: transform; }

      .zone-banner {
        position: absolute; top: 18px; left: calc(var(--zx) * 1px); width: calc(var(--zw) * 1px);
        padding: 0.45rem 0.85rem; border-radius: 0.65rem; background: var(--wl-panel); border: 1px solid var(--wl-border-subtle);
        display: flex; align-items: center; justify-content: space-between; font-size: 0.75rem; font-weight: 600; letter-spacing: 0.05em; color: var(--wl-ink-muted); pointer-events: none;
      }
      .zone-banner .zone-num { font-family: var(--wl-font-mono); color: var(--wl-blue); font-weight: 700; }

      .blueprint-spec {
        position: absolute; left: calc(var(--bx) * 1px); top: calc(var(--by) * 1px); width: 404px;
        padding: 1.125rem 1.25rem; border-radius: 1rem; background: var(--wl-panel); border: 1px dashed var(--wl-border-ui); backdrop-filter: blur(12px); pointer-events: none;
      }
      .blueprint-spec-header { display: flex; align-items: center; justify-content: space-between; margin-block-end: 0.625rem; font-size: 0.75rem; font-family: var(--wl-font-mono); font-weight: 700; color: var(--wl-blue); }
      .blueprint-spec-list { display: grid; gap: 0.5rem; }
      .blueprint-spec-list li { display: flex; align-items: flex-start; gap: 0.5rem; font-size: 0.78rem; line-height: 1.4; color: var(--wl-ink-secondary); }
      .spec-check { color: var(--wl-emerald); font-weight: 700; flex-shrink: 0; }

      .wires-layer { position: absolute; inset: 0; pointer-events: none; overflow: visible; }
      .conduit-rail { fill: none; stroke: var(--wl-border-ui); stroke-width: 2.25; stroke-linecap: round; stroke-linejoin: round; opacity: 0.58; }
      .conduit-glow { fill: none; stroke-width: 8; stroke-linecap: round; opacity: 0.14; filter: blur(4px); }
      .conduit-stream {
        fill: none; stroke-width: 2.6; stroke-linecap: round; stroke-dasharray: 8 10;
        animation: pulse-dash 1.35s linear infinite;
        @media (prefers-reduced-motion: reduce) { animation: none; stroke-dasharray: none; }
      }
      .conduit-group[data-animated="false"] .conduit-stream { animation: none; stroke-dasharray: none; }
      body.motion-paused .conduit-stream { animation-play-state: paused; }
      @keyframes pulse-dash { to { stroke-dashoffset: -36; } }

      .conduit-group[data-tone="blue"] .conduit-stream, .conduit-group[data-tone="blue"] .conduit-glow { stroke: var(--wl-blue); }
      .conduit-group[data-tone="emerald"] .conduit-stream, .conduit-group[data-tone="emerald"] .conduit-glow { stroke: var(--wl-emerald); }
      .conduit-group[data-tone="rose"] .conduit-stream, .conduit-group[data-tone="rose"] .conduit-glow { stroke: var(--wl-rose); }
      .conduit-group[data-tone="violet"] .conduit-stream, .conduit-group[data-tone="violet"] .conduit-glow { stroke: var(--wl-violet); }
      .conduit-group[data-tone="amber"] .conduit-stream, .conduit-group[data-tone="amber"] .conduit-glow { stroke: var(--wl-amber); }

      .conduit-group { transition: opacity 0.22s ease; }
      .conduit-group.is-highlighted .conduit-glow { opacity: 0.42; stroke-width: 11; }
      .conduit-group.is-dimmed { opacity: 0.15; }

      .workspace[data-flow="blue"] .conduit-group:not([data-tone="blue"]) { opacity: 0.13; }
      .workspace[data-flow="emerald"] .conduit-group:not([data-tone="emerald"]) { opacity: 0.13; }
      .workspace[data-flow="rose"] .conduit-group:not([data-tone="rose"]) { opacity: 0.13; }
      .workspace[data-flow="violet"] .conduit-group:not([data-tone="violet"]) { opacity: 0.13; }
      .workspace[data-flow="amber"] .conduit-group:not([data-tone="amber"]) { opacity: 0.13; }

      .route-pill-bg { fill: var(--wl-surface); stroke: var(--wl-border-ui); stroke-width: 1.25; }
      .route-pill-text { font-family: var(--wl-font-mono); font-size: 0.75rem; font-weight: 600; fill: var(--wl-ink); }
      .port-dot { fill: var(--wl-surface); stroke: var(--wl-border-ui); stroke-width: 2; }

      .arch-node {
        position: absolute; left: calc(var(--nx) * 1px); top: calc(var(--ny) * 1px); width: calc(var(--nw) * 1px); height: calc(var(--nh) * 1px);
        display: flex; flex-direction: column; justify-content: space-between; padding: 0.95rem 1.1rem;
        border-radius: 1.1rem; background: var(--wl-surface); border: 1.5px solid var(--wl-border-ui);
        box-shadow: var(--wl-shadow-card); text-align: left; cursor: pointer;
        --node-accent: var(--wl-blue); --node-accent-soft: var(--wl-blue-soft);
        transition: transform 0.2s cubic-bezier(0.22, 1, 0.36, 1), border-color 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease;
      }
      .arch-node[data-accent="emerald"] { --node-accent: var(--wl-emerald); --node-accent-soft: var(--wl-emerald-soft); }
      .arch-node[data-accent="rose"] { --node-accent: var(--wl-rose); --node-accent-soft: var(--wl-rose-soft); }
      .arch-node[data-accent="violet"] { --node-accent: var(--wl-violet); --node-accent-soft: var(--wl-violet-soft); }
      .arch-node[data-accent="amber"] { --node-accent: var(--wl-amber); --node-accent-soft: var(--wl-amber-soft); }

      .arch-node[data-kind="core"], .arch-node[data-kind="gate"], .arch-node[data-kind="store"] {
        background: linear-gradient(160deg var(--in-oklab), var(--node-accent-soft) 0%, transparent 55%), var(--wl-surface);
      }
      .arch-node[data-kind="client"] { padding: 0.7rem 0.95rem; }

      .arch-node:hover { transform: translateY(-2px); box-shadow: var(--wl-shadow-elevated); border-color: var(--node-accent); }
      .arch-node:focus-visible { outline: 3px solid var(--wl-blue); outline-offset: 4px; }
      .arch-node[aria-pressed="true"] { border-color: var(--node-accent); box-shadow: 0 0 0 3px var(--node-accent-soft), var(--wl-shadow-elevated); transform: translateY(-2px); }
      .arch-node[data-sim-active="true"] { border-color: var(--sim-accent, var(--wl-emerald)); box-shadow: 0 0 0 5px var(--sim-accent-soft, var(--wl-emerald-soft)), var(--wl-shadow-elevated); transform: translateY(-3px) scale(1.02); }
      .arch-node.is-dimmed { opacity: 0.32; }

      .arch-node[data-kind="actor"] {
        background: transparent; border: none; box-shadow: none; padding: 0.15rem; align-items: center; justify-content: flex-start; gap: 0.35rem; text-align: center;
      }
      .arch-node[data-kind="actor"]:hover, .arch-node[data-kind="actor"][aria-pressed="true"], .arch-node[data-kind="actor"][data-sim-active="true"] { box-shadow: none; }
      .actor-figure { display: grid; place-items: center; color: var(--node-accent); filter: drop-shadow(0 6px 14px rgba(2, 6, 23, 0.28)); transition: filter 0.22s ease, color 0.22s ease; }
      .actor-shape { fill: var(--wl-canvas); stroke: currentColor; stroke-width: 2.75; stroke-linecap: round; stroke-linejoin: round; transition: fill 0.22s ease; }
      .arch-node[data-kind="actor"]:hover .actor-figure, .arch-node[data-kind="actor"][aria-pressed="true"] .actor-figure { filter: drop-shadow(0 0 14px var(--node-accent)); }
      .arch-node[data-kind="actor"]:hover .actor-shape, .arch-node[data-kind="actor"][aria-pressed="true"] .actor-shape { fill: var(--node-accent-soft); }
      .arch-node[data-kind="actor"][data-sim-active="true"] .actor-figure { color: var(--sim-accent, var(--node-accent)); filter: drop-shadow(0 0 18px var(--sim-accent, var(--node-accent))); }
      .arch-node[data-kind="actor"][data-sim-active="true"] .actor-shape { fill: var(--sim-accent-soft, var(--node-accent-soft)); }
      .actor-caption { display: flex; flex-direction: column; align-items: center; padding: 0.22rem 0.65rem; border-radius: 0.65rem; background: var(--wl-panel); border: 1px solid var(--wl-border-ui); backdrop-filter: blur(10px); }
      .arch-node[data-kind="actor"][aria-pressed="true"] .actor-caption { border-color: var(--node-accent); box-shadow: 0 0 0 3px var(--node-accent-soft); }
      .actor-role { font-family: var(--wl-font-mono); font-size: 0.75rem; font-weight: 600; color: var(--wl-ink-muted); line-height: 1.2; }

      .node-top { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
      .node-icon { display: grid; place-items: center; inline-size: 2.15rem; block-size: 2.15rem; border-radius: 0.6rem; background: var(--node-accent-soft); color: var(--node-accent); border: 1px solid var(--wl-border-subtle); flex-shrink: 0; }
      .node-eyebrow { font-family: var(--wl-font-mono); font-size: 0.75rem; font-weight: 600; color: var(--wl-ink-muted); }
      .node-title { display: block; font-size: 1.15rem; font-weight: 700; letter-spacing: -0.02em; line-height: 1.2; color: var(--wl-ink); }
      .arch-node[data-kind="core"] .node-title, .arch-node[data-kind="gate"] .node-title, .arch-node[data-kind="store"] .node-title { font-size: 1.25rem; }
      .arch-node[data-kind="client"] .node-title, .arch-node[data-kind="actor"] .node-title { font-size: 0.95rem; }
      .node-sub { display: block; font-size: 0.78rem; color: var(--wl-ink-secondary); line-height: 1.3; }
      .node-footer { display: flex; align-items: center; justify-content: space-between; gap: 0.375rem; padding-block-start: 0.45rem; border-block-start: 1px solid var(--wl-border-subtle); font-family: var(--wl-font-mono); font-size: 0.75rem; color: var(--wl-ink-muted); }
      .micro-chip { display: inline-flex; align-items: center; padding: 0.1rem 0.42rem; border-radius: 0.35rem; background: var(--wl-surface-elevated); border: 1px solid var(--wl-border-subtle); color: var(--wl-ink-secondary); font-size: 0.75rem; }

      .sim-packet {
        position: absolute; left: 0; top: 0; display: inline-flex; align-items: center; gap: 0.4rem;
        padding: 0.3rem 0.65rem; border-radius: 999px; background: var(--wl-surface); border: 2px solid var(--wl-emerald);
        color: var(--wl-ink); font-family: var(--wl-font-mono); font-size: 0.75rem; font-weight: 700;
        box-shadow: 0 0 24px rgba(52, 211, 153, 0.55); pointer-events: none; z-index: 15;
        translate: calc(var(--px, 0) * 1px - 50%) calc(var(--py, 0) * 1px - 50%);
        transition: translate 0.65s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.25s ease;
        @media (prefers-reduced-motion: reduce) { transition: opacity 0.15s linear; }
      }
      .sim-packet[hidden] { display: none; }
      .sim-packet[data-tone="rose"] { border-color: var(--wl-rose); box-shadow: 0 0 24px rgba(251, 113, 133, 0.55); }
      .sim-packet[data-tone="blue"] { border-color: var(--wl-blue); box-shadow: 0 0 24px rgba(96, 165, 250, 0.55); }
      .sim-packet[data-tone="violet"] { border-color: var(--wl-violet); box-shadow: 0 0 24px rgba(167, 139, 250, 0.55); }
      .sim-packet[data-tone="amber"] { border-color: var(--wl-amber); box-shadow: 0 0 24px rgba(251, 191, 36, 0.55); }

      .canvas-hud { position: absolute; inset-block-end: 1rem; inset-inline: 1rem; display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; pointer-events: none; z-index: 10; flex-wrap: wrap; }
      .hud-card { pointer-events: auto; display: inline-flex; align-items: center; gap: 0.625rem; padding: 0.45rem 0.75rem; border-radius: 0.75rem; background: var(--wl-panel); backdrop-filter: blur(16px); border: 1px solid var(--wl-border-subtle); box-shadow: var(--wl-shadow-card); font-size: 0.78rem; color: var(--wl-ink-secondary); }
      .zoom-readout { font-family: var(--wl-font-mono); font-size: 0.78rem; min-inline-size: 3.1rem; text-align: center; font-weight: 600; }
    }

    @layer dialogs {
      dialog {
        margin: auto; border: 1px solid var(--wl-border-ui); border-radius: 1rem; background: var(--wl-surface); color: var(--wl-ink);
        box-shadow: var(--wl-shadow-elevated); max-inline-size: min(62rem, calc(100vw - 2rem)); max-block-size: calc(100dvh - 3rem); padding: 0;
      }
      dialog:modal { overscroll-behavior: contain; }
      dialog::backdrop { overflow: hidden; overscroll-behavior: contain; background-color: rgba(2, 6, 23, 0.58); backdrop-filter: blur(4px); }
      .dialog-shell { display: grid; grid-template-rows: auto minmax(0, 1fr); max-block-size: calc(100dvh - 3rem); }
      .dialog-header { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 1rem 1.25rem; border-block-end: 1px solid var(--wl-border-subtle); }
      .dialog-header h2 { font-size: 1.05rem; font-weight: 700; }
      .dialog-body { padding: 1.25rem; overflow: auto; }
      .matrix-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; text-align: left; }
      .matrix-table caption { text-align: left; font-size: 0.8125rem; color: var(--wl-ink-secondary); margin-block-end: 0.75rem; }
      .matrix-table th, .matrix-table td { padding: 0.65rem 0.75rem; border-block-end: 1px solid var(--wl-border-subtle); vertical-align: top; }
      .matrix-table thead th { font-family: var(--wl-font-mono); font-size: 0.75rem; color: var(--wl-ink-muted); background: var(--wl-surface-elevated); }
      .theme-fieldset { border: 1px solid var(--wl-border-subtle); border-radius: 0.75rem; padding: 0.875rem; display: grid; gap: 0.5rem; }
      .theme-option { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 0.625rem 0.75rem; border-radius: 0.55rem; border: 1px solid var(--wl-border-subtle); cursor: pointer; }
      .theme-option:has(input:checked) { border-color: var(--wl-blue); background: var(--wl-blue-soft); }
      .theme-option-sub { font-size: 0.78rem; color: var(--wl-ink-secondary); display: block; }
    }

    @layer utilities {
      .visually-hidden { position: absolute; clip-path: inset(50%); overflow: hidden; width: 1px; height: 1px; margin: -1px; padding: 0; border: 0; white-space: nowrap; }
      @media (prefers-reduced-motion: reduce) {
        ::view-transition-group(*), ::view-transition-old(*), ::view-transition-new(*) { animation: none !important; }
      }
    }
  </style>
</head>
<body>
  <header class="topbar">
    <div class="brand-cluster">
      <div class="brand-mark" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3"/><path d="M3 12h6m6 0h6M12 3v6m0 6v6"/>
        </svg>
      </div>
      <div>
        <div class="eyebrow-row">
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
      <button type="button" class="btn" id="btn-open-matrix">Matrix</button>
      <button type="button" class="btn btn-icon-only" id="btn-open-settings" aria-label="Display settings">⚙</button>
    </div>
  </header>

  <main class="workspace" id="workspace" data-flow="all">
    <section class="canvas-shell" aria-label="Interactive architecture diagram">
      <div class="canvas-viewport" id="canvas-viewport" tabindex="0" role="region" aria-label="Interactive architecture canvas. Drag to pan, scroll to zoom.">
        <div class="stage-world" id="stage-world">
          ${zonesMarkup}
          ${notesMarkup}
          <svg class="wires-layer" viewBox="0 0 ${doc.stageWidth} ${doc.stageHeight}" width="${doc.stageWidth}" height="${doc.stageHeight}" aria-hidden="true">
            <defs>
              <marker id="arrow-blue" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse"><path d="M 0 1.5 L 8.5 5 L 0 8.5 z" fill="var(--wl-blue)"/></marker>
              <marker id="arrow-emerald" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse"><path d="M 0 1.5 L 8.5 5 L 0 8.5 z" fill="var(--wl-emerald)"/></marker>
              <marker id="arrow-rose" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse"><path d="M 0 1.5 L 8.5 5 L 0 8.5 z" fill="var(--wl-rose)"/></marker>
              <marker id="arrow-violet" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse"><path d="M 0 1.5 L 8.5 5 L 0 8.5 z" fill="var(--wl-violet)"/></marker>
              <marker id="arrow-amber" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse"><path d="M 0 1.5 L 8.5 5 L 0 8.5 z" fill="var(--wl-amber)"/></marker>
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
        stageWorld.style.transform = 'translate(' + panX + 'px, ' + panY + 'px) scale(' + scale + ')';
        zoomReadout.textContent = Math.round(scale * 100) + '%';
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
      viewport.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || e.target.closest('.arch-node, button')) return;
        dragStart = { x: e.clientX - panX, y: e.clientY - panY };
        viewport.classList.add('is-dragging');
        viewport.setPointerCapture(e.pointerId);
      });
      viewport.addEventListener('pointermove', (e) => {
        if (!dragStart || !viewport.hasPointerCapture(e.pointerId)) return;
        panX = e.clientX - dragStart.x;
        panY = e.clientY - dragStart.y;
        applyTransform();
      });
      const endDrag = () => { dragStart = null; viewport.classList.remove('is-dragging'); };
      viewport.addEventListener('pointerup', endDrag);
      viewport.addEventListener('pointercancel', endDrag);
      viewport.addEventListener('lostpointercapture', endDrag);

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

      const TONE_CSS = {
        blue: ['var(--wl-blue)', 'var(--wl-blue-soft)'],
        emerald: ['var(--wl-emerald)', 'var(--wl-emerald-soft)'],
        rose: ['var(--wl-rose)', 'var(--wl-rose-soft)'],
        violet: ['var(--wl-violet)', 'var(--wl-violet-soft)'],
        amber: ['var(--wl-amber)', 'var(--wl-amber-soft)'],
      };

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

      const metaScheme = document.querySelector('meta[name="color-scheme"]');
      const radios = Array.from(document.querySelectorAll('input[name="theme-choice"]'));
      try {
        const saved = localStorage.getItem('blueprint-studio-color-scheme');
        const target = saved === 'light' || saved === 'dark' ? saved : 'system';
        for (const r of radios) r.checked = r.value === target;
      } catch (_) {}
      for (const r of radios) {
        r.addEventListener('change', () => {
          if (!r.checked) return;
          if (r.value === 'system') {
            metaScheme.content = 'light dark';
            try { localStorage.removeItem('blueprint-studio-color-scheme'); } catch (_) {}
          } else {
            metaScheme.content = r.value;
            try { localStorage.setItem('blueprint-studio-color-scheme', r.value); } catch (_) {}
          }
        });
      }

      const firstId = Object.keys(DATA.nodes)[0];
      if (firstId) selectNode(firstId);
      else showOverview();
      requestAnimationFrame(fitToViewport);
    })();
  </script>
</body>
</html>`;
}
