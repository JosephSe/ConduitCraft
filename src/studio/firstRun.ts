/**
 * First run (R-08): a brand-new visitor sees the example system working instead of an empty canvas. `lumen-relay`
 * opens in the Traffic lens with its first scenario playing; after one loop a single-path component fails so the
 * ripple shows. It never replaces work: see `shouldShowFirstRun`.
 */
import type { DiagramDocument } from '../types';
import { FIRST_RUN_SEEN_KEY, FIRST_RUN_TEMPLATE_ID, pickFirstRunFailure, shouldShowFirstRun } from '../core/firstRun';
import { parseBlueprintJson } from '../exporter/blueprintJson';
import { announce } from './a11y';
import { setFailures } from './chaos';
import { app, AUTOSAVE_KEY, RECOVERY_KEY, onHistoryCommit, setSelection } from './state';
import { onPlaybackChange, simulationPlayback } from './simulationPlayback';
import { getStarterTemplateById, loadTemplateRaw } from './templatesGallery';
import { renderAll } from './render';

export interface FirstRunDeps {
  createBlank: () => void;
  openTemplateGallery: () => void;
  openCodeDialog: () => void;
  runScenario: (id: string) => void;
  fitToViewport: () => void;
}

function storageHas(key: string): boolean {
  try {
    return localStorage.getItem(key) !== null;
  } catch {
    return false;
  }
}

function markSeen(): void {
  try {
    localStorage.setItem(FIRST_RUN_SEEN_KEY, '1');
  } catch {
    // Storage unavailable: first run may show again next visit, which is harmless.
  }
}

const reducedMotion = (): boolean => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

function isEmpty(doc: DiagramDocument): boolean {
  return doc.nodes.length === 0 && doc.zones.length === 0 && doc.notesCards.length === 0;
}

function switchToTraffic(): void {
  document.querySelector<HTMLInputElement>('input[name="workspace-mode"][value="data"]')?.click();
}

/** Show first run if this visitor qualifies. Call once at boot, after the share link and autosave checks. */
export function startFirstRunIfNew(deps: FirstRunDeps): void {
  const card = document.getElementById('first-run');
  if (!card) return;
  const facts = {
    redesign: document.documentElement.dataset.ui === '2',
    hasSavedWork: storageHas(AUTOSAVE_KEY) || storageHas(RECOVERY_KEY) || storageHas('blueprint-studio-autosave-v1'),
    hasShareLink: window.location.hash.length > 1,
    seenBefore: storageHas(FIRST_RUN_SEEN_KEY),
    documentEmpty: isEmpty(app.doc),
  };
  if (!shouldShowFirstRun(facts)) return;
  const template = getStarterTemplateById(FIRST_RUN_TEMPLATE_ID);
  if (!template) return;

  void (async () => {
    let doc: DiagramDocument;
    try {
      const parsed = parseBlueprintJson(await loadTemplateRaw(template));
      if (!parsed.ok) return;
      doc = parsed.doc;
    } catch {
      return; // Offline with the example not cached: the plain empty canvas is still usable.
    }
    // Someone got there first (a share link, a file, an edit) while the example loaded.
    if (!isEmpty(app.doc) || window.location.hash.length > 1) return;

    let active = true;
    const end = (): void => {
      if (!active) return;
      active = false;
      card.hidden = true;
      markSeen();
    };

    // Assigned directly, with no history step, so the example is never autosaved as the visitor's own work.
    app.doc = doc;
    setSelection({ type: 'none' });
    renderAll(true);
    requestAnimationFrame(deps.fitToViewport);
    switchToTraffic();
    card.hidden = false;

    const scenario = doc.simulations[0];
    const failId = pickFirstRunFailure(doc);
    const failTitle = doc.nodes.find((n) => n.id === failId)?.title ?? failId;

    if (reducedMotion()) {
      // Nothing moves: show the failed state at once. The summary is in the failure panel.
      if (failId) {
        setFailures([failId]);
        announce(`${failTitle} has failed. Components behind it are unreachable.`);
      }
    } else if (scenario) {
      simulationPlayback.setLoop(true);
      deps.runScenario(scenario.id);
      let sawLast = false;
      onPlaybackChange((state) => {
        if (!active || state.scenario?.id !== scenario.id) return;
        if (state.currentStepIndex === state.totalSteps - 1) sawLast = true;
        else if (sawLast && state.currentStepIndex === 0 && state.isPlaying && failId) {
          sawLast = false;
          setFailures([failId]);
        }
      });
    }

    // Any real edit, load or template means the visitor has taken over.
    onHistoryCommit(end);
    const pick = (action: () => void) => () => {
      end();
      action();
    };
    document.getElementById('first-run-blank')?.addEventListener(
      'click',
      pick(() => {
        deps.createBlank();
        document.querySelector<HTMLInputElement>('input[name="workspace-mode"][value="design"]')?.click();
      }),
    );
    document.getElementById('first-run-template')?.addEventListener('click', pick(deps.openTemplateGallery));
    document.getElementById('first-run-mermaid')?.addEventListener('click', pick(deps.openCodeDialog));
  })();
}
