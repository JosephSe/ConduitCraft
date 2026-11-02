import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildActionContext, isActionAvailable } from '../src/core/actions.ts';
import { createBlankDocument } from '../src/templates/presets.ts';
import type { DiagramDocument } from '../src/types.ts';

function docWithNodes(): DiagramDocument {
  const doc = createBlankDocument();
  doc.nodes.push(
    { id: 'a', kind: 'service', title: 'A', subtitle: '', x: 0, y: 0, groupId: 'g1' },
    { id: 'b', kind: 'service', title: 'B', subtitle: '', x: 0, y: 0, groupId: 'g1' },
    { id: 'c', kind: 'service', title: 'C', subtitle: '', x: 0, y: 0 },
  );
  return doc;
}

describe('action availability', () => {
  it('needs a selection for selection actions, but not for canvas actions', () => {
    const ctx = buildActionContext({ type: 'none' }, docWithNodes(), 'design');
    for (const id of ['edit-delete', 'edit-rename', 'edit-lock', 'fit-selection', 'edit-group']) {
      assert.equal(isActionAvailable(id, ctx), false, id);
    }
    for (const id of ['edit-undo', 'fit-view', 'edit-select-all', 'add-service']) {
      assert.equal(isActionAvailable(id, ctx), true, id);
    }
  });

  it('allows Group only for two or more, Ungroup only when grouped', () => {
    const doc = docWithNodes();
    const one = buildActionContext({ type: 'node', id: 'c' }, doc, 'design');
    assert.equal(isActionAvailable('edit-group', one), false);
    assert.equal(isActionAvailable('edit-ungroup', one), false);
    const two = buildActionContext({ type: 'multi', ids: ['a', 'c'] }, doc, 'design');
    assert.equal(isActionAvailable('edit-group', two), true);
    assert.equal(isActionAvailable('edit-ungroup', two), true);
  });

  it('keeps wires out of lock, arrange and duplicate, but lets them be renamed and deleted', () => {
    const ctx = buildActionContext({ type: 'edge', id: 'e1' }, docWithNodes(), 'design');
    assert.equal(isActionAvailable('edit-rename', ctx), true);
    assert.equal(isActionAvailable('edit-delete', ctx), true);
    assert.equal(isActionAvailable('edit-lock', ctx), false);
    assert.equal(isActionAvailable('edit-duplicate', ctx), false);
    assert.equal(isActionAvailable('edit-bring-to-front', ctx), false);
  });

  it('turns editing actions off in Data View', () => {
    const ctx = buildActionContext({ type: 'node', id: 'a' }, docWithNodes(), 'data');
    assert.equal(isActionAvailable('edit-delete', ctx), false);
    assert.equal(isActionAvailable('fit-selection', ctx), true);
  });

  it('treats an empty multi-selection as no selection', () => {
    const ctx = buildActionContext({ type: 'multi', ids: [] }, docWithNodes(), 'design');
    assert.equal(ctx.selection, 'none');
    assert.equal(isActionAvailable('edit-delete', ctx), false);
  });

  it('lays out a selection only with two or more components', () => {
    const doc = docWithNodes();
    assert.equal(isActionAvailable('auto-layout-selection', buildActionContext({ type: 'node', id: 'a' }, doc, 'design')), false);
    assert.equal(
      isActionAvailable('auto-layout-selection', buildActionContext({ type: 'multi', ids: ['a', 'b'] }, doc, 'design')),
      true,
    );
  });
});
