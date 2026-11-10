/** A picture of the canvas as it is drawn, not a simplified redraw. */
import type { StreamTone } from '../types';
import { TONE_CSS } from '../shared/tones';
import { describeDiagram } from '../core/describe';
import { renderDiagramSvg } from '../exporter/diagramSvg';
import { app } from './state';
import { stageWorld, viewport, workspace } from './dom';

function escapeXmlText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export interface StagePictureOptions {
  /** Steps animated wires. Omit to keep the dash where it is on screen. */
  dashOffset?: number;
  /** Crop to the canvas viewport, including the current pan and zoom. */
  currentView?: boolean;
  /** Components lit for one scenario hop. */
  activeNodes?: readonly string[];
  tone?: StreamTone;
  packetLabel?: string;
  /** Keep highlighted/selected states (defaults to true when multi-selection is active). */
  preserveSelection?: boolean;
}

/**
 * Static map of ConduitCraft CSS variables for inline resolution in exported SVGs.
 * Guarantees standard image viewers, Figma, Illustrator, and markdown image tags
 * render accurate colors and styling without relying on unresolved CSS variables.
 */
export const WL_RESOLVED_TOKENS: Record<string, string> = {
  '--wl-canvas': '#ECEFEE',
  '--wl-canvas-light': '#ECEFEE',
  '--wl-canvas-dark': '#1D1F21',
  '--wl-panel': 'rgba(255, 255, 255, 0.84)',
  '--wl-panel-light': 'rgba(255, 255, 255, 0.84)',
  '--wl-panel-dark': 'rgba(46, 48, 51, 0.84)',
  '--wl-surface': '#FFFFFF',
  '--wl-surface-light': '#FFFFFF',
  '--wl-surface-dark': '#2A2C2F',
  '--wl-surface-elevated': 'rgba(21, 24, 28, 0.055)',
  '--wl-surface-elevated-light': 'rgba(21, 24, 28, 0.055)',
  '--wl-surface-elevated-dark': 'rgba(255, 255, 255, 0.07)',
  '--wl-surface-code': '#15181C',
  '--wl-surface-code-light': '#15181C',
  '--wl-surface-code-dark': '#15181C',
  '--wl-ink': '#15181C',
  '--wl-ink-light': '#15181C',
  '--wl-ink-dark': '#F2F3F1',
  '--wl-ink-secondary': '#565C64',
  '--wl-ink-secondary-light': '#565C64',
  '--wl-ink-secondary-dark': '#B7BBBF',
  '--wl-ink-muted': '#5C626A',
  '--wl-ink-muted-light': '#5C626A',
  '--wl-ink-muted-dark': '#92979C',
  '--wl-border-ui': 'rgba(21, 24, 28, 0.2)',
  '--wl-border-ui-light': 'rgba(21, 24, 28, 0.2)',
  '--wl-border-ui-dark': 'rgba(255, 255, 255, 0.2)',
  '--wl-border-subtle': 'rgba(21, 24, 28, 0.11)',
  '--wl-border-subtle-light': 'rgba(21, 24, 28, 0.11)',
  '--wl-border-subtle-dark': 'rgba(255, 255, 255, 0.1)',
  '--wl-grid-dot': '#8CC4D8',
  '--wl-grid-dot-light': '#8CC4D8',
  '--wl-grid-dot-dark': 'rgba(140, 196, 216, 0.3)',
  '--wl-blue': '#1d4ed8',
  '--wl-blue-light': '#1d4ed8',
  '--wl-blue-dark': '#60a5fa',
  '--wl-blue-soft': 'rgba(29, 78, 216, 0.12)',
  '--wl-blue-soft-light': 'rgba(29, 78, 216, 0.12)',
  '--wl-blue-soft-dark': 'rgba(96, 165, 250, 0.16)',
  '--wl-emerald': '#047857',
  '--wl-emerald-light': '#047857',
  '--wl-emerald-dark': '#34d399',
  '--wl-emerald-soft': 'rgba(4, 120, 87, 0.12)',
  '--wl-emerald-soft-light': 'rgba(4, 120, 87, 0.12)',
  '--wl-emerald-soft-dark': 'rgba(52, 211, 153, 0.16)',
  '--wl-rose': '#be123c',
  '--wl-rose-light': '#be123c',
  '--wl-rose-dark': '#fb7185',
  '--wl-rose-soft': 'rgba(190, 18, 60, 0.11)',
  '--wl-rose-soft-light': 'rgba(190, 18, 60, 0.11)',
  '--wl-rose-soft-dark': 'rgba(251, 113, 133, 0.16)',
  '--wl-amber': '#b45309',
  '--wl-amber-light': '#b45309',
  '--wl-amber-dark': '#fbbf24',
  '--wl-amber-soft': 'rgba(180, 83, 9, 0.12)',
  '--wl-amber-soft-light': 'rgba(180, 83, 9, 0.12)',
  '--wl-amber-soft-dark': 'rgba(251, 191, 36, 0.16)',
  '--wl-violet': '#5b21b6',
  '--wl-violet-light': '#5b21b6',
  '--wl-violet-dark': '#a78bfa',
  '--wl-violet-soft': 'rgba(91, 33, 182, 0.12)',
  '--wl-violet-soft-light': 'rgba(91, 33, 182, 0.12)',
  '--wl-violet-soft-dark': 'rgba(167, 139, 250, 0.2)',
  '--wl-font-sans': "'Instrument Sans', 'Instrument Sans Fallback', 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI Variable', 'Segoe UI', system-ui, sans-serif",
  '--wl-font-mono': "'Geist Mono', 'Geist Mono Fallback', ui-monospace, 'SF Mono', 'Cascadia Code', Menlo, Consolas, monospace",
};

