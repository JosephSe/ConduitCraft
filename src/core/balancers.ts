/**
 * Load balancers (K2): reading balancer settings from untrusted input, and the pure maths of spreading traffic
 * over live targets. Pure and DOM-free. The per-run counters live in `studio/simulationPlayback.ts` and are never
 * saved.
 */
import type { BalancerStrategy, DiagramDocument, NodeBalancer } from '../types';

export const BALANCER_STRATEGIES: readonly BalancerStrategy[] = ['round-robin', 'least-connections', 'weighted', 'hash'];

export const BALANCER_STRATEGY_LABELS: Record<BalancerStrategy, string> = {
  'round-robin': 'Round robin',
  'least-connections': 'Least connections',
  weighted: 'Weighted',
  hash: 'Hash',
};

/** The short text in the chip. */
export const BALANCER_STRATEGY_CHIPS: Record<BalancerStrategy, string> = {
  'round-robin': 'RR',
  'least-connections': 'LEAST',
  weighted: 'WEIGHTED',
  hash: 'HASH',
};

/** Reads `balancer` from untrusted input. The default ('round-robin') is left absent. */
export function normalizeBalancer(raw: unknown): NodeBalancer | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  const out: NodeBalancer = {};
  if (typeof r.strategy === 'string') {
    const strategy = r.strategy.trim().toLowerCase();
    if (strategy !== 'round-robin' && (BALANCER_STRATEGIES as readonly string[]).includes(strategy)) {
      out.strategy = strategy as BalancerStrategy;
    }
  }
  return Object.keys(out).length ? out : undefined;
}

/** Components a balancer spreads traffic over: the targets of wires leaving it (both-way wires count too). */
export function balancerTargets(doc: Pick<DiagramDocument, 'nodes' | 'edges'>, balancerId: string): string[] {
  const out = new Set<string>();
  for (const e of doc.edges) {
    if (e.from === balancerId) out.add(e.to);
    else if (e.flow === 'both' && e.to === balancerId) out.add(e.from);
  }
  out.delete(balancerId);
  return [...out];
}

/**
 * Picks a live target to stand in for a down one. Round robin over the live targets using `counter`, so the same
 * counter always gives the same answer. Returns null when no target is live.
 */
export function pickLiveTarget(targets: readonly string[], down: ReadonlySet<string>, counter: number): string | null {
  const live = targets.filter((t) => !down.has(t));
  if (!live.length) return null;
  return live[((Math.floor(counter) % live.length) + live.length) % live.length];
}

export interface BalancerSwap {
  balancerId: string;
  /** The down target the scenario named. */
  from: string;
  /** The live target that stands in for it. */
  to: string;
}

/**
 * Playback (K2): a packet leaves a step that holds a load balancer for a step that names one of its down targets (or one step holds both).
 * The balancer sends it to a live target instead, for that step's render only. `counters` holds one count per
 * balancer (round robin over the live targets), so the same run always gives the same answer. With no failure, or
 * no live target left, the step is returned unchanged: the scenario's own steps decide the path.
 */
export function substituteBalancerTargets(
  doc: Pick<DiagramDocument, 'nodes' | 'edges'>,
  current: readonly string[],
  next: readonly string[],
  down: ReadonlySet<string>,
  counters: Map<string, number>,
): { nodes: string[]; swaps: BalancerSwap[] } {
  const nodes = [...next];
  const swaps: BalancerSwap[] = [];
  if (!down.size) return { nodes, swaps };
  // The balancer may sit in the step before, or in the same step as the target it would have sent traffic to.
  for (const id of new Set([...current, ...next])) {
    if (doc.nodes.find((n) => n.id === id)?.kind !== 'balancer') continue;
    const targets = balancerTargets(doc, id);
    for (const t of targets) {
      const at = nodes.indexOf(t);
      if (at < 0 || !down.has(t)) continue;
      const counter = counters.get(id) ?? 0;
      const live = pickLiveTarget(targets, down, counter);
      if (live === null) continue;
      counters.set(id, counter + 1);
      swaps.push({ balancerId: id, from: t, to: live });
      if (nodes.includes(live)) nodes.splice(at, 1);
      else nodes[at] = live;
    }
  }
  return { nodes, swaps };
}

/** What a balancer's card shows in its chip: the strategy when set, else the stencil text. */
export function balancerChip(node: { kind: string; chip: string; balancer?: NodeBalancer }): string {
  if (node.kind !== 'balancer' || !node.balancer?.strategy) return node.chip;
  return BALANCER_STRATEGY_CHIPS[node.balancer.strategy];
}
