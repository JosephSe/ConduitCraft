import { app, mutateWithHistory } from './state';
import { renderAll, requestInspectorRefresh } from './render';
import { notify } from './toast';
import {
  bringForward,
  bringToFront,
  canGroupSelection,
  groupSelection,
  sendBackward,
  sendToBack,
  toggleSelectionLock,
  ungroupSelection,
} from './zOrderLockGroup';

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

/** Lock or unlock the selection. Does nothing (and records no undo step) when there is nothing to lock. */
export function applyLockToggle(): void {
  let locked = false;
  const changed = mutateWithHistory(() => {
    locked = toggleSelectionLock(app.doc, app.selection);
  });
  if (!changed) {
    notify('Select a component to lock');
    return;
  }
  renderAll(true);
  requestInspectorRefresh();
  notify(locked ? 'Locked selection' : 'Unlocked selection');
}

/** Group the selected components; needs a multi-selection of two or more. */
export function applyGroup(): void {
  if (!canGroupSelection(app.selection)) {
    notify('Select 2 or more components to group');
    return;
  }
  const changed = mutateWithHistory(() => groupSelection(app.doc, app.selection) !== null);
  if (!changed) return;
  renderAll(true);
  requestInspectorRefresh();
  notify('Grouped components');
}

/** Ungroup the selection. Records an undo step only if a group was actually dissolved. */
export function applyUngroup(): void {
  const changed = mutateWithHistory(() => ungroupSelection(app.doc, app.selection));
  if (!changed) {
    notify('No group to ungroup');
    return;
  }
  renderAll(true);
  requestInspectorRefresh();
  notify('Ungrouped components');
}
