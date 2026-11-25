import { nodeShapeFrame, storeDrawsCylinder } from './nodeStyle';
import { notesCardHeight, notesCardWidth } from './notesSize';
import { computePortOffsets, type PortSpreadEnd } from './portSpread';
import { wireLabelText } from './wire';
import { longestStraightRun } from './wireGeom';
import type {
  DiagramDocument,
  DiagramEdge,
  DiagramNode,
  NodeKind,
  PortSide,
  RoutedDiagramEdge,
  SimulationScenario,
} from '../types';

export function getNodeDimensions(kind: NodeKind): { width: number; height: number } {
  switch (kind) {
    case 'actor':
      return { width: 148, height: 142 };
    case 'core':
    case 'gate':
    case 'limiter':
      return { width: 242, height: 172 };
    case 'store':
      return { width: 216, height: 150 };
    case 'client':
    case 'scheduler':
      return { width: 192, height: 112 };
    case 'cache':
      return { width: 200, height: 112 };
    case 'queue':
      return { width: 240, height: 112 };
    case 'balancer':
      return { width: 200, height: 120 };
    case 'service':
    case 'bus':
    default:
      return { width: 222, height: 142 };
  }
}

const LEGACY_STORE_WIDTH = 248;
const LEGACY_STORE_HEIGHT = 172;

/** Shrink a drum that is still the old card size. A custom size stays put, and the box stays centered. */
export function tightenLegacyStoreCylinder(node: DiagramNode): void {
  if (!storeDrawsCylinder(node.kind, node.shape)) return;
  if (node.width !== LEGACY_STORE_WIDTH || node.height !== LEGACY_STORE_HEIGHT) return;
  const next = getNodeDimensions('store');
  node.x += Math.round((node.width - next.width) / 2);
  node.y += Math.round((node.height - next.height) / 2);
  node.width = next.width;
  node.height = next.height;
}

export function getNodeCenter(node: DiagramNode): [number, number] {
  return [Math.round(node.x + node.width / 2), Math.round(node.y + node.height / 2)];
}

/** The radius of an actor's head, in world units, as drawn at the top of its box (the top port is its crown). */
const ACTOR_HEAD_R = 12;

/**
 * How far apart, at most, wires that share one of an actor's ports sit. The head is small, so its ends stay on it;
 * the body's sides are short.
 */
const ACTOR_PORT_SPREAD: Record<Exclude<PortSide, 'auto'>, { gap: number; room: number }> = {
  top: { gap: 16, room: 2 * (ACTOR_HEAD_R - 2) },
  bottom: { gap: 24, room: 72 },
  left: { gap: 14, room: 32 },
  right: { gap: 14, room: 32 },
};

export function getPortPoint(
  node: DiagramNode,
  side: Exclude<PortSide, 'auto'>,
  offsetRatio = 0,
): [number, number] {
  const cx = node.x + node.width / 2;
  const cy = node.y + node.height / 2;

  if (node.kind === 'actor') {
    // The figure's ports are fixed points on the head, the caption and the sides of the body. When several wires
    // share one, `offsetRatio` moves each along it: around the head for the top, so the ends stay on the outline.
    switch (side) {
      case 'top': {
        const dx = Math.max(-ACTOR_HEAD_R + 2, Math.min(ACTOR_HEAD_R - 2, node.width * offsetRatio));
        const drop = ACTOR_HEAD_R - Math.sqrt(ACTOR_HEAD_R * ACTOR_HEAD_R - dx * dx);
        return [Math.round(cx + dx), Math.round(node.y + 4 + drop)];
      }
      case 'bottom':
        return [Math.round(cx + node.width * offsetRatio), Math.round(node.y + node.height - 2)];
      case 'left':
        return [Math.round(node.x + 22), Math.round(node.y + 58 + node.height * offsetRatio)];
      case 'right':
        return [Math.round(node.x + node.width - 22), Math.round(node.y + 58 + node.height * offsetRatio)];
    }
  }

  switch (side) {
    case 'top':
      return [Math.round(cx + node.width * offsetRatio), node.y];
    case 'bottom':
      return [Math.round(cx + node.width * offsetRatio), node.y + node.height];
    case 'left':
      return [node.x, Math.round(cy + node.height * offsetRatio)];
    case 'right':
      return [node.x + node.width, Math.round(cy + node.height * offsetRatio)];
  }
}

