import type { NodeIconName } from '../types';

const SVG_NS = 'http://www.w3.org/2000/svg';

interface SvgPrimitive {
  tag: 'path' | 'rect' | 'circle' | 'ellipse' | 'polyline';
  attrs: Record<string, string>;
}

export const ICON_LIST: Array<{ id: NodeIconName; label: string }> = [
  { id: 'monitor', label: 'Platform' },
  { id: 'code', label: 'API / Code' },
  { id: 'bridge', label: 'Event Bus' },
  { id: 'shield', label: 'Gate / Policy' },
  { id: 'database', label: 'Database' },
  { id: 'server', label: 'Server' },
  { id: 'cloud', label: 'Cloud' },
  { id: 'cpu', label: 'Compute' },
  { id: 'lock', label: 'Auth / Lock' },
  { id: 'globe', label: 'Network' },
  { id: 'agency', label: 'Client / Org' },
  { id: 'spark', label: 'AI / Engine' },
];

const ICON_PRIMITIVES: Record<NodeIconName, SvgPrimitive[]> = {
  actor: [
    { tag: 'circle', attrs: { cx: '12', cy: '8', r: '4' } },
    { tag: 'path', attrs: { d: 'M5 20c0-3.87 3.13-7 7-7s7 3.13 7 7' } },
  ],
  monitor: [
    { tag: 'rect', attrs: { x: '2', y: '3', width: '20', height: '14', rx: '2' } },
    { tag: 'path', attrs: { d: 'M8 21h8M12 17v4' } },
  ],
  bridge: [
    { tag: 'path', attrs: { d: 'M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5' } },
  ],
  shield: [
    { tag: 'path', attrs: { d: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' } },
    { tag: 'path', attrs: { d: 'm9 12 2 2 4-4' } },
  ],
  code: [
    { tag: 'polyline', attrs: { points: '16 18 22 12 16 6' } },
    { tag: 'polyline', attrs: { points: '8 6 2 12 8 18' } },
  ],
  database: [
    { tag: 'ellipse', attrs: { cx: '12', cy: '5', rx: '9', ry: '3' } },
    { tag: 'path', attrs: { d: 'M21 12c0 1.66-4 3-9 3s-9-1.34-9-3' } },
    { tag: 'path', attrs: { d: 'M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5' } },
  ],
  agency: [
    { tag: 'path', attrs: { d: 'M3 21h18M5 21V7l7-4 7 4v14' } },
  ],
  server: [
    { tag: 'rect', attrs: { x: '2', y: '2', width: '20', height: '8', rx: '2' } },
    { tag: 'rect', attrs: { x: '2', y: '14', width: '20', height: '8', rx: '2' } },
    { tag: 'path', attrs: { d: 'M6 6h.01M6 18h.01' } },
  ],
  lock: [
    { tag: 'rect', attrs: { x: '3', y: '11', width: '18', height: '11', rx: '2' } },
    { tag: 'path', attrs: { d: 'M7 11V7a5 5 0 0 1 10 0v4' } },
  ],
  cloud: [
    { tag: 'path', attrs: { d: 'M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z' } },
  ],
  spark: [
    {
      tag: 'path',
      attrs: {
        d: 'M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3L12 3Z',
      },
    },
  ],
  cpu: [
    { tag: 'rect', attrs: { x: '4', y: '4', width: '16', height: '16', rx: '2' } },
    { tag: 'rect', attrs: { x: '9', y: '9', width: '6', height: '6', rx: '1' } },
    { tag: 'path', attrs: { d: 'M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3' } },
  ],
  globe: [
    { tag: 'circle', attrs: { cx: '12', cy: '12', r: '10' } },
    { tag: 'path', attrs: { d: 'M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z' } },
  ],
};

export function normalizeIconName(raw: string | undefined, fallback: NodeIconName): NodeIconName {
  if (!raw) return fallback;
  const key = raw.trim().toLowerCase() as NodeIconName;
  return key in ICON_PRIMITIVES ? key : fallback;
}

export function createNodeIconSvg(icon: NodeIconName, size = 18): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');

  const primitives = ICON_PRIMITIVES[icon] || ICON_PRIMITIVES.server;
  for (const prim of primitives) {
    const el = document.createElementNS(SVG_NS, prim.tag);
    for (const [k, v] of Object.entries(prim.attrs)) {
      el.setAttribute(k, v);
    }
    svg.appendChild(el);
  }
  return svg;
}

export function createHumanOutlineSvg(compact = false): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', compact ? '30' : '66');
  svg.setAttribute('height', compact ? '34' : '78');
  svg.setAttribute('viewBox', '0 0 70 82');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('aria-hidden', 'true');

  const head = document.createElementNS(SVG_NS, 'circle');
  head.setAttribute('class', 'actor-shape');
  head.setAttribute('cx', '35');
  head.setAttribute('cy', '18');
  head.setAttribute('r', '12.5');

  const body = document.createElementNS(SVG_NS, 'path');
  body.setAttribute('class', 'actor-shape');
  body.setAttribute(
    'd',
    'M 14 74 C 14 53 22.5 38 35 38 C 47.5 38 56 53 56 74 C 56 77.5 53 79.5 49 79.5 H 21 C 17 79.5 14 77.5 14 74 Z',
  );

  svg.append(head, body);
  return svg;
}

export function renderIconMarkup(icon: NodeIconName, size = 18): string {
  const primitives = ICON_PRIMITIVES[icon] || ICON_PRIMITIVES.server;
  const inner = primitives
    .map((p) => {
      const attrs = Object.entries(p.attrs)
        .map(([k, v]) => `${k}="${v}"`)
        .join(' ');
      return `<${p.tag} ${attrs}/>`;
    })
    .join('');
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
}

