import {
  BEAD_PARTS,
  BEAD_SLOW_FACTOR,
  advanceBead,
  beadCount,
  beadSpeed,
  beadStart,
  beadVisible,
} from '../core/beads';

/**
 * Traffic beads (v4 concept): while the Traffic lens is on, each animated wire carries glowing beads that a
 * requestAnimationFrame loop moves along it. The loop starts every time the lens turns to Traffic and stops when it
 * leaves, so switching lenses never leaves the flow frozen. The CSS capsule on `.conduit-stream` stays as the fallback
 * (and is what pictures and GIF exports draw): a wire with beads carries `data-beads`, which hides it.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

interface Bead {
  pos: number;
  speed: number;
  reverse: boolean;
  g: SVGGElement;
  parts: SVGCircleElement[];
}

interface WireBeads {
  d: string;
  transform: string;
  key: string;
  group: SVGGElement;
  length: number;
  path: SVGPathElement;
  layer: SVGGElement;
  beads: Bead[];
}

const wires = new Map<SVGGElement, WireBeads>();
let frame = 0;
let last = 0;

const reducedMotion = (): boolean => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

function eligible(g: SVGGElement): SVGPathElement | null {
  if (g.dataset.animated !== 'true' || g.classList.contains('is-chaos-cut')) return null;
  const path = g.querySelector<SVGPathElement>('.conduit-stream');
  if (!path?.getAttribute('d') || typeof path.getTotalLength !== 'function') return null;
  return path;
}

function drop(g: SVGGElement): void {
  wires.get(g)?.layer.remove();
  wires.delete(g);
  delete g.dataset.beads;
}

function build(g: SVGGElement, path: SVGPathElement): WireBeads | null {
  const length = path.getTotalLength();
  if (!(length > 1)) return null;
  const twoWay = g.dataset.flow === 'both';
  const flowScale = Number.parseFloat(g.style.getPropertyValue('--flow-scale')) || 1;
  const speed = beadSpeed(g.dataset.sync === 'async', flowScale);
  const count = beadCount(length, twoWay);
  const layer = document.createElementNS(SVG_NS, 'g');
  layer.setAttribute('class', 'cc-beads');
  layer.setAttribute('aria-hidden', 'true');
  const transform = path.getAttribute('transform') ?? '';
  if (transform) layer.setAttribute('transform', transform);
  const id = g.dataset.edgeId ?? '';
  const beads: Bead[] = [];
  for (let i = 0; i < count; i += 1) {
    const bead = document.createElementNS(SVG_NS, 'g');
    bead.setAttribute('class', 'cc-bead');
    const parts = BEAD_PARTS.map((part) => {
      const c = document.createElementNS(SVG_NS, 'circle');
      c.setAttribute('class', part.core ? 'cc-bead-dot cc-bead-core' : 'cc-bead-dot');
      c.setAttribute('r', String(part.r));
      if (part.opacity < 1) c.setAttribute('opacity', String(part.opacity));
      return c;
    });
    bead.append(...parts);
    layer.append(bead);
    beads.push({ pos: beadStart(i, count, length, id), speed, reverse: twoWay && i % 2 === 1, g: bead, parts });
  }
  // Above the rail and the (hidden) stream, below the port dot and the label badge.
  path.after(layer);
  g.dataset.beads = 'true';
  return { d: path.getAttribute('d') ?? '', transform, key: `${g.dataset.flow}|${g.dataset.sync}|${flowScale}`, group: g, length, path, layer, beads };
}

function place(wire: WireBeads, bead: Bead): void {
  const { length, path } = wire;
  const visible = beadVisible(bead.pos, length);
  bead.g.style.opacity = visible ? '' : '0';
  if (!visible) return;
  BEAD_PARTS.forEach((part, i) => {
    const along = Math.max(0, Math.min(length, bead.pos - part.back));
    const pt = path.getPointAtLength(bead.reverse ? length - along : along);
    bead.parts[i].setAttribute('cx', pt.x.toFixed(1));
    bead.parts[i].setAttribute('cy', pt.y.toFixed(1));
  });
}

function sync(root: ParentNode): void {
  const seen = new Set<SVGGElement>();
  for (const g of root.querySelectorAll<SVGGElement>('.conduit-group')) {
    const path = eligible(g);
    if (!path) {
      if (wires.has(g)) drop(g);
      continue;
    }
    seen.add(g);
    const have = wires.get(g);
    const flowScale = Number.parseFloat(g.style.getPropertyValue('--flow-scale')) || 1;
    const key = `${g.dataset.flow}|${g.dataset.sync}|${flowScale}`;
    if (
      have &&
      have.path === path &&
      have.layer.isConnected &&
      have.d === path.getAttribute('d') &&
      have.transform === (path.getAttribute('transform') ?? '') &&
      have.key === key
    ) {
      continue;
    }
    if (have) drop(g);
    const built = build(g, path);
    if (built) wires.set(g, built);
  }
  for (const g of [...wires.keys()]) if (!seen.has(g)) drop(g);
}

function stop(): void {
  if (frame) cancelAnimationFrame(frame);
  frame = 0;
  for (const g of [...wires.keys()]) drop(g);
}

function start(workspace: HTMLElement): void {
  if (frame || reducedMotion()) return;
  last = performance.now();
  const tick = (now: number) => {
    const dt = Math.min(50, now - last);
    last = now;
    sync(workspace);
    const paused = document.body.classList.contains('motion-paused');
    for (const wire of wires.values()) {
      // A wire into or out of a degraded or slowed component runs slower (set by the wire painter under a failure).
      const factor = wire.group.dataset.traffic === 'slow' ? BEAD_SLOW_FACTOR : 1;
      for (const bead of wire.beads) {
        if (!paused) bead.pos = advanceBead(bead.pos, bead.speed * factor, dt, wire.length);
        place(wire, bead);
      }
    }
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
}

/** Run the beads whenever the workspace is in the Traffic lens. Call once at boot. */
export function initTrafficBeads(): void {
  const workspace = document.getElementById('workspace');
  if (!workspace) return;
  const apply = () => (workspace.dataset.lens === 'traffic' && !reducedMotion() ? start(workspace) : stop());
  new MutationObserver(apply).observe(workspace, { attributes: true, attributeFilter: ['data-lens'] });
  window.matchMedia?.('(prefers-reduced-motion: reduce)').addEventListener?.('change', apply);
  apply();
}