export function routeDiagramEdges(doc: DiagramDocument): RoutedDiagramEdge[] {
  const nodeMap = new Map(doc.nodes.map((n) => [n.id, n]));

  // Detect nodes participating in bottom U-loops so incoming & outgoing ports never overlap
  const hasUnderOut = new Set<string>();
  const hasUnderIn = new Set<string>();
  const hasDownwardOut = new Set<string>();

  for (const e of doc.edges) {
    const src = nodeMap.get(e.from);
    const dst = nodeMap.get(e.to);
    if (!src || !dst) continue;
    const [scx, scy] = getNodeCenter(src);
    const [dcx, dcy] = getNodeCenter(dst);
    const isUnder =
      e.route === 'under' ||
      (e.sourcePort === 'bottom' && e.targetPort === 'bottom') ||
      (e.route === 'auto' &&
        e.sourcePort === 'auto' &&
        e.targetPort === 'auto' &&
        doc.direction === 'LR' &&
        dcx < scx - 48 &&
        Math.abs(dcy - scy) < 160);

    if (isUnder) {
      hasUnderOut.add(src.id);
      hasUnderIn.add(dst.id);
    } else if (dst.y >= src.y + src.height - 8) {
      hasDownwardOut.add(src.id);
    }
  }

  let underLoopCount = 0;
  const overLoops: Array<{ minX: number; maxX: number; y: number }> = [];

  // Group wires that connect the same pair of components so they can be fanned into lanes
  const laneInfo = new Map<string, { index: number; count: number }>();
  const pairGroups = new Map<string, string[]>();
  const pairOf = new Map<string, string>(); // edge id -> its pair's key
  for (const e of doc.edges) {
    if (!nodeMap.has(e.from) || !nodeMap.has(e.to)) continue;
    const key = e.from < e.to ? `${e.from}|${e.to}` : `${e.to}|${e.from}`;
    const list = pairGroups.get(key) || [];
    list.push(e.id);
    pairGroups.set(key, list);
    pairOf.set(e.id, key);
  }
  for (const ids of pairGroups.values()) {
    ids.forEach((id, index) => laneInfo.set(id, { index, count: ids.length }));
  }

  // Resolve port sides up front for wires routed port-to-port, steering 'auto' ports away from
  // paths that would cut through other components.
  const SIDE_ROUTES = new Set<DiagramEdge['route']>(['bezier', 'straight', 'arc', 'orthogonal', 'step']);
  const resolvedSides = new Map<string, { srcSide: Side; dstSide: Side }>();
  // U-loops leave and enter on the same side (both tops or both bottoms). They draw their own path, but their ends
  // still share sides with other wires.
  const loopSides = new Map<string, { srcSide: Side; dstSide: Side }>();
  for (const e of doc.edges) {
    const src = nodeMap.get(e.from);
    const dst = nodeMap.get(e.to);
    if (!src || !dst) continue;
    if (e.route === 'over' || e.route === 'under') {
      const side = e.route === 'over' ? 'top' : 'bottom';
      loopSides.set(e.id, { srcSide: side, dstSide: side });
      continue;
    }
    const explicitAuto = e.route === 'auto' && (e.sourcePort !== 'auto' || e.targetPort !== 'auto');
    if (!SIDE_ROUTES.has(e.route) && !explicitAuto) continue;
    const sides = chooseRouteSides(e, src, dst, doc.nodes);
    // Auto routes with both ends on the top or bottom become U-loops.
    if (explicitAuto && sides.srcSide === sides.dstSide && (sides.srcSide === 'top' || sides.srcSide === 'bottom')) {
      loopSides.set(e.id, sides);
      continue;
    }
    resolvedSides.set(e.id, sides);
  }

  // Wires that meet one side of a component get their own spot along it instead of sharing the
  // midpoint. Parallel wires between the same pair that meet the same side already separate by lane, so those
  // ends sit this out; a pair's wires on different sides (one over the top, one back under) still spread.
  const portOffsets = new Map<string, number>(); // `${edgeId}|src` or `${edgeId}|dst` -> offset ratio
  // Sides that wires with both ports on 'auto' took, learnt by routing them once (see the second pass below).
  const autoSides = new Map<string, { srcSide: Side; dstSide: Side }>();
  /** Spread the ends that share a side. True when a wire with 'auto' ports shares a side with another end. */
  const spreadPorts = (): boolean => {
    portOffsets.clear();
    const spreadEnds: PortSpreadEnd[] = [];
    const sidesOf = (id: string) => resolvedSides.get(id) ?? loopSides.get(id) ?? autoSides.get(id);
    /** The side the wire meets `nodeId` on, or undefined when that is not known. */
    const sideAt = (edge: DiagramEdge, nodeId: string): Side | undefined => {
      const sides = sidesOf(edge.id);
      if (!sides) return undefined;
      return edge.from === nodeId ? sides.srcSide : edge.to === nodeId ? sides.dstSide : undefined;
    };
    const edgeById = new Map(doc.edges.map((e) => [e.id, e]));
    /** True when another wire between the same two components meets `nodeId` on `side`: lanes keep those apart. */
    const sharesSideWithTwin = (e: DiagramEdge, nodeId: string, side: Side): boolean =>
      (laneInfo.get(e.id)?.count ?? 1) > 1 &&
      (pairGroups.get(pairOf.get(e.id)!) ?? []).some((id) => {
        const twin = id !== e.id ? edgeById.get(id) : undefined;
        return !!twin && sideAt(twin, nodeId) === side;
      });
    for (const e of doc.edges) {
      const sides = sidesOf(e.id);
      if (!sides) continue;
      const src = nodeMap.get(e.from)!;
      const dst = nodeMap.get(e.to)!;
      const ends: Array<[DiagramNode, Side, DiagramNode, string]> = [
        [src, sides.srcSide, dst, `${e.id}|src`],
        [dst, sides.dstSide, src, `${e.id}|dst`],
      ];
      for (const [node, side, other, key] of ends) {
        if (sharesSideWithTwin(e, node.id, side)) continue;
        const [nx, ny] = getNodeCenter(node);
        const [ox, oy] = getNodeCenter(other);
        const span = side === 'top' || side === 'bottom' ? node.width : node.height;
        spreadEnds.push({
          key,
          nodeId: node.id,
          side,
          span,
          delta: side === 'top' || side === 'bottom' ? ox - nx : oy - ny,
          actorSpread: node.kind === 'actor' ? ACTOR_PORT_SPREAD[side] : null,
        });
      }
    }
    const computed = computePortOffsets(spreadEnds);
    let autoShares = false;
    for (const [key, ratio] of computed) {
      portOffsets.set(key, ratio);
      const edgeId = key.slice(0, key.lastIndexOf('|'));
      if (autoSides.has(edgeId)) autoShares = true;
    }
    return autoShares;
  };
  spreadPorts();

  // Loops keep clear of the components in their way, and only those: a component beyond the run (well above an over
  // loop, well below an under one) leaves the run where it is, so components can sit on the far side of a loop.
  const LOOP_CLEARANCE = 40;
  const loopBlockers = (minX: number, maxX: number, skip: readonly DiagramNode[]): DiagramNode[] =>
    doc.nodes.filter((n) => !skip.includes(n) && n.x + n.width >= minX - 8 && n.x <= maxX + 8);
  /** The run's height over the stretch: lifted past each component it would cross on its way up from the ends. */
  const clearOverRun = (y: number, minX: number, maxX: number, src: DiagramNode, dst: DiagramNode): number => {
    const lowerTop = Math.max(src.y, dst.y);
    const nodes = loopBlockers(minX, maxX, [src, dst]);
    for (let guard = 0; guard <= nodes.length; guard++) {
      const inWay = nodes.filter((n) => n.y < lowerTop && n.y + n.height + LOOP_CLEARANCE > y);
      if (inWay.length === 0) break;
      y = Math.min(y, Math.min(...inWay.map((n) => n.y)) - 54);
    }
    return y;
  };
  /** The run's depth under the stretch: dropped past each component it would cross on its way down from the ends. */
  const clearUnderRun = (y: number, minX: number, maxX: number, src: DiagramNode, dst: DiagramNode): number => {
    const upperBottom = Math.min(src.y + src.height, dst.y + dst.height);
    const nodes = loopBlockers(minX, maxX, [src, dst]);
    for (let guard = 0; guard <= nodes.length; guard++) {
      const inWay = nodes.filter((n) => n.y + n.height > upperBottom && n.y - LOOP_CLEARANCE < y);
      if (inWay.length === 0) break;
      y = Math.max(y, Math.max(...inWay.map((n) => n.y + n.height)) + 58);
    }
    return y;
  };

  const routeAll = () => {
    underLoopCount = 0;
    overLoops.length = 0;
    return doc.edges
      .map((rawEdge): RoutedDiagramEdge | null => {
        // The routed label is what the wire shows: the protocol prefix plus the label (F-17).
        const e = { ...rawEdge, label: wireLabelText(rawEdge) };
        const src = nodeMap.get(e.from);
        const dst = nodeMap.get(e.to);
        if (!src || !dst) return null;

        const [scx, scy] = getNodeCenter(src);
        const [dcx, dcy] = getNodeCenter(dst);
        const badgeWidth = e.label ? Math.max(88, Math.round(e.label.length * 7.6 + 26)) : undefined;
        const lane = laneInfo.get(e.id) || { index: 0, count: 1 };

        // Helper for bottom U-channel ("Under U-Loop")
        const buildUnderLoop = (): RoutedDiagramEdge => {
          const [sx, sy] = getPortPoint(
            src,
            'bottom',
            portOffsets.get(`${e.id}|src`) ?? (hasDownwardOut.has(src.id) || hasUnderIn.has(src.id) ? -0.19 : 0),
          );
          const [tx, ty] = getPortPoint(
            dst,
            'bottom',
            portOffsets.get(`${e.id}|dst`) ?? (hasUnderOut.has(dst.id) ? 0.16 : 0),
          );
          const loopY = clearUnderRun(
            Math.max(src.y + src.height, dst.y + dst.height) +
              58 +
              (underLoopCount > 2 ? (underLoopCount % 2) * 28 : 0) +
              lane.index * 30,
            Math.min(sx, tx),
            Math.max(sx, tx),
            src,
            dst,
          );
          underLoopCount++;
          const r = Math.min(20, Math.max(6, Math.abs(sx - tx) / 3));
          const dir = tx < sx ? -1 : 1;
          const pathD =
            Math.abs(sx - tx) < 8
              ? `M ${sx} ${sy} C ${sx - 56} ${loopY}, ${tx + 56} ${loopY}, ${tx} ${ty + 6}`
              : [
                  `M ${sx} ${sy}`,
                  `L ${sx} ${loopY - r}`,
                  `Q ${sx} ${loopY} ${sx + dir * r} ${loopY}`,
                  `L ${tx - dir * r} ${loopY}`,
                  `Q ${tx} ${loopY} ${tx} ${loopY - r}`,
                  `L ${tx} ${ty + 6}`,
                ].join(' ');
          return {
            ...e,
            pathD,
            startPoint: [sx, sy],
            endPoint: [tx, ty],
            badgePos: e.label ? [Math.round((sx + tx) / 2), loopY] : undefined,
            badgeWidth,
            isLoop: true,
          };
        };

        // Helper for top U-channel ("Over U-Loop")
        const buildOverLoop = (): RoutedDiagramEdge => {
          const [sx, sy] = getPortPoint(src, 'top', portOffsets.get(`${e.id}|src`) ?? 0);
          const [tx, ty] = getPortPoint(dst, 'top', portOffsets.get(`${e.id}|dst`) ?? 0);
          const minX = Math.min(sx, tx);
          const maxX = Math.max(sx, tx);
          let loopY = clearOverRun(Math.min(src.y, dst.y) - 54 - lane.index * 30, minX, maxX, src, dst);
          // Step up past any loop already drawn over the same stretch, so their runs never lie on top of each other.
          // Loops side by side (such as one into a component and one out of it) keep one line.
          while (overLoops.some((l) => l.minX < maxX && minX < l.maxX && Math.abs(l.y - loopY) < 20)) {
            loopY = clearOverRun(loopY - 24, minX, maxX, src, dst);
          }
          overLoops.push({ minX, maxX, y: loopY });
          const r = Math.min(20, Math.max(6, Math.abs(sx - tx) / 3));
          const dir = tx < sx ? -1 : 1;
          const pathD =
            Math.abs(sx - tx) < 8
              ? `M ${sx} ${sy} C ${sx - 56} ${loopY}, ${tx + 56} ${loopY}, ${tx} ${ty - 6}`
              : [
                  `M ${sx} ${sy}`,
                  `L ${sx} ${loopY + r}`,
                  `Q ${sx} ${loopY} ${sx + dir * r} ${loopY}`,
                  `L ${tx - dir * r} ${loopY}`,
                  `Q ${tx} ${loopY} ${tx} ${loopY + r}`,
                  `L ${tx} ${ty - 6}`,
                ].join(' ');
          return {
            ...e,
            pathD,
            startPoint: [sx, sy],
            endPoint: [tx, ty],
            badgePos: e.label ? [Math.round((sx + tx) / 2), loopY] : undefined,
            badgeWidth,
            isLoop: true,
          };
        };

        // 1. Explicit Routing Styles (always honored even when ports were chosen by port-dragging)
        if (e.route === 'under') {
          return buildUnderLoop();
        }

        if (e.route === 'over') {
          return buildOverLoop();
        }

        if (e.route === 'fanout') {
          autoSides.set(e.id, { srcSide: 'bottom', dstSide: 'top' });
          const [sx, sy] = getPortPoint(src, 'bottom', portOffsets.get(`${e.id}|src`) ?? 0);
          const [tx, ty] = getPortPoint(dst, 'top', portOffsets.get(`${e.id}|dst`) ?? 0);
          const dy = ty - sy;
          if (dy >= 20) {
            const midY = Math.round((sy + ty) / 2);
            const pathD =
              Math.abs(sx - tx) <= 4
                ? `M ${sx} ${sy} L ${tx} ${ty - 6}`
                : `M ${sx} ${sy} C ${sx} ${midY}, ${tx} ${midY}, ${tx} ${ty - 6}`;
            return {
              ...e,
              pathD,
              startPoint: [sx, sy],
              endPoint: [tx, ty],
              badgePos: e.label ? [Math.round((sx + tx) / 2), midY] : undefined,
              badgeWidth,
            };
          }
          const pull = Math.max(54, Math.round(Math.hypot(tx - sx, ty - sy) * 0.36));
          const c1: [number, number] = [sx, sy + pull];
          const c2: [number, number] = [tx, ty - 6 - pull];
          const tip: [number, number] = [tx, ty - 6];
          const midX = Math.round(0.125 * sx + 0.375 * c1[0] + 0.375 * c2[0] + 0.125 * tip[0]);
          const midY = Math.round(0.125 * sy + 0.375 * c1[1] + 0.375 * c2[1] + 0.125 * tip[1]);
          return {
            ...e,
            pathD: `M ${sx} ${sy} C ${c1[0]} ${c1[1]}, ${c2[0]} ${c2[1]}, ${tip[0]} ${tip[1]}`,
            startPoint: [sx, sy],
            endPoint: [tx, ty],
            badgePos: e.label ? [midX, midY] : undefined,
            badgeWidth,
          };
        }

        const presetSides = resolvedSides.get(e.id);
        const resolvedSrcSide =
          presetSides?.srcSide ?? (e.sourcePort === 'auto' ? inferBestSide(src, dst) : e.sourcePort);
        const resolvedDstSide =
          presetSides?.dstSide ?? (e.targetPort === 'auto' ? inferBestSide(dst, src) : e.targetPort);
        const srcPort = (): Point => getPortPoint(src, resolvedSrcSide, portOffsets.get(`${e.id}|src`) ?? 0);
        const dstPort = (): Point => getPortPoint(dst, resolvedDstSide, portOffsets.get(`${e.id}|dst`) ?? 0);

        if (e.route === 'straight') {
          const startPt = srcPort();
          const endPt = dstPort();
          const vx = endPt[0] - startPt[0];
          const vy = endPt[1] - startPt[1];
          const len = Math.hypot(vx, vy) || 1;
          const ex = Math.round(endPt[0] - (vx / len) * 6);
          const ey = Math.round(endPt[1] - (vy / len) * 6);
          const midX = Math.round((startPt[0] + ex) / 2);
          const midY = Math.round((startPt[1] + ey) / 2);
          return {
            ...e,
            pathD: `M ${startPt[0]} ${startPt[1]} L ${ex} ${ey}`,
            startPoint: startPt,
            endPoint: endPt,
            badgePos: e.label ? [midX, midY - 16] : undefined,
            badgeWidth,
          };
        }

        if (e.route === 'bezier') {
          const startPt = srcPort();
          const endPt = dstPort();
          const { pathD, badgePos } = buildPortToPortBezier(
            startPt,
            resolvedSrcSide,
            endPt,
            resolvedDstSide,
            Boolean(e.label),
            true,
          );
          return {
            ...e,
            pathD,
            startPoint: startPt,
            endPoint: endPt,
            badgePos,
            badgeWidth,
          };
        }

        if (e.route === 'arc') {
          const startPt = srcPort();
          const endPt = dstPort();
          const dx = endPt[0] - startPt[0];
          const dy = endPt[1] - startPt[1];
          const dist = Math.hypot(dx, dy) || 1;
          const bow = Math.max(52, Math.min(116, dist * 0.36));

          // Bow upward for predominantly horizontal wires; bow rightward for vertical wires
          let nx = 0;
          let ny = 0;
          if (Math.abs(dx) >= Math.abs(dy)) {
            nx = 0;
            ny = -1;
          } else {
            nx = 1;
            ny = 0;
          }

          const cx = Math.round((startPt[0] + endPt[0]) / 2 + nx * bow * 1.45);
          const cy = Math.round((startPt[1] + endPt[1]) / 2 + ny * bow * 1.45);
          const tvx = endPt[0] - cx;
          const tvy = endPt[1] - cy;
          const tlen = Math.hypot(tvx, tvy) || 1;
          const ex = Math.round(endPt[0] - (tvx / tlen) * 6);
          const ey = Math.round(endPt[1] - (tvy / tlen) * 6);

          const bx = Math.round(0.25 * startPt[0] + 0.5 * cx + 0.25 * ex);
          const by = Math.round(0.25 * startPt[1] + 0.5 * cy + 0.25 * ey);

          return {
            ...e,
            pathD: `M ${startPt[0]} ${startPt[1]} Q ${cx} ${cy} ${ex} ${ey}`,
            startPoint: startPt,
            endPoint: endPt,
            badgePos: e.label ? [bx, by] : undefined,
            badgeWidth,
          };
        }

        if (e.route === 'orthogonal' || e.route === 'step') {
          const startPt = srcPort();
          const endPt = dstPort();
          const eVec = sideDirVec(resolvedDstSide);
          const targetTip: [number, number] = [endPt[0] + eVec[0] * 6, endPt[1] + eVec[1] * 6];
          const waypoints = buildOrthogonalWaypoints(
            startPt,
            resolvedSrcSide,
            targetTip,
            resolvedDstSide,
          );
          const { pathD, midPoint } = buildOrthogonalPathFromPoints(
            waypoints,
            e.route === 'orthogonal' ? 24 : 0,
          );
          return {
            ...e,
            pathD,
            startPoint: startPt,
            endPoint: endPt,
            badgePos: e.label ? midPoint : undefined,
            badgeWidth,
          };
        }

        // 2. Smart Auto (`e.route === 'auto'`) with explicit ports
        if (e.sourcePort !== 'auto' || e.targetPort !== 'auto') {
          if (resolvedSrcSide === 'bottom' && resolvedDstSide === 'bottom') {
            return buildUnderLoop();
          }
          if (resolvedSrcSide === 'top' && resolvedDstSide === 'top') {
            return buildOverLoop();
          }

          const startPt = srcPort();
          const endPt = dstPort();
          const { pathD, badgePos } = buildPortToPortBezier(
            startPt,
            resolvedSrcSide,
            endPt,
            resolvedDstSide,
            Boolean(e.label),
            false,
          );
          return {
            ...e,
            pathD,
            startPoint: startPt,
            endPoint: endPt,
            badgePos,
            badgeWidth,
          };
        }

        // 3. Smart Auto (`e.route === 'auto'`) when both ports are 'auto'
        const shouldLoopUnder =
          doc.direction === 'LR' && dcx < scx - 48 && Math.abs(dcy - scy) < 160;

        if (shouldLoopUnder) {
          return buildUnderLoop();
        }

        // Downward vertical or fan-out
        const isDownward =
          dst.y >= src.y + src.height + 16 &&
          (Math.abs(dcx - scx) < 280 || dst.kind === 'client' || doc.direction === 'TD');

        if (isDownward) {
          const [, sy] = getPortPoint(src, 'bottom');
          const [, ty] = getPortPoint(dst, 'top');
          const srcOff = portOffsets.get(`${e.id}|src`);
          const dstOff = portOffsets.get(`${e.id}|dst`);
          const overlapMin = Math.max(src.x + 28, dst.x + 28);
          const overlapMax = Math.min(src.x + src.width - 28, dst.x + dst.width - 28);

          // Ends that share the target's top (or the source's bottom) are spread like any others.
          autoSides.set(e.id, { srcSide: 'bottom', dstSide: 'top' });
          const [spreadTx, spreadTy] = dstOff === undefined ? [dcx, ty] : getPortPoint(dst, 'top', dstOff);
          if (overlapMax >= overlapMin && dst.kind !== 'client') {
            // A straight drop where the two components overlap. When the target's top is shared, drop at this
            // wire's own spot on it, if that is still over the source.
            const x =
              dstOff !== undefined
                ? spreadTx
                : Math.round(
                    hasUnderOut.has(src.id)
                      ? Math.max(overlapMin, Math.min(overlapMax, dcx))
                      : (overlapMin + overlapMax) / 2,
                  );
            if (x >= overlapMin && x <= overlapMax) {
              const endY = dstOff !== undefined ? spreadTy : ty;
              return {
                ...e,
                pathD: `M ${x} ${sy} L ${x} ${endY - 6}`,
                startPoint: [x, sy],
                endPoint: [x, endY],
                badgePos: e.label ? [x, Math.round((sy + endY) / 2)] : undefined,
                badgeWidth,
              };
            }
          }

          const sx = srcOff === undefined ? scx : getPortPoint(src, 'bottom', srcOff)[0];
          const tx = spreadTx;
          const endY = spreadTy;
          const midY = Math.round((sy + endY) / 2);
          const pathD =
            Math.abs(sx - tx) <= 4
              ? `M ${sx} ${sy} L ${tx} ${endY - 6}`
              : `M ${sx} ${sy} C ${sx} ${midY}, ${tx} ${midY}, ${tx} ${endY - 6}`;
          return {
            ...e,
            pathD,
            startPoint: [sx, sy],
            endPoint: [tx, endY],
            badgePos: e.label ? [Math.round((sx + tx) / 2), midY] : undefined,
            badgeWidth,
          };
        }

        // Upward vertical
        if (dst.y + dst.height <= src.y - 16 && Math.abs(dcx - scx) < 220) {
          autoSides.set(e.id, { srcSide: 'top', dstSide: 'bottom' });
          const [sx, sy] = getPortPoint(src, 'top', portOffsets.get(`${e.id}|src`) ?? 0);
          const [tx, ty] = getPortPoint(dst, 'bottom', portOffsets.get(`${e.id}|dst`) ?? 0);
          const midY = Math.round((sy + ty) / 2);
          const pathD =
            Math.abs(sx - tx) <= 4
              ? `M ${sx} ${sy} L ${tx} ${ty + 6}`
              : `M ${sx} ${sy} C ${sx} ${midY}, ${tx} ${midY}, ${tx} ${ty + 6}`;
          return {
            ...e,
            pathD,
            startPoint: [sx, sy],
            endPoint: [tx, ty],
            badgePos: e.label ? [Math.round((sx + tx) / 2), midY] : undefined,
            badgeWidth,
          };
        }

        // Standard Horizontal Conduit
        const goingRight = dcx >= scx;
        autoSides.set(e.id, { srcSide: goingRight ? 'right' : 'left', dstSide: goingRight ? 'left' : 'right' });
        const [sx, rawSy] = getPortPoint(src, goingRight ? 'right' : 'left', portOffsets.get(`${e.id}|src`) ?? 0);
        const [tx, rawTy] = getPortPoint(dst, goingRight ? 'left' : 'right', portOffsets.get(`${e.id}|dst`) ?? 0);
        const alignedY = Math.abs(rawSy - rawTy) <= 14 ? rawTy : undefined;
        const sy = alignedY ?? rawSy;
        const ty = alignedY ?? rawTy;
        const endOffset = goingRight ? -6 : 6;
        const midX = Math.round((sx + tx) / 2);

        const pathD =
          Math.abs(sy - ty) <= 4
            ? `M ${sx} ${sy} L ${tx + endOffset} ${ty}`
            : `M ${sx} ${sy} C ${midX} ${sy}, ${midX} ${ty}, ${tx + endOffset} ${ty}`;

        return {
          ...e,
          pathD,
          startPoint: [sx, sy],
          endPoint: [tx, ty],
          badgePos: e.label ? [midX, Math.round((sy + ty) / 2 - 18)] : undefined,
          badgeWidth,
        };
      })
      .filter((edge): edge is RoutedDiagramEdge => edge !== null);
  };

  // Wires with both ports on 'auto' pick their sides while routing. Route once to learn them; if two ends then
  // share a side, spread them like any other and route again, so they no longer meet at one point.
  let routed = routeAll();
  if (autoSides.size > 0 && spreadPorts()) routed = routeAll();

  return finalizeRoutes(routed, laneInfo);
}

