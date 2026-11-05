/**
 * The live code pane (F-05, D2): the Blueprint file next to the canvas. Typing updates the canvas after a 250 ms
 * pause, one undo step per pause; text that does not read keeps the last good canvas and marks the lines; edits
 * made on the canvas flow back into the text unless the text has unapplied problems, and nothing typed is ever
 * thrown away without a Reset. A lazy chunk, loaded the first time the pane is opened (`⌘/`).
 */
import '../styles/codePane.css';
import { blueprintNodeKey, importMermaidOrBlueprint, serializeToBlueprintMarkdown } from '../core/parser';
import { indexBlocks, nodeKeys, rangeOfSelection, selectionAtLine, type BlockIndex } from '../core/codeLines';
import type { ImportIssue } from '../types';
import { announce } from './a11y';
import { notify } from './toast';
import { app, fullDocument, onPagesChange, onSelectionChange, replaceFile, setSelection } from './state';
import { onInsightsChange } from './insights';
import { renderAll } from './render';

const DEBOUNCE_MS = 250;
const WIDTH_KEY = 'conduitcraft:code-pane-width';
const MIN_WIDTH = 288;

let pane: HTMLElement | null = null;
let area: HTMLTextAreaElement;
let gutter: HTMLElement;
let highlight: HTMLElement;
let blocks: BlockIndex = indexBlocks('');
let keys = new Map<string, string>();
/** True while a selection is being made from the text, so the highlight does not scroll the text under the cursor. */
let fromText = false;
let list: HTMLUListElement;
let status: HTMLElement;
let timer: number | undefined;
/** What the canvas looked like as text the last time the pane and the canvas agreed. */
let synced = '';
let unapplied = false;
let applying = false;

const canvasText = (): string => serializeToBlueprintMarkdown(fullDocument());

function setStatus(text: string, tone: 'ok' | 'warn' = 'ok'): void {
  status.textContent = text;
  status.dataset.tone = tone;
}

/** Only the first page's top level is mapped to lines (the pages and nested levels are further down the file). */
const mapped = () => app.pageIndex === 0 && app.levelPath.length === 0;

function reindex(): void {
  blocks = indexBlocks(area.value);
  keys = nodeKeys(app.doc.nodes.map((n) => n.id), blueprintNodeKey);
}

/** Highlight the lines of what is selected on the canvas, and bring them into view when asked. */
function paintHighlight(reveal: boolean): void {
  const range = mapped() ? rangeOfSelection(blocks, app.selection, (id) => keys.get(id)) : null;
  highlight.hidden = !range;
  if (!range) return;
  const style = getComputedStyle(area);
  const lineHeight = parseFloat(style.lineHeight) || 18;
  const top = parseFloat(style.paddingTop) + (range.start - 1) * lineHeight;
  if (reveal && (top < area.scrollTop || top + lineHeight > area.scrollTop + area.clientHeight)) {
    area.scrollTop = Math.max(0, top - 2 * lineHeight);
  }
  highlight.style.top = `${top - area.scrollTop}px`;
  highlight.style.height = `${(range.end - range.start + 1) * lineHeight}px`;
}

/** The cursor is in a component's (or wire's, swimlane's, note's, frame's) block: select it on the canvas. */
function selectFromCursor(): void {
  if (!mapped()) return;
  const line = area.value.slice(0, area.selectionStart).split('\n').length;
  const ids = new Map([...keys].map(([id, key]) => [key, id]));
  const target = selectionAtLine(blocks, line, (key) => ids.get(key));
  if (!target) return;
  fromText = true;
  try {
    setSelection(target);
  } finally {
    fromText = false;
  }
  paintHighlight(false);
}

/** One number per line, with the lines the importer complained about marked. */
function paintGutter(bad: ReadonlySet<number> = new Set()): void {
  reindex();
  paintHighlight(false);
  const lines = area.value.split('\n').length;
  let html = '';
  for (let n = 1; n <= lines; n += 1) html += bad.has(n) ? `<span class="is-bad">${n}</span>\n` : `${n}\n`;
  gutter.innerHTML = html;
  gutter.scrollTop = area.scrollTop;
}

