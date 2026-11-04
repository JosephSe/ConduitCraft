/**
 * Smart guides (B11): while a component is dragged, snap its edges and centre to other components and report the
 * guide lines to draw. Everything here is pure, in world units, so it is tested without a browser.
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A guide line. `axis: 'x'` is a vertical line at world x = `pos`, spanning world y `from` to `to`. */
export interface Guide {
  axis: 'x' | 'y';
  pos: number;
  from: number;
  to: number;
}

/** A gap that equals another gap in the same row or column: drawn as a short bracket with the size. */
export interface SpacingMark {
  axis: 'x' | 'y';
  /** The gap runs from `start` to `end` along `axis`, at `cross` on the other axis. */
  start: number;
  end: number;
  cross: number;
}

/** The distance from the moving component to its nearest neighbour on one side (shown while Alt is held). */
export interface Distance {
  axis: 'x' | 'y';
  start: number;
  end: number;
  cross: number;
  value: number;
}

export interface GuideResult {
  /** The snapped position of the moving rectangle. */
  x: number;
  y: number;
  snappedX: boolean;
  snappedY: boolean;
  guides: Guide[];
  spacing: SpacingMark[];
}

const EPS = 0.5;

const lines = (r: Rect, axis: 'x' | 'y'): number[] => {
  const start = axis === 'x' ? r.x : r.y;
  const size = axis === 'x' ? r.width : r.height;
  return [start, start + size / 2, start + size];
};

/** The overlap of two ranges on the other axis, so only components in the same row or column count as neighbours. */
function overlaps(a: Rect, b: Rect, axis: 'x' | 'y'): boolean {
  // Overlap on the OTHER axis: for horizontal gaps (axis 'x') the rectangles must share some y range.
  if (axis === 'x') return a.y < b.y + b.height && b.y < a.y + a.height;
  return a.x < b.x + b.width && b.x < a.x + a.width;
}

/** The best (smallest) offset that lines one of the moving rectangle's lines up with one of the others', or null. */
function bestLineOffset(moving: Rect, others: Rect[], axis: 'x' | 'y', threshold: number): number | null {
  let best: number | null = null;
  const mine = lines(moving, axis);
  for (const other of others) {
    for (const target of lines(other, axis)) {
      for (const m of mine) {
        const delta = target - m;
        if (Math.abs(delta) <= threshold && (best === null || Math.abs(delta) < Math.abs(best))) best = delta;
      }
    }
  }
  return best;
}

/** An offset that makes the gaps either side of the moving rectangle equal, or that repeats the gap between two others. */
function bestSpacingOffset(moving: Rect, others: Rect[], axis: 'x' | 'y', threshold: number): number | null {
  const size = axis === 'x' ? moving.width : moving.height;
  const at = (r: Rect) => (axis === 'x' ? r.x : r.y);
  const len = (r: Rect) => (axis === 'x' ? r.width : r.height);
  const row = others.filter((o) => overlaps(moving, o, axis)).sort((a, b) => at(a) - at(b));
  const pos = at(moving);
  let best: number | null = null;
  const consider = (target: number) => {
    const delta = target - pos;
    if (Math.abs(delta) <= threshold && (best === null || Math.abs(delta) < Math.abs(best))) best = delta;
  };
  for (let i = 0; i < row.length; i++) {
    for (let j = i + 1; j < row.length; j++) {
      const a = row[i];
      const b = row[j];
      const gapStart = at(a) + len(a);
      const gapEnd = at(b);
      // Between a and b: equal space on both sides.
      if (gapEnd - gapStart >= size) consider((gapStart + gapEnd - size) / 2);
    }
    // Repeat the gap between two neighbours: a, b, then the moving one the same distance on.
    if (i + 1 < row.length) {
      const a = row[i];
      const b = row[i + 1];
      const gap = at(b) - (at(a) + len(a));
      if (gap >= 0) {
        consider(at(b) + len(b) + gap);
        consider(at(a) - gap - size);
      }
    }
  }
  return best;
}

/** Guide lines for every other rectangle that now shares a line with the moving one. */
function guidesFor(moving: Rect, others: Rect[], axis: 'x' | 'y'): Guide[] {
  const found = new Map<number, Guide>();
  const mine = lines(moving, axis);
  const spanOf = (r: Rect): [number, number] => (axis === 'x' ? [r.y, r.y + r.height] : [r.x, r.x + r.width]);
  const [mFrom, mTo] = spanOf(moving);
  for (const other of others) {
    for (const target of lines(other, axis)) {
      if (!mine.some((m) => Math.abs(m - target) < EPS)) continue;
      const key = Math.round(target * 2) / 2;
      const [oFrom, oTo] = spanOf(other);
      const existing = found.get(key);
      if (existing) {
        existing.from = Math.min(existing.from, oFrom);
        existing.to = Math.max(existing.to, oTo);
      } else {
        found.set(key, { axis, pos: target, from: Math.min(mFrom, oFrom), to: Math.max(mTo, oTo) });
      }
    }
  }
  return [...found.values()];
}

