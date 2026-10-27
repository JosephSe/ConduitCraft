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
