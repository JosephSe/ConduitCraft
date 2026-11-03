/**
 * The failure summary (F-01): "2 failed · 5 unreachable · 1 rerouted", a list of what is affected where a click
 * pans to the component, and a button to restore everything. Shown in the Traffic lens while anything has failed.
 */
import { app, panToNodeIfNeeded, setSelection } from './state';
import { repaintForLens, chaosResult, chaosSummary, clearFailures, onChaosChange, summaryText } from './chaos';

const LABELS = { failed: 'Failed', degraded: 'Degraded', unreachable: 'Unreachable', rerouted: 'Rerouted', 'at-risk': 'Potential disruption' } as const;

export function initChaosPanel(): void {
  const panel = document.getElementById('chaos-panel');
  const summary = document.getElementById('chaos-summary') as HTMLButtonElement | null;
  const reset = document.getElementById('chaos-reset');
  const list = document.getElementById('chaos-list');
  const workspace = document.getElementById('workspace');
  if (!panel || !summary || !reset || !list || !workspace) return;

  const repaint = () => {
    const counts = chaosSummary();
    const visible = Boolean(counts) && app.lens === 'traffic' && document.documentElement.dataset.ui === '2';
    panel.hidden = !visible;
    if (!counts || !visible) {
      list.hidden = true;
      summary.setAttribute('aria-expanded', 'false');
      return;
    }
    summary.textContent = summaryText(counts);
    if (list.hidden) return;
    const result = chaosResult()!;
    list.replaceChildren();
    for (const status of ['failed', 'degraded', 'unreachable', 'rerouted', 'at-risk'] as const) {
      for (const id of status === 'at-risk' ? result.atRisk : result[status]) {
        const node = app.doc.nodes.find((n) => n.id === id);
        const item = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'chaos-item';
        button.dataset.status = status;
        button.dataset.node = id;
        button.textContent = `${node?.title || id} · ${LABELS[status]}`;
        item.appendChild(button);
        list.appendChild(item);
      }
    }
  };

  summary.addEventListener('click', () => {
    list.hidden = !list.hidden;
    summary.setAttribute('aria-expanded', String(!list.hidden));
    repaint();
  });
  list.addEventListener('click', (e) => {
    const id = (e.target as HTMLElement).closest<HTMLElement>('.chaos-item')?.dataset.node;
    const node = id ? app.doc.nodes.find((n) => n.id === id) : undefined;
    if (!node) return;
    setSelection({ type: 'node', id: node.id });
    panToNodeIfNeeded(node);
  });
  reset.addEventListener('click', clearFailures);

  onChaosChange(repaint);
  new MutationObserver(() => {
    repaintForLens();
    repaint();
  }).observe(workspace, { attributes: true, attributeFilter: ['data-mode'] });
}
