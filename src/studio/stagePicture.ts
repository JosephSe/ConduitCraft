/** A picture of the canvas as it is drawn, not a simplified redraw. */
import type { StreamTone } from '../types';
import { TONE_CSS } from '../shared/tones';
import { describeDiagram } from '../core/describe';
import { renderDiagramSvg, ROUGH_FILTER } from '../exporter/diagramSvg';
import { notesRect, type WorldRect } from './viewportFrame';
import { titleBlockFor, titleBlockSvg } from '../exporter/titleBlock';
import { app, pageInfo } from './state';
import { stageWorld, viewport, workspace } from './dom';

export { pageInfo };

function escapeXmlText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export interface StagePictureOptions {
  /** Steps animated wires. Omit to keep the dash where it is on screen. */
  dashOffset?: number;
  /** Crop to the canvas viewport, including the current pan and zoom. */
  currentView?: boolean;
  /** Crop to this part of the stage, in stage pixels (a scenario GIF keeps just its components). */
  crop?: WorldRect;
  /** Components lit for one scenario hop. */
  activeNodes?: readonly string[];
  tone?: StreamTone;
  packetLabel?: string;
  /** Keep highlighted/selected states (defaults to true when multi-selection is active). */
  preserveSelection?: boolean;
  /** Add the title block strip (8.7). Exports pass `titleBlockOn()`; thumbnails leave it off. */
  titleBlock?: boolean;
}

/**
 * Static map of ConduitCraft CSS variables for inline resolution in exported SVGs.
 * Guarantees standard image viewers, Figma, Illustrator, and markdown image tags
 * render accurate colors and styling without relying on unresolved CSS variables.
 */
