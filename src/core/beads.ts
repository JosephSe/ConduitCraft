/**
 * Traffic beads (v4 concept): idle traffic is drawn as small glowing beads that run along each live wire from its
 * source to its target. A wire carries about one bead per 300 px, spread evenly, and each bead runs at a steady speed
 * (150 px a second for a sync call, 105 for an async one, slowed or sped up by the wire's latency).
 */

/** Pixels of wire per bead. */
export const BEAD_SPACING = 300;
/** A bead runs this far past the end of the wire (hidden) before it starts again, so beads do not pile up at the target. */
export const BEAD_RUN_OUT = 40;
/** Speed in px per second. */
export const BEAD_SPEED_SYNC = 150;
export const BEAD_SPEED_ASYNC = 105;
/** Each bead is a head, a core, and two fading tail dots behind it (offsets in px back along the wire). */
export const BEAD_PARTS = [
  { back: 22, r: 2.2, opacity: 0.3, core: false },
  { back: 12, r: 3.2, opacity: 0.55, core: false },
  { back: 0, r: 4.4, opacity: 1, core: false },
  { back: 0, r: 1.7, opacity: 1, core: true },
] as const;

/** How many beads a wire of this length carries. A two-way wire carries at least one each way. */
export function beadCount(length: number, twoWay = false): number {
  const count = Math.max(1, Math.round(Math.max(0, length) / BEAD_SPACING));
  return twoWay ? Math.max(2, count) : count;
}

/** Speed in px per second. `flowScale` is the wire's latency scale (1 is normal, larger is slower; see `latencyScale`). */
export function beadSpeed(async: boolean, flowScale = 1): number {
  const base = async ? BEAD_SPEED_ASYNC : BEAD_SPEED_SYNC;
  return base / (flowScale > 0 && Number.isFinite(flowScale) ? flowScale : 1);
}

/** A small stable phase from the wire id, so neighbouring wires do not pulse in step. */
function idPhase(id: string): number {
  return (id.length * 37) % 60;
}

/** Where bead `index` of `count` starts on a wire of `length` px. */
export function beadStart(index: number, count: number, length: number, id: string): number {
  return ((index / Math.max(1, count)) * length + idPhase(id)) % (length + BEAD_RUN_OUT);
}

/** The next position after `dtMs`, wrapping at the end of the run-out. */
export function advanceBead(pos: number, speed: number, dtMs: number, length: number): number {
  const loop = length + BEAD_RUN_OUT;
  if (loop <= 0) return 0;
  const next = (pos + (speed * dtMs) / 1000) % loop;
  return next < 0 ? next + loop : next;
}

/** A bead past the end of the wire is hidden until it wraps. */
export function beadVisible(pos: number, length: number): boolean {
  return pos <= length;
}


export { BEAD_SLOW_FACTOR, wireTraffic, type WireTraffic } from './wireTraffic';
