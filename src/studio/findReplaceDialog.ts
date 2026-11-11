/**
 * The Find and replace dialog (F-29, Cmd/Ctrl+Shift+F). Searches titles, subtitles, wire labels, notes, swimlanes
 * and comments in this level or every level; shows the matches; replaces all of them (one undo step), replaces
 * one, jumps to one, or hands them to multi-select. Built on first use, so it costs the entry bundle nothing.
 */
import {
  collectLevels,
  findMatches,
  idsInLevel,
  replaceAll,
  type FindLevel,
  type FindMatch,
  type FindOptions,
} from '../core/findReplace';
import { app, fitSelection, goToLevel, goToPage, openPageDocument, mutateWithHistory, setSelection } from './state';
import { renderAll } from './render';
import { notify } from './toast';
import { allLevelNodes } from '../core/levels';
import type { DiagramDocument } from '../types';
import { contentOfPage, pageCount, pageList } from '../core/pages';

const MAX_ROWS = 200;
let dialog: HTMLDialogElement | null = null;

type Scope = 'level' | 'all' | 'pages';

/** The file that holds every page's content: the open page's own copy of it is stale while it is being edited. */
const pageHost = () => app.pageRoot ?? app.levelRoot ?? app.doc;

function levelsFor(scope: Scope): FindLevel[] {
  const open: FindLevel = { path: app.levelPath, content: app.doc };
  if (scope !== 'pages' || pageCount(pageHost()) < 2) return collectLevels(app.levelRoot ?? app.doc, open, scope === 'pages' ? 'all' : scope);
  // Every page: the open page through its live copy, the others straight from the file (D10).
  return pageList(pageHost()).flatMap((page) => {
    const content = page.index === app.pageIndex ? (app.levelRoot ?? app.doc) : contentOfPage(pageHost(), page.index);
    if (!content) return [];
    const here: FindLevel = page.index === app.pageIndex ? open : { path: ['\u0000'], content };
    return collectLevels(content, here, 'all').map((level) => ({ ...level, page: page.index }));
  });
}

const onOpenPage = (m: Pick<FindMatch, 'page'>) => m.page === undefined || m.page === app.pageIndex;

/** "Orders › Payments" for a level path, from the component titles along it. */
function whereLabel(path: string[], page?: number): string {
  const onThisPage = page === undefined || page === app.pageIndex;
  const content = onThisPage ? openPageDocument() : (contentOfPage(pageHost(), page) as DiagramDocument | null);
  const titles = new Map(content ? allLevelNodes(content).map((e) => [e.node.id, e.node.title]) : []);
  const levels = path.length === 0 ? 'Top level' : path.map((id) => titles.get(id) || id).join(' › ');
  return page === undefined || pageCount(pageHost()) < 2 ? levels : `${pageList(pageHost())[page]?.title ?? ''} · ${levels}`;
}

function snippet(text: string, query: string): string {
  const flat = text.replace(/\s+/g, ' ');
  const at = flat.toLowerCase().indexOf(query.toLowerCase());
  if (flat.length <= 60 || at < 0) return flat.slice(0, 80);
  const start = Math.max(0, at - 20);
  return `${start > 0 ? '…' : ''}${flat.slice(start, start + 70)}${start + 70 < flat.length ? '…' : ''}`;
}

