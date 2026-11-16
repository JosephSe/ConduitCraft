/**
 * What a wire carries in the Traffic lens, from the failure status of the two components it joins
 * (`ChaosStatus` in studio/chaos.ts, or null when nothing has happened to it).
 * - `cut`: nothing flows. One end has failed outright, or is cut off from every entry point (unreachable), or is
 *   waiting behind a queue whose consumers are down (delayed). Traffic can neither leave nor reach such a component.
 * - `slow`: one end is still serving but slower: a replicated component that lost a replica (degraded), or a
 *   component whose cache is down so every read goes to the store (slowed).
 * - `live`: everything else, including a queue that is buffering (its producers carry on), a rate limiter that
 *   fails open (bypassed), traffic that took a detour (rerouted) and a caller of a failed component (at risk).
 */
export type WireTraffic = 'live' | 'slow' | 'cut';

const NO_TRAFFIC = new Set(['failed', 'unreachable', 'delayed']);
const SLOWER = new Set(['degraded', 'slowed']);
/** Beads on a slow wire run at this fraction of their usual speed. */
export const BEAD_SLOW_FACTOR = 0.5;

export function wireTraffic(fromStatus: string | null | undefined, toStatus: string | null | undefined): WireTraffic {
  const ends = [fromStatus, toStatus];
  if (ends.some((s) => s && NO_TRAFFIC.has(s))) return 'cut';
  if (ends.some((s) => s && SLOWER.has(s))) return 'slow';
  return 'live';
}
