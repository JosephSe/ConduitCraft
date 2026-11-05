/**
 * Architecture insights (F-02): rules that read the graph and say something about it. Pure and DOM-free.
 *
 * Issues reuse the `ImportIssue` shape (`level`, `message`, `code`) and add a `target` to pan to and select.
 * `runInsights` returns every issue; `visibleInsights` drops the rules a diagram has muted.
 */
import { viewOfLevel } from './levels';
import type { DiagramDocument, DiagramEdge, ImportIssue, ImportIssueLevel } from '../types';
import { balancerTargets } from './balancers';
import { backingStoreOf, limiterOnlyTarget } from './components';
import { entryPointIds, reachableFrom } from './reachability';
import { getEffectiveSimulations } from './layout';

export type InsightCode =
  | 'spof'
  | 'cycle'
  | 'orphan'
  | 'dangling-store'
  | 'deprecated-in-path'
  | 'at-risk-fan-in'
  | 'latency-budget'
  | 'unlabeled-wire'
  | 'queue-no-consumer'
  | 'queue-no-dlq'
  | 'sync-into-queue'
  | 'balancer-single-target'
  | 'cache-no-backing'
  | 'limiter-fail-open'
  | 'scheduler-no-queue'
  | 'external-unprotected';

export interface InsightTarget {
  type: 'node' | 'edge';
  id: string;
}

export interface InsightIssue extends ImportIssue {
  code: InsightCode;
  target: InsightTarget;
}

export interface InsightRule {
  code: InsightCode;
  level: ImportIssueLevel;
  /** Short name for the Review lens group heading and the mute toggle. */
  title: string;
}

export const INSIGHT_RULES: readonly InsightRule[] = [
  { code: 'latency-budget', level: 'error', title: 'Latency budget exceeded' },
  { code: 'spof', level: 'warning', title: 'Single point of failure' },
  { code: 'cycle', level: 'warning', title: 'Synchronous cycle' },
  { code: 'deprecated-in-path', level: 'warning', title: 'Deprecated component in a scenario' },
  { code: 'queue-no-consumer', level: 'warning', title: 'Queue nothing reads from' },
  { code: 'external-unprotected', level: 'warning', title: 'Unprotected call to an external component' },
  { code: 'at-risk-fan-in', level: 'warning', title: 'At-risk component with many dependents' },
  { code: 'orphan', level: 'info', title: 'Component with no wires' },
  { code: 'dangling-store', level: 'info', title: 'Data store nothing reads from' },
  { code: 'queue-no-dlq', level: 'info', title: 'Queue with a limit and no dead-letter queue' },
  { code: 'sync-into-queue', level: 'info', title: 'Synchronous wire into a queue' },
  { code: 'balancer-single-target', level: 'info', title: 'Load balancer with fewer than two targets' },
  { code: 'cache-no-backing', level: 'info', title: 'Cache with no data store behind it' },
  { code: 'limiter-fail-open', level: 'info', title: 'Rate limiter that fails open' },
  { code: 'scheduler-no-queue', level: 'info', title: 'Scheduler that writes straight to a store' },
  { code: 'unlabeled-wire', level: 'info', title: 'Wire between services without a label' },
];

const RULE_BY_CODE = new Map(INSIGHT_RULES.map((rule) => [rule.code, rule]));

export function insightRule(code: string): InsightRule | undefined {
  return RULE_BY_CODE.get(code as InsightCode);
}

/** The rules this diagram has muted, ignoring anything that is not a known rule code. */
export function mutedRules(doc: Pick<DiagramDocument, 'insights'>): Set<string> {
  return new Set((doc.insights?.muted ?? []).filter((code) => RULE_BY_CODE.has(code as InsightCode)));
}

/** Reads `insights` from untrusted input. Returns undefined when nothing is muted. */
export function normalizeInsights(raw: unknown): DiagramDocument['insights'] {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const muted = (raw as Record<string, unknown>).muted;
  if (!Array.isArray(muted)) return undefined;
  const codes = [...new Set(muted.filter((c): c is string => typeof c === 'string' && RULE_BY_CODE.has(c as InsightCode)))];
  return codes.length ? { muted: codes } : undefined;
}

/** Reads a scenario's latency budget from untrusted input: a positive, finite number of milliseconds. */
export function normalizeBudgetMs(raw: unknown): number | undefined {
  return typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? Math.round(raw) : undefined;
}

