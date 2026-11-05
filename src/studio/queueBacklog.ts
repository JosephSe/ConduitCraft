/**
 * Queue backlog (K1), Traffic lens only. While a queue's consumers are down, a scenario that reaches the queue parks
 * its message there instead of stopping. The depth lives here, per page and per level, and is never saved or exported.
 * The maths (`enqueue`, `drainCount`, `holdingQueue`) is pure and lives in `core/queues.ts`.
 */
import { failureKey } from '../core/failures';
import { getNodeCenter } from '../core/layout';
import {
  drainCount,
  enqueue,
  fanoutDrain,
  fanoutHold,
  maxLag,
  queueConsumers,
  type BacklogState,
  type EnqueueOutcome,
} from '../core/queues';
import type { DiagramNode } from '../types';
import { announce } from './a11y';
import { bufferingQueueIds, downIds, onChaosChange, onChaosReset } from './chaos';
import { renderAll } from './render';
import { app, onPageOpened } from './state';

const BASE_DRAIN_MS = 300;
/** Blocks drawn inside the pipe; past this the last one reads "+N". */
export const MAX_BLOCKS = 8;

/** Each page keeps its own backlog (D10), as it keeps its own failures. */
const byPage = new Map<string, Map<string, BacklogState>>();
let pageId = '';
let backlog = new Map<string, BacklogState>();
/** Messages a queue held when it started to drain, for the "drained 7 messages" announcement. */
const drainTotals = new Map<string, number>();
const drainTimers = new Map<string, ReturnType<typeof setTimeout>>();
const listeners = new Set<() => void>();
let speedProvider: () => number = () => 1;

/** Playback tells the backlog how fast to drain, so a drain keeps pace with the run. */
export function setBacklogSpeedProvider(provider: () => number): void {
  speedProvider = provider;
}

export function onBacklogChange(listener: () => void): void {
  listeners.add(listener);
}