/**
 * Post-processing pass: manual waypoints, parallel-wire lane separation and badge de-overlap.
 */
function finalizeRoutes(
  routed: RoutedDiagramEdge[],
  laneInfo: Map<string, { index: number; count: number }>,
): RoutedDiagramEdge[] {
  const out = routed.map((edge): RoutedDiagramEdge => {
    let next = edge;

    // 1. Manual bend point: smooth curve through the waypoint
    if (edge.waypoint) {
      const [wx, wy] = edge.waypoint;
      const [sx, sy] = edge.startPoint;
      const [ex, ey] = edge.endPoint;
      const tvx = ex - sx;
      const tvy = ey - sy;
      const tlen = Math.hypot(tvx, tvy) || 1;
      const ux = tvx / tlen;
      const uy = tvy / tlen;
      const d1 = Math.hypot(wx - sx, wy - sy);
      const d2 = Math.hypot(ex - wx, ey - wy);
      const c1x = Math.round(wx - ux * d1 * 0.5);
      const c1y = Math.round(wy - uy * d1 * 0.5);
      const c2x = Math.round(wx + ux * d2 * 0.5);
      const c2y = Math.round(wy + uy * d2 * 0.5);
      const avx = ex - c2x;
      const avy = ey - c2y;
      const alen = Math.hypot(avx, avy) || 1;
      const tipX = Math.round(ex - (avx / alen) * 6);
      const tipY = Math.round(ey - (avy / alen) * 6);
      next = {
        ...edge,
        pathD: `M ${sx} ${sy} Q ${c1x} ${c1y} ${wx} ${wy} Q ${c2x} ${c2y} ${tipX} ${tipY}`,
        badgePos: edge.label
          ? [Math.round(0.25 * wx + 0.5 * c2x + 0.25 * tipX), Math.round(0.25 * wy + 0.5 * c2y + 0.25 * tipY)]
          : undefined,
        isLoop: false,
      };
    }

    // 2. Lane separation for parallel wires (loops separate by depth instead)
    const lane = laneInfo.get(edge.id);
    if (lane && lane.count > 1 && !next.isLoop && !edge.waypoint) {
      const spread = (lane.index - (lane.count - 1) / 2) * 22;
      const dx = next.endPoint[0] - next.startPoint[0];
      const dy = next.endPoint[1] - next.startPoint[1];
      next = {
        ...next,
        laneOffset: Math.abs(dx) >= Math.abs(dy) ? [0, spread] : [spread, 0],
      };
    }
    return next;
  });

  // 3. Move each badge onto its drawn wire (the lane offset shifts the whole wire), then nudge overlapping
  //    badges apart. A badge first slides along its own wire so it stays on it; only when the wire has no room
  //    left does it step off sideways. badgePos ends up in drawn coordinates, so renderers place it as is.
  const placed: Array<{ x: number; y: number; w: number }> = [];
  const clashes = (x: number, y: number, w: number) =>
    placed.some((p) => Math.abs(p.x - x) < (p.w + w) / 2 + 6 && Math.abs(p.y - y) < 30);
  // A label the user dragged keeps its spot, offset from where it would sit; the others make room around it.
  const ordered = [...out.filter((e) => e.labelOffset), ...out.filter((e) => !e.labelOffset)];
  for (const edge of ordered) {
    if (!edge.badgePos || !edge.badgeWidth) continue;
    edge.labelFits = Boolean(edge.labelOffset) || longestStraightRun(edge.pathD) >= edge.badgeWidth + 24;
    const off = edge.laneOffset || [0, 0];
    const baseX = edge.badgePos[0] + off[0];
    const baseY = edge.badgePos[1] + off[1];
    const w = edge.badgeWidth;
    edge.labelAnchor = [Math.round(baseX), Math.round(baseY)];
    if (edge.labelOffset) {
      const pos: [number, number] = [Math.round(baseX + edge.labelOffset[0]), Math.round(baseY + edge.labelOffset[1])];
      placed.push({ x: pos[0], y: pos[1], w });
      edge.badgePos = pos;
      continue;
    }
    let bx = baseX;
    let by = baseY;
    if (clashes(bx, by, w)) {
      let found = false;
      // Slide along the wire's main axis, keeping the badge within the wire's span.
      const dx = edge.endPoint[0] - edge.startPoint[0];
      const dy = edge.endPoint[1] - edge.startPoint[1];
      const horizontal = Math.abs(dx) >= Math.abs(dy);
      const along = horizontal ? 0 : 1;
      const half = horizontal ? w / 2 + 8 : 21;
      const lo = Math.min(edge.startPoint[along], edge.endPoint[along]) + off[along] + half;
      const hi = Math.max(edge.startPoint[along], edge.endPoint[along]) + off[along] - half;
      const step = horizontal ? 24 : 16;
      const base = along === 0 ? baseX : baseY;
      for (let k = 1; k <= 24 && !found; k++) {
        for (const sign of [1, -1]) {
          const pos = base + sign * step * k;
          if (pos < lo || pos > hi) continue;
          const cx = along === 0 ? pos : baseX;
          const cy = along === 0 ? baseY : pos;
          if (!clashes(cx, cy, w)) {
            bx = cx;
            by = cy;
            found = true;
            break;
          }
        }
      }
      // No room along the wire: step off it sideways, as little as possible and away from its lane's
      // neighbours first, so the wire still runs through the label where it can.
      const outward = Math.sign(off[horizontal ? 1 : 0]) || 1;
      for (let d = 4; d <= 128 && !found; d += 4) {
        for (const sign of [outward, -outward]) {
          const cx = horizontal ? baseX : baseX + sign * d;
          const cy = horizontal ? baseY + sign * d : baseY;
          if (!clashes(cx, cy, w)) {
            bx = cx;
            by = cy;
            found = true;
            break;
          }
        }
      }
    }
    placed.push({ x: bx, y: by, w });
    edge.badgePos = [Math.round(bx), Math.round(by)];
  }

  return out;
}

