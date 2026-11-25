/** Element-scoped View Transitions (`scoped-component-transitions`) for the properties panel. Kept out of the panel's lazy chunk. */
import { inspectorScope } from './dom';

const supportsScopedVT = typeof Element !== 'undefined' && 'startViewTransition' in Element.prototype;

export function withInspectorTransition(updateFn: () => void): void {
  if (!supportsScopedVT) {
    updateFn();
    return;
  }
  const vt = (
    inspectorScope as unknown as {
      startViewTransition: (cb: () => void) => { ready: Promise<void> };
    }
  ).startViewTransition(updateFn);
  vt.ready.catch(() => {});
}
