/**
 * The diagram library's commands and dialog (F-08, B3). New, open, rename, duplicate and delete (always with a
 * 10-second Undo), Export all as .zip, and a thumbnail made on idle after a save. The data lives in `library.ts`.
 */
import { createBlankDocument } from '../templates/presets';
import type { DiagramDocument, SelectionTarget } from '../types';
import { expandStageToFit } from '../core/layout';
import { escapeHtml } from '../shared/escapeHtml';
import {
  DELETE_UNDO_MS,
  createDiagram,
  deleteDiagram,
  duplicateDiagram,
  exportAllAsZip,
  getActiveDiagramId,
  hasDiagram,
  listLibrary,
  renameDiagram,
  restoreDiagram,
  setActiveDiagramId,
  setThumbnail,
} from './library';
import { AUTOSAVE_ID, getRecord, getStorageStatus, reportStorageFailure, type DiagramRecord } from './storage';
import {
  app,
  clearPendingRestoreOffer,
  fitToViewport,
  flushAutosave,
  onAutosaved,
  scheduleAutosave,
  setSelection,
  syncHistoryButtons,
  usableStoredDoc,
} from './state';
import { libraryDialog, libraryDialogBody, restoreSessionBanner, traceList } from './dom';
import { resetActiveFile } from './pwa';
import { renderAll } from './render';
import { renderStagePictureSvg } from './stagePicture';
import { notify } from './toast';

export interface LibraryDeps {
  clearSimulation: () => void;
  downloadBytes: (bytes: Uint8Array, filename: string, mimeType: string) => void;
}

let deps: LibraryDeps | null = null;
let styles: Promise<unknown> | null = null;
let renaming: string | null = null;
let lastDeleted: { removed: DiagramRecord; undo: () => void; timer: number } | null = null;

function clearLastDeleted(): void {
  if (lastDeleted) window.clearTimeout(lastDeleted.timer);
  lastDeleted = null;
}

const THUMBNAIL_WIDTH = 320;
const THUMBNAIL_HEIGHT = 200;
const THUMBNAIL_IDLE_MS = 1500;

function failed(err: unknown, what: string): void {
  reportStorageFailure(err, what);
}

/** Put a saved diagram on the canvas. The one before it is saved first, and undo does not cross the switch. */
export function openDiagram(
  id: string,
  { selection = { type: 'none' }, force = false, keepFile = false }: { selection?: SelectionTarget; force?: boolean; keepFile?: boolean } = {},
): boolean {
  const record = hasDiagram(id) ? getRecord<DiagramRecord>('diagrams', id) : undefined;
  if (!record) return false;
  const doc = structuredClone(record.doc);
  if (!force && id === getActiveDiagramId()) return true;
  if (app.hasPendingAutosave) flushAutosave();
  setActiveDiagramId(id).catch((err) => failed(err, 'choice of open diagram'));
  clearPendingRestoreOffer();
  if (restoreSessionBanner) restoreSessionBanner.hidden = true;
  if (!keepFile) resetActiveFile();
  deps?.clearSimulation();
  app.undoStack.length = 0;
  app.redoStack.length = 0;
  app.doc = usableStoredDoc(doc) ?? doc;
  expandStageToFit(app.doc);
  setSelection(selection);
  traceList.replaceChildren();
  syncHistoryButtons();
  renderAll(true);
  fitToViewport();
  return true;
}

/**
 * Add a document to the library as a new diagram and open it, so what was open stays in the library untouched.
 * Used by New Blueprint, templates, and file open and import. The toast's Undo goes back to the previous diagram.
 * `pickSelection` chooses what is selected once the new diagram is open.
 */