function sideDirVec(side: Exclude<PortSide, 'auto'>): [number, number] {
  switch (side) {
    case 'top':
      return [0, -1];
    case 'bottom':
      return [0, 1];
    case 'left':
      return [-1, 0];
    case 'right':
      return [1, 0];
  }
}

function inferBestSide(fromNode: DiagramNode, toNode: DiagramNode): Exclude<PortSide, 'auto'> {
  const [fx, fy] = getNodeCenter(fromNode);
  const [tx, ty] = getNodeCenter(toNode);
  const dx = tx - fx;
  const dy = ty - fy;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? 'right' : 'left';
  }
  return dy >= 0 ? 'bottom' : 'top';
}

function buildPortToPortBezier(
  start: [number, number],
  startSide: Exclude<PortSide, 'auto'>,
  end: [number, number],
  endSide: Exclude<PortSide, 'auto'>,
  withBadge: boolean,
  forceWaveWhenCollinear = false,
): { pathD: string; badgePos?: [number, number] } {
  const { c1, c2, targetTip } = portToPortBezierControls(
    start,
    startSide,
    end,
    endSide,
    forceWaveWhenCollinear,
  );
  const pathD = `M ${start[0]} ${start[1]} C ${c1[0]} ${c1[1]}, ${c2[0]} ${c2[1]}, ${targetTip[0]} ${targetTip[1]}`;
  const midX = Math.round(0.125 * start[0] + 0.375 * c1[0] + 0.375 * c2[0] + 0.125 * targetTip[0]);
  const midY = Math.round(0.125 * start[1] + 0.375 * c1[1] + 0.375 * c2[1] + 0.125 * targetTip[1]);

  return {
    pathD,
    badgePos: withBadge ? [midX, midY] : undefined,
  };
}

