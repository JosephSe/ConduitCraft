/**
 * The layered (ELK) auto-layout (D3 / F-11). A second arranger beside `autoLayoutDocument`, which stays the default.
 * ELK is a big library, so this module is only ever loaded on demand (`import('../core/elkLayout')`), and it has no
 * DOM in it: `planElkLayout` works out where everything goes and `applyElkPlan` moves it, so the studio can do the
 * second step inside one undo step.
 *
 * What it honours:
 *  - fixed wire ends (a wire whose source or target side is not "auto") stay on that side of the component;
 *  - zones (the numbered columns) are layers, so a component stays in the zone it is in, left to right;
 *  - locked components stay exactly where they are, and are left out of the arranging.
 */
import ELK from 'elkjs/lib/elk.bundled.js';
import type { ElkNode, ElkExtendedEdge, ElkPort } from 'elkjs/lib/elk-api';
import { getNodeDimensions, expandStageToFit, type LayoutDirection, type LayoutSpacing } from './layout';
import { nodeShapeFrame } from './nodeStyle';
import type { DiagramDocument, PortSide } from '../types';

export interface ElkLayoutOptions {
  direction?: LayoutDirection;
  spacing?: LayoutSpacing;
}

/** Where each moved component goes, plus the direction the diagram now flows. */
export interface ElkPlan {
  direction: LayoutDirection;
  positions: Map<string, { x: number; y: number; width: number; height: number }>;
}

const GAPS: Record<LayoutDirection, Record<LayoutSpacing, { layer: number; node: number }>> = {
  LR: { compact: { layer: 64, node: 32 }, comfortable: { layer: 104, node: 56 }, spacious: { layer: 160, node: 88 } },
  TD: { compact: { layer: 64, node: 32 }, comfortable: { layer: 96, node: 56 }, spacious: { layer: 152, node: 88 } },
};
const SIDE: Record<Exclude<PortSide, 'auto'>, string> = { top: 'NORTH', right: 'EAST', bottom: 'SOUTH', left: 'WEST' };
const snap = (n: number): number => Math.round(n / 16) * 16;

let elk: InstanceType<typeof ELK> | null = null;

/** Work out the layered layout without touching the document. Resolves to null when there is nothing to arrange. */
export async function planElkLayout(doc: DiagramDocument, options: ElkLayoutOptions = {}): Promise<ElkPlan | null> {
  const direction: LayoutDirection = options.direction ?? doc.direction ?? 'LR';
  const gaps = GAPS[direction][options.spacing ?? 'comfortable'];
  const movable = doc.nodes.filter((n) => !n.locked);
  if (movable.length === 0) return null;
  const ids = new Set(movable.map((n) => n.id));

  // The size each component will have once arranged, the same as the built-in layout uses.
  const sizes = new Map(
    movable.map((n) => {
      const frame = nodeShapeFrame(getNodeDimensions(n.kind), n.shape);
      return [n.id, { width: frame.width, height: frame.height }] as const;
    }),
  );

  // Zones are layers only in a left-to-right layout, and only when every movable component sits in one.
  const zoneOf = new Map<string, number>();
  if (direction === 'LR' && doc.zones.length > 0) {
    const zones = [...doc.zones].sort((a, b) => a.x - b.x);
    for (const n of movable) {
      const cx = n.x + n.width / 2;
      const index = zones.findIndex((z) => cx >= z.x && cx < z.x + z.width);
      if (index >= 0) zoneOf.set(n.id, index);
    }
  }
  const useZones = zoneOf.size === movable.length && new Set(zoneOf.values()).size > 1;

  const wires = doc.edges.filter((e) => e.from !== e.to && e.route !== 'under' && ids.has(e.from) && ids.has(e.to));
  const ports = new Map<string, ElkPort[]>();
  const portFor = (nodeId: string, wireId: string, end: 's' | 't', side: PortSide): string | undefined => {
    if (side === 'auto') return undefined;
    const id = `${wireId}:${end}`;
    const list = ports.get(nodeId) ?? [];
    list.push({ id, width: 0, height: 0, layoutOptions: { 'elk.port.side': SIDE[side] } });
    ports.set(nodeId, list);
    return id;
  };
  const edges: ElkExtendedEdge[] = wires.map((e) => ({
    id: e.id,
    sources: [portFor(e.from, e.id, 's', e.sourcePort) ?? e.from],
    targets: [portFor(e.to, e.id, 't', e.targetPort) ?? e.to],
  }));

  const root: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': direction === 'LR' ? 'RIGHT' : 'DOWN',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.spacing.nodeNode': String(gaps.node),
      'elk.layered.spacing.nodeNodeBetweenLayers': String(gaps.layer),
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      ...(useZones ? { 'elk.partitioning.activate': 'true' } : {}),
    },
    children: movable.map((n) => {
      const own = ports.get(n.id);
      return {
        id: n.id,
        ...sizes.get(n.id)!,
        ...(own ? { ports: own, layoutOptions: { 'elk.portConstraints': 'FIXED_SIDE' } } : {}),
        ...(useZones ? { layoutOptions: { ...(own ? { 'elk.portConstraints': 'FIXED_SIDE' } : {}), 'elk.partitioning.partition': String(zoneOf.get(n.id)) } } : {}),
      };
    }),
    edges,
  };

  elk ??= new ELK();
  const laid = await elk.layout(root);
  const placed = (laid.children ?? []).filter((c) => c.x !== undefined && c.y !== undefined);
  if (placed.length === 0) return null;

  // Keep the arranged block where the movable components were, so locked ones around them keep their neighbours.
  const hasLocked = movable.length < doc.nodes.length;
  const anchorX = hasLocked ? Math.min(...movable.map((n) => n.x)) : 72;
  const anchorY = hasLocked ? Math.min(...movable.map((n) => n.y)) : direction === 'LR' ? 196 : 96;
  const minX = Math.min(...placed.map((c) => c.x!));
  const minY = Math.min(...placed.map((c) => c.y!));

  const positions: ElkPlan['positions'] = new Map();
  for (const c of placed) {
    const size = sizes.get(c.id)!;
    positions.set(c.id, { x: snap(anchorX + c.x! - minX), y: snap(anchorY + c.y! - minY), ...size });
  }
  return { direction, positions };
}

/** Move the components to where the plan says. Returns how many ended up somewhere else. */
export function applyElkPlan(doc: DiagramDocument, plan: ElkPlan): number {
  let moved = 0;
  doc.direction = plan.direction;
  for (const n of doc.nodes) {
    const to = plan.positions.get(n.id);
    if (!to || n.locked) continue;
    if (n.x !== to.x || n.y !== to.y) moved++;
    n.x = to.x;
    n.y = to.y;
    n.width = to.width;
    n.height = to.height;
  }
  expandStageToFit(doc);
  return moved;
}