/** The gaps that now equal each other on one axis, including the ones the moving rectangle makes. */
function spacingMarks(moving: Rect, others: Rect[], axis: 'x' | 'y'): SpacingMark[] {
  const at = (r: Rect) => (axis === 'x' ? r.x : r.y);
  const len = (r: Rect) => (axis === 'x' ? r.width : r.height);
  const row = [...others.filter((o) => overlaps(moving, o, axis)), moving].sort((a, b) => at(a) - at(b));
  const gaps: Array<{ start: number; end: number; touchesMoving: boolean; cross: number }> = [];
  for (let i = 0; i + 1 < row.length; i++) {
    const a = row[i];
    const b = row[i + 1];
    const start = at(a) + len(a);
    const end = at(b);
    if (end - start <= 0) continue;
    const crossOf = (r: Rect) => (axis === 'x' ? r.y + r.height / 2 : r.x + r.width / 2);
    gaps.push({ start, end, touchesMoving: a === moving || b === moving, cross: (crossOf(a) + crossOf(b)) / 2 });
  }
  const marks: SpacingMark[] = [];
  for (const gap of gaps) {
    if (!gap.touchesMoving) continue;
    const size = gap.end - gap.start;
    const equal = gaps.filter((g) => g !== gap && Math.abs(g.end - g.start - size) < EPS);
    if (equal.length === 0) continue;
    for (const g of [gap, ...equal]) marks.push({ axis, start: g.start, end: g.end, cross: g.cross });
  }
  // The same gap can be reached from two sides.
  const seen = new Set<string>();
  return marks.filter((m) => {
    const key = `${m.axis}:${m.start}:${m.end}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Snap the moving rectangle to the others. A line (edge or centre) of the moving rectangle snaps to a line of another
 * one within `threshold` world units; failing that, the rectangle snaps to equal spacing between neighbours. The
 * returned guides and spacing marks are for the snapped position.
 */
export function snapToGuides(moving: Rect, others: Rect[], threshold: number): GuideResult {
  const dx = bestLineOffset(moving, others, 'x', threshold) ?? bestSpacingOffset(moving, others, 'x', threshold);
  const dy = bestLineOffset(moving, others, 'y', threshold) ?? bestSpacingOffset(moving, others, 'y', threshold);
  const snapped: Rect = { ...moving, x: moving.x + (dx ?? 0), y: moving.y + (dy ?? 0) };
  return {
    x: snapped.x,
    y: snapped.y,
    snappedX: dx !== null,
    snappedY: dy !== null,
    guides: [...guidesFor(snapped, others, 'x'), ...guidesFor(snapped, others, 'y')],
    spacing: [...spacingMarks(snapped, others, 'x'), ...spacingMarks(snapped, others, 'y')],
  };
}

/** The nearest neighbour on each side that shares a row or column with the rectangle, for the Alt overlay. */
export function distancesTo(moving: Rect, others: Rect[]): Distance[] {
  const out: Distance[] = [];
  for (const axis of ['x', 'y'] as const) {
    const at = (r: Rect) => (axis === 'x' ? r.x : r.y);
    const len = (r: Rect) => (axis === 'x' ? r.width : r.height);
    const crossOf = (r: Rect) => (axis === 'x' ? r.y + r.height / 2 : r.x + r.width / 2);
    let before: Rect | null = null;
    let after: Rect | null = null;
    for (const other of others) {
      if (!overlaps(moving, other, axis)) continue;
      if (at(other) + len(other) <= at(moving) && (!before || at(other) + len(other) > at(before) + len(before))) before = other;
      if (at(other) >= at(moving) + len(moving) && (!after || at(other) < at(after))) after = other;
    }
    if (before) {
      const start = at(before) + len(before);
      out.push({ axis, start, end: at(moving), cross: (crossOf(before) + crossOf(moving)) / 2, value: Math.round(at(moving) - start) });
    }
    if (after) {
      const start = at(moving) + len(moving);
      out.push({ axis, start, end: at(after), cross: (crossOf(after) + crossOf(moving)) / 2, value: Math.round(at(after) - start) });
    }
  }
  return out;
}