function portToPortBezierControls(
  start: [number, number],
  startSide: Exclude<PortSide, 'auto'>,
  end: [number, number],
  endSide: Exclude<PortSide, 'auto'>,
  forceWaveWhenCollinear: boolean,
): { c1: [number, number]; c2: [number, number]; targetTip: [number, number] } {
  const dist = Math.hypot(end[0] - start[0], end[1] - start[1]);
  const pull = Math.max(48, Math.min(180, dist * 0.45));

  const sVec = sideDirVec(startSide);
  const eVec = sideDirVec(endSide);
  const targetTip: [number, number] = [end[0] + eVec[0] * 6, end[1] + eVec[1] * 6];

  let c1: [number, number] = [
    Math.round(start[0] + sVec[0] * pull),
    Math.round(start[1] + sVec[1] * pull),
  ];
  let c2: [number, number] = [
    Math.round(targetTip[0] + eVec[0] * pull),
    Math.round(targetTip[1] + eVec[1] * pull),
  ];

  // When explicitly set to 'bezier', add a clean sinusoidal S-inflection if endpoints are collinear
  if (forceWaveWhenCollinear) {
    const sHoriz = startSide === 'left' || startSide === 'right';
    const eHoriz = endSide === 'left' || endSide === 'right';
    const wave = Math.round(Math.max(30, Math.min(48, dist * 0.26)));
    if (sHoriz && eHoriz && Math.abs(start[1] - targetTip[1]) < 16) {
      c1 = [c1[0], c1[1] - wave];
      c2 = [c2[0], c2[1] + wave];
    } else if (!sHoriz && !eHoriz && Math.abs(start[0] - targetTip[0]) < 16) {
      c1 = [c1[0] - wave, c1[1]];
      c2 = [c2[0] + wave, c2[1]];
    }
  }

  return { c1, c2, targetTip };
}

type Side = Exclude<PortSide, 'auto'>;
type Point = [number, number];
const ALL_SIDES: readonly Side[] = ['top', 'right', 'bottom', 'left'];

/** Points along the path a side-based route would draw, close enough to test for collisions. */
function sampleSideRoute(
  route: DiagramEdge['route'],
  start: Point,
  startSide: Side,
  end: Point,
  endSide: Side,
): Point[] {
  const eVec = sideDirVec(endSide);
  const tip: Point = [end[0] + eVec[0] * 6, end[1] + eVec[1] * 6];
  const polyline = (pts: Point[], perSegment: number): Point[] => {
    const out: Point[] = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1];
      const [bx, by] = pts[i];
      for (let s = 1; s <= perSegment; s++) {
        const t = s / perSegment;
        out.push([ax + (bx - ax) * t, ay + (by - ay) * t]);
      }
    }
    return out;
  };
  if (route === 'straight') return polyline([start, end], 24);
  if (route === 'orthogonal' || route === 'step') {
    return polyline(buildOrthogonalWaypoints(start, startSide, tip, endSide), 8);
  }
  const { c1, c2, targetTip } = portToPortBezierControls(start, startSide, end, endSide, route === 'bezier');
  const out: Point[] = [];
  for (let s = 0; s <= 32; s++) {
    const t = s / 32;
    const u = 1 - t;
    const a = u * u * u;
    const b = 3 * u * u * t;
    const c = 3 * u * t * t;
    const d = t * t * t;
    out.push([
      a * start[0] + b * c1[0] + c * c2[0] + d * targetTip[0],
      a * start[1] + b * c1[1] + c * c2[1] + d * targetTip[1],
    ]);
  }
  return out;
}

/** How many obstacle boxes a sampled path enters, and how long it is. */
function scoreSampledPath(points: Point[], obstacles: readonly DiagramNode[]): { hits: number; length: number } {
  const pad = 8;
  let hits = 0;
  for (const n of obstacles) {
    const inside = points.some(
      ([x, y]) => x > n.x - pad && x < n.x + n.width + pad && y > n.y - pad && y < n.y + n.height + pad,
    );
    if (inside) hits++;
  }
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    length += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  }
  return { hits, length };
}

/**
 * Resolve 'auto' ports to sides. The usual nearest-facing pair wins unless its path would run
 * through another component; then the side pair that crosses the fewest (then is shortest) wins.
 * Explicit ports are never changed.
 */
function chooseRouteSides(
  e: DiagramEdge,
  src: DiagramNode,
  dst: DiagramNode,
  nodes: readonly DiagramNode[],
): { srcSide: Side; dstSide: Side } {
  const preferredSrc = e.sourcePort === 'auto' ? inferBestSide(src, dst) : e.sourcePort;
  const preferredDst = e.targetPort === 'auto' ? inferBestSide(dst, src) : e.targetPort;
  if (e.sourcePort !== 'auto' && e.targetPort !== 'auto') {
    return { srcSide: preferredSrc, dstSide: preferredDst };
  }
  const obstacles = nodes.filter((n) => n.id !== src.id && n.id !== dst.id);
  if (obstacles.length === 0) return { srcSide: preferredSrc, dstSide: preferredDst };

  const score = (s: Side, d: Side) =>
    scoreSampledPath(
      sampleSideRoute(e.route, getPortPoint(src, s), s, getPortPoint(dst, d), d),
      obstacles,
    );
  const preferred = score(preferredSrc, preferredDst);
  if (preferred.hits === 0) return { srcSide: preferredSrc, dstSide: preferredDst };

  let best = { srcSide: preferredSrc, dstSide: preferredDst, ...preferred };
  const srcOptions = e.sourcePort === 'auto' ? ALL_SIDES : [preferredSrc];
  const dstOptions = e.targetPort === 'auto' ? ALL_SIDES : [preferredDst];
  for (const s of srcOptions) {
    for (const d of dstOptions) {
      // Same-side pairs on the top or bottom are U-loops in auto routing, not port-to-port curves.
      if (e.route === 'auto' && s === d && (s === 'top' || s === 'bottom')) continue;
      const result = score(s, d);
      if (result.hits < best.hits || (result.hits === best.hits && result.length < best.length)) {
        best = { srcSide: s, dstSide: d, ...result };
      }
    }
  }
  return { srcSide: best.srcSide, dstSide: best.dstSide };
}