/**
 * Returns a complete map of resolved `--wl-*` CSS custom properties,
 * taking into account current computed document styles and active color-scheme.
 */
export function currentScheme(): 'light' | 'dark' {
  if (typeof document !== 'undefined' && document.documentElement) {
    const theme = document.documentElement.getAttribute('data-theme');
    if (theme === 'graphite' || theme === 'dark') return 'dark';
    if (theme === 'vellum' || theme === 'light') return 'light';
    if (document.documentElement.classList.contains('dark')) return 'dark';
  }
  const dark = typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  return dark ? 'dark' : 'light';
}

export function getResolvedWlVariables(): Record<string, string> {
  const isDark = currentScheme() === 'dark';

  const vars: Record<string, string> = { ...WL_RESOLVED_TOKENS };
  if (isDark) {
    vars['--wl-canvas'] = vars['--wl-canvas-dark'];
    vars['--wl-panel'] = vars['--wl-panel-dark'];
    vars['--wl-surface'] = vars['--wl-surface-dark'];
    vars['--wl-surface-elevated'] = vars['--wl-surface-elevated-dark'];
    vars['--wl-surface-code'] = vars['--wl-surface-code-dark'];
    vars['--wl-ink'] = vars['--wl-ink-dark'];
    vars['--wl-ink-secondary'] = vars['--wl-ink-secondary-dark'];
    vars['--wl-ink-muted'] = vars['--wl-ink-muted-dark'];
    vars['--wl-border-ui'] = vars['--wl-border-ui-dark'];
    vars['--wl-border-subtle'] = vars['--wl-border-subtle-dark'];
    vars['--wl-grid-dot'] = vars['--wl-grid-dot-dark'];
    vars['--wl-blue'] = vars['--wl-blue-dark'];
    vars['--wl-blue-soft'] = vars['--wl-blue-soft-dark'];
    vars['--wl-emerald'] = vars['--wl-emerald-dark'];
    vars['--wl-emerald-soft'] = vars['--wl-emerald-soft-dark'];
    vars['--wl-rose'] = vars['--wl-rose-dark'];
    vars['--wl-rose-soft'] = vars['--wl-rose-soft-dark'];
    vars['--wl-amber'] = vars['--wl-amber-dark'];
    vars['--wl-amber-soft'] = vars['--wl-amber-soft-dark'];
    vars['--wl-violet'] = vars['--wl-violet-dark'];
    vars['--wl-violet-soft'] = vars['--wl-violet-soft-dark'];
  }

  if (typeof document !== 'undefined' && document.documentElement && typeof getComputedStyle === 'function') {
    try {
      const rootStyle = getComputedStyle(document.documentElement);
      for (const key of Object.keys(vars)) {
        const val = rootStyle.getPropertyValue(key)?.trim();
        if (val && !val.startsWith('var(--')) {
          vars[key] = val;
        }
      }
    } catch {
      // Keep static mapping if getComputedStyle is unavailable or fails
    }
  }

  return vars;
}

