/**
 * Chaos simulation state (F-01). Failures belong to the Traffic lens, not the document: they live here, are never
 * saved or exported on their own, and only travel with the file when saved as a scenario's `failures`.
 * The maths is in `core/reachability.ts`; this module holds the set, repaints on change and announces results.
 */
import { failedAncestor, failedIdsAt, failureKey, insideFailedComponent } from '../core/failures';
import { nodesAtLevel, type LevelPath } from '../core/levels';
import { entryPointIds, reachableFrom, type ReachabilityResult } from '../core/reachability';
import { announce } from './a11y';
import { app, onPageOpened } from './state';
import { renderAll } from './render';

export type ChaosStatus = 'failed' | 'degraded' | 'unreachable' | 'rerouted' | 'at-risk' | 'buffering' | 'delayed';

/** Failures at every level, keyed by where they sit (`core/failures.ts`), so repeated ids at different levels never collide. */
let failed = new Set<string>();
/** Each page keeps its own failures (D10), so a component that fails on one page stays up on the others. */
const failedByPage = new Map<string, Set<string>>();
let failedPageId = '';

/** The open page changed: show that page's failures. */
function switchChaosPage(pageId: string): void {
  if (pageId === failedPageId) return;
  failedByPage.set(failedPageId, failed);
  failedPageId = pageId;
  failed = failedByPage.get(pageId) ?? new Set<string>();
  cached = undefined;
  for (const listener of listeners) listener();
}
/** Component under the pointer while Alt is held and nothing has failed: a what-if preview. */
let previewId: string | null = null;
let cached: ReachabilityResult | null | undefined;
const listeners = new Set<() => void>();
onPageOpened(switchChaosPage);

export function onChaosChange(listener: () => void): void {
  listeners.add(listener);
}

/** Forget the cached result. Call before a repaint, since the document may have changed underneath. */
export function invalidateChaos(): void {
  cached = undefined;
  if (failed.size === 0) return;
  const root = app.levelRoot ?? app.doc;
  for (const key of [...failed]) {
    const parts = key.split('\u0000');
    const id = parts.pop()!;
    // The open level is edited live, so check it in `app.doc`; every other level lives in the saved tree.
    const nodes = parts.join('\u0000') === app.levelPath.join('\u0000') ? app.doc.nodes : nodesAtLevel(root, parts);
    if (!nodes?.some((n) => n.id === id)) failed.delete(key);
  }
}

/** The failed component the open level sits inside (at any depth), or null. */
function failedParent(): { path: LevelPath; id: string } | null {
  return failedAncestor(failed, app.levelPath);
}

/** Has anything failed that shows on the open level, either on it or above it? */
function hasRun(): boolean {
  return failedParent() !== null || failedIdsAt(failed, app.levelPath).length > 0;
}

/** Did the component `id` at the level `path` fail itself (not counting what it cuts off)? */
export function isFailedAt(path: LevelPath, id: string): boolean {
  return failed.has(failureKey(path, id));
}

/** Failures can be run and seen in the Traffic and Review lenses. */
export function chaosLensActive(): boolean {
  return app.lens === 'traffic' || app.lens === 'review';
}

/** Failures set on the open level. Failures on other levels are not listed here. */
export function failedIds(): string[] {
  return failedIdsAt(failed, app.levelPath);
}

export function isPreview(): boolean {
  return !hasRun() && previewId !== null;
}

function effectiveFailures(): string[] {
  const own = failedIds();
  if (own.length) return own;
  return previewId ? [previewId] : [];
}

/** The current reachability result, or null when nothing has failed (and nothing is being previewed). */
export function chaosResult(): ReachabilityResult | null {
  if (cached !== undefined) return cached;
  if (failedParent()) {
    cached = insideFailedComponent(app.doc);
    return cached;
  }
  const ids = effectiveFailures();
  cached = ids.length ? reachableFrom(app.doc, entryPointIds(app.doc), ids) : null;
  return cached;
}

export function chaosStatusOf(nodeId: string): ChaosStatus | null {
  const r = chaosResult();
  if (!r) return null;
  if (r.failed.includes(nodeId)) return 'failed';
  if (r.degraded.includes(nodeId)) return 'degraded';
  if (r.delayed.includes(nodeId)) return 'delayed';
  if (r.unreachable.includes(nodeId)) return 'unreachable';
  if (r.buffering.includes(nodeId)) return 'buffering';
  if (r.atRisk.includes(nodeId)) return 'at-risk';
  if (r.rerouted.includes(nodeId)) return 'rerouted';
  return null;
}

/** The first of these components a packet cannot get through, or null. Used to stop playback. */
export function blockedNodeIn(nodeIds: readonly string[]): string | null {
  if (!hasRun()) return null;
  return nodeIds.find((id) => ['failed', 'unreachable', 'delayed'].includes(chaosStatusOf(id) ?? '')) ?? null;
}