function buildOrthogonalWaypoints(
  start: [number, number],
  startSide: Exclude<PortSide, 'auto'>,
  targetTip: [number, number],
  endSide: Exclude<PortSide, 'auto'>,
): Array<[number, number]> {
  const sVec = sideDirVec(startSide);
  const eVec = sideDirVec(endSide);
  const sHoriz = startSide === 'left' || startSide === 'right';
  const eHoriz = endSide === 'left' || endSide === 'right';
  const stub = 28;

  if (sHoriz && eHoriz) {
    const forward = startSide !== endSide && (targetTip[0] - start[0]) * sVec[0] >= 28;
    if (forward) {
      if (Math.abs(start[1] - targetTip[1]) < 14) {
        const lead = Math.max(16, Math.min(34, Math.round(Math.abs(targetTip[0] - start[0]) * 0.24)));
        const jogY = start[1] - 34;
        return [
          start,
          [start[0] + sVec[0] * lead, start[1]],
          [start[0] + sVec[0] * lead, jogY],
          [targetTip[0] + eVec[0] * lead, jogY],
          [targetTip[0] + eVec[0] * lead, targetTip[1]],
          targetTip,
        ];
      }
      const midX = Math.round((start[0] + targetTip[0]) / 2);
      return [start, [midX, start[1]], [midX, targetTip[1]], targetTip];
    }

    const p1: [number, number] = [start[0] + sVec[0] * stub, start[1]];
    const p4: [number, number] = [targetTip[0] + eVec[0] * stub, targetTip[1]];
    if (startSide === endSide) {
      const outerX = sVec[0] > 0 ? Math.max(p1[0], p4[0]) : Math.min(p1[0], p4[0]);
      return [start, [outerX, start[1]], [outerX, targetTip[1]], targetTip];
    }
    const midY =
      Math.abs(start[1] - targetTip[1]) < 48
        ? Math.min(start[1], targetTip[1]) - 56
        : Math.round((start[1] + targetTip[1]) / 2);
    return [start, p1, [p1[0], midY], [p4[0], midY], p4, targetTip];
  }

  if (!sHoriz && !eHoriz) {
    const forward = startSide !== endSide && (targetTip[1] - start[1]) * sVec[1] >= 28;
    if (forward) {
      if (Math.abs(start[0] - targetTip[0]) < 14) {
        const lead = Math.max(16, Math.min(34, Math.round(Math.abs(targetTip[1] - start[1]) * 0.24)));
        const jogX = start[0] + 34;
        return [
          start,
          [start[0], start[1] + sVec[1] * lead],
          [jogX, start[1] + sVec[1] * lead],
          [jogX, targetTip[1] + eVec[1] * lead],
          [targetTip[0], targetTip[1] + eVec[1] * lead],
          targetTip,
        ];
      }
      const midY = Math.round((start[1] + targetTip[1]) / 2);
      return [start, [start[0], midY], [targetTip[0], midY], targetTip];
    }

    const p1: [number, number] = [start[0], start[1] + sVec[1] * stub];
    const p4: [number, number] = [targetTip[0], targetTip[1] + eVec[1] * stub];
    if (startSide === endSide) {
      const outerY = sVec[1] > 0 ? Math.max(p1[1], p4[1]) : Math.min(p1[1], p4[1]);
      return [start, [start[0], outerY], [targetTip[0], outerY], targetTip];
    }
    const midX =
      Math.abs(start[0] - targetTip[0]) < 48
        ? Math.max(start[0], targetTip[0]) + 64
        : Math.round((start[0] + targetTip[0]) / 2);
    return [start, p1, [midX, p1[1]], [midX, p4[1]], p4, targetTip];
  }

  // Cross-axis ports (e.g. right -> top, bottom -> left)
  const corner: [number, number] = sHoriz
    ? [targetTip[0], start[1]]
    : [start[0], targetTip[1]];
  const exitsForward = sHoriz
    ? (corner[0] - start[0]) * sVec[0] >= 12
    : (corner[1] - start[1]) * sVec[1] >= 12;
  const entersForward = eHoriz
    ? (corner[0] - targetTip[0]) * eVec[0] >= 12
    : (corner[1] - targetTip[1]) * eVec[1] >= 12;

  if (exitsForward && entersForward) {
    return [start, corner, targetTip];
  }

  const p1: [number, number] = [start[0] + sVec[0] * stub, start[1] + sVec[1] * stub];
  const p4: [number, number] = [targetTip[0] + eVec[0] * stub, targetTip[1] + eVec[1] * stub];
  const midCorner: [number, number] = sHoriz ? [p1[0], p4[1]] : [p4[0], p1[1]];
  return [start, p1, midCorner, p4, targetTip];
}

function buildOrthogonalPathFromPoints(
  rawPoints: Array<[number, number]>,
  cornerRadius: number,
): { pathD: string; midPoint: [number, number] } {
  const pts: Array<[number, number]> = [];
  for (const p of rawPoints) {
    const prev = pts[pts.length - 1];
    if (prev && Math.abs(prev[0] - p[0]) < 0.5 && Math.abs(prev[1] - p[1]) < 0.5) {
      continue;
    }
    if (pts.length >= 2) {
      const a = pts[pts.length - 2];
      const b = pts[pts.length - 1];
      const collinearX = Math.abs(a[0] - b[0]) < 0.5 && Math.abs(b[0] - p[0]) < 0.5;
      const collinearY = Math.abs(a[1] - b[1]) < 0.5 && Math.abs(b[1] - p[1]) < 0.5;
      if (collinearX || collinearY) {
        pts[pts.length - 1] = p;
        continue;
      }
    }
    pts.push(p);
  }

  if (pts.length < 2) {
    const fallback: [number, number] = pts[0] || [0, 0];
    return { pathD: `M ${fallback[0]} ${fallback[1]}`, midPoint: fallback };
  }

  let totalLen = 0;
  const segLens: number[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const d = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    segLens.push(d);
    totalLen += d;
  }

  let half = totalLen / 2;
  let midPoint: [number, number] = [
    Math.round((pts[0][0] + pts[pts.length - 1][0]) / 2),
    Math.round((pts[0][1] + pts[pts.length - 1][1]) / 2),
  ];
  for (let i = 0; i < segLens.length; i++) {
    if (half <= segLens[i] || i === segLens.length - 1) {
      const t = segLens[i] > 0 ? half / segLens[i] : 0.5;
      midPoint = [
        Math.round(pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t),
        Math.round(pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t),
      ];
      break;
    }
    half -= segLens[i];
  }

  if (cornerRadius <= 0 || pts.length === 2) {
    const cmds = [`M ${Math.round(pts[0][0])} ${Math.round(pts[0][1])}`];
    for (let i = 1; i < pts.length; i++) {
      cmds.push(`L ${Math.round(pts[i][0])} ${Math.round(pts[i][1])}`);
    }
    return { pathD: cmds.join(' '), midPoint };
  }

  const cmds: string[] = [`M ${Math.round(pts[0][0])} ${Math.round(pts[0][1])}`];
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1];
    const curr = pts[i];
    const next = pts[i + 1];

    const v1x = curr[0] - prev[0];
    const v1y = curr[1] - prev[1];
    const len1 = Math.hypot(v1x, v1y);

    const v2x = next[0] - curr[0];
    const v2y = next[1] - curr[1];
    const len2 = Math.hypot(v2x, v2y);

    const r = Math.min(cornerRadius, len1 * 0.45, len2 * 0.45);
    if (r < 1.5) {
      cmds.push(`L ${Math.round(curr[0])} ${Math.round(curr[1])}`);
      continue;
    }

    const inX = curr[0] - (v1x / len1) * r;
    const inY = curr[1] - (v1y / len1) * r;
    const outX = curr[0] + (v2x / len2) * r;
    const outY = curr[1] + (v2y / len2) * r;

    cmds.push(`L ${Math.round(inX)} ${Math.round(inY)}`);
    cmds.push(
      `Q ${Math.round(curr[0])} ${Math.round(curr[1])} ${Math.round(outX)} ${Math.round(outY)}`,
    );
  }
  const last = pts[pts.length - 1];
  cmds.push(`L ${Math.round(last[0])} ${Math.round(last[1])}`);
  return { pathD: cmds.join(' '), midPoint };
}

export type LayoutDirection = 'LR' | 'TD';
export type LayoutSpacing = 'compact' | 'comfortable' | 'spacious';
export type LayoutAlgorithm = 'layered' | 'tree';

export interface AutoLayoutOptions {
  direction?: LayoutDirection;
  spacing?: LayoutSpacing;
  algorithm?: LayoutAlgorithm;
  selectionOnly?: boolean;
  selectedNodeIds?: readonly string[];
}

