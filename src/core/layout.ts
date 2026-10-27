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
      return { width: 242, height: 172 };
    case 'store':
      return { width: 248, height: 172 };
    case 'client':
      return { width: 178, height: 88 };
    case 'service':
    case 'bus':
    default:
      return { width: 222, height: 142 };
  }
}

export function getNodeCenter(node: DiagramNode): [number, number] {
  return [Math.round(node.x + node.width / 2), Math.round(node.y + node.height / 2)];
}

export function getPortPoint(
  node: DiagramNode,
  side: Exclude<PortSide, 'auto'>,
  offsetRatio = 0,
): [number, number] {
  const cx = node.x + node.width / 2;
  const cy = node.y + node.height / 2;

  if (node.kind === 'actor') {
    switch (side) {
      case 'top':
        return [Math.round(cx), Math.round(node.y + 4)];
      case 'bottom':
        return [Math.round(cx), Math.round(node.y + node.height - 2)];
      case 'left':
        return [Math.round(node.x + 22), Math.round(node.y + 58)];
      case 'right':
        return [Math.round(node.x + node.width - 22), Math.round(node.y + 58)];
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
  let overLoopCount = 0;

  // Group wires that connect the same pair of components so they can be fanned into lanes
  const laneInfo = new Map<string, { index: number; count: number }>();
  const pairGroups = new Map<string, string[]>();
  for (const e of doc.edges) {
    if (!nodeMap.has(e.from) || !nodeMap.has(e.to)) continue;
    const key = e.from < e.to ? `${e.from}|${e.to}` : `${e.to}|${e.from}`;
    const list = pairGroups.get(key) || [];
    list.push(e.id);
    pairGroups.set(key, list);
  }
  for (const ids of pairGroups.values()) {
    ids.forEach((id, index) => laneInfo.set(id, { index, count: ids.length }));
  }

  // Lowest / highest obstacle edge for nodes overlapping a horizontal span (keeps loops clear of siblings)
  const lowestBottomWithin = (minX: number, maxX: number): number => {
    let bottom = -Infinity;
    for (const n of doc.nodes) {
      if (n.x + n.width >= minX - 8 && n.x <= maxX + 8) bottom = Math.max(bottom, n.y + n.height);
    }
    return bottom;
  };
  const highestTopWithin = (minX: number, maxX: number): number => {
    let top = Infinity;
    for (const n of doc.nodes) {
      if (n.x + n.width >= minX - 8 && n.x <= maxX + 8) top = Math.min(top, n.y);
    }
    return top;
  };

  const routed = doc.edges
    .map((e): RoutedDiagramEdge | null => {
      const src = nodeMap.get(e.from);
      const dst = nodeMap.get(e.to);
      if (!src || !dst) return null;

      const [scx, scy] = getNodeCenter(src);
      const [dcx, dcy] = getNodeCenter(dst);
      const badgeWidth = e.label ? Math.max(104, e.label.length * 8.2 + 34) : undefined;
      const lane = laneInfo.get(e.id) || { index: 0, count: 1 };

      // Helper for bottom U-channel ("Under U-Loop")
      const buildUnderLoop = (): RoutedDiagramEdge => {
        const [sx, sy] = getPortPoint(
          src,
          'bottom',
          hasDownwardOut.has(src.id) || hasUnderIn.has(src.id) ? -0.19 : 0,
        );
        const [tx, ty] = getPortPoint(dst, 'bottom', hasUnderOut.has(dst.id) ? 0.16 : 0);
        const loopY =
          Math.max(
            src.y + src.height,
            dst.y + dst.height,
            lowestBottomWithin(Math.min(sx, tx), Math.max(sx, tx)),
          ) +
          58 +
          (underLoopCount > 2 ? (underLoopCount % 2) * 28 : 0) +
          lane.index * 30;
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
        const [sx, sy] = getPortPoint(src, 'top');
        const [tx, ty] = getPortPoint(dst, 'top');
        const loopY =
          Math.min(src.y, dst.y, highestTopWithin(Math.min(sx, tx), Math.max(sx, tx))) -
          54 -
          (overLoopCount % 2) * 24 -
          lane.index * 30;
        overLoopCount++;
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
        const [sx, sy] = getPortPoint(src, 'bottom');
        const [tx, ty] = getPortPoint(dst, 'top');
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

      const resolvedSrcSide = e.sourcePort === 'auto' ? inferBestSide(src, dst) : e.sourcePort;
      const resolvedDstSide = e.targetPort === 'auto' ? inferBestSide(dst, src) : e.targetPort;

      if (e.route === 'straight') {
        const startPt = getPortPoint(src, resolvedSrcSide);
        const endPt = getPortPoint(dst, resolvedDstSide);
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
        const startPt = getPortPoint(src, resolvedSrcSide);
        const endPt = getPortPoint(dst, resolvedDstSide);
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
        const startPt = getPortPoint(src, resolvedSrcSide);
        const endPt = getPortPoint(dst, resolvedDstSide);
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
        const startPt = getPortPoint(src, resolvedSrcSide);
        const endPt = getPortPoint(dst, resolvedDstSide);
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
          e.route === 'orthogonal' ? 14 : 0,
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

        const startPt = getPortPoint(src, resolvedSrcSide);
        const endPt = getPortPoint(dst, resolvedDstSide);
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
        const overlapMin = Math.max(src.x + 28, dst.x + 28);
        const overlapMax = Math.min(src.x + src.width - 28, dst.x + dst.width - 28);

        if (overlapMax >= overlapMin && dst.kind !== 'client') {
          const x = Math.round(
            hasUnderOut.has(src.id)
              ? Math.max(overlapMin, Math.min(overlapMax, dcx))
              : (overlapMin + overlapMax) / 2,
          );
          return {
            ...e,
            pathD: `M ${x} ${sy} L ${x} ${ty - 6}`,
            startPoint: [x, sy],
            endPoint: [x, ty],
            badgePos: e.label ? [x, Math.round((sy + ty) / 2)] : undefined,
            badgeWidth,
          };
        }

        const midY = Math.round((sy + ty) / 2);
        const pathD =
          Math.abs(scx - dcx) <= 4
            ? `M ${scx} ${sy} L ${dcx} ${ty - 6}`
            : `M ${scx} ${sy} C ${scx} ${midY}, ${dcx} ${midY}, ${dcx} ${ty - 6}`;
        return {
          ...e,
          pathD,
          startPoint: [scx, sy],
          endPoint: [dcx, ty],
          badgePos: e.label ? [Math.round((scx + dcx) / 2), midY] : undefined,
          badgeWidth,
        };
      }

      // Upward vertical
      if (dst.y + dst.height <= src.y - 16 && Math.abs(dcx - scx) < 220) {
        const [sx, sy] = getPortPoint(src, 'top');
        const [tx, ty] = getPortPoint(dst, 'bottom');
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
      const [sx, rawSy] = getPortPoint(src, goingRight ? 'right' : 'left');
      const [tx, rawTy] = getPortPoint(dst, goingRight ? 'left' : 'right');
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

  // 3. Nudge overlapping badges apart
  const placed: Array<{ x: number; y: number; w: number }> = [];
  for (const edge of out) {
    if (!edge.badgePos || !edge.badgeWidth) continue;
    const off = edge.laneOffset || [0, 0];
    let bx = edge.badgePos[0] + off[0];
    let by = edge.badgePos[1] + off[1];
    const w = edge.badgeWidth;
    for (let attempt = 0; attempt < 8; attempt++) {
      const clash = placed.find(
        (p) => Math.abs(p.x - bx) < (p.w + w) / 2 + 6 && Math.abs(p.y - by) < 30,
      );
      if (!clash) break;
      const sign = attempt % 2 === 0 ? 1 : -1;
      by = edge.badgePos[1] + off[1] + sign * 32 * Math.ceil((attempt + 1) / 2);
    }
    placed.push({ x: bx, y: by, w });
    edge.badgePos = [Math.round(bx - off[0]), Math.round(by - off[1])];
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

  const pathD = `M ${start[0]} ${start[1]} C ${c1[0]} ${c1[1]}, ${c2[0]} ${c2[1]}, ${targetTip[0]} ${targetTip[1]}`;
  const midX = Math.round(0.125 * start[0] + 0.375 * c1[0] + 0.375 * c2[0] + 0.125 * targetTip[0]);
  const midY = Math.round(0.125 * start[1] + 0.375 * c1[1] + 0.375 * c2[1] + 0.125 * targetTip[1]);

  return {
    pathD,
    badgePos: withBadge ? [midX, midY] : undefined,
  };
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

export function autoLayoutDocument(doc: DiagramDocument): void {
  if (doc.nodes.length === 0) return;

  const nodes = doc.nodes;
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  for (const n of nodes) {
    const dims = getNodeDimensions(n.kind);
    n.width = dims.width;
    n.height = dims.height;
  }

  const ids = nodes.map((n) => n.id);
  const tempAdj = new Map<string, string[]>();
  for (const id of ids) tempAdj.set(id, []);

  for (const e of doc.edges) {
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
  if (doc.direction === 'LR') {
    for (const n of nodes) {
      const inEdges = doc.edges.filter((e) => e.to === n.id);
      const outEdges = doc.edges.filter((e) => e.from === n.id);
      if (n.kind === 'actor' && inEdges.length === 0 && outEdges.length === 1) {
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

  if (doc.direction === 'LR') {
    let cursorX = 72;
    const centerLineY = 352;
    const vGap = 56;

    for (const r of sortedRanks) {
      const col = columns.get(r)!;
      const colW = Math.max(...col.map((n) => n.width));
      const totalH = col.reduce((s, n) => s + n.height, 0) + Math.max(0, col.length - 1) * vGap;
      let cursorY = Math.max(196, Math.round((centerLineY - totalH / 2) / 16) * 16);

      for (const n of col) {
        n.x = Math.round((cursorX + (colW - n.width) / 2) / 16) * 16;
        n.y = cursorY;
        cursorY += n.height + vGap;
      }
      cursorX += colW + 104;
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
    const hGap = 56;

    for (const r of sortedRanks) {
      const row = columns.get(r)!;
      const rowH = Math.max(...row.map((n) => n.height));
      const totalW = row.reduce((s, n) => s + n.width, 0) + Math.max(0, row.length - 1) * hGap;
      let cursorX = Math.max(64, Math.round((centerLineX - totalW / 2) / 16) * 16);

      for (const n of row) {
        n.x = cursorX;
        n.y = Math.round((cursorY + (rowH - n.height) / 2) / 16) * 16;
        cursorX += n.width + hGap;
      }
      cursorY += rowH + 96;
    }
  }

  expandStageToFit(doc);
}

export function expandStageToFit(doc: DiagramDocument): void {
  const maxNodeR = doc.nodes.length > 0 ? Math.max(...doc.nodes.map((n) => n.x + n.width)) : 1200;
  const maxNodeB = doc.nodes.length > 0 ? Math.max(...doc.nodes.map((n) => n.y + n.height)) : 700;
  const maxZoneR = doc.zones.length > 0 ? Math.max(...doc.zones.map((z) => z.x + z.width)) : 0;
  const maxNotesR = doc.notesCards.length > 0 ? Math.max(...doc.notesCards.map((c) => c.x + 410)) : 0;
  const maxNotesB = doc.notesCards.length > 0 ? Math.max(...doc.notesCards.map((c) => c.y + 220)) : 0;

  doc.stageWidth = Math.max(1680, maxNodeR + 140, maxZoneR + 96, maxNotesR + 96);
  doc.stageHeight = Math.max(920, maxNodeB + 160, maxNotesB + 120);
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
    doc.nodes.find((n) => n.kind === 'actor' && (inDegree.get(n.id) || 0) === 0) ||
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

export type { DiagramEdge };
