import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  SNAPSHOTS_STORAGE_KEY,
  listSnapshots,
  saveSnapshot,
  getSnapshot,
  deleteSnapshot,
  computeDocumentDiff,
  renderSnapshotsDialogHtml,
} from '../src/studio/snapshots';
import { createBlankDocument, createNodeFromStencil } from '../src/templates/presets';
import type { DiagramDocument, DiagramEdge } from '../src/types';

describe('version snapshots and architecture diff view (suggestion 19)', () => {
  // In-memory localStorage mock for node test runner
  const storageMap = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key: string) => storageMap.get(key) ?? null,
    setItem: (key: string, value: string) => storageMap.set(key, String(value)),
    removeItem: (key: string) => storageMap.delete(key),
    clear: () => storageMap.clear(),
    key: (index: number) => Array.from(storageMap.keys())[index] ?? null,
    length: 0,
  } as Storage;

  beforeEach(() => {
    storageMap.clear();
  });

  it('saves, lists, retrieves, and deletes named version snapshots', () => {
    const doc = createBlankDocument();
    const nodeA = createNodeFromStencil('core', 100, 100, 0);
    nodeA.id = 'core-a';
    doc.nodes.push(nodeA);

    assert.strictEqual(listSnapshots().length, 0);

    const snap1 = saveSnapshot('Baseline v1.0', doc);
    assert.ok(snap1.id.startsWith('snap-'));
    assert.strictEqual(snap1.name, 'Baseline v1.0');
    assert.strictEqual(snap1.nodeCount, 1);
    assert.strictEqual(snap1.edgeCount, 0);

    const nodeB = createNodeFromStencil('service', 300, 100, 1);
    nodeB.id = 'auth-b';
    doc.nodes.push(nodeB);

    const snap2 = saveSnapshot('Sprint 42 Refactor', doc);
    assert.strictEqual(snap2.name, 'Sprint 42 Refactor');
    assert.strictEqual(snap2.nodeCount, 2);

    const all = listSnapshots();
    assert.strictEqual(all.length, 2);
    // Timestamp descending
    assert.strictEqual(all[0].id, snap2.id);
    assert.strictEqual(all[1].id, snap1.id);

    const retrieved = getSnapshot(snap1.id);
    assert.ok(retrieved);
    assert.strictEqual(retrieved.name, 'Baseline v1.0');
    assert.strictEqual(retrieved.doc.nodes.length, 1);

    deleteSnapshot(snap1.id);
    assert.strictEqual(listSnapshots().length, 1);
    assert.strictEqual(listSnapshots()[0].id, snap2.id);
  });

  it('identifies identical documents with hasChanges: false', () => {
    const docA = createBlankDocument();
    const docB = createBlankDocument();
    const node = createNodeFromStencil('store', 100, 100, 0);
    node.id = 'db-shard';
    docA.nodes.push(node);
    docB.nodes.push({ ...node });

    const diff = computeDocumentDiff(docA, docB);
    assert.strictEqual(diff.hasChanges, false);
    assert.strictEqual(diff.addedNodesCount, 0);
    assert.strictEqual(diff.removedNodesCount, 0);
    assert.strictEqual(diff.modifiedNodesCount, 0);
  });

  it('accurately computes added, removed, and modified nodes between snapshots', () => {
    const baseDoc = createBlankDocument();
    const currentDoc = createBlankDocument();

    // Node 1: Unchanged in both
    const nUnchanged = createNodeFromStencil('client', 50, 50, 0);
    nUnchanged.id = 'web-client';
    baseDoc.nodes.push(nUnchanged);
    currentDoc.nodes.push({ ...nUnchanged });

    // Node 2: Modified in currentDoc
    const nModBase = createNodeFromStencil('service', 200, 50, 1);
    nModBase.id = 'billing-svc';
    nModBase.title = 'Billing v1';
    nModBase.status = 'planned';
    baseDoc.nodes.push(nModBase);

    const nModCurrent = createNodeFromStencil('service', 200, 50, 1);
    nModCurrent.id = 'billing-svc';
    nModCurrent.title = 'Billing v2 Core';
    nModCurrent.status = 'live';
    nModCurrent.comment = 'Deployed to cluster';
    currentDoc.nodes.push(nModCurrent);

    // Node 3: Removed from currentDoc
    const nRemoved = createNodeFromStencil('store', 400, 50, 2);
    nRemoved.id = 'legacy-db';
    nRemoved.title = 'Legacy Oracle DB';
    baseDoc.nodes.push(nRemoved);

    // Node 4: Added in currentDoc
    const nAdded = createNodeFromStencil('store', 500, 50, 3);
    nAdded.id = 'aurora-pg';
    nAdded.title = 'Aurora Postgres';
    currentDoc.nodes.push(nAdded);

    const diff = computeDocumentDiff(baseDoc, currentDoc);
    assert.strictEqual(diff.hasChanges, true);
    assert.strictEqual(diff.addedNodesCount, 1);
    assert.strictEqual(diff.removedNodesCount, 1);
    assert.strictEqual(diff.modifiedNodesCount, 1);

    const addedItem = diff.nodeDiffs.find((n) => n.id === 'aurora-pg');
    assert.ok(addedItem);
    assert.strictEqual(addedItem.status, 'added');

    const removedItem = diff.nodeDiffs.find((n) => n.id === 'legacy-db');
    assert.ok(removedItem);
    assert.strictEqual(removedItem.status, 'removed');

    const modItem = diff.nodeDiffs.find((n) => n.id === 'billing-svc');
    assert.ok(modItem);
    assert.strictEqual(modItem.status, 'modified');
    assert.ok(modItem.changes.some((c) => c.includes('Billing v1') && c.includes('Billing v2 Core')));
    assert.ok(modItem.changes.some((c) => c.includes('planned') && c.includes('live')));
  });

  it('accurately computes added, removed, and modified wires', () => {
    const baseDoc = createBlankDocument();
    const currentDoc = createBlankDocument();

    const e1: DiagramEdge = {
      id: 'w1',
      from: 'a',
      to: 'b',
      sourcePort: 'right',
      targetPort: 'left',
      tone: 'blue',
      route: 'bezier',
      label: 'REST',
      animated: true,
    };
    baseDoc.edges.push(e1);

    // In currentDoc, e1 route and tone changed
    const e1Mod: DiagramEdge = {
      ...e1,
      route: 'orthogonal',
      tone: 'emerald',
      label: 'gRPC v2',
    };
    currentDoc.edges.push(e1Mod);

    // Added edge e2
    const e2: DiagramEdge = {
      id: 'w2',
      from: 'b',
      to: 'c',
      sourcePort: 'right',
      targetPort: 'left',
      tone: 'violet',
      route: 'direct',
      label: 'Kafka',
      animated: true,
    };
    currentDoc.edges.push(e2);

    const diff = computeDocumentDiff(baseDoc, currentDoc);
    assert.strictEqual(diff.addedEdgesCount, 1);
    assert.strictEqual(diff.modifiedEdgesCount, 1);
    assert.strictEqual(diff.removedEdgesCount, 0);

    const modEdge = diff.edgeDiffs.find((e) => e.id === 'w1');
    assert.ok(modEdge);
    assert.strictEqual(modEdge.status, 'modified');
    assert.ok(modEdge.changes.some((c) => c.includes('REST') && c.includes('gRPC v2')));
  });

  it('renders structured HTML diff summary and ledger markup', () => {
    const doc = createBlankDocument();
    const snap = saveSnapshot('Approved Architecture', doc);
    const snapshots = [snap];

    const current = createBlankDocument();
    const node = createNodeFromStencil('gate', 100, 100, 0);
    node.id = 'waf';
    node.title = 'WAF Gateway';
    current.nodes.push(node);

    const diff = computeDocumentDiff(snap.doc, current);
    const html = renderSnapshotsDialogHtml(snapshots, snap.id, diff);

    assert.ok(html.includes('Version Snapshots'));
    assert.ok(html.includes('Approved Architecture'));
    assert.ok(html.includes('+1 added'));
    assert.ok(html.includes('WAF Gateway'));
    assert.ok(html.includes('diff-row-added'));
  });
});
