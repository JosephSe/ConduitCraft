/**
 * The dock's other two faces (6.4). The Design face is dock.ts; the Traffic face is the run bar
 * (runBar.ts) plus "Fail a component" here; the Review face steps through the issues the Review panel lists. This
 * module shows the face the lens asks for, arms the fail action, and drives the Review face.
 */
import { insightRule, mutedRules } from '../core/insights';
import { announce } from './a11y';
import { chaosLensActive, toggleFailure } from './chaos';
import { notify } from './toast';
import { onInsightsChange, orderedInsights, selectIssue, toggleMute } from './insights';
import { renderAll } from './render';
import { app, onSelectionChange, pushHistory } from './state';

type Issue = ReturnType<typeof orderedInsights>[number];

const keyOf = (issue: Issue): string => `${issue.path.join('/')}:${issue.code}:${issue.target.id}`;

/** A fix an issue can offer: its label, and what it does to the document. Only fixes with one obvious answer are here. */
function fixesFor(issue: Issue): Array<{ label: string; apply: () => void }> {
  const node = issue.target.type === 'node' ? app.doc.nodes.find((n) => n.id === issue.target.id) : undefined;
  if (issue.code === 'spof' && node) {
    return [
      {
        label: 'Add a standby',
        apply: () => {
          node.resilience = { ...node.resilience, replicas: Math.max(2, (node.resilience?.replicas ?? 1) + 1) };
        },
      },
    ];
  }
  return [];
}

export function initDockFaces(): void {
  const workspace = document.getElementById('workspace');
  const dock = document.getElementById('dock');
  const faces = Array.from(document.querySelectorAll<HTMLElement>('#dock [data-face]'));
  const failBtn = document.getElementById('run-bar-fail');
  const prev = document.getElementById('review-prev');
  const next = document.getElementById('review-next');
  const count = document.getElementById('review-count');
  const sentence = document.getElementById('review-sentence');
  const fixes = document.getElementById('review-fixes');
  const ignore = document.getElementById('review-ignore') as HTMLButtonElement | null;
  if (!workspace || !dock || !failBtn || !prev || !next || !count || !sentence || !fixes || !ignore) return;

  const setHiddenFaces = () => {
    for (const face of faces) {
      face.hidden = face.dataset.face !== app.lens;
    }
  };

  // Fail a component: with a component selected it fails that one; otherwise the next component picked fails.
  let armed = false;
  const setArmed = (on: boolean) => {
    armed = on;
    failBtn.setAttribute('aria-pressed', String(on));
    if (on) workspace.dataset.failArmed = '';
    else delete workspace.dataset.failArmed;
  };
  failBtn.addEventListener('click', () => {
    if (armed) return setArmed(false);
    const sel = app.selection;
    if (sel.type === 'node') {
      toggleFailure(sel.id);
      return;
    }
    setArmed(true);
    notify('Click the component to fail');
  });
  onSelectionChange(({ selection }) => {
    if (!armed) return;
    if (selection.type === 'node' && chaosLensActive()) toggleFailure(selection.id);
    if (selection.type !== 'none') setArmed(false);
  });
  document.addEventListener('keydown', (e) => {
    if (armed && e.key === 'Escape') setArmed(false);
  });

  // Review face: one issue at a time, in the order the panel lists them.
  let at = '';
  const current = (): { list: Issue[]; index: number } => {
    const list = orderedInsights();
    const found = list.findIndex((i) => keyOf(i) === at);
    return { list, index: found };
  };
  const paintReview = () => {
    const { list, index } = current();
    const hasAny = list.length > 0;
    prev.toggleAttribute('disabled', !hasAny);
    next.toggleAttribute('disabled', !hasAny);
    fixes.replaceChildren();
    if (!hasAny) {
      count.textContent = 'No issues';
      sentence.textContent = 'Nothing to flag. The rules found no problems.';
      sentence.title = '';
      ignore.hidden = true;
      return;
    }
    const shown = index < 0 ? 0 : index;
    const issue = list[shown];
    at = keyOf(issue);
    count.textContent = `${shown + 1} of ${list.length}`;
    sentence.textContent = issue.trail.length ? `${issue.trail.join(' ▸ ')}: ${issue.message}` : issue.message;
    sentence.title = sentence.textContent;
    ignore.hidden = false;
    ignore.dataset.rule = issue.code;
    ignore.setAttribute('aria-label', `Ignore this rule: ${insightRule(issue.code)?.title ?? issue.code}`);
    for (const fix of fixesFor(issue)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn-compact review-fix';
      button.textContent = fix.label;
      button.addEventListener('click', () => {
        pushHistory();
        fix.apply();
        renderAll(false);
        announce(`${fix.label}: done.`);
      });
      fixes.appendChild(button);
    }
  };
  const step = (by: 1 | -1) => {
    const { list, index } = current();
    if (!list.length) return;
    const to = list[(Math.max(0, index) + by + list.length) % list.length];
    at = keyOf(to);
    selectIssue(to);
    paintReview();
  };
  prev.addEventListener('click', () => step(-1));
  next.addEventListener('click', () => step(1));
  ignore.addEventListener('click', () => {
    const code = ignore.dataset.rule;
    if (code && !mutedRules(app.doc).has(code)) toggleMute(code);
  });

  let lastLens = app.lens;
  let morphTimer = 0;
  let morphEnd: ((e: TransitionEvent) => void) | null = null;
  const clearMorph = () => {
    if (morphTimer) {
      clearTimeout(morphTimer);
      morphTimer = 0;
    }
    if (morphEnd) {
      dock.removeEventListener('transitionend', morphEnd);
      morphEnd = null;
    }
    dock.style.transition = '';
    dock.style.width = '';
  };

  const applyLensFace = (animate: boolean) => {
    const lensChanged = app.lens !== lastLens;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const shouldMorph = animate && lensChanged && !reduceMotion && dock.offsetWidth > 0;
    lastLens = app.lens;

    if (!shouldMorph) {
      clearMorph();
      setHiddenFaces();
      if (app.lens === 'review') paintReview();
      return;
    }

    clearMorph();
    const fromW = dock.getBoundingClientRect().width;
    setHiddenFaces();
    if (app.lens === 'review') paintReview();
    dock.style.transition = 'none';
    dock.style.width = 'auto';
    const toW = dock.getBoundingClientRect().width;
    if (morphEnd || morphTimer) clearMorph();
    if (morphEnd === null && morphTimer === 0 && Math.abs(toW - fromW) < 1) {
      dock.style.transition = '';
      dock.style.width = '';
      return;
    }
    dock.style.width = `${fromW}px`;
    void dock.offsetWidth;
    dock.style.transition = '';
    dock.style.width = `${toW}px`;

    const finish = () => clearMorph();
    morphEnd = (e: TransitionEvent) => {
      if (e.target === dock && e.propertyName === 'width') finish();
    };
    dock.addEventListener('transitionend', morphEnd);
    morphTimer = window.setTimeout(finish, 420);
  };

  onInsightsChange(() => {
    setHiddenFaces();
    if (app.lens === 'review') paintReview();
  });
  new MutationObserver(() => {
    if (app.lens !== 'traffic') setArmed(false);
    applyLensFace(true);
  }).observe(workspace, { attributes: true, attributeFilter: ['data-lens'] });
  applyLensFace(false);
}
