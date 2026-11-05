/**
 * Architecture insights in the studio (F-02). The rules live in `core/insights.ts`; this module caches their result,
 * keeps the count in the Review lens button, paints the list of issues and handles mute and click-to-select.
 * Recomputing waits 300 ms after the last change, and the canvas badges show in the Review lens only.
 */
import {
  INSIGHT_RULES,
  insightCountText,
  insightRule,
  mutedRules,
  runInsightsAllLevels,
  type LevelInsightIssue as InsightIssue,
} from '../core/insights';
import { announce } from './a11y';
import { app, goToLevel, openPageDocument, panToNodeIfNeeded, pushHistory, setSelection } from './state';
import { renderAll } from './render';

const DEBOUNCE_MS = 300;

let cached: InsightIssue[] | undefined;
let timer: number | undefined;
let paintedKey = '';
const listeners = new Set<() => void>();

/** Every issue for the current document, ignoring mutes. Recomputed lazily after a change. */
function allIssues(): InsightIssue[] {
  cached ??= runInsightsAllLevels(openPageDocument());
  return cached;
}

/** Issues for rules that are not muted. */
export function currentInsights(): InsightIssue[] {
  const muted = mutedRules(app.doc);
  return allIssues().filter((issue) => !muted.has(issue.code));
}

/** Visible issues aimed at one component or wire, most severe first. */
export function insightsFor(type: 'node' | 'edge', id: string): InsightIssue[] {
  if (app.lens !== 'review') return [];
  const here = app.levelPath.join('/');
  return currentInsights().filter(
    (issue) => issue.path.join('/') === here && issue.target.type === type && issue.target.id === id,
  );
}

const LEVEL_RANK = { error: 0, warning: 1, info: 2 } as const;

/** The most severe level among issues, for the badge colour. */
export function worstLevel(issues: readonly InsightIssue[]): InsightIssue['level'] | null {
  return issues.reduce<InsightIssue['level'] | null>(
    (worst, i) => (worst === null || LEVEL_RANK[i.level] < LEVEL_RANK[worst] ? i.level : worst),
    null,
  );
}

export function onInsightsChange(listener: () => void): void {
  listeners.add(listener);
}

function keyOf(issues: readonly InsightIssue[]): string {
  return issues.map((i) => `${i.path.join('/')}:${i.code}:${i.target.id}`).join('|');
}

/** Call from every render: the cached result is dropped now, and the count and list catch up after 300 ms. */
export function invalidateInsights(): void {
  cached = undefined;
  window.clearTimeout(timer);
  timer = window.setTimeout(refreshInsights, DEBOUNCE_MS);
}

function refreshInsights(): void {
  const key = keyOf(currentInsights());
  const changed = key !== paintedKey;
  paintedKey = key;
  for (const listener of listeners) listener();
  // Badges are painted with the components, so a changed result repaints them while the Review lens is open.
  if (changed && app.lens === 'review') renderAll(false);
}

/** Show the new lens's state at once instead of waiting for the debounce. */
export function repaintInsightsForLens(): void {
  window.clearTimeout(timer);
  paintedKey = keyOf(currentInsights());
  for (const listener of listeners) listener();
  renderAll(false);
}

function toggleMute(code: string): void {
  pushHistory();
  const muted = mutedRules(app.doc);
  if (!muted.delete(code)) muted.add(code);
  if (muted.size) app.doc.insights = { muted: [...muted] };
  else delete app.doc.insights;
  renderAll(false);
  refreshInsights();
  announce(`${insightRule(code)?.title ?? code} ${muted.has(code) ? 'muted' : 'shown again'}.`);
}

