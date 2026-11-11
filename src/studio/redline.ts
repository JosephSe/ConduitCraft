/**
 * Redline marks (C5, 8.4). In the Review lens every visible issue on this level is circled on the sheet with a
 * hand-drawn ellipse in the redline colour and numbered like the issue list. The shape comes from `core/roughen.ts`,
 * seeded by the target id, so it never changes between renders. Errors are drawn with a solid pen; warnings and notes
 * use a dashed one.
 */
import { roughEllipsePath } from '../core/roughen';
import { app } from './state';
import { orderedInsights } from './insights';
import { wireHandlesSvg } from './dom';

const SVG_NS = 'http://www.w3.org/2000/svg';

function layer(): SVGGElement {
  let g = wireHandlesSvg.querySelector<SVGGElement>('#redline-layer');
  if (!g) {
    g = document.createElementNS(SVG_NS, 'g');
    g.id = 'redline-layer';
    g.setAttribute('aria-hidden', 'true');
    wireHandlesSvg.prepend(g);
  }
  return g;
}

/** Repaints the marks: nothing outside the Review lens. Called with every full render. */
export function paintRedline(): void {
  const g = layer();
  if (app.lens !== 'review') {
    g.replaceChildren();
    return;
  }
  const here = app.levelPath.join('/');
  const marks: SVGElement[] = [];
  orderedInsights().forEach((issue, index) => {
    if (issue.path.join('/') !== here) return;
    let cx: number;
    let cy: number;
    let rx: number;
    let ry: number;
    if (issue.target.type === 'node') {
      const node = app.doc.nodes.find((n) => n.id === issue.target.id);
      if (!node) return;
      cx = node.x + node.width / 2;
      cy = node.y + node.height / 2;
      rx = node.width / 2 + 14;
      ry = node.height / 2 + 12;
    } else {
      const edge = app.doc.edges.find((e) => e.id === issue.target.id);
      const from = app.doc.nodes.find((n) => n.id === edge?.from);
      const to = app.doc.nodes.find((n) => n.id === edge?.to);
      if (!edge || !from || !to) return;
      cx = (from.x + from.width / 2 + to.x + to.width / 2) / 2;
      cy = (from.y + from.height / 2 + to.y + to.height / 2) / 2;
      rx = 30;
      ry = 20;
    }
    const mark = document.createElementNS(SVG_NS, 'g');
    mark.setAttribute('class', 'redline-mark');
    mark.dataset.level = issue.level;
    mark.dataset.n = String(index + 1);
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', roughEllipsePath(cx, cy, rx, ry, `${issue.target.id}:${issue.code}`));
    path.setAttribute('pathLength', '1');
    const num = document.createElementNS(SVG_NS, 'text');
    num.setAttribute('x', String(Math.round(cx + rx * 0.72 + 4)));
    num.setAttribute('y', String(Math.round(cy - ry * 0.72 - 4)));
    num.textContent = String(index + 1);
    mark.append(path, num);
    marks.push(mark);
  });
  // Unchanged marks keep their drawn state, so the pen animation only plays when the lens opens or the issues change.
  const signature = marks.map((m) => `${m.dataset.n}${m.firstElementChild?.getAttribute('d')}`).join('|');
  if (g.dataset.sig === signature) return;
  g.dataset.sig = signature;
  g.replaceChildren(...marks);
}
