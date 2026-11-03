/**
 * Chaos simulation state (F-01). Failures belong to the Traffic lens, not the document: they live here, are never
 * saved or exported on their own, and only travel with the file when saved as a scenario's `failures`.
 * The maths is in `core/reachability.ts`; this module holds the set, repaints on change and announces results.
 */
import { entryPointIds, reachableFrom, type ReachabilityResult } from '../core/reachability';
import { announce } from './a11y';
import { app } from './state';
import { renderAll } from './render';

export type ChaosStatus = 'failed' | 'degraded' | 'unreachable' | 'rerouted' | 'at-risk';

const failed = new Set<string>();
/** Component under the pointer while Alt is held and nothing has failed: a what-if preview. */
let previewId: string | null = null;
let cached: ReachabilityResult | null | undefined;
const listeners = new Set<() => void>();

export function onChaosChange(listener: () => void): void {
  listeners.add(listener);
}

/** Forget the cached result. Call before a repaint, since the document may have changed underneath. */
export function invalidateChaos(): void {
  cached = undefined;
  for (const id of [...failed]) if (!app.doc.nodes.some((n) => n.id === id)) failed.delete(id);
}

export function failedIds(): string[] {
  return [...failed];
}

export function isPreview(): boolean {
  return failed.size === 0 && previewId !== null;
}

function effectiveFailures(): string[] {
  if (failed.size) return [...failed];
  return previewId ? [previewId] : [];
}

/** The current reachability result, or null when nothing has failed (and nothing is being previewed). */
export function chaosResult(): ReachabilityResult | null {
  if (cached !== undefined) return cached;
  const ids = effectiveFailures();
  cached = ids.length ? reachableFrom(app.doc, entryPointIds(app.doc), ids) : null;
  return cached;
}

export function chaosStatusOf(nodeId: string): ChaosStatus | null {
  const r = chaosResult();
  if (!r) return null;
  if (r.failed.includes(nodeId)) return 'failed';
  if (r.degraded.includes(nodeId)) return 'degraded';
  if (r.unreachable.includes(nodeId)) return 'unreachable';
  if (r.atRisk.includes(nodeId)) return 'at-risk';
  if (r.rerouted.includes(nodeId)) return 'rerouted';
  return null;
}

/** The first of these components a packet cannot get through, or null. Used to stop playback. */
export function blockedNodeIn(nodeIds: readonly string[]): string | null {
  if (failed.size === 0) return null;
  return nodeIds.find((id) => ['failed', 'unreachable'].includes(chaosStatusOf(id) ?? '')) ?? null;
}

export interface ChaosSummary {
  failed: number;
  degraded: number;
  unreachable: number;
  rerouted: number;
  atRisk: number;
}

/** Counts for the run of real failures (not the Alt preview), or null when none are set. */
export function chaosSummary(): ChaosSummary | null {
  if (failed.size === 0) return null;
  const r = chaosResult();
  if (!r) return null;
  return {
    failed: r.failed.length,
    degraded: r.degraded.length,
    unreachable: r.unreachable.length,
    rerouted: r.rerouted.length,
    atRisk: r.atRisk.length,
  };
}

/** "2 failed · 5 unreachable · 1 rerouted", with degraded components only when there are some. */
export function summaryText(s: ChaosSummary): string {
  const parts = [`${s.failed} failed`];
  if (s.degraded) parts.push(`${s.degraded} degraded`);
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

export function toggleFailure(id: string): void {
  if (!app.doc.nodes.some((n) => n.id === id)) return;
  const wasFailed = failed.delete(id);
  if (!wasFailed) failed.add(id);
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
  for (const id of ids) if (app.doc.nodes.some((n) => n.id === id)) failed.add(id);
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
  const next = failed.size === 0 ? id : null;
  if (next === previewId) return;
  previewId = next;
  changed();
}

/** Alt + hover previews what would become unreachable, in the Traffic lens, while nothing has failed. */
export function initChaosPreview(layer: HTMLElement): void {
  let altDown = false;
  let hovered: string | null = null;
  const sync = () => setPreview(altDown && hovered && app.lens === 'traffic' ? hovered : null);
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