const READ_WORDS = /\b(read|reads|query|queries|select|fetch|get|load|lookup|look up|scan|retrieve|subscribe)\b/i;

/** A wire is treated as a synchronous call unless it is marked async. */
const isSync = (e: DiagramEdge) => e.sync !== 'async';

function titleOf(doc: DiagramDocument, id: string): string {
  return doc.nodes.find((n) => n.id === id)?.title || id;
}

function spof(doc: DiagramDocument): InsightIssue[] {
  const entries = entryPointIds(doc);
  if (entries.length === 0) return [];
  const hasOut = new Set<string>();
  for (const e of doc.edges) {
    hasOut.add(e.from);
    if (e.flow === 'both') hasOut.add(e.to);
  }
  const entrySet = new Set(entries);
  const sinks = doc.nodes.filter((n) => !hasOut.has(n.id) && !entrySet.has(n.id)).map((n) => n.id);
  if (sinks.length === 0) return [];
  const sinkSet = new Set(sinks);

  const out: InsightIssue[] = [];
  for (const node of doc.nodes) {
    // Entries and sinks sit at the ends of a path, so they cannot cut one in the middle.
    if (entrySet.has(node.id) || sinkSet.has(node.id)) continue;
    const r = reachableFrom(doc, entries, [node.id]);
    // Replicas make a failure degrade the component instead of failing it; a live fallback keeps the sinks reachable.
    if (!r.failed.includes(node.id)) continue;
    const cut = r.unreachable.filter((id) => sinkSet.has(id));
    if (cut.length === 0) continue;
    out.push({
      level: 'warning',
      code: 'spof',
      target: { type: 'node', id: node.id },
      message: `${titleOf(doc, node.id)} is a single point of failure: if it fails, ${r.unreachable.length} ${
        r.unreachable.length === 1 ? 'component becomes' : 'components become'
      } unreachable.`,
    });
  }
  return out;
}

/** Strongly connected components of the synchronous wires (Tarjan), as lists of node ids. */
function syncCycles(doc: DiagramDocument): string[][] {
  const ids = new Set(doc.nodes.map((n) => n.id));
  const next = new Map<string, string[]>();
  for (const e of doc.edges) {
    if (!isSync(e) || !ids.has(e.from) || !ids.has(e.to)) continue;
    const list = next.get(e.from);
    if (list) list.push(e.to);
    else next.set(e.from, [e.to]);
  }
  const selfLoops = new Set(doc.edges.filter((e) => isSync(e) && e.from === e.to && ids.has(e.from)).map((e) => e.from));

  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const found: string[][] = [];
  let counter = 0;

  const strong = (root: string) => {
    // Iterative so a long chain cannot overflow the call stack.
    const work: Array<{ id: string; i: number }> = [{ id: root, i: 0 }];
    index.set(root, counter);
    low.set(root, counter++);
    stack.push(root);
    onStack.add(root);
    while (work.length) {
      const frame = work[work.length - 1];
      const edges = next.get(frame.id) ?? [];
      if (frame.i < edges.length) {
        const to = edges[frame.i++];
        if (!index.has(to)) {
          index.set(to, counter);
          low.set(to, counter++);
          stack.push(to);
          onStack.add(to);
          work.push({ id: to, i: 0 });
        } else if (onStack.has(to)) {
          low.set(frame.id, Math.min(low.get(frame.id)!, index.get(to)!));
        }
        continue;
      }
      work.pop();
      if (work.length) {
        const parent = work[work.length - 1].id;
        low.set(parent, Math.min(low.get(parent)!, low.get(frame.id)!));
      }
      if (low.get(frame.id) === index.get(frame.id)) {
        const group: string[] = [];
        let member: string;
        do {
          member = stack.pop()!;
          onStack.delete(member);
          group.push(member);
        } while (member !== frame.id);
        if (group.length > 1 || selfLoops.has(group[0])) found.push(group);
      }
    }
  };

  for (const node of doc.nodes) if (!index.has(node.id)) strong(node.id);
  return found;
}

function cycle(doc: DiagramDocument): InsightIssue[] {
  const order = new Map(doc.nodes.map((n, i) => [n.id, i]));
  return syncCycles(doc).map((group) => {
    group.sort((a, b) => order.get(a)! - order.get(b)!);
    const names = group.map((id) => titleOf(doc, id));
    return {
      level: 'warning',
      code: 'cycle',
      target: { type: 'node', id: group[0] },
      message:
        group.length === 1
          ? `${names[0]} calls itself synchronously.`
          : `${names.join(' → ')} → ${names[0]} call each other synchronously. Mark one wire async to break the loop.`,
    };
  });
}