/** Queues on the open level that are up but holding messages because their consumers are down (K1). */
export function bufferingQueueIds(): ReadonlySet<string> {
  if (!hasRun()) return new Set();
  return new Set(chaosResult()?.buffering ?? []);
}

/** Components on the open level that cannot take a message right now: failed or cut off, and not just delayed. */
export function downIds(): ReadonlySet<string> {
  if (!hasRun()) return new Set();
  const r = chaosResult();
  return new Set(r ? [...r.failed, ...r.unreachable, ...r.delayed] : []);
}

export interface ChaosSummary {
  failed: number;
  degraded: number;
  unreachable: number;
  rerouted: number;
  atRisk: number;
  buffering: number;
  delayed: number;
}

/** Counts for the run of real failures (not the Alt preview), or null when none are set. */
export function chaosSummary(): ChaosSummary | null {
  if (!hasRun()) return null;
  const r = chaosResult();
  if (!r) return null;
  return {
    failed: r.failed.length,
    degraded: r.degraded.length,
    unreachable: r.unreachable.length,
    rerouted: r.rerouted.length,
    atRisk: r.atRisk.length,
    buffering: r.buffering.length,
    delayed: r.delayed.length,
  };
}

/** "2 failed · 5 unreachable · 1 rerouted", with degraded components only when there are some. */
export function summaryText(s: ChaosSummary): string {
  const parts = [`${s.failed} failed`];
  if (s.degraded) parts.push(`${s.degraded} degraded`);
  if (s.buffering) parts.push(`${s.buffering} buffering`);
  if (s.delayed) parts.push(`${s.delayed} delayed`);
  parts.push(`${s.unreachable} unreachable`, `${s.rerouted} rerouted`);
  if (s.atRisk) parts.push(`${s.atRisk} at risk`);
  return parts.join(' · ');
}

function titleOf(id: string): string {
  return app.doc.nodes.find((n) => n.id === id)?.title || id;
}

function changed(): void {
  cached = undefined;
  renderAll(false);
  for (const listener of listeners) listener();
}

/** The lens changed: failures only show in Traffic, so the components need repainting. */
export function repaintForLens(): void {
  if (failed.size || previewId) renderAll(false);
}

/**
 * A level was opened. Tell the panel to recount, and say once when it sits inside a failed component, since
 * everything in it is down and the reason is one level up.
 */
export function levelOpened(): void {
  cached = undefined;
  for (const listener of listeners) listener();
  const parent = failedParent();
  if (!parent || !chaosLensActive()) return;
  const title = nodesAtLevel(app.levelRoot ?? app.doc, parent.path)?.find((n) => n.id === parent.id)?.title || parent.id;
  announce(`Inside ${title}, which has failed.`);
}

export function toggleFailure(id: string): void {
  if (!app.doc.nodes.some((n) => n.id === id)) return;
  const key = failureKey(app.levelPath, id);
  const wasFailed = failed.delete(key);
  if (!wasFailed) failed.add(key);
  previewId = null;
  changed();
  const name = titleOf(id);
  if (wasFailed) {
    announce(failed.size ? `${name} restored.` : `${name} restored. All components are back.`);
    return;
  }
  const r = chaosResult();
  const n = r?.unreachable.length ?? 0;
  const degraded = r?.degraded.includes(id);
  announce(
    degraded
      ? `${name} degraded. It still has replicas running.`
      : `${name} failed. ${n} ${n === 1 ? 'component' : 'components'} unreachable.`,
  );
}

/** Replaces the failure set (used when a saved chaos scenario runs). */
export function setFailures(ids: readonly string[]): void {
  failed.clear();
  for (const id of ids) if (app.doc.nodes.some((n) => n.id === id)) failed.add(failureKey(app.levelPath, id));
  previewId = null;
  changed();
}

export function clearFailures(): void {
  if (failed.size === 0) return;
  failed.clear();
  changed();
  announce('All components restored.');
}

export function setPreview(id: string | null): void {
  const next = !hasRun() ? id : null;
  if (next === previewId) return;
  previewId = next;
  changed();
}

/** Alt + hover previews what would become unreachable, in the Traffic lens, while nothing has failed. */
export function initChaosPreview(layer: HTMLElement): void {
  let altDown = false;
  let hovered: string | null = null;
  const sync = () => setPreview(altDown && hovered && chaosLensActive() ? hovered : null);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Alt' && !altDown) {
      altDown = true;
      sync();
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === 'Alt') {
      altDown = false;
      sync();
    }
  });
  window.addEventListener('blur', () => {
    altDown = false;
    sync();
  });
  layer.addEventListener('pointerover', (e) => {
    hovered = (e.target as HTMLElement).closest<HTMLElement>('.arch-node')?.dataset.node ?? null;
    sync();
  });
  layer.addEventListener('pointerleave', () => {
    hovered = null;
    sync();
  });
}
