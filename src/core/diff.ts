/**
 * The difference between two versions of a diagram (added, removed and changed components and wires). Pure and
 * DOM-free, so the snapshot dialog, the CLI and the drift check can all use it.
 */
import type { DiagramDocument, DiagramEdge, DiagramNode } from '../types';
import { limiterRate } from './components';

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

const QUEUE_FIELDS: Array<[keyof NonNullable<DiagramNode['queue']>, string]> = [
  ['ordering', 'ordering'],
  ['delivery', 'delivery'],
  ['maxDepth', 'max depth'],
  ['deadLetterId', 'dead-letter queue'],
  ['retention', 'retention'],
];

/** "Orders Queue: max depth 100 → 500" for each queue setting that changed (K1). */
function queueChanges(before: DiagramNode, after: DiagramNode): string[] {
  const out: string[] = [];
  for (const [key, label] of QUEUE_FIELDS) {
    const a = before.queue?.[key];
    const b = after.queue?.[key];
    if (a === b) continue;
    out.push(`${after.title || after.id}: ${label} ${a ?? 'none'} → ${b ?? 'none'}`);
  }
  return out;
}

/** "Edge LB: strategy round-robin → hash" when a load balancer's strategy changed (K2). */
function balancerChanges(before: DiagramNode, after: DiagramNode): string[] {
  const a = before.balancer?.strategy;
  const b = after.balancer?.strategy;
  return a === b ? [] : [`${after.title || after.id}: strategy ${a ?? 'round-robin'} → ${b ?? 'round-robin'}`];
}

/** Changes to a cache, rate limiter or scheduler setting (K3 to K5). */
function componentChanges(before: DiagramNode, after: DiagramNode): string[] {
  const name = after.title || after.id;
  const out: string[] = [];
  if (before.cache?.hitRate !== after.cache?.hitRate) out.push(`${name}: hit rate ${before.cache?.hitRate ?? 80}% → ${after.cache?.hitRate ?? 80}%`);
  if (before.cache?.backingId !== after.cache?.backingId) out.push(`${name}: backing store ${before.cache?.backingId ?? 'inferred'} → ${after.cache?.backingId ?? 'inferred'}`);
  const bl = limiterRate(before.limiter);
  const al = limiterRate(after.limiter);
  if (bl.admit !== al.admit || bl.per !== al.per) out.push(`${name}: admits ${bl.admit} of ${bl.per} → ${al.admit} of ${al.per}`);
  if (Boolean(before.limiter?.failOpen) !== Boolean(after.limiter?.failOpen)) out.push(`${name}: ${after.limiter?.failOpen ? 'now fails open' : 'now fails closed'}`);
  if (before.schedule?.every !== after.schedule?.every) out.push(`${name}: schedule ${before.schedule?.every ?? 'none'} → ${after.schedule?.every ?? 'none'}`);
  return out;
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
      for (const line of queueChanges(before, after)) changes.push(line);
      for (const line of balancerChanges(before, after)) changes.push(line);
      for (const line of componentChanges(before, after)) changes.push(line);
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