export function renderHumanOutlineMarkup(): string {
  return `<svg width="66" height="78" viewBox="0 0 70 82" fill="none" aria-hidden="true"><circle class="actor-shape" cx="35" cy="18" r="12.5"/><path class="actor-shape" d="M 14 74 C 14 53 22.5 38 35 38 C 47.5 38 56 53 56 74 C 56 77.5 53 79.5 49 79.5 H 21 C 17 79.5 14 77.5 14 74 Z"/></svg>`;
}

export type UiIconName =
  | 'undo'
  | 'redo'
  | 'pencil'
  | 'select'
  | 'connect'
  | 'settings'
  | 'swimlane'
  | 'notes'
  | 'upload'
  | 'trash'
  | 'copy'
  | 'zoomIn'
  | 'zoomOut'
  | 'fit'
  | 'layout'
  | 'template'
  | 'play'
  | 'pause'
  | 'help';

const UI_ICON_PRIMITIVES: Record<UiIconName, SvgPrimitive[]> = {
  undo: [
    { tag: 'path', attrs: { d: 'M3 7v6h6' } },
    { tag: 'path', attrs: { d: 'M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13' } },
  ],
  redo: [
    { tag: 'path', attrs: { d: 'M21 7v6h-6' } },
    { tag: 'path', attrs: { d: 'M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7' } },
  ],
  pencil: [
    { tag: 'path', attrs: { d: 'M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z' } },
  ],
  select: [
    { tag: 'path', attrs: { d: 'm3 3 7 18 3-7 7-3L3 3z' } },
  ],
  connect: [
    { tag: 'circle', attrs: { cx: '18', cy: '6', r: '3' } },
    { tag: 'circle', attrs: { cx: '6', cy: '18', r: '3' } },
    { tag: 'path', attrs: { d: 'M18 9v2a4 4 0 0 1-4 4H9' } },
  ],
  settings: [
    { tag: 'circle', attrs: { cx: '12', cy: '12', r: '3' } },
    {
      tag: 'path',
      attrs: {
        d: 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
      },
    },
  ],
  swimlane: [
    { tag: 'rect', attrs: { x: '3', y: '4', width: '18', height: '16', rx: '2' } },
    { tag: 'path', attrs: { d: 'M3 10h18' } },
  ],
  notes: [
    { tag: 'rect', attrs: { x: '4', y: '3', width: '16', height: '18', rx: '2' } },
    { tag: 'path', attrs: { d: 'M8 8h8M8 12h8M8 16h5' } },
  ],
  upload: [
    { tag: 'path', attrs: { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12' } },
  ],
  trash: [
    { tag: 'path', attrs: { d: 'M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6' } },
  ],
  copy: [
    { tag: 'rect', attrs: { x: '9', y: '9', width: '13', height: '13', rx: '2' } },
    { tag: 'path', attrs: { d: 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1' } },
  ],
  zoomIn: [
    { tag: 'circle', attrs: { cx: '11', cy: '11', r: '8' } },
    { tag: 'path', attrs: { d: 'm21 21-4.35-4.35M11 8v6M8 11h6' } },
  ],
  zoomOut: [
    { tag: 'circle', attrs: { cx: '11', cy: '11', r: '8' } },
    { tag: 'path', attrs: { d: 'm21 21-4.35-4.35M8 11h6' } },
  ],
  fit: [
    { tag: 'path', attrs: { d: 'M15 3h6v6M9 21H3v-6M21 15v6h-6M3 9V3h6' } },
  ],
  layout: [
    { tag: 'rect', attrs: { x: '3', y: '3', width: '6', height: '6', rx: '1' } },
    { tag: 'rect', attrs: { x: '15', y: '3', width: '6', height: '6', rx: '1' } },
    { tag: 'rect', attrs: { x: '9', y: '15', width: '6', height: '6', rx: '1' } },
    { tag: 'path', attrs: { d: 'M6 9v3a3 3 0 0 0 3 3h3a3 3 0 0 0 3-3V9' } },
  ],
  template: [
    { tag: 'rect', attrs: { x: '3', y: '3', width: '18', height: '18', rx: '2' } },
    { tag: 'path', attrs: { d: 'M3 9h18M9 21V9' } },
  ],
  play: [
    { tag: 'path', attrs: { d: 'm5 3 14 9-14 9V3z' } },
  ],
  pause: [
    { tag: 'rect', attrs: { x: '6', y: '4', width: '4', height: '16' } },
    { tag: 'rect', attrs: { x: '14', y: '4', width: '4', height: '16' } },
  ],
  help: [
    { tag: 'circle', attrs: { cx: '12', cy: '12', r: '10' } },
    { tag: 'path', attrs: { d: 'M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01' } },
  ],
};

export function renderUiIconMarkup(icon: UiIconName, size = 16): string {
  const primitives = UI_ICON_PRIMITIVES[icon] || UI_ICON_PRIMITIVES.help;
  const inner = primitives
    .map((p) => {
      const attrs = Object.entries(p.attrs)
        .map(([k, v]) => `${k}="${v}"`)
        .join(' ');
      return `<${p.tag} ${attrs}/>`;
    })
    .join('');
  return `<svg class="ui-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
}

export function createUiIconSvg(icon: UiIconName, size = 16): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'ui-icon');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');

  const primitives = UI_ICON_PRIMITIVES[icon] || UI_ICON_PRIMITIVES.help;
  for (const prim of primitives) {
    const el = document.createElementNS(SVG_NS, prim.tag);
    for (const [k, v] of Object.entries(prim.attrs)) {
      el.setAttribute(k, v);
    }
    svg.appendChild(el);
  }
  return svg;
}