function paintDiagnostics(issues: readonly ImportIssue[]): void {
  list.replaceChildren(
    ...issues.slice(0, 50).map((issue) => {
      const li = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'code-diagnostic';
      button.dataset.level = issue.level;
      button.textContent = `${issue.line ? `Line ${issue.line}: ` : ''}${issue.message}`;
      button.addEventListener('click', () => goToLine(issue.line));
      li.appendChild(button);
      return li;
    }),
  );
}

function goToLine(line?: number): void {
  if (!line) return;
  const lines = area.value.split('\n');
  const start = lines.slice(0, line - 1).reduce((sum, l) => sum + l.length + 1, 0);
  area.focus();
  area.setSelectionRange(start, start + (lines[line - 1]?.length ?? 0));
}

/** Read the text; apply it when it reads, otherwise say why not and keep the canvas as it was. */
function applyText(): void {
  const text = area.value;
  paintGutter();
  if (!text.trim()) {
    unapplied = true;
    paintDiagnostics([]);
    setStatus('Nothing to read yet. The canvas is unchanged.', 'warn');
    return;
  }
  const { doc, issues } = importMermaidOrBlueprint(text);
  const errors = issues.filter((i) => i.level === 'error');
  const empty = doc.nodes.length === 0 && doc.zones.length === 0 && doc.notesCards.length === 0;
  const problems = issues.filter((i) => i.level !== 'info');
  paintDiagnostics(problems);
  paintGutter(new Set(problems.filter((i) => i.line).map((i) => i.line as number)));
  if (errors.length > 0 || empty) {
    unapplied = true;
    setStatus(
      errors.length ? `${errors.length} ${errors.length === 1 ? 'problem' : 'problems'}. The canvas keeps the last good version.` : 'No components found. The canvas is unchanged.',
      'warn',
    );
    return;
  }
  unapplied = false;
  const wasBlueprint = /^\s*---/.test(text);
  applying = true;
  try {
    replaceFile(doc);
    renderAll(true);
  } finally {
    applying = false;
  }
  synced = canvasText();
  if (!wasBlueprint) {
    // Mermaid is read once: from here on the pane holds the Blueprint file it was turned into.
    area.value = synced;
    paintGutter();
    notify('Converted the Mermaid to a Blueprint file. ConduitCraft reads Mermaid but does not write it.');
  }
  setStatus(problems.length ? `Applied, with ${problems.length} ${problems.length === 1 ? 'warning' : 'warnings'}.` : 'In step with the canvas.');
}

/** The canvas changed (an edit, undo or redo, a different page): show the new text unless unapplied text would be lost. */
function syncFromCanvas(): void {
  if (!pane || pane.hidden || applying) return;
  const now = canvasText();
  if (now === synced) return;
  if (unapplied || (document.activeElement === area && area.value !== synced)) {
    setStatus('The canvas changed while this text has problems. Reset to use the canvas version.', 'warn');
    return;
  }
  synced = now;
  area.value = now;
  paintGutter();
  paintDiagnostics([]);
  setStatus('In step with the canvas.');
}

export function resetFromCanvas(): void {
  synced = canvasText();
  area.value = synced;
  unapplied = false;
  paintGutter();
  paintDiagnostics([]);
  setStatus('In step with the canvas.');
}

