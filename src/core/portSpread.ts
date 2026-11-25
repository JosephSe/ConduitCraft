export type SpreadSide = 'top' | 'right' | 'bottom' | 'left';

export const SHARED_TRACK_GAP = 14;
export const SYMMETRIC_MAX_GAP = 24;
export const LEVEL_TOLERANCE = 14;

export interface PortSpreadEnd {
  key: string;
  nodeId: string;
  side: SpreadSide;
  span: number;
  /** Signed center-to-center delta along the side axis (`other - node`). */
  delta: number;
  actorSpread?: { gap: number; room: number } | null;
}

/**
 * Pure shared-track port spreading (V4 MP3):
 * when multiple wires share a side of a component, step them 14 px apart in parallel tracks
 * ordered by where the other end sits, keeping any level wire straight on the centerline.
 * Returns normalized per-end offset ratios in [-0.5, 0.5] without mutating saved ports.
 */
export function computePortOffsets(ends: readonly PortSpreadEnd[]): Map<string, number> {
  const offsets = new Map<string, number>();
  const groups = new Map<string, PortSpreadEnd[]>();

  for (const end of ends) {
    const gk = `${end.nodeId}|${end.side}`;
    let g = groups.get(gk);
    if (!g) {
      g = [];
      groups.set(gk, g);
    }
    g.push(end);
  }

  for (const group of groups.values()) {
    if (group.length < 2) continue;
    group.sort((a, b) => a.delta - b.delta || a.key.localeCompare(b.key));
    const first = group[0];
    const span = Math.max(1, first.span);

    if (first.actorSpread) {
      const gap = Math.min(first.actorSpread.gap, first.actorSpread.room / (group.length - 1));
      group.forEach((entry, i) => {
        offsets.set(entry.key, ((i - (group.length - 1) / 2) * gap) / span);
      });
      continue;
    }

    let anchorIdx = -1;
    let bestAbs = Infinity;
    for (let i = 0; i < group.length; i += 1) {
      const absDelta = Math.abs(group[i].delta);
      if (absDelta <= LEVEL_TOLERANCE && absDelta < bestAbs) {
        bestAbs = absDelta;
        anchorIdx = i;
      }
    }

    if (anchorIdx >= 0) {
      const maxSide = Math.max(anchorIdx, group.length - 1 - anchorIdx, 1);
      const step = Math.min(SHARED_TRACK_GAP, (span * 0.3) / maxSide);
      group.forEach((entry, i) => {
        offsets.set(entry.key, ((i - anchorIdx) * step) / span);
      });
    } else {
      const gap = Math.min(SYMMETRIC_MAX_GAP, (span * 0.6) / (group.length - 1));
      group.forEach((entry, i) => {
        offsets.set(entry.key, ((i - (group.length - 1) / 2) * gap) / span);
      });
    }
  }

  return offsets;
}
