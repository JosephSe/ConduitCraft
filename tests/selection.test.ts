import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  excludeAllEdgesInSelection,
  getActiveEdgeIdsInSelection,
  includeAllEdgesInSelection,
  isEdgeActiveInSelection,
  normalizeSelection,
  resolveSelectionUpdate,
  selectionKey,
  selectionOfStage,
  toggleEdgeInSelection,
  toggleNodeInSelection,
  toggleNotesInSelection,
  toggleZoneInSelection,
} from '../src/studio/selection.ts';
import type { DiagramEdge, SelectionTarget } from '../src/types.ts';

const SAMPLE_EDGES: readonly DiagramEdge[] = [
  {
    id: 'e1',
    from: 'a',
    to: 'b',
    sourcePort: 'right',
    targetPort: 'left',
    tone: 'blue',
    route: 'auto',
    label: 'Request',
    animated: true,
  },
  {
    id: 'e2',
    from: 'b',
    to: 'c',
    sourcePort: 'right',
    targetPort: 'left',
    tone: 'emerald',
    route: 'auto',
    label: 'Payload',
    animated: false,
  },
  {
    id: 'e3',
    from: 'x',
    to: 'y',
    sourcePort: 'right',
    targetPort: 'left',
    tone: 'amber',
    route: 'auto',
    label: 'Other',
    animated: false,
  },
];

