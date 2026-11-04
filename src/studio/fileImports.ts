/**
 * Bringing draw.io and Excalidraw files into the library (F-25, B6 and B7). The importers (`importers/drawio.ts`,
 * `importers/excalidraw.ts`) are lazy chunks; this file asks how to treat several pages, opens the result as new
 * diagrams, and shows the import report.
 */
import type { DiagramDocument, ImportIssue, SelectionTarget } from '../types';
import type { DrawioPageMode } from '../importers/drawio';
import { escapeHtml } from '../shared/escapeHtml';
import { createDiagram } from './library';
import { openAsNewDiagram } from './libraryUi';
import { app, performUndo, pushHistory } from './state';
import { renderAll } from './render';
import { notify } from './toast';

const pagesDialog = document.getElementById('drawio-pages-dialog') as HTMLDialogElement | null;
const pagesText = document.getElementById('drawio-pages-text');
const traceDialog = document.getElementById('trace-mode-dialog') as HTMLDialogElement | null;
const reportDialog = document.getElementById('import-report-dialog') as HTMLDialogElement | null;
const reportList = document.getElementById('import-report-list');

const firstNode = (doc: DiagramDocument): SelectionTarget =>
  doc.nodes.length > 0 ? { type: 'node', id: doc.nodes[0].id } : { type: 'none' };

/** Ask how to bring in a file with several pages. Resolves null when the visitor cancels. */
function askPageMode(pageCount: number): Promise<DrawioPageMode | null> {
  if (!pagesDialog) return Promise.resolve('separate');
  if (pagesText) {
    pagesText.textContent = `It has ${pageCount} pages. Make each page its own diagram, or one overview whose components open the pages as levels?`;
  }
  return new Promise((resolve) => {
    let choice: DrawioPageMode | null = null;
    const onClick = (event: Event): void => {
      const mode = (event.target as HTMLElement).closest<HTMLElement>('[data-drawio-mode]')?.dataset.drawioMode;
      if (!mode) return;
      choice = mode === 'separate' || mode === 'levels' ? mode : null;
      pagesDialog.close();
    };
    pagesDialog.addEventListener('click', onClick);
    pagesDialog.addEventListener(
      'close',
      () => {
        pagesDialog.removeEventListener('click', onClick);
        resolve(choice);
      },
      { once: true },
    );
    pagesDialog.showModal();
  });
}

const LEVEL_LABEL: Record<ImportIssue['level'], string> = { error: 'Not imported', warning: 'Changed', info: 'Note' };

function showReport(issues: ImportIssue[]): void {
  if (!reportDialog || !reportList) return;
  reportList.innerHTML = issues
    .map((item) => `<li><strong>${LEVEL_LABEL[item.level]}:</strong> ${escapeHtml(item.message)}</li>`)
    .join('');
  reportDialog.showModal();
}

/**
 * Open converted documents as new diagrams, the first one left open, and offer the report of what was skipped.
 * `source` names the format in messages. Returns false when there was nothing to import.
 */
async function openConverted(docs: DiagramDocument[], issues: ImportIssue[], source: string): Promise<boolean> {
  const nodes = docs.reduce((sum, d) => sum + d.nodes.length, 0);
  const empty = docs.every((d) => d.nodes.length === 0 && d.zones.length === 0 && d.notesCards.length === 0);
  if (empty) {
    notify(`No shapes could be imported from this ${source} file`, {
      tone: 'error',
      action: issues.length ? { label: 'See report', onClick: () => showReport(issues) } : undefined,
    });
    return false;
  }
  // Extra pages go to the library first, so the first page is the one left open (and Undo goes back to what was open).
  for (const extra of docs.slice(1)) await createDiagram(extra);
  const wires = docs.reduce((sum, d) => sum + d.edges.length, 0);
  const more = docs.length > 1 ? `; ${docs.length - 1} more ${docs.length === 2 ? 'page is' : 'pages are'} in Your diagrams` : '';
  const ok = await openAsNewDiagram(docs[0], `Imported ${nodes} components and ${wires} wires from ${source}${more}`, {
    pickSelection: firstNode,
    keepFile: true,
  });
  if (ok && issues.length > 0) {
    notify(`${issues.length} ${issues.length === 1 ? 'thing was' : 'things were'} not imported exactly`, {
      duration: 12000,
      action: { label: 'See report', onClick: () => showReport(issues) },
    });
  }
  return ok;
}

/** Import draw.io text as new diagrams. Returns false when nothing could be imported. */
export async function importDrawioText(text: string, title: string): Promise<boolean> {
  let importer: typeof import('../importers/drawio');
  try {
    importer = await import('../importers/drawio');
  } catch {
    notify('Could not load the draw.io importer. Check your connection and try again.', { tone: 'error' });
    return false;
  }
  let file: Awaited<ReturnType<typeof importer.readDrawio>>;
  try {
    file = await importer.readDrawio(text);
  } catch (err) {
    notify(err instanceof Error ? err.message : 'Could not read this draw.io file.', { tone: 'error' });
    return false;
  }
  const mode = file.pages.length > 1 ? await askPageMode(file.pages.length) : 'separate';
  if (!mode) return false;
  const { docs, issues } = importer.convertDrawio(file, mode, title);
  return openConverted(docs, issues, 'draw.io');
}