export async function openAsNewDiagram(
  doc: DiagramDocument,
  message: string,
  options: { pickSelection?: (doc: DiagramDocument) => SelectionTarget; keepFile?: boolean } = {},
): Promise<boolean> {
  if (app.hasPendingAutosave) flushAutosave();
  // Nothing saved yet (a fresh visit): there is no earlier diagram, so Undo opens a new blank one.
  const previousId = hasDiagram(getActiveDiagramId()) ? getActiveDiagramId() : null;
  try {
    // The very first diagram keeps the old autosave's id, so it stays the first entry (and the old storage key).
    const record = await createDiagram(doc, Date.now(), listLibrary().length === 0 ? AUTOSAVE_ID : undefined);
    openDiagram(record.id, { selection: options.pickSelection?.(record.doc) ?? { type: 'none' }, force: true, keepFile: options.keepFile });
    notify(message, {
      action: {
        label: 'Undo',
        onClick: () => {
          if (previousId && openDiagram(previousId)) return;
          if (previousId) notify('The previous diagram is no longer in the library', { tone: 'error' });
          else void newDiagram();
        },
      },
    });
  } catch (err) {
    failed(err, 'new diagram');
    return false;
  } finally {
    refreshLibraryDialog();
  }
  return true;
}

export async function newDiagram(): Promise<void> {
  if (app.hasPendingAutosave) flushAutosave();
  try {
    const record = await createDiagram(createBlankDocument());
    openDiagram(record.id);
    notify('Started a new diagram');
  } catch (err) {
    failed(err, 'new diagram');
  }
  refreshLibraryDialog();
}

export async function duplicateActiveDiagram(): Promise<void> {
  if (app.hasPendingAutosave) flushAutosave();
  await duplicateById(getActiveDiagramId(), true);
}

async function duplicateById(id: string, open: boolean): Promise<void> {
  try {
    const copy = await duplicateDiagram(id);
    if (!copy) return;
    if (open) openDiagram(copy.id);
    notify(open ? `Made a copy: ${copy.title}` : `Copied to ${copy.title}`);
  } catch (err) {
    failed(err, 'copy of the diagram');
  }
  refreshLibraryDialog();
}

async function renameById(id: string, title: string): Promise<void> {
  const isOpen = id === getActiveDiagramId();
  if (isOpen && app.hasPendingAutosave) flushAutosave();
  try {
    if (!(await renameDiagram(id, title))) return;
  } catch (err) {
    failed(err, 'new name');
    return;
  }
  if (isOpen) {
    (app.levelRoot ?? app.doc).title = title.trim();
    renderAll(false);
    scheduleAutosave();
  }
}

/** Delete with Undo. Deleting the open diagram opens the next one, or an empty canvas when it was the last. */
export function deleteById(id: string): void {
  const wasOpen = id === getActiveDiagramId();
  const others = listLibrary().filter((entry) => entry.id !== id);
  if (wasOpen) {
    if (others[0]) openDiagram(others[0].id);
    else {
      // Nothing left to open: an empty canvas that becomes a diagram again on its first edit.
      if (app.autosaveTimer !== null) window.clearTimeout(app.autosaveTimer);
      app.autosaveTimer = null;
      app.hasPendingAutosave = false;
      deps?.clearSimulation();
      resetActiveFile();
      app.undoStack.length = 0;
      app.redoStack.length = 0;
      app.doc = createBlankDocument();
      setSelection({ type: 'none' });
      traceList.replaceChildren();
      syncHistoryButtons();
      renderAll(true);
    }
  }
  const result = deleteDiagram(id);
  if (!result) return;
  result.done.catch((err) => failed(err, 'deletion'));
  const undo = (): void => {
    if (lastDeleted?.removed === result.removed) clearLastDeleted();
    restoreDiagram(result.removed)
      .then(() => {
        if (wasOpen) openDiagram(result.removed.id);
        notify(`Brought back ${result.removed.title}`);
        refreshLibraryDialog();
      })
      .catch((err) => failed(err, 'restored diagram'));
  };
  // The toast sits under an open dialog, so the dialog carries its own Undo for the same ten seconds.
  clearLastDeleted();
  lastDeleted = {
    removed: result.removed,
    undo,
    timer: window.setTimeout(() => {
      lastDeleted = null;
      refreshLibraryDialog();
    }, DELETE_UNDO_MS),
  };
  notify(`Deleted ${result.removed.title}`, { duration: DELETE_UNDO_MS, action: { label: 'Undo', onClick: undo } });
  refreshLibraryDialog();
}

export function deleteActiveDiagram(): void {
  deleteById(getActiveDiagramId());
}

