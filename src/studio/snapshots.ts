/**
 * Version snapshots, timeline, and architecture diffing engine.
 * Allows saving named snapshots (e.g. "Baseline V1", "Pre-refactor"),
 * and visually computing/displaying added, removed, and modified components & wires.
 */
import type { DiagramDocument, DiagramEdge, DiagramNode } from '../types';
import { escapeHtml } from '../shared/escapeHtml';
import { listRecords, putRecord, getRecord, removeRecord, reportStorageFailure } from './storage';

export interface VersionSnapshot {
  id: string;
  name: string;
  timestamp: number;
  nodeCount: number;
  edgeCount: number;
  doc: DiagramDocument;
}

export type DiffStatus = 'added' | 'removed' | 'modified' | 'unchanged';

export interface NodeDiffItem {
  id: string;
  status: DiffStatus;
  before?: DiagramNode;
  after?: DiagramNode;
  changes: string[];
}

export interface EdgeDiffItem {
  id: string;
  status: DiffStatus;
  before?: DiagramEdge;
  after?: DiagramEdge;
  changes: string[];
}

export interface DocumentDiff {
  nodeDiffs: NodeDiffItem[];
  edgeDiffs: EdgeDiffItem[];
  addedNodesCount: number;
  removedNodesCount: number;
  modifiedNodesCount: number;
  addedEdgesCount: number;
  removedEdgesCount: number;
  modifiedEdgesCount: number;
  hasChanges: boolean;
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

/** Compute differences between a base document (e.g. past snapshot) and current document. */
export function computeDocumentDiff(baseDoc: DiagramDocument, currentDoc: DiagramDocument): DocumentDiff {
  const baseNodes = new Map(baseDoc.nodes.map((n) => [n.id, n]));
  const currentNodes = new Map(currentDoc.nodes.map((n) => [n.id, n]));

  const allNodeIds = new Set([...baseNodes.keys(), ...currentNodes.keys()]);
  const nodeDiffs: NodeDiffItem[] = [];

  for (const id of allNodeIds) {
    const before = baseNodes.get(id);
    const after = currentNodes.get(id);

    if (!before && after) {
      nodeDiffs.push({
        id,
        status: 'added',
        after,
        changes: [`Added ${after.kind || 'component'} "${after.title || after.id}"`],
      });
    } else if (before && !after) {
      nodeDiffs.push({
        id,
        status: 'removed',
        before,
        changes: [`Removed ${before.kind || 'component'} "${before.title || before.id}"`],
      });
    } else if (before && after) {
      const changes: string[] = [];
      if (before.title !== after.title) {
        changes.push(`Title changed from "${before.title}" to "${after.title}"`);
      }
      if (before.subtitle !== after.subtitle) {
        changes.push(`Subtitle changed from "${before.subtitle}" to "${after.subtitle}"`);
      }
      if (before.kind !== after.kind) {
        changes.push(`Kind changed from ${before.kind} to ${after.kind}`);
      }
      if (before.status !== after.status) {
        changes.push(`Status changed from ${before.status || 'none'} to ${after.status || 'none'}`);
      }
      if (before.comment !== after.comment) {
        changes.push('Review comment updated');
      }
      if (before.accent !== after.accent) {
        changes.push(`Accent colour changed from ${before.accent || 'default'} to ${after.accent || 'default'}`);
      }
      if (before.shape !== after.shape) {
        changes.push(`Shape changed from ${before.shape || 'box'} to ${after.shape || 'box'}`);
      }
      if (before.x !== after.x || before.y !== after.y) {
        changes.push(`Moved to (${after.x}, ${after.y})`);
      }

      nodeDiffs.push({
        id,
        status: changes.length > 0 ? 'modified' : 'unchanged',
        before,
        after,
        changes,
      });
    }
  }

  // Compare Edges
  const baseEdges = new Map(baseDoc.edges.map((e) => [e.id, e]));
  const currentEdges = new Map(currentDoc.edges.map((e) => [e.id, e]));
  const allEdgeIds = new Set([...baseEdges.keys(), ...currentEdges.keys()]);
  const edgeDiffs: EdgeDiffItem[] = [];

  for (const id of allEdgeIds) {
    const before = baseEdges.get(id);
    const after = currentEdges.get(id);

    if (!before && after) {
      edgeDiffs.push({
        id,
        status: 'added',
        after,
        changes: [`Added wire from ${after.from} to ${after.to}${after.label ? ` (${after.label})` : ''}`],
      });
    } else if (before && !after) {
      edgeDiffs.push({
        id,
        status: 'removed',
        before,
        changes: [`Removed wire from ${before.from} to ${before.to}${before.label ? ` (${before.label})` : ''}`],
      });
    } else if (before && after) {
      const changes: string[] = [];
      if (before.label !== after.label) {
        changes.push(`Wire label changed from "${before.label}" to "${after.label}"`);
      }
      if (before.route !== after.route) {
        changes.push(`Routing mode changed from ${before.route} to ${after.route}`);
      }
      if (before.tone !== after.tone) {
        changes.push(`Wire colour changed from ${before.tone} to ${after.tone}`);
      }
      if (before.from !== after.from || before.to !== after.to) {
        changes.push(`Endpoints rewired to ${after.from} -> ${after.to}`);
      }
      if (before.comment !== after.comment) {
        changes.push('Wire comment updated');
      }
      if ((before.flow || 'forward') !== (after.flow || 'forward')) {
        changes.push(`Wire flow changed from ${before.flow || 'forward'} to ${after.flow || 'forward'}`);
      }

      edgeDiffs.push({
        id,
        status: changes.length > 0 ? 'modified' : 'unchanged',
        before,
        after,
        changes,
      });
    }
  }

  const addedNodesCount = nodeDiffs.filter((n) => n.status === 'added').length;
  const removedNodesCount = nodeDiffs.filter((n) => n.status === 'removed').length;
  const modifiedNodesCount = nodeDiffs.filter((n) => n.status === 'modified').length;

  const addedEdgesCount = edgeDiffs.filter((e) => e.status === 'added').length;
  const removedEdgesCount = edgeDiffs.filter((e) => e.status === 'removed').length;
  const modifiedEdgesCount = edgeDiffs.filter((e) => e.status === 'modified').length;

  const hasChanges =
    addedNodesCount > 0 ||
    removedNodesCount > 0 ||
    modifiedNodesCount > 0 ||
    addedEdgesCount > 0 ||
    removedEdgesCount > 0 ||
    modifiedEdgesCount > 0;

  return {
    nodeDiffs,
    edgeDiffs,
    addedNodesCount,
    removedNodesCount,
    modifiedNodesCount,
    addedEdgesCount,
    removedEdgesCount,
    modifiedEdgesCount,
    hasChanges,
  };
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
