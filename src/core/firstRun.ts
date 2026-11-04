/**
 * First run (R-08): what a brand-new visitor sees. Pure and DOM-free so the rules are unit tested; the studio
 * wires them up in `studio/firstRun.ts`.
 */
import type { DiagramDocument } from '../types';
import { entryPointIds, reachableFrom } from './reachability';

/** The example that plays on first run. */
export const FIRST_RUN_TEMPLATE_ID = 'lumen-relay';

/** Set once someone has picked a card or started working, so first run never comes back for them. */
export const FIRST_RUN_SEEN_KEY = 'conduitcraft-first-run-seen';

export interface FirstRunFacts {
  /** Any autosave or recovery copy exists in this browser. */
  hasSavedWork: boolean;
  /** The URL carries a share link. */
  hasShareLink: boolean;
  /** The visitor already picked a card or opened something here before. */
  seenBefore: boolean;
  /** The open document has nothing in it. */
  documentEmpty: boolean;
}

/** First run shows only for a visitor with nothing of their own to come back to. It must never replace work. */
export function shouldShowFirstRun(f: FirstRunFacts): boolean {
  return f.documentEmpty && !f.hasSavedWork && !f.hasShareLink && !f.seenBefore;
}

/**
 * The component to fail once the first loop has played: the single-instance, non-entry component whose failure
 * cuts off the most others. Ties go to the one listed first. Null when no failure would cut anything off.
 */
export function pickFirstRunFailure(doc: DiagramDocument): string | null {
  const entries = new Set(entryPointIds(doc));
  let best: string | null = null;
  let bestCut = 0;
  for (const node of doc.nodes) {
    if (entries.has(node.id) || (node.resilience?.replicas ?? 1) > 1 || node.resilience?.fallbackId) continue;
    const cut = reachableFrom(doc, [...entries], [node.id]).unreachable.length;
    if (cut > bestCut) {
      best = node.id;
      bestCut = cut;
    }
  }
  return best;
}
