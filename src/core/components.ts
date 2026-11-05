/**
 * Caches, rate limiters and schedulers (K3 to K5): reading their settings from untrusted input, and the pure maths
 * behind them. Pure and DOM-free. The per-run counters live in `studio/simulationPlayback.ts` and are never saved.
 */
import type { DiagramDocument, NodeCache, NodeLimiter, NodeSchedule } from '../types';

export const DEFAULT_HIT_RATE = 80;
export const DEFAULT_ADMIT = 4;
export const DEFAULT_PER = 5;
export const MAX_PER = 99;
export const MAX_SCHEDULE_EVERY = 40;

type Wired = Pick<DiagramDocument, 'nodes' | 'edges'>;

/** Reads `cache` from untrusted input. The default hit rate is left absent. */
export function normalizeCache(raw: unknown): NodeCache | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  const out: NodeCache = {};
  if (typeof r.hitRate === 'number' && Number.isFinite(r.hitRate)) {
    const rate = Math.round(r.hitRate);
    if (rate >= 0 && rate <= 100 && rate !== DEFAULT_HIT_RATE) out.hitRate = rate;
  }
  if (typeof r.backingId === 'string' && r.backingId.trim()) out.backingId = r.backingId.trim();
  return Object.keys(out).length ? out : undefined;
}

/** Reads `limiter` from untrusted input. The defaults (4 of 5, fail-closed) are left absent. */
export function normalizeLimiter(raw: unknown): NodeLimiter | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  const whole = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= MAX_PER ? v : undefined);
  const per = whole(r.per);
  const admit = whole(r.admit);
  const out: NodeLimiter = {};
  if (admit !== undefined) {
    const clamped = Math.min(admit, per ?? DEFAULT_PER);
    if (clamped !== DEFAULT_ADMIT) out.admit = clamped;
  }
  if (per !== undefined && per !== DEFAULT_PER) out.per = per;
  if (r.failOpen === true) out.failOpen = true;
  return Object.keys(out).length ? out : undefined;
}

/** Reads `schedule` from untrusted input. */
export function normalizeSchedule(raw: unknown): NodeSchedule | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const every = (raw as Record<string, unknown>).every;
  if (typeof every !== 'string') return undefined;
  const text = every.trim().slice(0, MAX_SCHEDULE_EVERY).trim();
  return text ? { every: text } : undefined;
}

export function cacheHitRate(cache: NodeCache | undefined): number {
  return cache?.hitRate ?? DEFAULT_HIT_RATE;
}

export function cacheChip(cache: NodeCache | undefined): string {
  return `HIT ${cacheHitRate(cache)}%`;
}

/** The effective "admit of every per" of a limiter. `admit` never exceeds `per`. */
export function limiterRate(limiter: NodeLimiter | undefined): { admit: number; per: number } {
  const per = limiter?.per ?? DEFAULT_PER;
  return { admit: Math.min(limiter?.admit ?? DEFAULT_ADMIT, per), per };
}

export function limiterChip(limiter: NodeLimiter | undefined): string {
  const { admit, per } = limiterRate(limiter);
  return `${admit}/${per}`;
}

export function scheduleChip(schedule: NodeSchedule | undefined, fallback: string): string {
  return schedule?.every || fallback;
}

/** What a card shows in its chip: the setting when one is set, else the stencil text. */
export function nodeChip(node: {
  kind: string;
  chip: string;
  cache?: NodeCache;
  limiter?: NodeLimiter;
  schedule?: NodeSchedule;
}): string {
  if (node.kind === 'cache' && node.cache?.hitRate !== undefined) return cacheChip(node.cache);
  if (node.kind === 'limiter' && (node.limiter?.admit !== undefined || node.limiter?.per !== undefined)) {
    return limiterChip(node.limiter);
  }
  if (node.kind === 'scheduler') return scheduleChip(node.schedule, node.chip);
  return node.chip;
}

function outgoing(doc: Wired, id: string): string[] {
  const out = new Set<string>();
  for (const e of doc.edges) {
    if (e.from === id) out.add(e.to);
    else if (e.flow === 'both' && e.to === id) out.add(e.from);
  }
  out.delete(id);
  return [...out];
}

/**
 * The store behind a cache: the one it names, else its only outgoing wire to a store. Null when there is none, or
 * more than one store and none is named.
 */
export function backingStoreOf(doc: Wired, cacheId: string): string | null {
  const node = doc.nodes.find((n) => n.id === cacheId);
  if (!node) return null;
  const named = node.cache?.backingId;
  if (named && named !== cacheId && doc.nodes.some((n) => n.id === named)) return named;
  const stores = outgoing(doc, cacheId).filter((id) => doc.nodes.find((n) => n.id === id)?.kind === 'store');
  return stores.length === 1 ? stores[0] : null;
}

/** The one component a limiter passes traffic to, or null when it has none or several. */
export function limiterOnlyTarget(doc: Wired, limiterId: string): string | null {
  const targets = outgoing(doc, limiterId);
  return targets.length === 1 ? targets[0] : null;
}

/** Packet `n` (counting from 0) is a hit when this is true. Hits are spread evenly, so the same run repeats. */
export function cacheHit(n: number, hitRate: number): boolean {
  return Math.floor(((n + 1) * hitRate) / 100) > Math.floor((n * hitRate) / 100);
}

/** Packet `n` is turned away when `n % per >= admit`. */
export function limiterRejects(n: number, admit: number, per: number): boolean {
  return n % per >= admit;
}

/**
 * Playback (K3): a packet that sits at the cache in step `index` while the next step reaches the backing store.
 * A hit skips the steps up to and including the backing store's, and goes on from the step after; a miss plays on.
 * Returns the step to go to (it may equal the scenario length, which ends the pass) and the packet label, or null
 * when this step is not a cache lookup.
 */
export function planCacheStep(
  steps: ReadonlyArray<{ nodes: readonly string[] }>,
  index: number,
  cacheId: string,
  backingId: string,
  hit: boolean,
): { next: number; label: 'HIT' | 'MISS' } | null {
  if (!steps[index]?.nodes.includes(cacheId)) return null;
  if (!steps[index + 1]?.nodes.includes(backingId)) return null;
  return hit ? { next: index + 2, label: 'HIT' } : { next: index + 1, label: 'MISS' };
}