export const WL_RESOLVED_TOKENS: Record<string, string> = {
  '--cc-canvas': '#ECEFEE',
  '--cc-canvas-light': '#ECEFEE',
  '--cc-canvas-dark': '#1D1F21',
  '--cc-island': 'rgba(255, 255, 255, 0.84)',
  '--cc-panel-light': 'rgba(255, 255, 255, 0.84)',
  '--cc-panel-dark': 'rgba(46, 48, 51, 0.84)',
  '--cc-sheet': '#FFFFFF',
  '--cc-band-a': '#FAFBFA',
  '--cc-band-b': '#F3F5F4',
  '--cc-surface-light': '#FFFFFF',
  '--cc-surface-dark': '#2A2C2F',
  '--cc-well': 'rgba(21, 24, 28, 0.055)',
  '--cc-surface-elevated-light': 'rgba(21, 24, 28, 0.055)',
  '--cc-surface-elevated-dark': 'rgba(255, 255, 255, 0.07)',
  '--cc-surface-code': '#15181C',
  '--cc-surface-code-light': '#15181C',
  '--cc-surface-code-dark': '#15181C',
  '--cc-ink': '#15181C',
  '--cc-ink-light': '#15181C',
  '--cc-ink-dark': '#F2F3F1',
  '--cc-ink-2': '#565C64',
  '--cc-ink-secondary-light': '#565C64',
  '--cc-ink-secondary-dark': '#B7BBBF',
  '--cc-ink-3': '#5C626A',
  '--cc-ink-muted-light': '#5C626A',
  '--cc-ink-muted-dark': '#92979C',
  '--cc-hair-2': 'rgba(21, 24, 28, 0.2)',
  '--cc-border-ui-light': 'rgba(21, 24, 28, 0.2)',
  '--cc-border-ui-dark': 'rgba(255, 255, 255, 0.2)',
  '--cc-hair': 'rgba(21, 24, 28, 0.11)',
  '--cc-border-subtle-light': 'rgba(21, 24, 28, 0.11)',
  '--cc-border-subtle-dark': 'rgba(255, 255, 255, 0.1)',
  '--cc-dot': '#8CC4D8',
  '--cc-grid-dot-light': '#8CC4D8',
  '--cc-grid-dot-dark': 'rgba(140, 196, 216, 0.3)',
  '--cc-blue': '#1d4ed8',
  '--cc-blue-light': '#1d4ed8',
  '--cc-blue-dark': '#60a5fa',
  '--cc-blue-soft': 'rgba(29, 78, 216, 0.12)',
  '--cc-blue-soft-light': 'rgba(29, 78, 216, 0.12)',
  '--cc-blue-soft-dark': 'rgba(96, 165, 250, 0.16)',
  '--cc-emerald': '#047857',
  '--cc-emerald-light': '#047857',
  '--cc-emerald-dark': '#34d399',
  '--cc-emerald-soft': 'rgba(4, 120, 87, 0.12)',
  '--cc-emerald-soft-light': 'rgba(4, 120, 87, 0.12)',
  '--cc-emerald-soft-dark': 'rgba(52, 211, 153, 0.16)',
  '--cc-rose': '#be123c',
  '--cc-rose-light': '#be123c',
  '--cc-rose-dark': '#fb7185',
  '--cc-rose-soft': 'rgba(190, 18, 60, 0.11)',
  '--cc-rose-soft-light': 'rgba(190, 18, 60, 0.11)',
  '--cc-rose-soft-dark': 'rgba(251, 113, 133, 0.16)',
  '--cc-amber': '#b45309',
  '--cc-amber-light': '#b45309',
  '--cc-amber-dark': '#fbbf24',
  '--cc-amber-soft': 'rgba(180, 83, 9, 0.12)',
  '--cc-amber-soft-light': 'rgba(180, 83, 9, 0.12)',
  '--cc-amber-soft-dark': 'rgba(251, 191, 36, 0.16)',
  '--cc-violet': '#5b21b6',
  '--cc-violet-light': '#5b21b6',
  '--cc-violet-dark': '#a78bfa',
  '--cc-violet-soft': 'rgba(91, 33, 182, 0.12)',
  '--cc-violet-soft-light': 'rgba(91, 33, 182, 0.12)',
  '--cc-violet-soft-dark': 'rgba(167, 139, 250, 0.2)',
  '--cc-cyan': '#0b7c9e',
  '--cc-cyan-light': '#0b7c9e',
  '--cc-cyan-dark': '#22d3ee',
  '--cc-cyan-soft': 'rgba(11, 124, 158, 0.12)',
  '--cc-cyan-soft-light': 'rgba(11, 124, 158, 0.12)',
  '--cc-cyan-soft-dark': 'rgba(34, 211, 238, 0.16)',
  '--cc-fuchsia': '#b5179e',
  '--cc-fuchsia-light': '#b5179e',
  '--cc-fuchsia-dark': '#f0abfc',
  '--cc-fuchsia-soft': 'rgba(181, 23, 158, 0.12)',
  '--cc-fuchsia-soft-light': 'rgba(181, 23, 158, 0.12)',
  '--cc-fuchsia-soft-dark': 'rgba(240, 171, 252, 0.18)',
  '--cc-font-sans': "'Instrument Sans', 'Instrument Sans Fallback', 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI Variable', 'Segoe UI', system-ui, sans-serif",
  '--cc-font-map': "'Bricolage Grotesque', 'Bricolage Grotesque Fallback', 'Instrument Sans', 'Instrument Sans Fallback', 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI Variable', 'Segoe UI', system-ui, sans-serif",
  '--cc-font-mono': "'Geist Mono', 'Geist Mono Fallback', ui-monospace, 'SF Mono', 'Cascadia Code', Menlo, Consolas, monospace",
};