export function autoLayoutDocument(doc: DiagramDocument, options?: AutoLayoutOptions): void {
  if (doc.nodes.length === 0) return;

  const isSelectionOnly = !!(options?.selectionOnly && options.selectedNodeIds && options.selectedNodeIds.length >= 2);
  const targetIds = isSelectionOnly ? new Set(options!.selectedNodeIds) : new Set(doc.nodes.map((n) => n.id));
  const nodes = doc.nodes.filter((n) => targetIds.has(n.id));
  if (nodes.length === 0) return;

  const direction: LayoutDirection = options?.direction || doc.direction || 'LR';
  if (!isSelectionOnly) {
    doc.direction = direction;
  }

  const spacing: LayoutSpacing = options?.spacing || 'comfortable';

  // Compute original bounding box if selectionOnly
  let initialCenterX = 0;
  let initialCenterY = 0;
  if (isSelectionOnly) {
    const minX = Math.min(...nodes.map((n) => n.x));
    const maxX = Math.max(...nodes.map((n) => n.x + n.width));
    const minY = Math.min(...nodes.map((n) => n.y));
    const maxY = Math.max(...nodes.map((n) => n.y + n.height));
    initialCenterX = (minX + maxX) / 2;
    initialCenterY = (minY + maxY) / 2;
  }

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  for (const n of nodes) {
    const frame = nodeShapeFrame(getNodeDimensions(n.kind), n.shape);
    n.width = frame.width;
    n.height = frame.height;
  }

  const ids = nodes.map((n) => n.id);
  const tempAdj = new Map<string, string[]>();
  for (const id of ids) tempAdj.set(id, []);

  const relevantEdges = doc.edges.filter((e) => targetIds.has(e.from) && targetIds.has(e.to));

  for (const e of relevantEdges) {
    if (e.from !== e.to && e.tone !== 'rose' && e.route !== 'under' && nodeMap.has(e.from) && nodeMap.has(e.to)) {
      tempAdj.get(e.from)!.push(e.to);
    }
  }

  const visited = new Set<string>();
  const active = new Set<string>();
  const dagEdges: Array<[string, string]> = [];

  const dfs = (u: string) => {
    visited.add(u);
    active.add(u);
    for (const v of tempAdj.get(u) || []) {
      if (active.has(v)) continue;
      dagEdges.push([u, v]);
      if (!visited.has(v)) dfs(v);
    }
    active.delete(u);
  };
  for (const id of ids) {
    if (!visited.has(id)) dfs(id);
  }

  const adj = new Map<string, string[]>();
  const indeg = new Map<string, number>();
  for (const id of ids) {
    adj.set(id, []);
    indeg.set(id, 0);
  }
  for (const [u, v] of dagEdges) {
    adj.get(u)!.push(v);
    indeg.set(v, (indeg.get(v) || 0) + 1);
  }

  const rank = new Map<string, number>();
  for (const id of ids) rank.set(id, 0);
  const queue = ids.filter((id) => (indeg.get(id) || 0) === 0);

  while (queue.length > 0) {
    const u = queue.shift()!;
    const rU = rank.get(u) || 0;
    for (const v of adj.get(u) || []) {
      if ((rank.get(v) || 0) < rU + 1) rank.set(v, rU + 1);
      indeg.set(v, (indeg.get(v) || 1) - 1);
      if (indeg.get(v) === 0) queue.push(v);
    }
  }

  // Pin mid-pipeline actor reviewers directly above their target gate in LR mode
  const pinnedAbove = new Map<string, string>();
  if (direction === 'LR') {
    for (const n of nodes) {
      const inEdges = relevantEdges.filter((e) => e.to === n.id);
      const outEdges = relevantEdges.filter((e) => e.from === n.id);
      if ((n.kind === 'actor' || n.kind === 'scheduler') && inEdges.length === 0 && outEdges.length === 1) {
        const targetId = outEdges[0].to;
        if ((rank.get(targetId) || 0) >= 2) {
          pinnedAbove.set(n.id, targetId);
        }
      }
    }
  }

  const columns = new Map<number, DiagramNode[]>();
  for (const n of nodes) {
    if (pinnedAbove.has(n.id)) continue;
    const r = rank.get(n.id) || 0;
    if (!columns.has(r)) columns.set(r, []);
    columns.get(r)!.push(n);
  }

  const sortedRanks = [...columns.keys()].sort((a, b) => a - b);
  const maxRank = sortedRanks.length > 0 ? sortedRanks[sortedRanks.length - 1] : 0;

  // Sugiyama crossing minimization via Barycenter ordering passes
  for (let pass = 0; pass < 2; pass++) {
    // Forward pass: order layer r based on average position in layer r-1
    for (let r = 1; r <= maxRank; r++) {
      const col = columns.get(r);
      const prevCol = columns.get(r - 1);
      if (!col || !prevCol || prevCol.length === 0) continue;

      const prevOrder = new Map<string, number>();
      prevCol.forEach((node, idx) => prevOrder.set(node.id, idx));

      col.sort((a, b) => {
        const inA = relevantEdges.filter((e) => e.to === a.id && prevOrder.has(e.from));
        const inB = relevantEdges.filter((e) => e.to === b.id && prevOrder.has(e.from));
        const scoreA = inA.length > 0 ? inA.reduce((sum, e) => sum + prevOrder.get(e.from)!, 0) / inA.length : Infinity;
        const scoreB = inB.length > 0 ? inB.reduce((sum, e) => sum + prevOrder.get(e.from)!, 0) / inB.length : Infinity;
        if (scoreA !== scoreB) return scoreA - scoreB;
        return (a.y - b.y) || (a.x - b.x);
      });
    }

    // Backward pass: order layer r based on average position in layer r+1
    for (let r = maxRank - 1; r >= 0; r--) {
      const col = columns.get(r);
      const nextCol = columns.get(r + 1);
      if (!col || !nextCol || nextCol.length === 0) continue;

      const nextOrder = new Map<string, number>();
      nextCol.forEach((node, idx) => nextOrder.set(node.id, idx));

      col.sort((a, b) => {
        const outA = relevantEdges.filter((e) => e.from === a.id && nextOrder.has(e.to));
        const outB = relevantEdges.filter((e) => e.from === b.id && nextOrder.has(e.to));
        const scoreA = outA.length > 0 ? outA.reduce((sum, e) => sum + nextOrder.get(e.to)!, 0) / outA.length : Infinity;
        const scoreB = outB.length > 0 ? outB.reduce((sum, e) => sum + nextOrder.get(e.to)!, 0) / outB.length : Infinity;
        if (scoreA !== scoreB) return scoreA - scoreB;
        return (a.y - b.y) || (a.x - b.x);
      });
    }
  }

  // Spacing gaps
  let layerGap = 104;
  let nodeGap = 56;
  if (direction === 'LR') {
    if (spacing === 'compact') {
      layerGap = 64;
      nodeGap = 32;
    } else if (spacing === 'spacious') {
      layerGap = 160;
      nodeGap = 88;
    } else {
      layerGap = 104;
      nodeGap = 56;
    }
  } else {
    // TD
    if (spacing === 'compact') {
      layerGap = 64;
      nodeGap = 32;
    } else if (spacing === 'spacious') {
      layerGap = 152;
      nodeGap = 88;
    } else {
      layerGap = 96;
      nodeGap = 56;
    }
  }

  if (direction === 'LR') {
    let cursorX = 72;
    const centerLineY = 352;

    for (const r of sortedRanks) {
      const col = columns.get(r)!;
      const colW = Math.max(...col.map((n) => n.width));
      const totalH = col.reduce((s, n) => s + n.height, 0) + Math.max(0, col.length - 1) * nodeGap;
      let cursorY = Math.max(196, Math.round((centerLineY - totalH / 2) / 16) * 16);

      for (const n of col) {
        n.x = Math.round((cursorX + (colW - n.width) / 2) / 16) * 16;
        n.y = cursorY;
        cursorY += n.height + nodeGap;
      }
      cursorX += colW + layerGap;
    }

    for (const [actorId, gateId] of pinnedAbove.entries()) {
      const actor = nodeMap.get(actorId)!;
      const gate = nodeMap.get(gateId)!;
      actor.x = Math.round((gate.x + (gate.width - actor.width) / 2) / 16) * 16;
      actor.y = Math.max(52, gate.y - actor.height - 44);
    }
  } else {
    let cursorY = 96;
    const centerLineX = 840;

    for (const r of sortedRanks) {
      const row = columns.get(r)!;
      const rowH = Math.max(...row.map((n) => n.height));
      const totalW = row.reduce((s, n) => s + n.width, 0) + Math.max(0, row.length - 1) * nodeGap;
      let cursorX = Math.max(64, Math.round((centerLineX - totalW / 2) / 16) * 16);

      for (const n of row) {
        n.x = cursorX;
        n.y = Math.round((cursorY + (rowH - n.height) / 2) / 16) * 16;
        cursorX += n.width + nodeGap;
      }
      cursorY += rowH + layerGap;
    }
  }

  // If selectionOnly, shift nodes so their new center aligns with initial center
  if (isSelectionOnly) {
    const newMinX = Math.min(...nodes.map((n) => n.x));
    const newMaxX = Math.max(...nodes.map((n) => n.x + n.width));
    const newMinY = Math.min(...nodes.map((n) => n.y));
    const newMaxY = Math.max(...nodes.map((n) => n.y + n.height));
    const newCenterX = (newMinX + newMaxX) / 2;
    const newCenterY = (newMinY + newMaxY) / 2;
    const shiftX = Math.round((initialCenterX - newCenterX) / 16) * 16;
    const shiftY = Math.round((initialCenterY - newCenterY) / 16) * 16;

    for (const n of nodes) {
      n.x = Math.max(32, n.x + shiftX);
      n.y = Math.max(32, n.y + shiftY);
    }
  }

  expandStageToFit(doc);
}