function orphan(doc: DiagramDocument): InsightIssue[] {
  const wired = new Set<string>();
  for (const e of doc.edges) {
    wired.add(e.from);
    wired.add(e.to);
  }
  return doc.nodes
    .filter((n) => !wired.has(n.id))
    .map((n) => ({
      level: 'info' as const,
      code: 'orphan' as const,
      target: { type: 'node' as const, id: n.id },
      message: `${n.title || n.id} has no wires.`,
    }));
}

function danglingStore(doc: DiagramDocument): InsightIssue[] {
  const out: InsightIssue[] = [];
  for (const node of doc.nodes) {
    if (node.kind !== 'store') continue;
    const touching = doc.edges.filter((e) => e.from === node.id || e.to === node.id);
    // Backups and exports are often write-only: a bucket written only by a scheduler or an external component is fine (K8).
    if (
      node.shape === 'bucket' &&
      touching.length > 0 &&
      touching.every((e) => {
        const writer = doc.nodes.find((n) => n.id === e.from);
        return e.to === node.id && (writer?.kind === 'scheduler' || writer?.external === true);
      })
    ) {
      continue;
    }
    // Unwired stores are reported as orphans instead.
    if (touching.length === 0) continue;
    const readFrom = touching.some((e) => e.from === node.id || e.flow === 'both' || READ_WORDS.test(e.label));
    if (readFrom) continue;
    out.push({
      level: 'info',
      code: 'dangling-store',
      target: { type: 'node', id: node.id },
      message: `Nothing reads from ${node.title || node.id}; every wire only writes to it.`,
    });
  }
  return out;
}

function queueNoConsumer(doc: DiagramDocument): InsightIssue[] {
  const out: InsightIssue[] = [];
  for (const node of doc.nodes) {
    if (node.kind !== 'queue') continue;
    const into = doc.edges.some((e) => e.to === node.id || (e.flow === 'both' && e.from === node.id));
    const outOf = doc.edges.some((e) => e.from === node.id || (e.flow === 'both' && e.to === node.id));
    if (!into || outOf) continue;
    out.push({
      level: 'warning',
      code: 'queue-no-consumer',
      target: { type: 'node', id: node.id },
      message: `Nothing reads from ${node.title || node.id}; messages pile up forever.`,
    });
  }
  return out;
}

function queueNoDlq(doc: DiagramDocument): InsightIssue[] {
  return doc.nodes
    .filter((n) => n.kind === 'queue' && n.queue?.maxDepth !== undefined && !n.queue.deadLetterId)
    .map((n) => ({
      level: 'info' as const,
      code: 'queue-no-dlq' as const,
      target: { type: 'node' as const, id: n.id },
      message: `${n.title || n.id} drops messages when full; it has no dead-letter queue.`,
    }));
}

function syncIntoQueue(doc: DiagramDocument): InsightIssue[] {
  const queues = new Map(doc.nodes.filter((n) => n.kind === 'queue').map((n) => [n.id, n]));
  return doc.edges
    .filter((e) => queues.has(e.to) && isSync(e))
    .map((e) => ({
      level: 'info' as const,
      code: 'sync-into-queue' as const,
      target: { type: 'edge' as const, id: e.id },
      message: `The wire into ${queues.get(e.to)!.title || e.to} is synchronous; queues are usually written asynchronously.`,
    }));
}

function balancerSingleTarget(doc: DiagramDocument): InsightIssue[] {
  const out: InsightIssue[] = [];
  for (const node of doc.nodes) {
    if (node.kind !== 'balancer') continue;
    const count = balancerTargets(doc, node.id).length;
    if (count >= 2) continue;
    out.push({
      level: 'info',
      code: 'balancer-single-target',
      target: { type: 'node', id: node.id },
      message: `${node.title || node.id} has ${count === 0 ? 'no targets' : 'one target'}, so it does not spread load.`,
    });
  }
  return out;
}

function cacheNoBacking(doc: DiagramDocument): InsightIssue[] {
  return doc.nodes
    .filter((n) => n.kind === 'cache' && backingStoreOf(doc, n.id) === null)
    .map((n) => ({
      level: 'info' as const,
      code: 'cache-no-backing' as const,
      target: { type: 'node' as const, id: n.id },
      message: `${n.title || n.id} has no data store behind it; a failure loses every read.`,
    }));
}