function select(issue: InsightIssue): void {
  if (issue.path.join('/') !== app.levelPath.join('/') && !goToLevel(issue.path)) return;
  if (issue.target.type === 'node') {
    const node = app.doc.nodes.find((n) => n.id === issue.target.id);
    if (!node) return;
    setSelection({ type: 'node', id: node.id });
    panToNodeIfNeeded(node);
    return;
  }
  const edge = app.doc.edges.find((e) => e.id === issue.target.id);
  if (!edge) return;
  setSelection({ type: 'edge', id: edge.id });
  // A wire has no box of its own, so bring its source component into view.
  const from = app.doc.nodes.find((n) => n.id === edge.from);
  if (from) panToNodeIfNeeded(from);
}

export function initInsightsPanel(): void {
  const panel = document.getElementById('insights-panel');
  const heading = document.getElementById('insights-heading');
  const body = document.getElementById('insights-body');
  const count = document.getElementById('insight-count');
  const workspace = document.getElementById('workspace');
  if (!panel || !heading || !body || !count || !workspace) return;

  const repaint = () => {
    const issues = currentInsights();
    count.hidden = !issues.length;
    count.textContent = `⚠ ${issues.length}`;
    count.setAttribute('aria-label', insightCountText(issues.length));
    const visible = app.lens === 'review';
    panel.hidden = !visible;
    if (!visible) return;

    heading.textContent = insightCountText(issues.length);
    const muted = mutedRules(app.doc);
    const frag = document.createDocumentFragment();
    for (const rule of INSIGHT_RULES) {
      const found = issues.filter((i) => i.code === rule.code);
      const isMuted = muted.has(rule.code);
      if (!found.length && !isMuted) continue;
      const section = document.createElement('section');
      section.className = 'insight-group';
      section.dataset.rule = rule.code;
      section.dataset.level = rule.level;
      const head = document.createElement('div');
      head.className = 'insight-group-head';
      const title = document.createElement('h3');
      title.textContent = isMuted ? `${rule.title} (muted)` : `${rule.title} · ${found.length}`;
      const mute = document.createElement('button');
      mute.type = 'button';
      mute.className = 'btn btn-compact insight-mute';
      mute.dataset.rule = rule.code;
      const verb = isMuted ? 'Show' : 'Mute';
      const svg = (paths: string) =>
        `<svg class="ui-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
      // Bell with a slash to mute; an eye to show a muted rule again.
      mute.innerHTML = isMuted
        ? svg('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>')
        : svg('<path d="M8.7 3A6 6 0 0 1 18 8c0 2.2.4 3.9.9 5.1M6.3 6.3A6 6 0 0 0 6 8c0 7-3 9-3 9h14M10.3 21a1.94 1.94 0 0 0 3.4 0M2 2l20 20"/>');
      mute.setAttribute('aria-label', `${verb} ${rule.title}`);
      mute.setAttribute('data-tip', `${verb} this rule`);
      head.append(title, mute);
      section.appendChild(head);
      if (!isMuted) {
        const list = document.createElement('ul');
        list.className = 'insight-list';
        found.forEach((issue) => {
          const item = document.createElement('li');
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'insight-item';
          button.dataset.level = issue.level;
          button.dataset.target = issue.target.id;
          button.dataset.type = issue.target.type;
          button.textContent = issue.trail.length ? `${issue.trail.join(' ▸ ')}: ${issue.message}` : issue.message;
          button.addEventListener('click', () => select(issue));
          item.appendChild(button);
          list.appendChild(item);
        });
        section.appendChild(list);
      }
      frag.appendChild(section);
    }
    if (!frag.childNodes.length) {
      const empty = document.createElement('p');
      empty.className = 'insight-empty';
      empty.textContent = 'Nothing to flag. The rules found no problems in this diagram.';
      frag.appendChild(empty);
    }
    body.replaceChildren(frag);
  };

  body.addEventListener('click', (e) => {
    const code = (e.target as HTMLElement).closest<HTMLElement>('.insight-mute')?.dataset.rule;
    if (code) toggleMute(code);
  });

  onInsightsChange(repaint);
  new MutationObserver(() => {
    repaintInsightsForLens();
  }).observe(workspace, { attributes: true, attributeFilter: ['data-lens'] });
  refreshInsights();
}
