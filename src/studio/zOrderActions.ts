import { app, mutateWithHistory } from './state';
import { renderAll } from './render';
import { notify } from './toast';
import { bringForward, bringToFront, sendBackward, sendToBack } from './zOrderLockGroup';

export type ZOrderAction = 'front' | 'back' | 'forward' | 'backward';

const ACTIONS = {
  front: { op: bringToFront, done: 'Brought to front', noop: 'Already at the front' },
  back: { op: sendToBack, done: 'Sent to back', noop: 'Already at the back' },
  forward: { op: bringForward, done: 'Brought forward', noop: 'Already at the front' },
  backward: { op: sendBackward, done: 'Sent backward', noop: 'Already at the back' },
} as const;

/** Reorder the selection. Records an undo step and shows "done" only if the order really changed. */
export function applyZOrder(action: ZOrderAction): void {
  const { op, done, noop } = ACTIONS[action];
  const changed = mutateWithHistory(() => op(app.doc, app.selection));
  if (!changed) {
    notify(noop);
    return;
  }
  renderAll(true);
  notify(done);
}
