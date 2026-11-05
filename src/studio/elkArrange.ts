/**
 * "Auto-Layout: Layered (ELK)" (D3). Loaded on first use, together with the ELK library it drives, so none of it is in
 * the entry bundle. The arranging is worked out first (it is async), then applied inside one undo step; the
 * components glide to their new places over 320 ms unless the person asked for reduced motion.
 */
import { applyElkPlan, planElkLayout } from '../core/elkLayout';
import type { LayoutDirection, LayoutSpacing } from '../core/layout';
import { wiresGroup } from './dom';
import { renderAll } from './render';
import { app, fitToViewport, mutateWithHistory, performUndo } from './state';
import { notify } from './toast';

const GLIDE_MS = 320;
let busy = false;

const reducedMotion = (): boolean => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

export async function arrangeWithElk(options: { direction?: LayoutDirection; spacing?: LayoutSpacing } = {}): Promise<void> {
  if (busy || app.doc.nodes.length === 0) return;
  busy = true;
  try {
    const plan = await planElkLayout(app.doc, options);
    if (!plan) {
      notify('Every component is locked, so there is nothing to arrange.');
      return;
    }
    const before = new Map(app.doc.nodes.map((n) => [n.id, { x: n.x, y: n.y }]));
    let moved = 0;
    const changed = mutateWithHistory(() => {
      moved = applyElkPlan(app.doc, plan);
      return moved > 0;
    });
    if (!changed) {
      notify('Already arranged this way.');
      return;
    }
    renderAll(true);
    fitToViewport();
    glide(before);
    notify(`Arranged ${moved} ${moved === 1 ? 'component' : 'components'} in layers.`, {
      action: { label: 'Undo', onClick: () => performUndo() },
    });
  } catch {
    notify('The layered layout could not be worked out. Nothing was changed.');
  } finally {
    busy = false;
  }
}

/** Slide each moved component from where it was, and bring the wires back in once they have settled. */
function glide(before: Map<string, { x: number; y: number }>): void {
  if (reducedMotion()) return;
  for (const n of app.doc.nodes) {
    const was = before.get(n.id);
    const el = document.getElementById('node-' + n.id);
    if (!was || !el || (was.x === n.x && was.y === n.y)) continue;
    el.animate(
      [{ transform: `translate(${was.x - n.x}px, ${was.y - n.y}px)` }, { transform: 'translate(0, 0)' }],
      { duration: GLIDE_MS, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)' },
    );
  }
  wiresGroup.animate([{ opacity: 0.15 }, { opacity: 1 }], { duration: GLIDE_MS, easing: 'ease-out' });
}