/**
 * Resolves references to `var(--wl-*)` in CSS or SVG content into concrete, standalone color/font values.
 */
export function resolveCssVariables(
  content: string,
  vars: Record<string, string> = getResolvedWlVariables()
): string {
  const replacePass = (text: string): string =>
    text.replace(/var\((--wl-[a-zA-Z0-9_-]+)(?:,\s*([^)]+))?\)/g, (fullMatch, varName, fallback) => {
      const val = vars[varName];
      if (val && !val.startsWith('var(--')) return val;
      return fallback?.trim() || val || fullMatch;
    });

  let resolved = replacePass(content);
  // Perform a second pass in case of nested fallback variables
  resolved = replacePass(resolved);
  return resolved;
}

/**
 * Cleans a cloned stage DOM tree for pixel-perfect export:
 * - Strips drag handles (.drag-handle, .node-drag-handle, .sim-drag-handle)
 * - Strips ports (.node-port)
 * - Strips waypoint handles (.waypoint-handle, .conduit-waypoint-handle, .wire-handle)
 * - Strips selection overlays, boxes, rings, guides, draft wire, and drag ghosts
 * - Strips .is-selected, .is-dimmed, .is-related, .is-highlighted, .is-entering, .is-dragging
 * - Deactivates node-select-hit aria-pressed so outline/selection rings do not show
 */
export function cleanClonedStage(clone: HTMLElement, options?: { preserveSelection?: boolean }): void {
  // 1. Remove interactive handles and ports
  const handlesAndPorts = clone.querySelectorAll(
    '.drag-handle, .node-drag-handle, .sim-drag-handle, .node-port, .waypoint-handle, .conduit-waypoint-handle, .wire-handle'
  );
  handlesAndPorts.forEach((el) => el.remove());

  // 2. Remove selection overlays, boxes, rings, guides, draft wire, and drag ghosts
  const overlays = clone.querySelectorAll(
    '.align-guide, #guides-g, .marquee-box, #draft-wire, .selection-box, .selection-ring, .selection-indicator, .stencil-drag-ghost, .is-drag-ghost, .drag-ghost'
  );
  overlays.forEach((el) => el.remove());

  const preserveSelection = options?.preserveSelection ?? (app.selection.type === 'multi');

  if (!preserveSelection) {
    // 3. Strip selection, dimming, related, and ghost states from all elements
    const stateful = clone.querySelectorAll(
      '.is-selected, .is-dimmed, .is-related, .is-highlighted, .is-entering, .is-dragging, .is-drag-ghost'
    );
    stateful.forEach((el) => {
      el.classList.remove(
        'is-selected',
        'is-dimmed',
        'is-related',
        'is-highlighted',
        'is-entering',
        'is-dragging',
        'is-drag-ghost'
      );
    });
    clone.classList.remove(
      'is-selected',
      'is-dimmed',
      'is-related',
      'is-highlighted',
      'is-entering',
      'is-dragging',
      'is-drag-ghost'
    );

    // 4. Deactivate node-select-hit aria-pressed so outline/selection rings do not show
    const pressedHits = clone.querySelectorAll('.node-select-hit[aria-pressed="true"]');
    pressedHits.forEach((hit) => {
      hit.setAttribute('aria-pressed', 'false');
    });
  } else {
    // Still strip transient drag and entering states
    const transient = clone.querySelectorAll('.is-entering, .is-dragging, .is-drag-ghost');
    transient.forEach((el) => el.classList.remove('is-entering', 'is-dragging', 'is-drag-ghost'));
    clone.classList.remove('is-entering', 'is-dragging', 'is-drag-ghost');
  }
}

