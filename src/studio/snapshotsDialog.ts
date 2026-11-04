/**
 * The Version Snapshots dialog: list, save, compare, restore and delete. Loaded the first time the dialog opens (or
 * a snapshot is taken from the palette), so the dialog code, the snapshot store wrapper and the diff markup stay
 * out of the entry bundle.
 */
import { snapshotsDialog, snapshotsDialogBody } from './dom';
import { resetActiveFile } from './pwa';
import { renderAll } from './render';
import {
  app,
  clearPendingRestoreOffer,
  fitToViewport,
  fullDocument,
  performUndo,
  pushHistory,
} from './state';
import {
  computeDocumentDiff,
  deleteSnapshot,
  getSnapshot,
  listSnapshots,
  renderSnapshotsDialogHtml,
  saveSnapshot,
} from './snapshots';
import { notify } from './toast';

let currentDiffSnapshotId: string | null = null;

function refreshSnapshotsDialog(): void {
  if (!snapshotsDialogBody) return;
  const snapshots = listSnapshots();
  if (!currentDiffSnapshotId && snapshots.length > 0) {
    currentDiffSnapshotId = snapshots[0].id;
  }
  const selectedSnapshot = snapshots.find((s) => s.id === currentDiffSnapshotId);
  const diff = selectedSnapshot ? computeDocumentDiff(selectedSnapshot.doc, app.doc) : null;
  snapshotsDialogBody.innerHTML = renderSnapshotsDialogHtml(snapshots, currentDiffSnapshotId, diff);

  const btnCreate = snapshotsDialogBody.querySelector<HTMLButtonElement>('#btn-create-snapshot');
  const inputName = snapshotsDialogBody.querySelector<HTMLInputElement>('#input-snapshot-name');

  const handleCreate = () => {
    const name = inputName?.value.trim() || `Snapshot ${snapshots.length + 1}`;
    const snap = saveSnapshot(name, fullDocument());
    currentDiffSnapshotId = snap.id;
    notify(`Saved version snapshot "${snap.name}"`);
    refreshSnapshotsDialog();
  };

  btnCreate?.addEventListener('click', handleCreate);
  inputName?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCreate();
    }
  });

  snapshotsDialogBody.querySelectorAll<HTMLButtonElement>('.btn-snapshot-diff').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      currentDiffSnapshotId = btn.getAttribute('data-diff-id');
      refreshSnapshotsDialog();
    });
  });

  snapshotsDialogBody.querySelectorAll<HTMLButtonElement>('.btn-snapshot-restore').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-restore-id');
      if (!id) return;
      const target = getSnapshot(id);
      if (target) {
        resetActiveFile();
        clearPendingRestoreOffer();
        pushHistory();
        app.doc = structuredClone(target.doc);
        renderAll(true);
        fitToViewport();
        snapshotsDialog?.close();
        notify(`Restored snapshot "${target.name}"`, { action: { label: 'Undo', onClick: () => performUndo() } });
      }
    });
  });

  snapshotsDialogBody.querySelectorAll<HTMLButtonElement>('.btn-snapshot-delete').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-delete-id');
      if (!id) return;
      deleteSnapshot(id);
      if (currentDiffSnapshotId === id) {
        currentDiffSnapshotId = null;
      }
      refreshSnapshotsDialog();
    });
  });
}

let snapshotStyles: Promise<unknown> | null = null;

export async function openSnapshotsDialog(): Promise<void> {
  // The snapshot and diff styles are only needed here, so they stay out of the entry stylesheet.
  snapshotStyles ??= import('../styles/snapshots.css').catch(() => undefined);
  await snapshotStyles;
  refreshSnapshotsDialog();
  snapshotsDialog?.showModal();
}

/** "Take Snapshot" in the command palette: a checkpoint named by the time, with no dialog. */
export function takeQuickSnapshot(): void {
  const snap = saveSnapshot(
    `Snapshot ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
    fullDocument(),
  );
  notify(`Recorded snapshot "${snap.name}"`);
}
