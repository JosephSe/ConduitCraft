/**
 * Chaos reachability (F-01): given a set of failed components, which others can still be reached from an entry
 * point, which cannot, and which only survive by another route. Pure and DOM-free.
 *
 * Traffic follows wires from `from` to `to`; a wire with `flow: 'both'` carries traffic either way.
 */
import type { DiagramDocument, DiagramNode, NodeResilience } from '../types';

export interface ReachabilityResult {
  /** Failed outright: in the failure set with a single instance. */
  failed: string[];
  /** In the failure set but running more than one replica, so still serving. */
  degraded: string[];
  /** Still reachable from an entry point (includes degraded components and entries themselves). */
  reachable: string[];
  /** Reachable before the failure and not after, and not failed themselves. */
  unreachable: string[];
  /** Still reachable, but at least one incoming path went through a failed or unreachable component. */
  rerouted: string[];
  /** Still working, but call a failed component directly, so their requests may fail. */
  atRisk: string[];
}

/** Entry points are actors and clients; a diagram with neither falls back to components nothing points at. */
export function entryPointIds(doc: DiagramDocument): string[] {
  const explicit = doc.nodes.filter((n) => n.kind === 'actor' || n.kind === 'client').map((n) => n.id);
  if (explicit.length) return explicit;
  const targets = new Set<string>();
  for (const e of doc.edges) {
    targets.add(e.to);
    if (e.flow === 'both') targets.add(e.from);
  }
  return doc.nodes.filter((n) => !targets.has(n.id)).map((n) => n.id);
}

/** Clamps `replicas` to a whole number of at least 1. */
export function replicaCount(node: Pick<DiagramNode, 'resilience'>): number {
  const r = node.resilience?.replicas;
  return typeof r === 'number' && Number.isFinite(r) && r >= 1 ? Math.floor(r) : 1;
}

/** Reads `resilience` from untrusted input. Defaults are left absent so a plain component stays plain. */
export function normalizeResilience(raw: unknown): NodeResilience | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  const out: NodeResilience = {};
  if (typeof r.replicas === 'number' && Number.isFinite(r.replicas) && r.replicas > 1) {
    out.replicas = Math.min(99, Math.floor(r.replicas));
  }
  if (typeof r.fallbackId === 'string' && r.fallbackId.trim()) out.fallbackId = r.fallbackId.trim();
  if (r.circuitBreaker === true) out.circuitBreaker = true;
  return Object.keys(out).length ? out : undefined;
}

function adjacency(doc: DiagramDocument): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const add = (from: string, to: string) => {
    const list = out.get(from);
    if (list) list.push(to);
    else out.set(from, [to]);
  };
  for (const e of doc.edges) {
    add(e.from, e.to);
    if (e.flow === 'both') add(e.to, e.from);
  }
  return out;
}

/** Components traffic can reach, walking from the entries and never entering a component in `blocked`. */
function walk(
  next: Map<string, string[]>,
  entries: readonly string[],
  blocked: ReadonlySet<string>,
  detour: ReadonlyMap<string, string>,
): Set<string> {
  const seen = new Set<string>();
  const stack: string[] = [];
  const visit = (id: string) => {
    // A blocked component with a live fallback hands its traffic to that fallback.
    const target = blocked.has(id) ? detour.get(id) : id;
    if (target === undefined || blocked.has(target) || seen.has(target)) return;
    seen.add(target);
    stack.push(target);
  };
  entries.forEach(visit);
  while (stack.length) {
    for (const to of next.get(stack.pop()!) ?? []) visit(to);
  }
  return seen;
}

export function reachableFrom(
  doc: DiagramDocument,
  entryIds: readonly string[],
  failedIds: Iterable<string>,
): ReachabilityResult {
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  const failedSet = new Set([...failedIds].filter((id) => byId.has(id)));
  const failed: string[] = [];
  const degraded: string[] = [];
  for (const id of failedSet) (replicaCount(byId.get(id)!) > 1 ? degraded : failed).push(id);

  const blocked = new Set(failed);
  const detour = new Map<string, string>();
  for (const id of failed) {
    const fb = byId.get(id)!.resilience?.fallbackId;
    if (fb && fb !== id && byId.has(fb) && !blocked.has(fb)) detour.set(id, fb);
  }

  const next = adjacency(doc);
  const entries = entryIds.filter((id) => byId.has(id));
  const before = walk(next, entries, new Set(), new Map());
  const after = walk(next, entries, blocked, detour);

  const unreachable = [...before].filter((id) => !after.has(id) && !blocked.has(id));
  const lost = new Set([...blocked, ...unreachable]);
  const rerouted = [...after].filter((id) => {
    if (detour.size && [...detour.values()].includes(id)) return true;
    return doc.edges.some(
      (e) => (e.to === id && lost.has(e.from)) || (e.flow === 'both' && e.from === id && lost.has(e.to)),
    );
  });

  const down = new Set([...failed, ...unreachable]);
  const atRisk = [...after].filter(
    (id) =>
      !failedSet.has(id) &&
      doc.edges.some((e) => {
        const target = e.from === id ? e.to : e.flow === 'both' && e.to === id ? e.from : null;
        return target !== null && blocked.has(target) && !detour.has(target) && !down.has(id);
      }),
  );

  const sort = (ids: string[]) => ids.sort();
  return {
    failed: sort(failed),
    degraded: sort(degraded),
    reachable: sort([...after]),
    unreachable: sort(unreachable),
    rerouted: sort(rerouted),
    atRisk: sort(atRisk),
  };
}

/**
 * After loading: drops a `fallbackId` that names a missing component or the component itself, and keeps only the
 * saved chaos failures that still exist. Run it once the whole node list is known.
 */
export function pruneDanglingChaos(doc: DiagramDocument): void {
  const ids = new Set(doc.nodes.map((n) => n.id));
  // A scenario belongs to the whole file, so its failures may name a component on any page (D10).
  const anyPage = new Set(ids);
  for (const page of doc.pages ?? []) for (const n of page.nodes) anyPage.add(n.id);
  for (const node of doc.nodes) {
    const r = node.resilience;
    if (!r?.fallbackId || (ids.has(r.fallbackId) && r.fallbackId !== node.id)) continue;
    delete r.fallbackId;
    if (!Object.keys(r).length) delete node.resilience;
  }
  for (const sim of doc.simulations) {
    if (!sim.failures) continue;
    const kept = [...new Set(sim.failures)].filter((id) => typeof id === 'string' && anyPage.has(id));
    if (kept.length) sim.failures = kept;
    else delete sim.failures;
  }
}
