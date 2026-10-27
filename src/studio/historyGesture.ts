/** Pure undo-grouping rules. One open gesture stores a single snapshot. */

export const NUDGE_COALESCE_MS = 600;

export interface HistoryGate {
  gestureDepth: number;
  capturedInGesture: boolean;
  coalesceUntil: number;
}

export function initialHistoryGate(): HistoryGate {
  return { gestureDepth: 0, capturedInGesture: false, coalesceUntil: 0 };
}

export type HistoryPush = { type: 'commit' } | { type: 'nudge'; now: number };

export function beginGesture(gate: HistoryGate): HistoryGate {
  return { ...gate, gestureDepth: gate.gestureDepth + 1 };
}

export function endGesture(gate: HistoryGate): HistoryGate {
  if (gate.gestureDepth === 0) return gate;
  const gestureDepth = gate.gestureDepth - 1;
  return {
    ...gate,
    gestureDepth,
    capturedInGesture: gestureDepth === 0 ? false : gate.capturedInGesture,
  };
}

/**
 * Decide whether this push stores a new undo snapshot.
 * An open gesture keeps the first snapshot only.
 * Arrow nudges inside `NUDGE_COALESCE_MS` share that snapshot.
 * A commit closes the nudge window so the next nudge starts a new step.
 */
export function resolveHistoryPush(
  gate: HistoryGate,
  push: HistoryPush,
): { capture: boolean; gate: HistoryGate } {
  if (gate.gestureDepth > 0) {
    if (gate.capturedInGesture) return { capture: false, gate };
    return {
      capture: true,
      gate: { ...gate, capturedInGesture: true, coalesceUntil: 0 },
    };
  }

  if (push.type === 'nudge' && push.now < gate.coalesceUntil) {
    return {
      capture: false,
      gate: { ...gate, coalesceUntil: push.now + NUDGE_COALESCE_MS },
    };
  }

  if (push.type === 'nudge') {
    return {
      capture: true,
      gate: { ...gate, coalesceUntil: push.now + NUDGE_COALESCE_MS },
    };
  }

  return { capture: true, gate: { ...gate, coalesceUntil: 0 } };
}