export function exportAllDiagrams(): void {
  if (app.hasPendingAutosave) flushAutosave();
  const { bytes, count } = exportAllAsZip();
  if (count === 0) {
    notify('There are no saved diagrams to export yet');
    return;
  }
  deps?.downloadBytes(bytes, 'conduitcraft-diagrams.zip', 'application/zip');
  notify(`Exported ${count} ${count === 1 ? 'diagram' : 'diagrams'}`);
}

// ---------------------------------------------------------------------------------------------------------------
// The dialog

function whenText(timestamp: number): string {
  if (!timestamp) return 'Saved earlier';
  return `Edited ${new Date(timestamp).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`;
}

function rowHtml(entry: ReturnType<typeof listLibrary>[number], activeId: string): string {
  const id = escapeHtml(entry.id);
  const title = escapeHtml(entry.title);
  const isOpen = entry.id === activeId;
  const thumb = entry.thumbnail?.startsWith('data:image/')
    ? `<img class="library-thumb" alt="" width="${THUMBNAIL_WIDTH / 4}" height="${THUMBNAIL_HEIGHT / 4}" src="${escapeHtml(entry.thumbnail)}">`
    : '<span class="library-thumb library-thumb-empty" aria-hidden="true"></span>';
  const name =
    renaming === entry.id
      ? `<input class="library-rename-input" type="text" value="${title}" aria-label="Name for ${title}" data-rename-input="${id}">`
      : `<span class="library-name">${title}</span>`;
  return `<li class="library-row" data-library-id="${id}"${isOpen ? ' aria-current="true"' : ''}>
    ${thumb}
    <div class="library-meta">${name}<span class="library-when">${isOpen ? 'Open now · ' : ''}${escapeHtml(whenText(entry.updatedAt))}</span></div>
    <div class="library-actions">
      <button type="button" class="btn" data-library-open="${id}"${isOpen ? ' disabled' : ''}>Open</button>
      <button type="button" class="btn" data-library-rename="${id}">${renaming === entry.id ? 'Save name' : 'Rename'}</button>
      <button type="button" class="btn" data-library-copy="${id}">Duplicate</button>
      <button type="button" class="btn" data-library-delete="${id}">Delete</button>
    </div>
  </li>`;
}

export function refreshLibraryDialog(): void {
  if (!libraryDialogBody || !libraryDialog?.open) return;
  const entries = listLibrary();
  const activeId = getActiveDiagramId();
  libraryDialogBody.innerHTML = `
    <div class="library-toolbar">
      <button type="button" class="btn solid" id="btn-library-new">New diagram</button>
      <button type="button" class="btn" id="btn-library-export"${entries.length === 0 ? ' disabled' : ''}>Export all as .zip</button>
    </div>
    ${
      lastDeleted
        ? `<p class="library-undo" role="status">Deleted ${escapeHtml(lastDeleted.removed.title)}. <button type="button" class="btn" id="btn-library-undo">Undo</button></p>`
        : ''
    }
    ${
      entries.length === 0
        ? '<p class="library-empty">Nothing saved yet. Add a component and it appears here.</p>'
        : `<ul class="library-list" aria-label="Saved diagrams">${entries.map((e) => rowHtml(e, activeId)).join('')}</ul>`
    }`;
  libraryDialogBody.querySelector<HTMLInputElement>('[data-rename-input]')?.focus();
}

function onDialogClick(event: Event): void {
  const target = event.target as HTMLElement;
  const button = target.closest<HTMLButtonElement>('button');
  if (!button) return;
  if (button.id === 'btn-library-new') return void newDiagram();
  if (button.id === 'btn-library-export') return exportAllDiagrams();
  if (button.id === 'btn-library-undo') return lastDeleted?.undo();
  const open = button.dataset.libraryOpen;
  if (open) {
    if (openDiagram(open)) {
      notify(`Opened ${getRecord<DiagramRecord>('diagrams', open)?.title ?? 'diagram'}`);
      libraryDialog?.close();
    }
    return;
  }
  const rename = button.dataset.libraryRename;
  if (rename) {
    if (renaming === rename) {
      const input = libraryDialogBody?.querySelector<HTMLInputElement>('[data-rename-input]');
      const value = input?.value.trim() ?? '';
      renaming = null;
      if (value) void renameById(rename, value).then(refreshLibraryDialog);
      else refreshLibraryDialog();
    } else {
      renaming = rename;
      refreshLibraryDialog();
    }
    return;
  }
  if (button.dataset.libraryCopy) return void duplicateById(button.dataset.libraryCopy, false);
  if (button.dataset.libraryDelete) deleteById(button.dataset.libraryDelete);
}