function build(): HTMLDialogElement {
  const dlg = document.createElement('dialog');
  dlg.id = 'find-replace-dialog';
  dlg.className = 'find-replace-dialog';
  dlg.setAttribute('closedby', 'any');
  dlg.setAttribute('aria-labelledby', 'find-replace-title');
  dlg.innerHTML = `
    <div class="dialog-shell">
      <div class="dialog-header">
        <h2 id="find-replace-title">Find and replace</h2>
        <form method="dialog"><button type="submit" class="btn">Close</button></form>
      </div>
      <div class="dialog-body find-replace-body">
        <label class="field-label" for="fr-find">Find</label>
        <input id="fr-find" class="field" type="text" autocomplete="off" spellcheck="false" />
        <label class="field-label" for="fr-replace">Replace with</label>
        <input id="fr-replace" class="field" type="text" autocomplete="off" spellcheck="false" />
        <div class="find-replace-options">
          <label><input type="checkbox" id="fr-case" /> Match case</label>
          <label><input type="checkbox" id="fr-word" /> Whole word</label>
          <label><input type="radio" name="fr-scope" value="level" checked /> This level</label>
          <label><input type="radio" name="fr-scope" value="all" /> All levels</label>
          <label id="fr-pages-scope"><input type="radio" name="fr-scope" value="pages" /> All pages</label>
        </div>
        <p class="field-tip" id="fr-status" role="status" aria-live="polite"></p>
        <ul class="find-replace-results" id="fr-results" aria-label="Matches"></ul>
        <div class="find-replace-actions">
          <button type="button" class="btn" id="fr-select">Select all matches</button>
          <button type="button" class="btn solid" id="fr-replace-all">Replace all</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(dlg);
  wire(dlg);
  return dlg;
}

function wire(dlg: HTMLDialogElement): void {
  const q = <T extends HTMLElement>(sel: string) => dlg.querySelector(sel) as T;
  const find = q<HTMLInputElement>('#fr-find');
  const replace = q<HTMLInputElement>('#fr-replace');
  const matchCase = q<HTMLInputElement>('#fr-case');
  const wholeWord = q<HTMLInputElement>('#fr-word');
  const status = q<HTMLElement>('#fr-status');
  const results = q<HTMLUListElement>('#fr-results');
  const btnSelect = q<HTMLButtonElement>('#fr-select');
  const btnReplaceAll = q<HTMLButtonElement>('#fr-replace-all');
  const scope = (): Scope => {
    const value = dlg.querySelector<HTMLInputElement>('input[name="fr-scope"]:checked')?.value;
    return value === 'all' || value === 'pages' ? value : 'level';
  };
  const opts = (): FindOptions => ({ query: find.value, matchCase: matchCase.checked, wholeWord: wholeWord.checked });

  let matches: FindMatch[] = [];

  const refresh = () => {
    // The page scope is only offered when the file has several pages.
    const pagesScope = q<HTMLElement>('#fr-pages-scope');
    pagesScope.hidden = pageCount(pageHost()) < 2;
    if (pagesScope.hidden && scope() === 'pages') (dlg.querySelector('input[name="fr-scope"][value="all"]') as HTMLInputElement).checked = true;
    matches = findMatches(levelsFor(scope()), opts());
    results.replaceChildren();
    const occurrences = matches.reduce((n, m) => n + m.count, 0);
    status.textContent = !find.value
      ? 'Type something to find.'
      : matches.length === 0
        ? 'No matches.'
        : `${occurrences} ${occurrences === 1 ? 'match' : 'matches'} in ${matches.length} ${matches.length === 1 ? 'place' : 'places'}.`;
    btnReplaceAll.disabled = matches.length === 0;
    btnSelect.disabled = !matches.some((m) => onOpenPage(m) && m.path.join('/') === app.levelPath.join('/'));
    for (const m of matches.slice(0, MAX_ROWS)) {
      const li = document.createElement('li');
      li.className = 'find-replace-row';
      const go = document.createElement('button');
      go.type = 'button';
      go.className = 'find-replace-go';
      const where = document.createElement('span');
      where.className = 'find-replace-where';
      where.textContent = `${m.path.length || m.page !== undefined ? `${whereLabel(m.path, m.page)} · ` : ''}${m.field}`;
      const text = document.createElement('span');
      text.textContent = snippet(m.text, find.value);
      go.append(where, text);
      go.addEventListener('click', () => jump(m));
      const one = document.createElement('button');
      one.type = 'button';
      one.className = 'btn btn-compact';
      one.textContent = 'Replace';
      one.setAttribute('aria-label', `Replace in ${m.field}: ${snippet(m.text, find.value)}`);
      one.addEventListener('click', () => {
        if (mutateWithHistory(() => replaceAll(levelsFor(scope()), opts(), replace.value, [m]) > 0)) renderAll(true);
        refresh();
      });
      li.append(go, one);
      results.appendChild(li);
    }
    if (matches.length > MAX_ROWS) {
      const more = document.createElement('li');
      more.className = 'field-tip';
      more.textContent = `${matches.length - MAX_ROWS} more not shown. Replace all still changes every match.`;
      results.appendChild(more);
    }
  };

  const jump = (m: FindMatch) => {
    dlg.close();
    if (!onOpenPage(m) && m.page !== undefined) goToPage(m.page);
    if (m.path.join('/') !== app.levelPath.join('/')) goToLevel(m.path);
    setSelection(
      m.kind === 'node' ? { type: 'node', id: m.id } : m.kind === 'edge' ? { type: 'edge', id: m.id } : m.kind === 'zone' ? { type: 'zone', id: m.id } : { type: 'notes', id: m.id },
    );
    renderAll(true);
    fitSelection();
  };

  for (const el of [find, matchCase, wholeWord]) el.addEventListener('input', refresh);
  dlg.querySelectorAll('input[name="fr-scope"]').forEach((el) => el.addEventListener('change', refresh));

  btnReplaceAll.addEventListener('click', () => {
    let count = 0;
    const changed = mutateWithHistory(() => {
      count = replaceAll(levelsFor(scope()), opts(), replace.value);
      return count > 0;
    });
    if (changed) renderAll(true);
    refresh();
    if (changed) status.textContent = `Replaced ${count} ${count === 1 ? 'match' : 'matches'}. Undo puts them back.`;
  });

  btnSelect.addEventListener('click', () => {
    const ids = idsInLevel(matches, app.levelPath, scope() === 'pages' ? app.pageIndex : undefined);
    const total = ids.node.length + ids.edge.length + ids.note.length + ids.zone.length;
    if (total === 0) return;
    dlg.close();
    setSelection(
      total === 1 && ids.node.length === 1
        ? { type: 'node', id: ids.node[0] }
        : { type: 'multi', ids: ids.node, edgeIds: ids.edge, notesIds: ids.note, zoneIds: ids.zone },
    );
    renderAll(true);
    notify(`Selected ${total} ${total === 1 ? 'item' : 'items'} in this level`);
  });

  dlg.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target === replace && matches.length > 0) {
      e.preventDefault();
      btnReplaceAll.click();
    }
  });

  dlg.addEventListener('close', () => {
    results.replaceChildren();
  });
  (dlg as HTMLDialogElement & { refreshFindReplace?: () => void }).refreshFindReplace = refresh;
}

/** Open the dialog, starting with the selected component's title as the search text when one is selected. */
export function openFindReplace(): void {
  dialog ??= build();
  const find = dialog.querySelector<HTMLInputElement>('#fr-find')!;
  if (!dialog.open) dialog.showModal();
  find.focus();
  find.select();
  (dialog as HTMLDialogElement & { refreshFindReplace?: () => void }).refreshFindReplace?.();
}
