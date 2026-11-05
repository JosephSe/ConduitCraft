/**
 * Message queues (K1): reading queue settings from untrusted input, and the pure maths of a backlog. Pure and
 * DOM-free. The live backlog is held per page in `studio/queueBacklog.ts` and is never saved.
 */
import type { DiagramDocument, NodeBalancer, NodeCache, NodeLimiter, NodeQueue, NodeSchedule, QueueDelivery, QueueOrdering } from '../types';
import { balancerChip } from './balancers';
import { nodeChip } from './components';

export const QUEUE_ORDERINGS: readonly QueueOrdering[] = ['standard', 'fifo', 'priority'];
export const QUEUE_DELIVERIES: readonly QueueDelivery[] = ['competing', 'fanout'];
export const MAX_QUEUE_DEPTH = 9999;
export const MAX_QUEUE_RETENTION = 40;

/** Reads `queue` from untrusted input. Defaults ('standard', 'competing') are left absent. */
export function normalizeQueue(raw: unknown): NodeQueue | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  const out: NodeQueue = {};
  if (r.ordering === 'fifo' || r.ordering === 'priority') out.ordering = r.ordering;
  if (r.delivery === 'fanout') out.delivery = 'fanout';
  if (
    typeof r.maxDepth === 'number' &&
    Number.isInteger(r.maxDepth) &&
    r.maxDepth >= 1 &&
    r.maxDepth <= MAX_QUEUE_DEPTH
  ) {
    out.maxDepth = r.maxDepth;
  }
  if (typeof r.deadLetterId === 'string' && r.deadLetterId.trim()) out.deadLetterId = r.deadLetterId.trim();
  if (typeof r.retention === 'string') {
    const retention = r.retention.trim().slice(0, MAX_QUEUE_RETENTION).trim();
    if (retention) out.retention = retention;
  }
  return Object.keys(out).length ? out : undefined;
}

export interface BacklogState {
  depth: number;
  deadLettered: number;
  dropped: number;
}

export type EnqueueOutcome = 'held' | 'dead-lettered' | 'dropped';

/** One message arrives at a buffering queue. Returns a new state; the input is not changed. */
export function enqueue(
  state: BacklogState,
  cfg: NodeQueue | undefined,
  deadLetterUp: boolean,
): { state: BacklogState; outcome: EnqueueOutcome } {
  const max = cfg?.maxDepth;
  if (max === undefined || state.depth < max) {
    return { state: { ...state, depth: state.depth + 1 }, outcome: 'held' };
  }
  if (cfg?.deadLetterId && deadLetterUp) {
    return { state: { ...state, deadLettered: state.deadLettered + 1 }, outcome: 'dead-lettered' };
  }
  return { state: { ...state, dropped: state.dropped + 1 }, outcome: 'dropped' };
}

/** One drain tick: how many messages leave. At least 1; one per live consumer for 'competing', 1 for 'fanout'. */
export function drainCount(liveConsumers: number, cfg: NodeQueue | undefined): number {
  if (cfg?.delivery === 'fanout') return 1;
  return Math.max(1, Math.floor(liveConsumers));
}

/** Components a queue hands messages to: the targets of wires leaving it, not counting its dead-letter target. */
export function queueConsumers(doc: Pick<DiagramDocument, 'nodes' | 'edges'>, queueId: string): string[] {
  const queue = doc.nodes.find((n) => n.id === queueId);
  const dlq = queue?.queue?.deadLetterId;
  const out = new Set<string>();
  for (const e of doc.edges) {
    if (e.from === queueId) out.add(e.to);
    else if (e.flow === 'both' && e.to === queueId) out.add(e.from);
  }
  out.delete(queueId);
  if (dlq) out.delete(dlq);
  return [...out];
}

/**
 * What a card shows in its chip and footer. A queue shows its ordering and limits when set; a balancer shows its
 * strategy in the chip (K2). Anything else shows the stencil text.
 */
export function queueCardText(node: {
  kind: string;
  chip: string;
  footerLeft: string;
  queue?: NodeQueue;
  balancer?: NodeBalancer;
  cache?: NodeCache;
  limiter?: NodeLimiter;
  schedule?: NodeSchedule;
}): {
  chip: string;
  footer: string;
} {
  if (node.kind === 'balancer') return { chip: balancerChip(node), footer: node.footerLeft };
  if (node.kind !== 'queue') return { chip: nodeChip(node), footer: node.footerLeft };
  const q = node.queue;
  const limits: string[] = [];
  if (q?.maxDepth) limits.push(`max ${q.maxDepth}`);
  if (q?.retention) limits.push(q.retention);
  return {
    chip: q?.ordering ? q.ordering.toUpperCase() : node.chip,
    footer: limits.length ? limits.join(' · ') : node.footerLeft,
  };
}

/** The buffering queue that holds a packet moving from step `current` to step `next`, or null. */
export function holdingQueue(
  doc: Pick<DiagramDocument, 'nodes' | 'edges'>,
  current: readonly string[],
  next: readonly string[],
  buffering: ReadonlySet<string>,
  down: ReadonlySet<string>,
): string | null {
  const holds = (q: string): boolean =>
    buffering.has(q) && queueConsumers(doc, q).some((c) => next.includes(c) && down.has(c));
  for (const id of current) if (holds(id)) return id;
  for (const id of next) if (holds(id)) return id;
  return null;
}