describe('selection controller', () => {
  it('keeps the current selection when the key does not change', () => {
    const current: SelectionTarget = { type: 'node', id: 'core' };
    const update = resolveSelectionUpdate(current, { type: 'node', id: 'core' });
    assert.equal(update.changed, false);
    assert.equal(update.selection, current);
  });

  it('copies multi-select ids and treats order as part of the key', () => {
    const ids = ['b', 'a'];
    const next = normalizeSelection({ type: 'multi', ids });
    ids.push('c');
    assert.deepEqual(next.ids, ['b', 'a']);
    assert.notEqual(selectionKey({ type: 'multi', ids: ['b', 'a'] }), selectionKey({ type: 'multi', ids: ['a', 'b'] }));
    const update = resolveSelectionUpdate({ type: 'node', id: 'a' }, { type: 'multi', ids: ['a', 'b'] });
    assert.equal(update.changed, true);
    assert.equal(selectionKey(update.selection), 'multi:a\u0000b');
  });

  it('selects swimlanes and notes together with components', () => {
    assert.deepEqual(selectionOfStage({ nodes: [], zones: ['lane'], notes: [] }), { type: 'zone', id: 'lane' });
    assert.deepEqual(selectionOfStage({ nodes: [], zones: [], notes: ['card'] }), { type: 'notes', id: 'card' });
    const mixed = selectionOfStage({ nodes: ['core'], zones: ['lane'], notes: ['card'] });
    assert.equal(mixed.type, 'multi');
    if (mixed.type !== 'multi') return;
    assert.deepEqual(mixed.ids, ['core']);
    assert.deepEqual(mixed.zoneIds, ['lane']);
    assert.deepEqual(mixed.notesIds, ['card']);
    const copied = normalizeSelection(mixed);
    mixed.zoneIds?.push('other');
    assert.deepEqual(copied.type === 'multi' ? copied.zoneIds : [], ['lane']);
    assert.equal(selectionKey(mixed), 'multi:core|lane\u0000other|card');
    assert.equal(selectionKey({ type: 'multi', ids: ['core'] }), 'multi:core');
  });

  it('collapses identical single targets and distinguishes kinds', () => {
    assert.equal(selectionKey({ type: 'edge', id: 'e1' }), 'edge:e1');
    assert.notEqual(selectionKey({ type: 'edge', id: 'e1' }), selectionKey({ type: 'node', id: 'e1' }));
    assert.equal(selectionKey({ type: 'none' }), 'none');
    const cleared = resolveSelectionUpdate({ type: 'zone', id: 'z' }, { type: 'none' });
    assert.equal(cleared.changed, true);
    assert.deepEqual(cleared.selection, { type: 'none' });
  });

  it('toggles components individually in multi-select', () => {
    // 1. None to single
    let sel: SelectionTarget = toggleNodeInSelection({ type: 'none' }, 'a');
    assert.deepEqual(sel, { type: 'node', id: 'a' });

    // 2. Add second node -> multi
    sel = toggleNodeInSelection(sel, 'b');
    assert.deepEqual(sel, { type: 'multi', ids: ['a', 'b'] });

    // 3. Add third node
    sel = toggleNodeInSelection(sel, 'c');
    assert.deepEqual(sel, { type: 'multi', ids: ['a', 'b', 'c'] });

    // 4. Click to unselect 'b' individually
    sel = toggleNodeInSelection(sel, 'b');
    assert.deepEqual(sel, { type: 'multi', ids: ['a', 'c'] });

    // 5. Click to unselect 'a' individually -> collapses to single node 'c'
    sel = toggleNodeInSelection(sel, 'a');
    assert.deepEqual(sel, { type: 'node', id: 'c' });

    // 6. Click to unselect last node 'c' -> none
    sel = toggleNodeInSelection(sel, 'c');
    assert.deepEqual(sel, { type: 'none' });
  });

  it('toggles and unselects connectors individually during multi-select', () => {
    // Start with multi-select of nodes a, b, c
    let sel: SelectionTarget = { type: 'multi', ids: ['a', 'b', 'c'] };

    // Initially, e1 (a->b) and e2 (b->c) are active
    assert.equal(isEdgeActiveInSelection(sel, 'e1', SAMPLE_EDGES), true);
    assert.equal(isEdgeActiveInSelection(sel, 'e2', SAMPLE_EDGES), true);
    assert.equal(isEdgeActiveInSelection(sel, 'e3', SAMPLE_EDGES), false);
    assert.deepEqual(getActiveEdgeIdsInSelection(sel, SAMPLE_EDGES), ['e1', 'e2']);

    // Unselect connector e1 individually
    sel = toggleEdgeInSelection(sel, 'e1', SAMPLE_EDGES);
    assert.equal(sel.type, 'multi');
    if (sel.type === 'multi') {
      assert.deepEqual(sel.excludedEdgeIds, ['e1']);
    }
    // Now e1 is unselected (inactive) while e2 remains active
    assert.equal(isEdgeActiveInSelection(sel, 'e1', SAMPLE_EDGES), false);
    assert.equal(isEdgeActiveInSelection(sel, 'e2', SAMPLE_EDGES), true);
    assert.deepEqual(getActiveEdgeIdsInSelection(sel, SAMPLE_EDGES), ['e2']);

    // Re-select connector e1
    sel = toggleEdgeInSelection(sel, 'e1', SAMPLE_EDGES);
    assert.equal(isEdgeActiveInSelection(sel, 'e1', SAMPLE_EDGES), true);
    assert.deepEqual(getActiveEdgeIdsInSelection(sel, SAMPLE_EDGES), ['e1', 'e2']);

    // Add independent connector e3
    sel = toggleEdgeInSelection(sel, 'e3', SAMPLE_EDGES);
    assert.equal(isEdgeActiveInSelection(sel, 'e3', SAMPLE_EDGES), true);
    assert.deepEqual(getActiveEdgeIdsInSelection(sel, SAMPLE_EDGES), ['e1', 'e2', 'e3']);

    // Remove independent connector e3
    sel = toggleEdgeInSelection(sel, 'e3', SAMPLE_EDGES);
    assert.equal(isEdgeActiveInSelection(sel, 'e3', SAMPLE_EDGES), false);
  });

  it('bulk excludes and restores all connectors in selection', () => {
    const sel: SelectionTarget = { type: 'multi', ids: ['a', 'b'] };
    assert.deepEqual(getActiveEdgeIdsInSelection(sel, SAMPLE_EDGES), ['e1', 'e2']);

    const allExcluded = excludeAllEdgesInSelection(sel, SAMPLE_EDGES);
    assert.equal(allExcluded.type, 'multi');
    if (allExcluded.type === 'multi') {
      assert.ok(allExcluded.excludedEdgeIds?.includes('e1'));
      assert.ok(allExcluded.excludedEdgeIds?.includes('e2'));
    }
    assert.deepEqual(getActiveEdgeIdsInSelection(allExcluded, SAMPLE_EDGES), []);

    const restored = includeAllEdgesInSelection(allExcluded);
    assert.deepEqual(getActiveEdgeIdsInSelection(restored, SAMPLE_EDGES), ['e1', 'e2']);
  });

  it('keeps multi-select target when single node has excluded edge', () => {
    // 1 node with an excluded edge does not collapse to pure node target
    const sel = toggleNodeInSelection({ type: 'multi', ids: ['a', 'b'], excludedEdgeIds: ['e1'] }, 'b');
    assert.equal(sel.type, 'multi');
    if (sel.type === 'multi') {
      assert.deepEqual(sel.ids, ['a']);
      assert.deepEqual(sel.excludedEdgeIds, ['e1']);
    }
  });

  it('selects and unselects swimlane stages and notes cards as part of multi-select', () => {
    // Start with a node selected
    let sel: SelectionTarget = { type: 'node', id: 'a' };

    // Toggle swimlane into selection
    sel = toggleZoneInSelection(sel, 'zone-1');
    assert.deepEqual(sel, { type: 'multi', ids: ['a'], zoneIds: ['zone-1'] });

    // Toggle notes card into selection
    sel = toggleNotesInSelection(sel, 'notes-1');
    assert.deepEqual(sel, { type: 'multi', ids: ['a'], zoneIds: ['zone-1'], notesIds: ['notes-1'] });

    // Add another swimlane
    sel = toggleZoneInSelection(sel, 'zone-2');
    assert.deepEqual(sel, { type: 'multi', ids: ['a'], zoneIds: ['zone-1', 'zone-2'], notesIds: ['notes-1'] });

    // Unselect zone-1 individually
    sel = toggleZoneInSelection(sel, 'zone-1');
    assert.deepEqual(sel, { type: 'multi', ids: ['a'], zoneIds: ['zone-2'], notesIds: ['notes-1'] });

    // Unselect node 'a' individually -> still multi (zone-2 and notes-1)
    sel = toggleNodeInSelection(sel, 'a');
    assert.deepEqual(sel, { type: 'multi', ids: [], zoneIds: ['zone-2'], notesIds: ['notes-1'] });

    // Unselect notes-1 individually -> collapses to single zone
    sel = toggleNotesInSelection(sel, 'notes-1');
    assert.deepEqual(sel, { type: 'zone', id: 'zone-2' });

    // Toggle notes-1 from single zone -> multi
    sel = toggleNotesInSelection(sel, 'notes-1');
    assert.deepEqual(sel, { type: 'multi', ids: [], zoneIds: ['zone-2'], notesIds: ['notes-1'] });

    // Unselect zone-2 -> collapses to single notes
    sel = toggleZoneInSelection(sel, 'zone-2');
    assert.deepEqual(sel, { type: 'notes', id: 'notes-1' });

    // Unselect notes-1 -> none
    sel = toggleNotesInSelection(sel, 'notes-1');
    assert.deepEqual(sel, { type: 'none' });
  });
});
