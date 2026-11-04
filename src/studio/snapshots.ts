/**
 * Version snapshots, timeline, and architecture diffing engine.
 * Allows saving named snapshots (e.g. "Baseline V1", "Pre-refactor"),
 * and visually computing/displaying added, removed, and modified components & wires.
 */
import type { DiagramDocument } from '../types';
import { escapeHtml } from '../shared/escapeHtml';
import { computeDocumentDiff } from '../core/diff';
import type { DocumentDiff, DiffStatus, EdgeDiffItem, NodeDiffItem } from '../core/diff';
import { listRecords, putRecord, getRecord, removeRecord, reportStorageFailure } from './storage';

export { computeDocumentDiff };
export type { DocumentDiff, DiffStatus, EdgeDiffItem, NodeDiffItem };

export interface VersionSnapshot {
  id: string;
  name: string;
  timestamp: number;
  nodeCount: number;
  edgeCount: number;
  doc: DiagramDocument;
}

/** Retrieve all saved version snapshots, newest first. */
export function listSnapshots(): VersionSnapshot[] {
  // Reversed first so that snapshots taken in the same millisecond still list newest first.
  return listRecords<VersionSnapshot>('snapshots').reverse().sort((a, b) => b.timestamp - a.timestamp);
}

/** Save a named version snapshot of the current document. A failed write is reported, never swallowed. */
export function saveSnapshot(name: string, doc: DiagramDocument): VersionSnapshot {
  const snapshot: VersionSnapshot = {
    id: `snap-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: name.trim() || `Snapshot ${new Date().toLocaleTimeString()}`,
    timestamp: Date.now(),
    nodeCount: doc.nodes.length,
    edgeCount: doc.edges.length,
    doc: structuredClone(doc),
  };
  putRecord('snapshots', snapshot).catch((err) => reportStorageFailure(err, 'snapshot'));
  return snapshot;
}

/** Delete a snapshot by ID. */
export function deleteSnapshot(id: string): void {
  removeRecord('snapshots', id).catch((err) => reportStorageFailure(err, 'snapshot'));
}

/** Retrieve a specific snapshot by ID. */
export function getSnapshot(id: string): VersionSnapshot | undefined {
  return getRecord<VersionSnapshot>('snapshots', id);
}

/** Render HTML markup for the snapshots dialog and diff viewer. */
export function renderSnapshotsDialogHtml(
  snapshots: VersionSnapshot[],
  selectedSnapshotId: string | null,
  diff: DocumentDiff | null
): string {
  const selectedSnapshot = snapshots.find((s) => s.id === selectedSnapshotId);

  return `
    <div class="snapshots-dialog-layout">
      <!-- Left Sidebar: Snapshots Timeline -->
      <aside class="snapshots-timeline-panel">
        <div class="snapshots-panel-header">
          <h3 class="snapshots-heading">Version Snapshots</h3>
          <span class="snapshots-count-pill">${snapshots.length} saved</span>
        </div>

        <form class="snapshot-create-row" id="snapshot-create-form" onsubmit="return false;">
          <input
            type="text"
            class="prop-input snapshot-name-input"
            id="input-snapshot-name"
            placeholder="e.g. Baseline v1, Pre-migration…"
            maxlength="48"
          />
          <button type="button" class="btn btn-compact btn-create-snapshot" id="btn-create-snapshot">
            + Snapshot
          </button>
        </form>

        <div class="snapshots-timeline-list" id="snapshots-timeline-list">
          ${
            snapshots.length === 0
              ? `<div class="snapshots-empty-hint">No snapshots saved yet. Click "+ Snapshot" to take a snapshot.</div>`
              : snapshots
                  .map((s) => {
                    const isSelected = s.id === selectedSnapshotId;
                    const dateStr = new Date(s.timestamp).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    });
                    return `
                    <div class="snapshot-card ${isSelected ? 'is-selected' : ''}" data-snapshot-id="${escapeHtml(s.id)}">
                      <div class="snapshot-card-top">
                        <strong class="snapshot-card-title">${escapeHtml(s.name)}</strong>
                        <span class="snapshot-card-date">${dateStr}</span>
                      </div>
                      <div class="snapshot-card-meta">
                        <span>${s.nodeCount} ${s.nodeCount === 1 ? 'node' : 'nodes'}</span>
                        <span>·</span>
                        <span>${s.edgeCount} ${s.edgeCount === 1 ? 'wire' : 'wires'}</span>
                      </div>
                      <div class="snapshot-card-actions">
                        <button type="button" class="btn btn-compact btn-snapshot-diff" data-diff-id="${escapeHtml(s.id)}">
                          ${isSelected ? 'Diffing' : 'Diff vs Current'}
                        </button>
                        <button type="button" class="btn btn-compact btn-snapshot-restore" data-restore-id="${escapeHtml(s.id)}">
                          Restore
                        </button>
                        <button type="button" class="btn btn-compact btn-snapshot-delete" data-delete-id="${escapeHtml(s.id)}" aria-label="Delete snapshot">
                          ✕
                        </button>
                      </div>
                    </div>
                  `;
                  })
                  .join('')
          }
        </div>
      </aside>

      <!-- Right Main: Diff Viewer -->
      <main class="snapshots-diff-view">
        ${
          !selectedSnapshot
            ? `
          <div class="diff-empty-state">
            <svg class="ui-icon" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
            <h4>Select or Create a Snapshot</h4>
            <p>Select any snapshot on the left to see what changed against your live canvas, or restore past architecture states.</p>
          </div>
        `
            : renderDiffContentHtml(selectedSnapshot, diff)
        }
      </main>
    </div>
  `;
}

function renderDiffContentHtml(snapshot: VersionSnapshot, diff: DocumentDiff | null): string {
  if (!diff) {
    return `<div>Loading diff…</div>`;
  }

  const activeChanges = [
    ...diff.nodeDiffs.filter((n) => n.status !== 'unchanged'),
    ...diff.edgeDiffs.filter((e) => e.status !== 'unchanged'),
  ];

  return `
    <div class="diff-header">
      <div>
        <h3 class="diff-target-title">Comparing vs "${escapeHtml(snapshot.name)}"</h3>
        <p class="diff-target-subtitle">Changes between snapshot and current live canvas</p>
      </div>
      <div class="diff-summary-badges">
        <span class="diff-badge diff-badge-added">+${diff.addedNodesCount + diff.addedEdgesCount} added</span>
        <span class="diff-badge diff-badge-modified">~${diff.modifiedNodesCount + diff.modifiedEdgesCount} modified</span>
        <span class="diff-badge diff-badge-removed">-${diff.removedNodesCount + diff.removedEdgesCount} removed</span>
      </div>
    </div>

    ${
      !diff.hasChanges
        ? `
      <div class="diff-no-changes">
        <div class="diff-match-pill">✓ Identical</div>
        <p>Your current architecture diagram is completely identical to <strong>"${escapeHtml(snapshot.name)}"</strong>.</p>
      </div>
    `
        : `
      <div class="diff-ledger">
        <h4 class="diff-ledger-title">Component & Connection Changes (${activeChanges.length})</h4>
        <div class="diff-ledger-items">
          ${diff.nodeDiffs
            .filter((n) => n.status !== 'unchanged')
            .map((item) => {
              const node = item.after || item.before;
              return `
                <div class="diff-row diff-row-${item.status}">
                  <span class="diff-row-tag diff-tag-${item.status}">${item.status.toUpperCase()}</span>
                  <div class="diff-row-body">
                    <strong>${escapeHtml(node?.title || item.id)}</strong> <span class="diff-kind-badge">${escapeHtml(node?.kind || 'node')}</span>
                    <ul class="diff-change-list">
                      ${item.changes.map((c) => `<li>${escapeHtml(c)}</li>`).join('')}
                    </ul>
                  </div>
                </div>
              `;
            })
            .join('')}

          ${diff.edgeDiffs
            .filter((e) => e.status !== 'unchanged')
            .map((item) => {
              const edge = item.after || item.before;
              return `
                <div class="diff-row diff-row-${item.status}">
                  <span class="diff-row-tag diff-tag-${item.status}">${item.status.toUpperCase()}</span>
                  <div class="diff-row-body">
                    <strong>Wire: ${escapeHtml(edge?.from)} ➔ ${escapeHtml(edge?.to)}</strong>
                    <ul class="diff-change-list">
                      ${item.changes.map((c) => `<li>${escapeHtml(c)}</li>`).join('')}
                    </ul>
                  </div>
                </div>
              `;
            })
            .join('')}
        </div>
      </div>
    `
    }
  `;
}