/**
 * Import a file that becomes a single diagram, through a lazy importer chunk. `convert` runs the importer and
 * throws a plain Error when the text is not the right kind of file.
 */
async function importSingle(
  source: string,
  load: () => Promise<{ convert: (text: string, title: string) => { doc: DiagramDocument; issues: ImportIssue[] } }>,
  text: string,
  title: string,
): Promise<boolean> {
  let importer: Awaited<ReturnType<typeof load>>;
  try {
    importer = await load();
  } catch {
    notify(`Could not load the ${source} importer. Check your connection and try again.`, { tone: 'error' });
    return false;
  }
  try {
    const { doc, issues } = importer.convert(text, title);
    return openConverted([doc], issues, source);
  } catch (err) {
    notify(err instanceof Error ? err.message : `Could not read this ${source} file.`, { tone: 'error' });
    return false;
  }
}

/** Import an Excalidraw scene as a new diagram. Returns false when nothing could be imported. */
export function importExcalidrawText(text: string, title: string): Promise<boolean> {
  return importSingle('Excalidraw', async () => ({ convert: (await import('../importers/excalidraw')).convertExcalidraw }), text, title);
}

/** Import a Docker Compose file as a new diagram. Returns false when nothing could be imported. */
export function importComposeText(text: string, title: string): Promise<boolean> {
  return importSingle('Docker Compose', async () => ({ convert: (await import('../importers/compose')).convertCompose }), text, title);
}

/** Import an OpenAPI 3 description as a new diagram. Returns false when nothing could be imported. */
export function importOpenApiText(text: string, title: string): Promise<boolean> {
  return importSingle('OpenAPI', async () => ({ convert: (await import('../importers/openapi')).convertOpenApi }), text, title);
}

/** Import Kubernetes manifests as a new diagram. Returns false when nothing could be imported. */
export function importKubernetesText(text: string, title: string): Promise<boolean> {
  return importSingle('Kubernetes', async () => ({ convert: (await import('../importers/kubernetes')).convertKubernetes }), text, title);
}

/** Import an AsyncAPI description as a new diagram. Returns false when nothing could be imported. */
export function importAsyncApiText(text: string, title: string): Promise<boolean> {
  return importSingle('AsyncAPI', async () => ({ convert: (await import('../importers/asyncapi')).convertAsyncApi }), text, title);
}

type TraceMode = 'new' | 'update';

/** Ask whether to start a new diagram or fold the traces into the open one. Resolves null when cancelled. */
function askTraceMode(): Promise<TraceMode | null> {
  if (!traceDialog) return Promise.resolve('new');
  return new Promise((resolve) => {
    let choice: TraceMode | null = null;
    const onClick = (event: Event): void => {
      const mode = (event.target as HTMLElement).closest<HTMLElement>('[data-trace-mode]')?.dataset.traceMode;
      if (!mode) return;
      choice = mode === 'new' || mode === 'update' ? mode : null;
      traceDialog.close();
    };
    traceDialog.addEventListener('click', onClick);
    traceDialog.addEventListener(
      'close',
      () => {
        traceDialog.removeEventListener('click', onClick);
        resolve(choice);
      },
      { once: true },
    );
    traceDialog.showModal();
  });
}

/**
 * Import a trace export (OpenTelemetry or Jaeger). With something on the canvas it asks whether to make a new diagram
 * or update the open one (matching components by their trace source, then by title); inside a level it always makes a
 * new diagram.
 */
export async function importTraceText(text: string, title: string): Promise<boolean> {
  let importer: typeof import('../importers/traces');
  try {
    importer = await import('../importers/traces');
  } catch {
    notify('Could not load the trace importer. Check your connection and try again.', { tone: 'error' });
    return false;
  }
  let result: ReturnType<typeof importer.convertTraces>;
  try {
    result = importer.convertTraces(text, title);
  } catch (err) {
    notify(err instanceof Error ? err.message : 'Could not read this trace file.', { tone: 'error' });
    return false;
  }
  const canUpdate = app.levelPath.length === 0 && app.doc.nodes.length > 0;
  const mode = canUpdate ? await askTraceMode() : 'new';
  if (!mode) return false;
  if (mode === 'new') return openConverted([result.doc], result.issues, 'traces');

  const merge = importer.mergeTraceDiagram(app.doc, result.doc);
  pushHistory();
  app.doc = merge.doc;
  renderAll(true);
  const part = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;
  notify(
    `Updated ${part(merge.updatedNodes, 'component')} and ${part(merge.updatedEdges, 'wire')} from traces; added ${part(merge.addedNodes, 'component')} and ${part(merge.addedEdges, 'wire')}`,
    { action: { label: 'Undo', onClick: () => performUndo() } },
  );
  if (result.issues.length > 0) {
    notify(`${result.issues.length} ${result.issues.length === 1 ? 'thing was' : 'things were'} not imported exactly`, {
      duration: 12000,
      action: { label: 'See report', onClick: () => showReport(result.issues) },
    });
  }
  return true;
}
