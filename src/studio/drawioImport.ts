/**
 * Bringing a draw.io file into the library (F-25, B6). The importer itself (`importers/drawio.ts`) is a lazy chunk;
 * this file asks how to treat several pages, opens the result as new diagrams, and shows the import report.
 */
import type { DiagramDocument, ImportIssue, SelectionTarget } from '../types';
import type { DrawioPageMode } from '../importers/drawio';
import { escapeHtml } from '../shared/escapeHtml';
import { createDiagram } from './library';
import { openAsNewDiagram } from './libraryUi';
import { notify } from './toast';

const pagesDialog = document.getElementById('drawio-pages-dialog') as HTMLDialogElement | null;
const pagesText = document.getElementById('drawio-pages-text');
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
  const nodes = docs.reduce((sum, d) => sum + d.nodes.length, 0);
  const empty = docs.every((d) => d.nodes.length === 0 && d.zones.length === 0 && d.notesCards.length === 0);
  if (empty) {
    notify('No shapes could be imported from this draw.io file', {
      tone: 'error',
      action: issues.length ? { label: 'See report', onClick: () => showReport(issues) } : undefined,
    });
    return false;
  }

  // Extra pages go to the library first, so the first page is the one left open (and Undo goes back to what was open).
  for (const extra of docs.slice(1)) await createDiagram(extra);
  const wires = docs.reduce((sum, d) => sum + d.edges.length, 0);
  const more = docs.length > 1 ? `; ${docs.length - 1} more ${docs.length === 2 ? 'page is' : 'pages are'} in Your diagrams` : '';
  const ok = await openAsNewDiagram(docs[0], `Imported ${nodes} components and ${wires} wires from draw.io${more}`, {
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