function limiterFailOpen(doc: DiagramDocument): InsightIssue[] {
  const out: InsightIssue[] = [];
  for (const n of doc.nodes) {
    if (n.kind !== 'limiter' || !n.limiter?.failOpen) continue;
    const target = limiterOnlyTarget(doc, n.id);
    out.push({
      level: 'info',
      code: 'limiter-fail-open',
      target: { type: 'node', id: n.id },
      message: target
        ? `${n.title || n.id} fails open: when it is down, traffic reaches ${titleOf(doc, target)} unchecked.`
        : `${n.title || n.id} fails open, but it has more than one target, so it fails closed when it is down.`,
    });
  }
  return out;
}

function schedulerNoQueue(doc: DiagramDocument): InsightIssue[] {
  const stores = new Set(doc.nodes.filter((n) => n.kind === 'store').map((n) => n.id));
  const out: InsightIssue[] = [];
  for (const n of doc.nodes) {
    if (n.kind !== 'scheduler') continue;
    const into = doc.edges.find((e) => e.from === n.id && stores.has(e.to));
    if (!into) continue;
    out.push({
      level: 'info',
      code: 'scheduler-no-queue',
      target: { type: 'node', id: n.id },
      message: `${n.title || n.id} runs straight into ${titleOf(doc, into.to)}; a failed run is not retried.`,
    });
  }
  return out;
}

/** A synchronous call into a component someone else runs, on a scenario path, with no breaker and no fallback (K7). */
function externalUnprotected(doc: DiagramDocument): InsightIssue[] {
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  const sims = getEffectiveSimulations(doc);
  const onPath = (from: string, to: string): boolean =>
    sims.some((sim) =>
      sim.steps.some(
        (s, i) =>
          (s.nodes.includes(from) && s.nodes.includes(to)) ||
          (s.nodes.includes(from) && Boolean(sim.steps[i + 1]?.nodes.includes(to))),
      ),
    );
  const out: InsightIssue[] = [];
  for (const e of doc.edges) {
    const caller = byId.get(e.from);
    const callee = byId.get(e.to);
    if (!caller || !callee || !callee.external || !isSync(e)) continue;
    if (caller.resilience?.circuitBreaker || callee.resilience?.fallbackId) continue;
    if (!onPath(e.from, e.to)) continue;
    out.push({
      level: 'warning',
      code: 'external-unprotected',
      target: { type: 'edge', id: e.id },
      message: `${caller.title || caller.id} calls ${callee.title || callee.id} synchronously with no circuit breaker or fallback.`,
    });
  }
  return out;
}

function deprecatedInPath(doc: DiagramDocument): InsightIssue[] {
  const deprecated = new Set(doc.nodes.filter((n) => n.status === 'deprecated').map((n) => n.id));
  if (deprecated.size === 0) return [];
  const scenariosOf = new Map<string, string[]>();
  for (const sim of getEffectiveSimulations(doc)) {
    for (const id of new Set(sim.steps.flatMap((s) => s.nodes))) {
      if (!deprecated.has(id)) continue;
      const list = scenariosOf.get(id);
      if (list) list.push(sim.name);
      else scenariosOf.set(id, [sim.name]);
    }
  }
  return [...scenariosOf].map(([id, names]) => ({
    level: 'warning' as const,
    code: 'deprecated-in-path' as const,
    target: { type: 'node' as const, id },
    message: `${titleOf(doc, id)} is deprecated but still on the path of ${names.map((n) => `"${n}"`).join(', ')}.`,
  }));
}

/** Components that call `id`, counting a two-way wire as a call from either end. */
function dependentsOf(doc: DiagramDocument, id: string): Set<string> {
  const out = new Set<string>();
  for (const e of doc.edges) {
    if (e.to === id && e.from !== id) out.add(e.from);
    if (e.flow === 'both' && e.from === id && e.to !== id) out.add(e.to);
  }
  return out;
}

const FAN_IN_THRESHOLD = 3;