function collectCss(sheet: CSSStyleSheet, chunks: string[]): void {
  let rules: CSSRuleList;
  try {
    rules = sheet.cssRules;
  } catch {
    return;
  }
  for (const rule of rules) {
    if (rule instanceof CSSImportRule) {
      if (rule.styleSheet) collectCss(rule.styleSheet, chunks);
      continue;
    }
    chunks.push(rule.cssText);
  }
}

function documentCss(): string {
  if (typeof document === 'undefined' || !document.styleSheets) return '';
  const chunks: string[] = [];
  for (const sheet of document.styleSheets) collectCss(sheet, chunks);
  return chunks.join('\n');
}

function paintScenario(clone: HTMLElement, frame: StagePictureOptions): void {
  const activeNodes = frame.activeNodes ?? [];
  if (activeNodes.length === 0) return;
  const tone = frame.tone ?? 'emerald';
  const [accent, soft] = TONE_CSS[tone];
  const active = new Set(activeNodes);
  clone.querySelectorAll<HTMLElement>('.arch-node').forEach((node) => {
    if (!active.has(node.dataset.node ?? '')) {
      delete node.dataset.simActive;
      node.style.removeProperty('--sim-accent');
      node.style.removeProperty('--sim-accent-soft');
      return;
    }
    node.dataset.simActive = 'true';
    node.style.setProperty('--sim-accent', accent);
    node.style.setProperty('--sim-accent-soft', soft);
  });

  const anchor = app.doc.nodes.find((node) => node.id === activeNodes[0]);
  const packet = clone.querySelector<HTMLElement>('#sim-packet');
  if (!packet) return;
  if (!anchor) {
    packet.hidden = true;
    return;
  }
  packet.hidden = false;
  packet.dataset.tone = tone;
  const label = packet.querySelector('#sim-packet-label');
  if (label) label.textContent = frame.packetLabel || anchor.title;
  const dot = packet.querySelector<HTMLElement>('#sim-packet-dot');
  if (dot) dot.style.background = accent;
  packet.style.setProperty('--px', String(Math.round(anchor.x + anchor.width / 2)));
  packet.style.setProperty('--py', String(Math.round(anchor.y + anchor.height / 2 - 62)));
}

/**
 * SVG of the live stage. Pass pixel width and height to rasterize sharper than
 * the stage's CSS pixels; the viewBox stays in stage coordinates.
 * A dash offset steps animated wires for one GIF frame. Without it, the still
 * picture keeps the dash where it is on screen.
 */
