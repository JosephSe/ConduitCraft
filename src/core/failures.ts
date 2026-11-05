/**
 * Failures across nested levels (F-03 with F-01, decision D5). A failure belongs to one component at one level, so
 * it is keyed by the chain of component ids that leads to it. The same id can then repeat at different levels
 * without colliding. Pure and DOM-free; the live set is held in `studio/chaos.ts`.
 *
 * The rule is one-directional: failing a component fails everything inside its child level, while failing a
 * component inside a child level leaves its parent alone.
 */
import type { DiagramDocument } from '../types';
import type { LevelPath } from './levels';
import type { ReachabilityResult } from './reachability';

const SEP = '\u0000';

/** Key for component `id` living at the level `path`. */
export function failureKey(path: LevelPath, id: string): string {
  return [...path, id].join(SEP);
}

/** Ids of the failures that sit directly on the level at `path`. */
export function failedIdsAt(keys: Iterable<string>, path: LevelPath): string[] {
  const prefix = path.length ? path.join(SEP) + SEP : '';
  const out: string[] = [];
  for (const key of keys) {
    if (!key.startsWith(prefix)) continue;
    const id = key.slice(prefix.length);
    if (!id.includes(SEP)) out.push(id);
  }
  return out;
}

/** The outermost failed component the level at `path` sits inside, or null when none of its ancestors has failed. */
export function failedAncestor(keys: ReadonlySet<string>, path: LevelPath): { path: LevelPath; id: string } | null {
  for (let i = 0; i < path.length; i += 1) {
    if (keys.has(failureKey(path.slice(0, i), path[i]))) return { path: path.slice(0, i), id: path[i] };
  }
  return null;
}

/** Everything in a level that sits inside a failed component: all of it is down, and nothing is rerouted. */
export function insideFailedComponent(level: DiagramDocument): ReachabilityResult {
  return {
    failed: level.nodes.map((n) => n.id),
    degraded: [],
    reachable: [],
    unreachable: [],
    rerouted: [],
    atRisk: [],
    buffering: [],
    delayed: [],
  };
}