function atRiskFanIn(doc: DiagramDocument): InsightIssue[] {
  const out: InsightIssue[] = [];
  for (const node of doc.nodes) {
    if (node.status !== 'at-risk') continue;
    const n = dependentsOf(doc, node.id).size;
    if (n < FAN_IN_THRESHOLD) continue;
    out.push({
      level: 'warning',
      code: 'at-risk-fan-in',
      target: { type: 'node', id: node.id },
      message: `${node.title || node.id} is marked at risk and ${n} components depend on it.`,
    });
  }
  return out;
}

function latencyBudget(doc: DiagramDocument): InsightIssue[] {
  const out: InsightIssue[] = [];
  for (const sim of doc.simulations) {
    const budget = sim.budgetMs;
    if (budget === undefined || budget <= 0) continue;
    let total = 0;
    let slowest: DiagramEdge | undefined;
    for (let i = 0; i + 1 < sim.steps.length; i++) {
      const from = sim.steps[i].nodes;
      const to = sim.steps[i + 1].nodes;
      // Parallel wires into one step overlap, so a hop costs its slowest wire.
      let hop = 0;
      for (const e of doc.edges) {
        if (typeof e.latencyMs !== 'number' || !from.includes(e.from) || !to.includes(e.to)) continue;
        if (e.latencyMs > hop) hop = e.latencyMs;
        if (!slowest || e.latencyMs > (slowest.latencyMs ?? 0)) slowest = e;
      }
      total += hop;
    }
    if (total <= budget || !slowest) continue;
    out.push({
      level: 'error',
      code: 'latency-budget',
      target: { type: 'edge', id: slowest.id },
      message: `"${sim.name}" takes ${total} ms along its path, ${total - budget} ms over its ${budget} ms budget.`,
    });
  }
  return out;
}

function unlabeledWire(doc: DiagramDocument): InsightIssue[] {
  const kindOf = new Map(doc.nodes.map((n) => [n.id, n.kind]));
  return doc.edges
    .filter((e) => kindOf.get(e.from) === 'service' && kindOf.get(e.to) === 'service' && !e.label.trim())
    .map((e) => ({
      level: 'info' as const,
      code: 'unlabeled-wire' as const,
      target: { type: 'edge' as const, id: e.id },
      message: `The wire from ${titleOf(doc, e.from)} to ${titleOf(doc, e.to)} has no label.`,
    }));
}

const CHECKS: Record<InsightCode, (doc: DiagramDocument) => InsightIssue[]> = {
  spof,
  cycle,
  orphan,
  'dangling-store': danglingStore,
  'deprecated-in-path': deprecatedInPath,
  'at-risk-fan-in': atRiskFanIn,
  'latency-budget': latencyBudget,
  'unlabeled-wire': unlabeledWire,
  'queue-no-consumer': queueNoConsumer,
  'queue-no-dlq': queueNoDlq,
  'sync-into-queue': syncIntoQueue,
  'balancer-single-target': balancerSingleTarget,
  'cache-no-backing': cacheNoBacking,
  'limiter-fail-open': limiterFailOpen,
  'scheduler-no-queue': schedulerNoQueue,
  'external-unprotected': externalUnprotected,
};

/** Every issue the rules find, most severe first, ignoring mutes. */
export function runInsights(doc: DiagramDocument): InsightIssue[] {
  return INSIGHT_RULES.flatMap((rule) => CHECKS[rule.code](doc));
}

export interface LevelInsightIssue extends InsightIssue {
  /** The level the issue is in (`[]` is the root). */
  path: string[];
  /** Titles of the components that lead to that level, outermost first. */
  trail: string[];
}

/** The rules run on every level on its own, each with where it was found (F-03). */
export function runInsightsAllLevels(root: DiagramDocument): LevelInsightIssue[] {
  const out: LevelInsightIssue[] = [];
  const visit = (path: string[], trail: string[]) => {
    for (const issue of runInsights(viewOfLevel(root, path))) out.push({ ...issue, path, trail });
    const here = path.length === 0 ? root : viewOfLevel(root, path);
    for (const node of here.nodes) if (node.child) visit([...path, node.id], [...trail, node.title]);
  };
  visit([], []);
  return out;
}

/** The issues for rules this diagram has not muted. */
export function visibleInsights(doc: DiagramDocument): InsightIssue[] {
  const muted = mutedRules(doc);
  return runInsights(doc).filter((issue) => !muted.has(issue.code));
}

/** "2 issues", or "No issues" for the top bar and the live region. */
export function insightCountText(n: number): string {
  return n === 0 ? 'No issues' : `${n} ${n === 1 ? 'issue' : 'issues'}`;
}