function onDialogKey(event: KeyboardEvent): void {
  const input = (event.target as HTMLElement).closest<HTMLInputElement>('[data-rename-input]');
  if (!input) return;
  if (event.key === 'Enter') {
    event.preventDefault();
    libraryDialogBody?.querySelector<HTMLButtonElement>(`[data-library-rename="${input.dataset.renameInput}"]`)?.click();
  } else if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    renaming = null;
    refreshLibraryDialog();
  }
}

export async function openLibraryDialog(): Promise<void> {
  if (!libraryDialog) return;
  // The library's styles are only needed here, so they stay out of the entry stylesheet.
  styles ??= import('../styles/library.css').catch(() => undefined);
  await styles;
  if (app.hasPendingAutosave) flushAutosave();
  renaming = null;
  if (!libraryDialog.open) libraryDialog.showModal();
  refreshLibraryDialog();
}

// ---------------------------------------------------------------------------------------------------------------
// Thumbnails

let thumbnailTimer: number | null = null;

/** The SVG drawn onto a 320 × 200 canvas and kept as a small WebP (or PNG) picture, not the whole SVG. */
function rasterThumbnail(svg: string): Promise<string | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = THUMBNAIL_WIDTH;
      canvas.height = THUMBNAIL_HEIGHT;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(null);
      ctx.fillStyle = '#ECEFEE';
      ctx.fillRect(0, 0, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT);
      const scale = Math.min(THUMBNAIL_WIDTH / image.naturalWidth, THUMBNAIL_HEIGHT / image.naturalHeight);
      const width = image.naturalWidth * scale;
      const height = image.naturalHeight * scale;
      ctx.drawImage(image, (THUMBNAIL_WIDTH - width) / 2, (THUMBNAIL_HEIGHT - height) / 2, width, height);
      try {
        resolve(canvas.toDataURL('image/webp', 0.8));
      } catch {
        resolve(null);
      }
    };
    image.onerror = () => resolve(null);
    // A data URL, not a blob URL: a blob URL would taint the canvas when the SVG embeds the live stage.
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

function scheduleThumbnail(savedId: string): void {
  // The picture is of the canvas, so only the open diagram can be drawn, and only when storage can hold it.
  if (savedId !== getActiveDiagramId() || getStorageStatus().backend !== 'indexeddb') return;
  if (thumbnailTimer !== null) window.clearTimeout(thumbnailTimer);
  thumbnailTimer = window.setTimeout(() => {
    thumbnailTimer = null;
    const run = (): void => {
      if (document.hidden || app.hasPendingAutosave || savedId !== getActiveDiagramId() || app.levelPath.length > 0 || app.pageIndex > 0) return;
      const svg = renderStagePictureSvg(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT, { preserveSelection: false });
      rasterThumbnail(svg)
        .then((picture) => (picture && savedId === getActiveDiagramId() ? setThumbnail(savedId, picture) : undefined))
        .then(refreshLibraryDialog)
        .catch(() => {
          // A picture that cannot be drawn just leaves the plain placeholder; the diagram itself is unaffected.
        });
    };
    if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 4000 });
    else run();
  }, THUMBNAIL_IDLE_MS);
}

export function initLibrary(libraryDeps: LibraryDeps): void {
  deps = libraryDeps;
  libraryDialogBody?.addEventListener('click', onDialogClick);
  libraryDialogBody?.addEventListener('keydown', onDialogKey);
  libraryDialog?.addEventListener('close', () => {
    renaming = null;
  });
  onAutosaved(scheduleThumbnail);
}