const key = (id: string) => failureKey(app.levelPath, id);
const reducedMotion = (): boolean =>
  typeof window !== 'undefined' && (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
const titleOf = (id: string) => app.doc.nodes.find((n) => n.id === id)?.title || id;

function changed(): void {
  renderAll(false);
  for (const listener of listeners) listener();
}

function switchBacklogPage(id: string): void {
  stopDrains();
  byPage.set(pageId, backlog);
  pageId = id;
  backlog = byPage.get(id) ?? new Map();
  drainTotals.clear();
  for (const listener of listeners) listener();
}

/** Messages waiting in the queue `id` on the open level. */
export function backlogDepth(id: string): number {
  return backlog.get(key(id))?.depth ?? 0;
}

/** Messages held across every queue on this page. */
export function totalHeld(): number {
  let total = 0;
  for (const state of backlog.values()) total += state.depth;
  return total;
}

function stopDrains(): void {
  for (const timer of drainTimers.values()) clearTimeout(timer);
  drainTimers.clear();
}

/** Forget every backlog: failures were cleared, the page or level changed, or the lens left Traffic. */
export function clearBacklogs(): void {
  stopDrains();
  drainTotals.clear();
  if (backlog.size === 0) return;
  backlog.clear();
  changed();
}

/**
 * One message arrives at a buffering queue on the open level. Returns what happened to it, and announces it.
 * `dead-lettered` and `dropped` leave the depth where it was.
 */
export function holdMessage(queueId: string): { outcome: EnqueueOutcome; deadLetterId?: string } {
  const node = app.doc.nodes.find((n) => n.id === queueId);
  const cfg = node?.queue;
  const dlq = cfg?.deadLetterId;
  const dlqUp = Boolean(dlq) && !downIds().has(dlq!) && app.doc.nodes.some((n) => n.id === dlq);
  const prev = backlog.get(key(queueId)) ?? { depth: 0, deadLettered: 0, dropped: 0 };
  let { state, outcome } = enqueue(prev, cfg, dlqUp);
  const fanout = cfg?.delivery === 'fanout';
  if (fanout && outcome === 'held') {
    // A stream keeps a lag for each consumer: the ones that are down fall one further behind (K6).
    const down = downIds();
    const lags = fanoutHold(prev.lags ?? {}, queueConsumers(app.doc, queueId).filter((c) => down.has(c)));
    state = { ...state, lags, depth: maxLag(lags) };
  }
  backlog.set(key(queueId), state);
  const name = titleOf(queueId);
  if (outcome === 'held') announce(fanout ? `Message added to ${name}. Lag is ${state.depth}.` : `Message held in ${name}. ${state.depth} waiting.`);
  else if (outcome === 'dead-lettered') announce(`${name} is full. Message sent to ${titleOf(dlq!)}.`);
  else announce(`${name} is full. Message dropped.`);
  if (outcome === 'dead-lettered') flashDlqLink(queueId);
  changed();
  return { outcome, ...(outcome === 'dead-lettered' ? { deadLetterId: dlq } : {}) };
}

function drainTick(id: string): void {
  drainTimers.delete(id);
  const state = backlog.get(key(id));
  if (!state || state.depth <= 0) return;
  const node = app.doc.nodes.find((n) => n.id === id);
  const down = downIds();
  const fanout = node?.queue?.delivery === 'fanout';
  // A queue that went back to buffering stops draining until its consumers are up again. A stream's live
  // consumers keep reading while others are down (K6).
  if (!fanout && bufferingQueueIds().has(id)) return;
  const liveIds = queueConsumers(app.doc, id).filter((c) => !down.has(c));
  let left: number;
  if (fanout) {
    const lags = fanoutDrain(state.lags ?? {}, liveIds);
    left = maxLag(lags);
    backlog.set(key(id), { ...state, lags, depth: left });
    // Only the consumers that are still down hold the rest of the lag.
    if (liveIds.every((c) => !lags[c])) {
      changed();
      if (left === 0) announceDrained(id, state);
      return;
    }
  } else {
    left = Math.max(0, state.depth - drainCount(liveIds.length, node?.queue));
    backlog.set(key(id), { ...state, depth: left });
  }
  if (left === 0) {
    const total = drainTotals.get(id) ?? state.depth;
    drainTotals.delete(id);
    announce(`${titleOf(id)} drained ${total} ${total === 1 ? 'message' : 'messages'}.`);
  } else {
    scheduleDrain(id);
  }
  changed();
}

function announceDrained(id: string, state: BacklogState): void {
  const total = drainTotals.get(id) ?? state.depth;
  drainTotals.delete(id);
  announce(`${titleOf(id)} drained ${total} ${total === 1 ? 'message' : 'messages'}.`);
}

function scheduleDrain(id: string): void {
  if (drainTimers.has(id)) return;
  drainTimers.set(id, setTimeout(() => drainTick(id), Math.round(BASE_DRAIN_MS / Math.max(0.25, speedProvider()))));
}

/** The failures changed: queues that are no longer buffering start to drain. */
function syncDrain(): void {
  const buffering = bufferingQueueIds();
  for (const [k, state] of backlog) {
    if (state.depth <= 0) continue;
    const id = k.split('\u0000').pop()!;
    const fanout = app.doc.nodes.find((n) => n.id === id)?.queue?.delivery === 'fanout';
    if (buffering.has(id) && !fanout) {
      // Back to buffering: stop the drain.
      const timer = drainTimers.get(id);
      if (timer) clearTimeout(timer);
      drainTimers.delete(id);
      continue;
    }
    if (!drainTotals.has(id)) drainTotals.set(id, state.depth);
    if (reducedMotion()) {
      backlog.set(k, { ...state, depth: 0 });
      drainTotals.delete(id);
      announce(`${titleOf(id)} drained ${state.depth} ${state.depth === 1 ? 'message' : 'messages'}.`);
      changed();
    } else {
      scheduleDrain(id);
    }
  }
}

let started = false;

/**
 * Hooks the backlog into the chaos run, page changes and the lens. Called once at start-up rather than on import,
 * because `chaos` and this module import each other through the renderer.
 */
export function initQueueBacklog(): void {
  if (started) return;
  started = true;
  onPageOpened(switchBacklogPage);
  onChaosChange(syncDrain);
  onChaosReset(clearBacklogs);
  // Leaving the Traffic lens ends the run, so the backlog goes with it.
  const workspace = document.getElementById('workspace');
  if (!workspace) return;
  new MutationObserver(() => {
    if (app.lens !== 'traffic') clearBacklogs();
  }).observe(workspace, { attributes: true, attributeFilter: ['data-mode', 'data-lens'] });
}

/**
 * Paints a queue's backlog onto its element: `data-backlog`, the message blocks, the count chip and the accessible
 * name. Called from every node paint, so it does nothing when the depth has not changed.
 */
export function paintBacklog(wrapper: HTMLElement, node: DiagramNode): void {
  if (node.kind !== 'queue') return;
  const depth = app.lens === 'traffic' ? backlogDepth(node.id) : 0;
  const max = node.queue?.maxDepth;
  const sig = `${depth}/${max ?? ''}`;
  const hit = wrapper.querySelector<HTMLElement>('.node-select-hit');
  let blocks = wrapper.querySelector<HTMLElement>(':scope > .queue-backlog');
  let chip = wrapper.querySelector<HTMLElement>(':scope > .queue-count');
  if (depth <= 0) {
    delete wrapper.dataset.backlog;
    blocks?.remove();
    chip?.remove();
    hit?.removeAttribute('aria-label');
    return;
  }
  wrapper.dataset.backlog = String(depth);
  hit?.setAttribute(
    'aria-label',
    node.queue?.delivery === 'fanout'
      ? `${node.title}, largest consumer lag ${depth}`
      : `${node.title}, ${depth} ${depth === 1 ? 'message' : 'messages'} waiting`,
  );
  if (!blocks) {
    blocks = document.createElement('span');
    blocks.className = 'queue-backlog';
    blocks.setAttribute('aria-hidden', 'true');
    wrapper.appendChild(blocks);
  }
  if (!chip) {
    chip = document.createElement('span');
    chip.className = 'queue-count';
    wrapper.appendChild(chip);
  }
  if (blocks.dataset.sig === sig) return;
  blocks.dataset.sig = sig;
  const shown = Math.min(depth, MAX_BLOCKS);
  blocks.replaceChildren(
    ...Array.from({ length: shown }, (_, i) => {
      const block = document.createElement('span');
      block.className = 'queue-msg';
      if (depth > MAX_BLOCKS && i === MAX_BLOCKS - 1) {
        block.dataset.more = '';
        block.textContent = `+${depth - (MAX_BLOCKS - 1)}`;
      }
      return block;
    }),
  );
  chip.textContent = node.queue?.delivery === 'fanout' ? `lag ${depth}` : max ? `${depth} / ${max}` : `${depth} waiting`;
  chip.dataset.level = max && depth >= max ? 'full' : max && depth >= max * 0.8 ? 'warn' : 'ok';
}

/** Queues whose dead-letter link shows because a message has just been sent down it (Traffic lens). */
const dlqFlash = new Set<string>();

function flashDlqLink(queueId: string): void {
  dlqFlash.add(queueId);
  setTimeout(() => {
    dlqFlash.delete(queueId);
    paintDlqLinks();
  }, 1500);
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * A thin dashed rose line from a queue to its dead-letter queue, shown while the queue is selected and while a
 * message is being dead-lettered. It is not a wire: it is not saved, not routed and not counted by insights.
 */
export function paintDlqLinks(): void {
  const layer = document.getElementById('dlq-links');
  if (!layer) return;
  const ids = new Set(dlqFlash);
  if (app.selection.type === 'node') ids.add(app.selection.id);
  const lines: SVGPathElement[] = [];
  for (const id of ids) {
    const queue = app.doc.nodes.find((n) => n.id === id);
    const dlq = queue?.queue?.deadLetterId ? app.doc.nodes.find((n) => n.id === queue.queue!.deadLetterId) : undefined;
    if (!queue || queue.kind !== 'queue' || !dlq || dlq.id === queue.id) continue;
    const [x1, y1] = getNodeCenter(queue);
    const [x2, y2] = getNodeCenter(dlq);
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('class', 'queue-dlq-link');
    path.setAttribute('d', `M ${x1} ${y1} L ${x2} ${y2}`);
    path.setAttribute('aria-hidden', 'true');
    lines.push(path);
  }
  layer.replaceChildren(...lines);
}