export function renderStagePictureSvg(
  pixelWidth?: number,
  pixelHeight?: number,
  frame?: StagePictureOptions,
): string {
  const liveStage = stageWorld ?? (typeof document !== 'undefined' ? (document.getElementById('stage-world') as HTMLElement) : null);
  if (!liveStage) {
    // If called outside DOM environment or before stage is mounted, fallback to vector SVG
    return renderDiagramSvg(app.doc, undefined, undefined, currentScheme());
  }

  const liveViewport = viewport ?? (typeof document !== 'undefined' ? (document.getElementById('viewport') as HTMLElement) : null);
  const liveWorkspace = workspace ?? (typeof document !== 'undefined' ? (document.getElementById('workspace') as HTMLElement) : null);

  const stageWidth = Math.max(1, Math.round(app.doc.stageWidth));
  const stageHeight = Math.max(1, Math.round(app.doc.stageHeight));
  const currentView = Boolean(frame?.currentView) && Boolean(liveViewport && liveViewport.clientWidth > 0 && liveViewport.clientHeight > 0);
  const frameWidth = currentView && liveViewport ? Math.max(1, Math.round(liveViewport.clientWidth)) : stageWidth;
  const frameHeight = currentView && liveViewport ? Math.max(1, Math.round(liveViewport.clientHeight)) : stageHeight;
  const outWidth = pixelWidth ?? frameWidth;
  const outHeight = pixelHeight ?? frameHeight;

  const clone = liveStage.cloneNode(true) as HTMLElement;
  const liveStreams = [...liveStage.querySelectorAll<SVGElement>('.conduit-stream')];
  clone.querySelectorAll<SVGElement>('.conduit-stream').forEach((stream, index) => {
    const live = liveStreams[index];
    if (!live || typeof getComputedStyle !== 'function') return;
    const computed = getComputedStyle(live);
    const dashed = computed.strokeDasharray !== 'none' && computed.strokeDasharray !== '';
    stream.style.animation = 'none';
    if (frame?.dashOffset !== undefined && dashed) {
      stream.style.strokeDasharray = computed.strokeDasharray;
      stream.style.strokeDashoffset = `${frame.dashOffset}px`;
      return;
    }
    stream.style.strokeDashoffset = computed.strokeDashoffset;
  });

  const liveStreamsRev = [...liveStage.querySelectorAll<SVGElement>('.conduit-stream-reverse')];
  clone.querySelectorAll<SVGElement>('.conduit-stream-reverse').forEach((stream, index) => {
    const live = liveStreamsRev[index];
    if (!live || typeof getComputedStyle !== 'function') return;
    const computed = getComputedStyle(live);
    const dashed = computed.strokeDasharray !== 'none' && computed.strokeDasharray !== '';
    stream.style.animation = 'none';
    if (frame?.dashOffset !== undefined && dashed) {
      stream.style.strokeDasharray = computed.strokeDasharray;
      stream.style.strokeDashoffset = `${-frame.dashOffset}px`;
      return;
    }
    stream.style.strokeDashoffset = computed.strokeDashoffset;
  });

  // Strip selection, dimming, drag handles, ports, waypoint handles, and overlays cleanly
  cleanClonedStage(clone, { preserveSelection: frame?.preserveSelection ?? (app.selection.type === 'multi') });

  if (frame) paintScenario(clone, frame);
  clone.removeAttribute('id');
  // The live stage uses CSS zoom. This picture keeps the previous scale transform.
  clone.style.removeProperty('zoom');
  clone.style.transformOrigin = '0 0';

  if (currentView) {
    const scale = app.scale || 1;
    const panX = app.panX || 0;
    const panY = app.panY || 0;
    const viewFitScale = Math.min(outWidth / frameWidth, outHeight / frameHeight);
    if (viewFitScale !== 1) {
      clone.style.transform = `scale(${viewFitScale}) translate(${panX}px, ${panY}px) scale(${scale})`;
    } else {
      clone.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
    }
  } else {
    const fitScale = Math.min(outWidth / stageWidth, outHeight / stageHeight);
    if (fitScale !== 1) {
      clone.style.transform = `scale(${fitScale})`;
    } else {
      clone.style.transform = 'none';
    }
  }
  clone.style.width = `${stageWidth}px`;
  clone.style.height = `${stageHeight}px`;
  clone.style.maxWidth = 'none';
  clone.style.maxInlineSize = 'none';

  // Ensure wires layer covers full stage dimensions
  const cloneWires = clone.querySelector<SVGElement>('#wires-svg, .wires-layer');
  if (cloneWires) {
    cloneWires.setAttribute('viewBox', `0 0 ${stageWidth} ${stageHeight}`);
    cloneWires.setAttribute('width', String(stageWidth));
    cloneWires.setAttribute('height', String(stageHeight));
    cloneWires.style.width = `${stageWidth}px`;
    cloneWires.style.height = `${stageHeight}px`;
    cloneWires.style.maxWidth = 'none';
    cloneWires.style.maxInlineSize = 'none';
    cloneWires.style.overflow = 'visible';
  }

  const shell = document.createElement('section');
  shell.className = 'canvas-shell';
  shell.style.cssText = `position:relative;width:${outWidth}px;height:${outHeight}px;overflow:hidden;max-width:none !important;max-inline-size:none !important;`;
  shell.appendChild(clone);

  const resolvedVars = getResolvedWlVariables();

  const root = document.createElement('div');
  root.className = 'workspace';
  if (liveWorkspace) {
    for (const name of liveWorkspace.getAttributeNames()) {
      if (name.startsWith('data-')) root.setAttribute(name, liveWorkspace.getAttribute(name) ?? '');
    }
  }

  const bodyStyle = typeof document !== 'undefined' && document.body && typeof getComputedStyle === 'function'
    ? getComputedStyle(document.body)
    : null;
  const rootStyle = typeof document !== 'undefined' && document.documentElement && typeof getComputedStyle === 'function'
    ? getComputedStyle(document.documentElement)
    : null;

  // Set explicit resolved --wl-* properties on root style
  const customParts: string[] = [];
  for (const [k, v] of Object.entries(resolvedVars)) {
    customParts.push(`${k}:${v}`);
  }
  if (rootStyle && typeof rootStyle[Symbol.iterator] === 'function') {
    for (const prop of rootStyle) {
      if (prop.startsWith('--') && !prop.startsWith('--wl-')) {
        customParts.push(`${prop}:${rootStyle.getPropertyValue(prop)}`);
      }
    }
  }

  root.style.cssText = [
    customParts.join(';'),
    'display:block !important',
    `width:${outWidth}px !important`,
    `height:${outHeight}px !important`,
    `min-width:${outWidth}px !important`,
    `min-inline-size:${outWidth}px !important`,
    `max-width:none !important`,
    `max-inline-size:none !important`,
    `overflow:visible !important`,
    `margin:0`,
    `color:${bodyStyle?.color || '#15181C'}`,
    `font-family:${bodyStyle?.fontFamily || "'Instrument Sans', 'Instrument Sans Fallback', system-ui, sans-serif"}`,
    `font-size:${bodyStyle?.fontSize || '16px'}`,
    `line-height:${bodyStyle?.lineHeight || '1.5'}`,
    `color-scheme:${rootStyle?.colorScheme || 'light'}`,
  ].join(';');
  root.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');

  const exportStyleOverrides = `
    .workspace {
      display: block !important;
      width: ${outWidth}px !important;
      height: ${outHeight}px !important;
      min-width: ${outWidth}px !important;
      min-inline-size: ${outWidth}px !important;
      max-width: none !important;
      max-inline-size: none !important;
      overflow: visible !important;
    }
    .canvas-shell {
      position: relative !important;
      width: ${outWidth}px !important;
      height: ${outHeight}px !important;
      max-width: none !important;
      max-inline-size: none !important;
      overflow: hidden !important;
    }
    .stage-world {
      width: ${stageWidth}px !important;
      height: ${stageHeight}px !important;
      max-width: none !important;
      max-inline-size: none !important;
    }
    .wires-layer {
      width: ${stageWidth}px !important;
      height: ${stageHeight}px !important;
      max-width: none !important;
      max-inline-size: none !important;
      overflow: visible !important;
    }
  `;

  const style = document.createElement('style');
  style.textContent = resolveCssVariables(documentCss(), resolvedVars) + '\n' + exportStyleOverrides;
  root.append(style, shell);

  const rawSerialized = new XMLSerializer().serializeToString(root);
  const serialized = resolveCssVariables(rawSerialized, resolvedVars);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${outWidth}" height="${outHeight}" viewBox="0 0 ${outWidth} ${outHeight}" role="img">
  <title>${escapeXmlText(app.doc.title.trim() || 'Untitled diagram')}</title>
  <desc>${escapeXmlText(describeDiagram(app.doc))}</desc>
  <foreignObject x="0" y="0" width="${outWidth}" height="${outHeight}" style="width:${outWidth}px;height:${outHeight}px;overflow:visible;">${serialized}</foreignObject>
</svg>`;
}