/**
 * Returns a complete map of resolved `--cc-*` CSS custom properties,
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
    vars['--cc-canvas'] = vars['--cc-canvas-dark'];
    vars['--cc-island'] = vars['--cc-panel-dark'];
    vars['--cc-sheet'] = vars['--cc-surface-dark'];
    vars['--cc-band-a'] = '#25282B';
    vars['--cc-band-b'] = '#212326';
    vars['--cc-well'] = vars['--cc-surface-elevated-dark'];
    vars['--cc-surface-code'] = vars['--cc-surface-code-dark'];
    vars['--cc-ink'] = vars['--cc-ink-dark'];
    vars['--cc-ink-2'] = vars['--cc-ink-secondary-dark'];
    vars['--cc-ink-3'] = vars['--cc-ink-muted-dark'];
    vars['--cc-hair-2'] = vars['--cc-border-ui-dark'];
    vars['--cc-hair'] = vars['--cc-border-subtle-dark'];
    vars['--cc-dot'] = vars['--cc-grid-dot-dark'];
    vars['--cc-blue'] = vars['--cc-blue-dark'];
    vars['--cc-blue-soft'] = vars['--cc-blue-soft-dark'];
    vars['--cc-emerald'] = vars['--cc-emerald-dark'];
    vars['--cc-emerald-soft'] = vars['--cc-emerald-soft-dark'];
    vars['--cc-rose'] = vars['--cc-rose-dark'];
    vars['--cc-rose-soft'] = vars['--cc-rose-soft-dark'];
    vars['--cc-amber'] = vars['--cc-amber-dark'];
    vars['--cc-amber-soft'] = vars['--cc-amber-soft-dark'];
    vars['--cc-violet'] = vars['--cc-violet-dark'];
    vars['--cc-violet-soft'] = vars['--cc-violet-soft-dark'];
    vars['--cc-cyan'] = vars['--cc-cyan-dark'];
    vars['--cc-cyan-soft'] = vars['--cc-cyan-soft-dark'];
    vars['--cc-fuchsia'] = vars['--cc-fuchsia-dark'];
    vars['--cc-fuchsia-soft'] = vars['--cc-fuchsia-soft-dark'];
  }

  if (typeof document !== 'undefined' && document.documentElement && typeof getComputedStyle === 'function') {
    try {
      // A diagram style re-sets the tokens on the sheet, so read them there; otherwise the page root.
      const source = app.doc.style ? document.getElementById('stage-world') ?? document.documentElement : document.documentElement;
      const rootStyle = getComputedStyle(source);
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
 * Resolves references to `var(--cc-*)` in CSS or SVG content into concrete, standalone color/font values.
 * Uses balanced-parenthesis scanning so nested fallbacks (e.g. `var(--cc-band-a, var(--cc-sheet))` or `color-mix(...)`)
 * never leave a stray `)` that invalidates the CSS declaration.
 */