export function expandStageToFit(doc: DiagramDocument): void {
  const maxNodeR = doc.nodes.length > 0 ? Math.max(...doc.nodes.map((n) => n.x + n.width)) : 1200;
  const maxNodeB = doc.nodes.length > 0 ? Math.max(...doc.nodes.map((n) => n.y + n.height)) : 700;
  const maxZoneR = doc.zones.length > 0 ? Math.max(...doc.zones.map((z) => z.x + z.width)) : 0;
  const maxNotesR = doc.notesCards.length > 0 ? Math.max(...doc.notesCards.map((c) => c.x + notesCardWidth(c) + 6)) : 0;
  const maxNotesB = doc.notesCards.length > 0
    ? Math.max(0, ...doc.notesCards.map((c) =>
        // A resized card uses its wrapped height; an untouched one keeps the original allowance, so stages don't shift.
        c.y + Math.max(220, c.width !== undefined ? notesCardHeight(c) : 54 + (c.items?.length || 0) * 26 + 24),
      ))
    : 0;
  const maxEdgeR = doc.edges.length > 0
    ? Math.max(0, ...doc.edges.map((e) => (e.waypoint ? e.waypoint[0] + 60 : 0)))
    : 0;
  const maxEdgeB = doc.edges.length > 0
    ? Math.max(0, ...doc.edges.map((e) => (e.waypoint ? e.waypoint[1] + 60 : 0)))
    : 0;

  const frames = doc.frames ?? [];
  const maxFrameR = frames.length > 0 ? Math.max(...frames.map((f) => f.x + f.width)) : 0;
  const maxFrameB = frames.length > 0 ? Math.max(...frames.map((f) => f.y + f.height)) : 0;

  doc.stageWidth = Math.max(doc.stageWidth || 0, 1680, maxNodeR + 140, maxZoneR + 96, maxNotesR + 96, maxEdgeR, maxFrameR + 96);
  doc.stageHeight = Math.max(doc.stageHeight || 0, 920, maxNodeB + 160, maxNotesB + 120, maxEdgeB, maxFrameB + 96);
}

export function getEffectiveSimulations(doc: DiagramDocument): SimulationScenario[] {
  if (doc.simulations.length > 0) return doc.simulations;
  return synthesizeAutoSimulations(doc);
}

export function synthesizeAutoSimulations(doc: DiagramDocument): SimulationScenario[] {
  if (doc.nodes.length === 0) return [];
  const nodeMap = new Map(doc.nodes.map((n) => [n.id, n]));
  const inDegree = new Map<string, number>();
  for (const n of doc.nodes) inDegree.set(n.id, 0);
  for (const e of doc.edges) {
    if (e.tone !== 'rose' && e.route !== 'under') {
      inDegree.set(e.to, (inDegree.get(e.to) || 0) + 1);
    }
  }

  const startNode =
    doc.nodes.find((n) => (n.kind === 'actor' || n.kind === 'scheduler') && (inDegree.get(n.id) || 0) === 0) ||
    doc.nodes.find((n) => (inDegree.get(n.id) || 0) === 0) ||
    doc.nodes[0];

  const primarySteps: SimulationScenario['steps'] = [];
  const visited = new Set<string>();
  let frontier: string[] = [startNode.id];
  let idx = 1;

  while (frontier.length > 0 && primarySteps.length < 12) {
    const batch = frontier.filter((id) => !visited.has(id) && nodeMap.has(id));
    if (batch.length === 0) break;
    for (const id of batch) visited.add(id);

    const anchor = nodeMap.get(batch[Math.floor(batch.length / 2)])!;
    const incomingEdge = doc.edges.find((e) => batch.includes(e.to) && visited.has(e.from));
    const stepTone = incomingEdge ? incomingEdge.tone : anchor.accent;

    primarySteps.push({
      id: `step-${idx++}`,
      nodes: batch,
      tone: stepTone,
      label:
        batch.length > 1
          ? `${batch.length} NODES SYNCED`
          : incomingEdge?.label || anchor.title.toUpperCase(),
      trace:
        batch.length > 1
          ? `Delivered stream payload across ${batch.map((id) => nodeMap.get(id)!.title).join(', ')}.`
          : `${anchor.title} (${anchor.subtitle}) processed data packet.`,
    });

    const nextFrontier: string[] = [];
    for (const id of batch) {
      for (const e of doc.edges) {
        if (e.from === id && e.tone !== 'rose' && e.route !== 'under' && !visited.has(e.to)) {
          if (!nextFrontier.includes(e.to)) nextFrontier.push(e.to);
        }
      }
    }
    frontier = nextFrontier;
  }

  const scenarios: SimulationScenario[] = [];
  if (primarySteps.length > 0) {
    scenarios.push({
      id: 'auto-primary',
      name: 'Simulate Primary Flow',
      tone: 'emerald',
      steps: primarySteps,
    });
  }

  // Also synthesize a Return / Exception scenario if any rose or under-loop edges exist
  const returnEdges = doc.edges.filter((e) => e.tone === 'rose' || e.route === 'under');
  if (returnEdges.length > 0) {
    const firstRet = returnEdges[0];
    const originNode = nodeMap.get(firstRet.from);
    if (originNode) {
      const retSteps: SimulationScenario['steps'] = [];
      for (const st of primarySteps) {
        if (st.nodes.includes(originNode.id)) break;
        retSteps.push(st);
      }
      retSteps.push({
        id: `ret-start`,
        nodes: [originNode.id],
        tone: 'rose',
        label: `${originNode.title.toUpperCase()} · EXCEPTION`,
        trace: `${originNode.title} triggered return / exception flow.`,
      });

      let cur = firstRet.from;
      const seenRet = new Set<string>([cur]);
      let hop = 1;
      while (hop < 8) {
        const edge = returnEdges.find((e) => e.from === cur && !seenRet.has(e.to));
        if (!edge) break;
        const nextNode = nodeMap.get(edge.to);
        if (!nextNode) break;
        seenRet.add(nextNode.id);
        retSteps.push({
          id: `ret-${hop++}`,
          nodes: [cur, nextNode.id],
          tone: 'rose',
          label: edge.label || `RETURN → ${nextNode.title.toUpperCase()}`,
          trace: `${nodeMap.get(cur)!.title} routed feedback to ${nextNode.title}.`,
        });
        cur = nextNode.id;
      }

      scenarios.push({
        id: 'auto-exception',
        name: 'Simulate Exception Flow',
        tone: 'rose',
        steps: retSteps,
      });
    }
  }

  return scenarios;
}

export function getAdjacencyLists(
  doc: DiagramDocument,
  nodeId: string,
): { upstream: DiagramNode[]; downstream: DiagramNode[] } {
  const nodeMap = new Map(doc.nodes.map((n) => [n.id, n]));
  const upIds = new Set<string>();
  const downIds = new Set<string>();

  for (const e of doc.edges) {
    if (e.to === nodeId && nodeMap.has(e.from)) upIds.add(e.from);
    if (e.from === nodeId && nodeMap.has(e.to)) downIds.add(e.to);
  }

  return {
    upstream: [...upIds].map((id) => nodeMap.get(id)!),
    downstream: [...downIds].map((id) => nodeMap.get(id)!),
  };
}

/** Selected components plus every component one wire away from any of them. */
export function relatedNodeIds(doc: DiagramDocument, selectedIds: readonly string[]): Set<string> {
  const nodeMap = new Map(doc.nodes.map((node) => [node.id, node]));
  const selected = new Set(selectedIds.filter((id) => nodeMap.has(id)));
  const related = new Set(selected);
  for (const edge of doc.edges) {
    if (selected.has(edge.from) && nodeMap.has(edge.to)) related.add(edge.to);
    if (selected.has(edge.to) && nodeMap.has(edge.from)) related.add(edge.from);
  }
  return related;
}

export type { DiagramEdge };