function build(): void {
  pane = document.createElement('section');
  pane.className = 'code-pane';
  pane.id = 'code-pane';
  pane.setAttribute('aria-label', 'Code');
  pane.hidden = true;
  pane.innerHTML = `
    <div class="code-pane-resize" id="code-pane-resize" role="separator" aria-orientation="vertical" aria-label="Resize the code pane" aria-valuemin="288" aria-valuemax="1200" aria-valuenow="416" tabindex="0"></div>
    <div class="code-pane-head">
      <h2 class="code-pane-title">Blueprint file</h2>
      <button type="button" class="btn btn-compact" id="code-pane-reset" data-tip="Use the canvas version of the text">Reset</button>
      <button type="button" class="btn btn-compact" id="code-pane-close" aria-label="Close the code pane">Close</button>
    </div>
    <div class="code-pane-body">
      <div class="code-gutter" id="code-gutter" aria-hidden="true"></div>
      <div class="code-area-wrap">
        <div class="code-highlight" id="code-highlight" aria-hidden="true" hidden></div>
        <textarea class="code-area" id="code-area" spellcheck="false" wrap="off" autocomplete="off" autocapitalize="off" aria-label="Blueprint file text" aria-describedby="code-status"></textarea>
      </div>
    </div>
    <p class="code-status" id="code-status" role="status" aria-live="polite"></p>
    <ul class="code-diagnostics" id="code-diagnostics" aria-label="Problems"></ul>`;
  document.querySelector('.canvas-shell')?.appendChild(pane);
  area = pane.querySelector('#code-area') as HTMLTextAreaElement;
  gutter = pane.querySelector('#code-gutter') as HTMLElement;
  highlight = pane.querySelector('#code-highlight') as HTMLElement;
  list = pane.querySelector('#code-diagnostics') as HTMLUListElement;
  status = pane.querySelector('#code-status') as HTMLElement;

  area.addEventListener('input', () => {
    window.clearTimeout(timer);
    paintGutter();
    timer = window.setTimeout(applyText, DEBOUNCE_MS);
  });
  area.addEventListener('scroll', () => {
    gutter.scrollTop = area.scrollTop;
    paintHighlight(false);
  });
  // Putting the cursor in a block selects what it describes.
  area.addEventListener('click', selectFromCursor);
  area.addEventListener('keyup', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End'].includes(e.key)) selectFromCursor();
  });
  onSelectionChange(() => {
    if (pane && !pane.hidden && !fromText) paintHighlight(true);
  });
  area.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === '/') {
      e.preventDefault();
      // Focus moves to the canvas below, so the window's own handler would see the key again and reopen the pane.
      e.stopPropagation();
      setCodePaneOpen(false);
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      document.getElementById('canvas-viewport')?.focus();
    }
  });
  pane.querySelector('#code-pane-reset')?.addEventListener('click', resetFromCanvas);
  pane.querySelector('#code-pane-close')?.addEventListener('click', () => setCodePaneOpen(false));

  // Resize from the left edge (the top edge on narrow screens, where the pane sits below the canvas).
  const handle = pane.querySelector<HTMLElement>('#code-pane-resize')!;
  const setWidth = (px: number) => {
    const max = Math.round(window.innerWidth * 0.6);
    const next = Math.max(MIN_WIDTH, Math.min(max, Math.round(px)));
    document.querySelector<HTMLElement>('.canvas-shell')?.style.setProperty('--code-pane-w', `${next}px`);
    handle.setAttribute('aria-valuenow', String(next));
    try {
      localStorage.setItem(WIDTH_KEY, String(next));
    } catch {
      // Not saved; the width is only a preference.
    }
  };
  handle.addEventListener('pointerdown', (e) => {
    handle.setPointerCapture(e.pointerId);
  });
  handle.addEventListener('pointermove', (e) => {
    if (handle.hasPointerCapture(e.pointerId)) setWidth(window.innerWidth - e.clientX - (document.querySelector('#inspector-panel')?.getBoundingClientRect().width ?? 0));
  });
  handle.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    setWidth((pane?.getBoundingClientRect().width ?? 420) + (e.key === 'ArrowLeft' ? 32 : -32));
  });
  try {
    const saved = Number(localStorage.getItem(WIDTH_KEY));
    if (saved >= MIN_WIDTH) document.querySelector<HTMLElement>('.canvas-shell')?.style.setProperty('--code-pane-w', `${saved}px`);
  } catch {
    // Default width.
  }
  // Every render schedules an insights refresh 300 ms later, which is a good moment to ask whether the canvas moved
  // on; undo, redo and page changes report through `onPagesChange`.
  onInsightsChange(syncFromCanvas);
  onPagesChange(syncFromCanvas);
}

export function isCodePaneOpen(): boolean {
  return Boolean(pane && !pane.hidden);
}

export function setCodePaneOpen(open: boolean): void {
  if (!pane) {
    if (!open) return;
    build();
  }
  const shell = document.querySelector<HTMLElement>('.canvas-shell');
  pane!.hidden = !open;
  if (shell) shell.dataset.codePane = open ? 'open' : '';
  if (open) {
    resetFromCanvas();
    area.focus();
    announce('Code pane open. Typing updates the canvas after a short pause.');
  } else {
    window.clearTimeout(timer);
    if (pane!.contains(document.activeElement)) document.getElementById('canvas-viewport')?.focus();
  }
}

export function toggleCodePane(): void {
  setCodePaneOpen(!isCodePaneOpen());
}