export function resolveCssVariables(
  content: string,
  vars: Record<string, string> = getResolvedWlVariables()
): string {
  let out = '';
  let i = 0;
  const n = content.length;
  while (i < n) {
    const start = content.indexOf('var(--cc-', i);
    if (start === -1) {
      out += content.slice(i);
      break;
    }
    out += content.slice(i, start);
    let depth = 0;
    let comma = -1;
    let j = start + 3; // index of '('
    for (; j < n; j += 1) {
      const ch = content[j];
      if (ch === '(') depth += 1;
      else if (ch === ')') {
        depth -= 1;
        if (depth === 0) break;
      } else if (ch === ',' && depth === 1 && comma === -1) {
        comma = j;
      }
    }
    if (depth !== 0 || j >= n) {
      out += content.slice(start);
      break;
    }
    const rawName = content.slice(start + 4, comma === -1 ? j : comma).trim();
    const rawFallback = comma === -1 ? '' : content.slice(comma + 1, j).trim();
    if (/^--cc-[a-zA-Z0-9_-]+$/.test(rawName)) {
      const val = vars[rawName];
      if (val && !val.startsWith('var(--')) {
        out += val;
      } else if (rawFallback) {
        out += resolveCssVariables(rawFallback, vars);
      } else if (val) {
        out += val;
      } else {
        out += content.slice(start, j + 1);
      }
    } else {
      out += content.slice(start, j + 1);
    }
    i = j + 1;
  }
  return out;
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
  // Traffic beads are live-only: a picture draws the CSS capsule train instead (see trafficBeads.ts).
  clone.querySelectorAll('.cc-beads').forEach((el) => el.remove());
  clone.querySelectorAll('[data-beads]').forEach((el) => el.removeAttribute('data-beads'));

  // 2. Remove selection overlays, boxes, rings, guides, draft wire, and drag ghosts
  const overlays = clone.querySelectorAll(
    '.align-guide, #guides-g, .marquee-box, #draft-wire, .selection-box, .selection-ring, .selection-indicator, .stencil-drag-ghost, .is-drag-ghost, .drag-ghost'
  );
  overlays.forEach((el) => el.remove());

  const preserveSelection = options?.preserveSelection ?? (app.selection.type === 'multi');

  if (!preserveSelection) {
    // 3. Strip selection, dimming, related, and ghost states from all elements
    const stateful = clone.querySelectorAll(
      '.is-selected, .is-dimmed, .is-related, .is-highlighted, .is-hovered, .is-entering, .is-dragging, .is-drag-ghost'
    );
    stateful.forEach((el) => {
      el.classList.remove(
        'is-selected',
        'is-dimmed',
        'is-related',
        'is-highlighted',
        'is-hovered',
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

/**
 * The webfont files as data URLs, by the URL the stylesheet names. A picture is drawn as an SVG image, and an image
 * cannot fetch anything, so without these its text falls back to Arial and Courier, and bold titles come out regular.
 */
const embeddedFonts = new Map<string, string>();
let fontsLoading: Promise<void> | null = null;

function fontFaceUrls(): string[] {
  if (typeof document === 'undefined' || !document.styleSheets) return [];
  const urls = new Set<string>();
  const visit = (sheet: CSSStyleSheet): void => {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      return;
    }
    for (const rule of rules) {
      if (rule instanceof CSSImportRule) {
        if (rule.styleSheet) visit(rule.styleSheet);
      } else if (rule instanceof CSSFontFaceRule) {
        const base = sheet.href ?? document.baseURI;
        for (const match of rule.style.getPropertyValue('src').matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) {
          if (!match[1].startsWith('data:')) urls.add(new URL(match[1], base).href);
        }
      }
    }
  };
  for (const sheet of document.styleSheets) visit(sheet);
  return [...urls];
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** The text of each linked stylesheet, by its URL, as written (see `collectCss` for why not the CSSOM). */
const sheetSources = new Map<string, string>();

async function fetchCss(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok || !/\btext\/css\b/i.test(response.headers.get('content-type') ?? '')) return null;
    return await response.text();
  } catch {
    return null;
  }
}

/**
 * A stylesheet's text, only when the server answers with CSS. The dev server answers a plain fetch of a stylesheet
 * with a JavaScript module (its hot-reload wrapper), and gives the CSS itself for the `?direct` URL.
 */
async function fetchStylesheet(href: string): Promise<string | null> {
  const css = await fetchCss(href);
  if (css !== null) return css;
  const direct = new URL(href);
  direct.searchParams.set('direct', '');
  return fetchCss(direct.href);
}

/**
 * Read what a picture of the stage needs and an SVG image cannot fetch: the webfont files and the text of the linked
 * stylesheets. Call before `renderStagePictureSvg`. Anything that cannot be read (offline and not cached) falls
 * back: a font to the system face, a stylesheet to its CSSOM rules.
 */
export function loadPictureFonts(): Promise<void> {
  if (typeof fetch !== 'function' || typeof document === 'undefined') return Promise.resolve();
  // Stylesheets that load on demand appear later, so each call picks up the new ones.
  const sheets = Promise.all(
    [...document.styleSheets]
      .map((sheet) => sheet.href)
      .filter((href): href is string => Boolean(href) && !sheetSources.has(href!))
      .map(async (href) => {
        const text = await fetchStylesheet(href);
        if (text !== null) sheetSources.set(href, text);
      }),
  );
  fontsLoading ??= Promise.all(
    fontFaceUrls().map(async (url) => {
      try {
        const response = await fetch(url);
        if (!response.ok) return;
        const type = response.headers.get('content-type')?.split(';')[0] || 'font/woff2';
        embeddedFonts.set(url, `data:${type};base64,${bytesToBase64(new Uint8Array(await response.arrayBuffer()))}`);
      } catch {
        // Keep the fallback face for this one.
      }
    }),
  ).then(() => {
    // Try again next time if nothing could be read.
    if (embeddedFonts.size === 0) fontsLoading = null;
  });
  return Promise.all([sheets, fontsLoading]).then(() => undefined);
}

/** Point the font URLs in some CSS at the embedded copies. */
function embedFontUrls(css: string, base: string): string {
  if (embeddedFonts.size === 0) return css;
  return css.replace(/url\(\s*["']?([^"')]+)["']?\s*\)/g, (whole, url: string) => {
    if (url.startsWith('data:') || url.startsWith('#')) return whole;
    let href: string;
    try {
      href = new URL(url, base).href;
    } catch {
      return whole;
    }
    const data = embeddedFonts.get(href);
    return data ? `url("${data}")` : whole;
  });
}

/**
 * The page's `@font-face` rules with the font files inline, for a file that must carry its own type (the standalone
 * HTML). Empty until `loadPictureFonts` has read the files.
 */
export function embeddedFontFaceCss(): string {
  if (embeddedFonts.size === 0 || typeof document === 'undefined') return '';
  const rules: string[] = [];
  const visit = (sheet: CSSStyleSheet): void => {
    let list: CSSRuleList;
    try {
      list = sheet.cssRules;
    } catch {
      return;
    }
    for (const rule of list) {
      if (rule instanceof CSSImportRule) {
        if (rule.styleSheet) visit(rule.styleSheet);
      } else if (rule instanceof CSSFontFaceRule) {
        rules.push(fontFaceCss(rule, sheet.href ?? document.baseURI));
      }
    }
  };
  for (const sheet of document.styleSheets) visit(sheet);
  return rules.join('\n');
}

function fontFaceCss(rule: CSSFontFaceRule, base: string): string {
  return embedFontUrls(rule.cssText, base);
}

/**
 * A stylesheet's CSS for the picture. The text as written is used where it can be had: Chrome writes a shorthand set
 * from a `var()` (`font: var(--cc-font-title)`) back as empty longhands, and where the rule also sets one of those
 * longhands (`font-stretch: 88%`) the shorthand cannot be read back at all, so titles lose their weight and size.
 */
function collectCss(sheet: CSSStyleSheet, chunks: string[]): void {
  if (sheet.disabled) return;
  const base = sheet.href ?? document.baseURI;
  const owner = sheet.ownerNode;
  const source =
    typeof HTMLStyleElement !== 'undefined' && owner instanceof HTMLStyleElement
      ? owner.textContent
      : sheet.href
        ? sheetSources.get(sheet.href)
        : null;
  if (source != null && !/@import\b/i.test(source)) {
    const media = sheet.media?.mediaText;
    const css = embedFontUrls(source, base);
    chunks.push(media && media !== 'all' ? `@media ${media} {\n${css}\n}` : css);
    return;
  }
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
    chunks.push(rule instanceof CSSFontFaceRule ? fontFaceCss(rule, base) : rule.cssText);
  }
}

function documentCss(): string {
  if (typeof document === 'undefined' || !document.styleSheets) return '';
  const chunks: string[] = [];
  for (const sheet of document.styleSheets) collectCss(sheet, chunks);
  return chunks.join('\n');
}

/** A cropped picture shows a note only if all of it fits, so no card is cut in half at the edge. */
function hideNotesOutside(clone: HTMLElement, crop: WorldRect): void {
  clone.querySelectorAll<HTMLElement>('.blueprint-spec').forEach((el) => {
    const card = app.doc.notesCards.find((c) => c.id === el.dataset.notesId);
    if (!card) return;
    const r = notesRect(card);
    const inside =
      r.x >= crop.x && r.y >= crop.y && r.x + r.width <= crop.x + crop.width && r.y + r.height <= crop.y + crop.height;
    if (!inside) el.style.display = 'none';
  });
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
    return renderDiagramSvg(app.doc, undefined, undefined, currentScheme(), frame?.titleBlock ? titleBlockFor(app.doc, pageInfo()) : null);
  }

  const liveViewport = viewport ?? (typeof document !== 'undefined' ? (document.getElementById('viewport') as HTMLElement) : null);
  const liveWorkspace = workspace ?? (typeof document !== 'undefined' ? (document.getElementById('workspace') as HTMLElement) : null);

  const stageWidth = Math.max(1, Math.round(app.doc.stageWidth));
  const stageHeight = Math.max(1, Math.round(app.doc.stageHeight));
  const currentView = Boolean(frame?.currentView) && Boolean(liveViewport && liveViewport.clientWidth > 0 && liveViewport.clientHeight > 0);
  const crop = !currentView && frame?.crop && frame.crop.width >= 1 && frame.crop.height >= 1 ? frame.crop : null;
  const frameWidth = currentView && liveViewport
    ? Math.max(1, Math.round(liveViewport.clientWidth))
    : crop
      ? Math.round(crop.width)
      : stageWidth;
  const frameHeight = currentView && liveViewport
    ? Math.max(1, Math.round(liveViewport.clientHeight))
    : crop
      ? Math.round(crop.height)
      : stageHeight;
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
    // The live wire runs one capsule end to end; a picture shows the capsule train, which also keeps a GIF loop seamless.
    const single = computed.animationName.includes('cc-capsule');
    if (single) {
      stream.style.strokeDasharray = '7 29';
      stream.style.strokeDashoffset = frame?.dashOffset !== undefined ? `${frame.dashOffset}px` : '0px';
      return;
    }
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
    // The live wire runs one capsule end to end; a picture shows the capsule train, which also keeps a GIF loop seamless.
    const single = computed.animationName.includes('cc-capsule');
    if (single) {
      stream.style.strokeDasharray = '7 29';
      stream.style.strokeDashoffset = frame?.dashOffset !== undefined ? `${frame.dashOffset}px` : '0px';
      return;
    }
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
  if (crop) hideNotesOutside(clone, crop);
  clone.removeAttribute('id');
  // The live stage uses CSS zoom. This picture keeps the previous scale transform.
  clone.style.removeProperty('zoom');
  clone.style.transformOrigin = '0 0';

  // Output pixels per stage pixel (per screen pixel for the current view), for the title block.
  let pictureScale = 1;
  if (currentView) {
    const scale = app.scale || 1;
    const panX = app.panX || 0;
    const panY = app.panY || 0;
    const viewFitScale = Math.min(outWidth / frameWidth, outHeight / frameHeight);
    pictureScale = viewFitScale;
    if (viewFitScale !== 1) {
      clone.style.transform = `scale(${viewFitScale}) translate(${panX}px, ${panY}px) scale(${scale})`;
    } else {
      clone.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
    }
  } else if (crop) {
    const cropScale = Math.min(outWidth / crop.width, outHeight / crop.height);
    pictureScale = cropScale;
    clone.style.transform = `scale(${cropScale}) translate(${-crop.x}px, ${-crop.y}px)`;
  } else {
    const fitScale = Math.min(outWidth / stageWidth, outHeight / stageHeight);
    pictureScale = fitScale;
    if (fitScale !== 1) {
      clone.style.transform = `scale(${fitScale})`;
    } else {
      clone.style.transform = 'none';
    }
  }
  clone.style.width = `${stageWidth}px`;
  clone.style.height = `${stageHeight}px`;
  clone.style.setProperty('--stage-h', String(stageHeight));
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

  // Set explicit resolved --cc-* properties on root style
  const customParts: string[] = [];
  for (const [k, v] of Object.entries(resolvedVars)) {
    customParts.push(`${k}:${v}`);
  }
  if (rootStyle && typeof rootStyle[Symbol.iterator] === 'function') {
    for (const prop of rootStyle) {
      if (prop.startsWith('--') && !(prop in resolvedVars)) {
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
    .stage-world::before, .stage-world::after { display: none !important; }
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
  // Sketch's wobble filter lives in the page head, not in the stage, so the picture carries its own copy.
  if (app.doc.style === 'sketch') {
    const defs = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute">${ROUGH_FILTER}</svg>`, 'image/svg+xml').documentElement;
    root.append(document.importNode(defs, true));
  }

  const rawSerialized = new XMLSerializer().serializeToString(root);
  const serialized = resolveCssVariables(rawSerialized, resolvedVars);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${outWidth}" height="${outHeight}" viewBox="0 0 ${outWidth} ${outHeight}" role="img">
  <title>${escapeXmlText(app.doc.title.trim() || 'Untitled diagram')}</title>
  <desc>${escapeXmlText(describeDiagram(app.doc))}</desc>
  <foreignObject x="0" y="0" width="${outWidth}" height="${outHeight}" style="width:${outWidth}px;height:${outHeight}px;overflow:visible;">${serialized}</foreignObject>
  ${frame?.titleBlock ? titleBlockSvg(titleBlockFor(app.doc, pageInfo()), outWidth, outHeight, currentScheme(), pictureScale) : ''}
</svg>`;
}
