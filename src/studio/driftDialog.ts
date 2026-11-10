/**
 * The drift check dialog (E5), opened from the command palette ("Check for Drift"). Pick the file the diagram was
 * imported from; the differences are listed (added green, removed red, changed amber) and each can be accepted or
 * ignored. Accepting is one undo step. While the dialog is open, components that changed or are gone from the file
 * are outlined on the canvas in the same colours. Built on first use, with its own stylesheet, so it costs the entry
 * bundle nothing.
 */
import { applyDrift, computeDrift, DRIFT_KINDS, type DriftItem, type DriftReport } from '../core/drift';
import { convertForDrift } from '../importers/driftSource';
import type { DiagramDocument } from '../types';
import { app, mutateWithHistory } from './state';
import { renderAll } from './render';
import { notify } from './toast';

const KIND_NAMES: Record<string, string> = {
  'docker-compose': 'Docker Compose',
  kubernetes: 'Kubernetes',
  openapi: 'OpenAPI',
  asyncapi: 'AsyncAPI',
};
const TYPE_WORDS = { added: 'In the file only', removed: 'Gone from the file', changed: 'Changed' } as const;

let dialog: HTMLDialogElement | null = null;
let styles: Promise<unknown> | null = null;

function build(): HTMLDialogElement {
  const dlg = document.createElement('dialog');
  dlg.id = 'drift-dialog';
  dlg.className = 'drift-dialog';
  dlg.setAttribute('closedby', 'any');
  dlg.setAttribute('aria-labelledby', 'drift-title');
  dlg.innerHTML = `
    <div class="dialog-shell">
      <div class="dialog-header">
        <h2 id="drift-title">Check for drift</h2>
        <form method="dialog"><button type="submit" class="btn">Close</button></form>
      </div>
      <div class="dialog-body drift-body">
        <p class="field-tip">Pick the newer copy of the file this diagram was imported from (${DRIFT_KINDS.map((k) => KIND_NAMES[k]).join(', ')}). The file is read in your browser and goes nowhere.</p>
        <label class="field-label" for="drift-file">Source file</label>
        <input id="drift-file" class="field" type="file" accept=".yml,.yaml,.json" />
        <p class="field-tip" id="drift-status" role="status" aria-live="polite"></p>
        <ul class="drift-list" id="drift-list" aria-label="Differences"></ul>
        <div class="drift-actions">
          <button type="button" class="btn solid" id="drift-accept-all" disabled>Accept all</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(dlg);
  wire(dlg);
  return dlg;
}

/** Outline the components the report says changed or are gone, and clear the outline from the rest. */
function markCanvas(report: DriftReport | null): void {
  document.querySelectorAll('.arch-node[data-drift]').forEach((el) => el.removeAttribute('data-drift'));
  if (!report) return;
  for (const item of report.items) {
    if (item.subject !== 'component' || item.type === 'added' || !item.targetId) continue;
    document.querySelector(`.arch-node[data-node-id="${CSS.escape(item.targetId)}"]`)?.setAttribute('data-drift', item.type);
  }
}

function wire(dlg: HTMLDialogElement): void {
  const q = <T extends HTMLElement>(sel: string) => dlg.querySelector(sel) as T;
  const input = q<HTMLInputElement>('#drift-file');
  const status = q<HTMLElement>('#drift-status');
  const list = q<HTMLUListElement>('#drift-list');
  const acceptAll = q<HTMLButtonElement>('#drift-accept-all');
  let source: { kind: string; doc: DiagramDocument } | null = null;
  let report: DriftReport | null = null;
  const ignored = new Set<string>();

  const visible = (): DriftItem[] => (report?.items ?? []).filter((i) => !ignored.has(i.id));

  const refresh = () => {
    report = source ? computeDrift(app.doc, source.doc, source.kind) : null;
    markCanvas(report);
    const items = visible();
    list.replaceChildren();
    acceptAll.disabled = items.length === 0;
    if (!source || !report) return;
    const name = KIND_NAMES[source.kind] ?? source.kind;
    status.textContent =
      report.tracked === 0
        ? `Nothing on this canvas was imported from a ${name} file, so there is nothing to compare. (Components keep track of where they came from; ones you drew by hand do not.)`
        : items.length === 0
          ? ignored.size > 0
            ? `Nothing left to decide. ${ignored.size} ${ignored.size === 1 ? 'difference was' : 'differences were'} ignored.`
            : `No drift. The diagram still matches this ${name} file.`
          : `${items.length} ${items.length === 1 ? 'difference' : 'differences'} between the diagram and this ${name} file.`;
    for (const item of items) {
      const li = document.createElement('li');
      li.className = 'drift-row';
      li.dataset.type = item.type;
      const badge = document.createElement('span');
      badge.className = 'drift-badge';
      badge.textContent = TYPE_WORDS[item.type];
      const text = document.createElement('span');
      text.className = 'drift-text';
      const title = document.createElement('strong');
      title.textContent = `${item.subject === 'wire' ? 'Wire: ' : ''}${item.title}`;
      const detail = document.createElement('span');
      detail.textContent = item.detail;
      text.append(title, detail);
      const accept = document.createElement('button');
      accept.type = 'button';
      accept.className = 'btn btn-compact';
      accept.textContent = 'Accept';
      accept.setAttribute('aria-label', `Accept: ${item.title}. ${item.detail}`);
      accept.addEventListener('click', () => apply([item]));
      const ignore = document.createElement('button');
      ignore.type = 'button';
      ignore.className = 'btn btn-compact';
      ignore.textContent = 'Ignore';
      ignore.setAttribute('aria-label', `Ignore: ${item.title}`);
      ignore.addEventListener('click', () => {
        ignored.add(item.id);
        refresh();
      });
      li.append(badge, text, accept, ignore);
      list.appendChild(li);
    }
  };

  const apply = (items: DriftItem[]) => {
    if (!source || items.length === 0) return;
    const { kind, doc } = source;
    let count = 0;
    const changed = mutateWithHistory(() => {
      count = applyDrift(app.doc, doc, kind, items);
      return count > 0;
    });
    if (changed) {
      renderAll(true);
      notify(`Accepted ${count} ${count === 1 ? 'difference' : 'differences'}. Undo puts them back.`);
    }
    refresh();
  };

  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    source = null;
    ignored.clear();
    if (!file) return refresh();
    try {
      source = convertForDrift(file.name, await file.text());
    } catch (err) {
      status.textContent = err instanceof Error ? err.message : 'That file could not be read.';
    }
    refresh();
    if (!source) {
      list.replaceChildren();
      acceptAll.disabled = true;
    }
  });
  acceptAll.addEventListener('click', () => apply(visible()));
  dlg.addEventListener('close', () => markCanvas(null));
}

export async function openDriftCheck(): Promise<void> {
  styles ??= import('../styles/drift.css').catch(() => undefined);
  await styles;
  dialog ??= build();
  dialog.showModal();
}
