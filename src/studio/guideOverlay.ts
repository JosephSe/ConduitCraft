/**
 * Draws the smart guides (B11) while a component is dragged. They go in one group on the wire-handles overlay, which
 * sits above the components and does not take pointer events, so a guide never gets in the way of the drag.
 */
import { wireHandlesSvg } from './dom';
import type { Distance, GuideResult } from './guides';

const NS = 'http://www.w3.org/2000/svg';
const GROUP_ID = 'guides-g';

function group(): SVGGElement {
  let g = wireHandlesSvg.querySelector<SVGGElement>(`#${GROUP_ID}`);
  if (!g) {
    g = document.createElementNS(NS, 'g');
    g.id = GROUP_ID;
    g.setAttribute('aria-hidden', 'true');
    wireHandlesSvg.appendChild(g);
  }
  return g;
}

function line(g: SVGGElement, x1: number, y1: number, x2: number, y2: number, cls: string): void {
  const el = document.createElementNS(NS, 'line');
  el.setAttribute('class', cls);
  el.setAttribute('x1', String(x1));
  el.setAttribute('y1', String(y1));
  el.setAttribute('x2', String(x2));
  el.setAttribute('y2', String(y2));
  g.appendChild(el);
}

function label(g: SVGGElement, x: number, y: number, text: string): void {
  const el = document.createElementNS(NS, 'text');
  el.setAttribute('class', 'guide-label');
  el.setAttribute('x', String(x));
  el.setAttribute('y', String(y));
  el.setAttribute('text-anchor', 'middle');
  el.textContent = text;
  g.appendChild(el);
}

/** A bracket across a gap, with its size above it (or beside it for a vertical gap). */
function bracket(g: SVGGElement, axis: 'x' | 'y', start: number, end: number, cross: number, text: string, cls: string): void {
  const mid = (start + end) / 2;
  if (axis === 'x') {
    line(g, start, cross, end, cross, cls);
    line(g, start, cross - 4, start, cross + 4, cls);
    line(g, end, cross - 4, end, cross + 4, cls);
    label(g, mid, cross - 8, text);
  } else {
    line(g, cross, start, cross, end, cls);
    line(g, cross - 4, start, cross + 4, start, cls);
    line(g, cross - 4, end, cross + 4, end, cls);
    label(g, cross + 18, mid + 4, text);
  }
}

export function paintGuides(result: GuideResult, distances: Distance[] = []): void {
  const g = group();
  g.replaceChildren();
  for (const guide of result.guides) {
    if (guide.axis === 'x') line(g, guide.pos, guide.from - 12, guide.pos, guide.to + 12, 'guide-line');
    else line(g, guide.from - 12, guide.pos, guide.to + 12, guide.pos, 'guide-line');
  }
  for (const mark of result.spacing) {
    bracket(g, mark.axis, mark.start, mark.end, mark.cross, String(Math.round(mark.end - mark.start)), 'guide-gap');
  }
  for (const d of distances) bracket(g, d.axis, d.start, d.end, d.cross, `${d.value} px`, 'guide-distance');
}

export function clearGuides(): void {
  wireHandlesSvg.querySelector(`#${GROUP_ID}`)?.replaceChildren();
}
