import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  bringToFront,
  sendToBack,
  bringForward,
  sendBackward,
  isSelectionLocked,
  toggleSelectionLock,
  canGroupSelection,
  groupSelection,
  ungroupSelection,
  getGroupSiblingIds,
} from '../src/studio/zOrderLockGroup.ts';
import { createBlankDocument } from '../src/templates/presets.ts';
import { SHORTCUTS } from '../src/studio/commands.ts';
import type { DiagramDocument } from '../src/types.ts';

describe('Z-order, lock, and group commands', () => {
  function makeTestDoc(): DiagramDocument {
    return {
      ...createBlankDocument(),
      nodes: [
        {
          id: 'n1',
          kind: 'service',
          accent: 'blue',
          icon: 'server',
          title: 'Node 1',
          subtitle: 'Sub 1',
          eyebrow: 'SERVICE',
          footerLeft: '',
          chip: '',
          zoneLabel: '',
          interfaceLabel: '',
          summary: '',
          metrics: [],
          code: '',
          x: 100,
          y: 100,
          width: 160,
          height: 80,
        },
        {
          id: 'n2',
          kind: 'database',
          accent: 'emerald',
          icon: 'database',
          title: 'Node 2',
          subtitle: 'Sub 2',
          eyebrow: 'DATABASE',
          footerLeft: '',
          chip: '',
          zoneLabel: '',
          interfaceLabel: '',
          summary: '',
          metrics: [],
          code: '',
          x: 300,
          y: 100,
          width: 160,
          height: 80,
        },
        {
          id: 'n3',
          kind: 'queue',
          accent: 'violet',
          icon: 'queue',
          title: 'Node 3',
          subtitle: 'Sub 3',
          eyebrow: 'QUEUE',
          footerLeft: '',
          chip: '',
          zoneLabel: '',
          interfaceLabel: '',
          summary: '',
          metrics: [],
          code: '',
          x: 500,
          y: 100,
          width: 160,
          height: 80,
        },
      ],
      zones: [
        { id: 'z1', number: '01', title: 'Zone 1', subtitle: '', x: 0, width: 400 },
        { id: 'z2', number: '02', title: 'Zone 2', subtitle: '', x: 420, width: 400 },
      ],
      notesCards: [
        { id: 'c1', title: 'Card 1', code: '', x: 0, y: 0, items: [] },
        { id: 'c2', title: 'Card 2', code: '', x: 420, y: 0, items: [] },
      ],
    };
  }

  it('reorders elements with bringToFront and sendToBack', () => {
    const doc = makeTestDoc();
    assert.deepEqual(doc.nodes.map((n) => n.id), ['n1', 'n2', 'n3']);

    // Bring n1 to front
    const changed = bringToFront(doc, { type: 'node', id: 'n1' });
    assert.equal(changed, true);
    assert.deepEqual(doc.nodes.map((n) => n.id), ['n2', 'n3', 'n1']);

    // Already at front: returns false
    assert.equal(bringToFront(doc, { type: 'node', id: 'n1' }), false);

    // Send n1 to back
    const changedBack = sendToBack(doc, { type: 'node', id: 'n1' });
    assert.equal(changedBack, true);
    assert.deepEqual(doc.nodes.map((n) => n.id), ['n1', 'n2', 'n3']);

    // Already at back: returns false
    assert.equal(sendToBack(doc, { type: 'node', id: 'n1' }), false);
  });

  it('steps elements one layer forward or backward', () => {
    const doc = makeTestDoc();
    assert.deepEqual(doc.nodes.map((n) => n.id), ['n1', 'n2', 'n3']);

    // Step n1 forward (swaps with n2)
    bringForward(doc, { type: 'node', id: 'n1' });
    assert.deepEqual(doc.nodes.map((n) => n.id), ['n2', 'n1', 'n3']);

    // Step n1 forward again (swaps with n3)
    bringForward(doc, { type: 'node', id: 'n1' });
    assert.deepEqual(doc.nodes.map((n) => n.id), ['n2', 'n3', 'n1']);

    // Cannot step forward past end
    assert.equal(bringForward(doc, { type: 'node', id: 'n1' }), false);

    // Step backward
    sendBackward(doc, { type: 'node', id: 'n1' });
    assert.deepEqual(doc.nodes.map((n) => n.id), ['n2', 'n1', 'n3']);

    sendBackward(doc, { type: 'node', id: 'n1' });
    assert.deepEqual(doc.nodes.map((n) => n.id), ['n1', 'n2', 'n3']);

    // Cannot step backward past beginning
    assert.equal(sendBackward(doc, { type: 'node', id: 'n1' }), false);
  });

  it('reorders multi-selection of nodes to the front or back together', () => {
    const doc = makeTestDoc();
    bringToFront(doc, { type: 'multi', ids: ['n1', 'n2'] });
    assert.deepEqual(doc.nodes.map((n) => n.id), ['n3', 'n1', 'n2']);

    sendToBack(doc, { type: 'multi', ids: ['n1', 'n2'] });
    assert.deepEqual(doc.nodes.map((n) => n.id), ['n1', 'n2', 'n3']);
  });

  it('toggles lock state on individual and multi-selections', () => {
    const doc = makeTestDoc();
    const sel = { type: 'node' as const, id: 'n1' };

    assert.equal(isSelectionLocked(doc, sel), false);

    // Lock
    const locked = toggleSelectionLock(doc, sel);
    assert.equal(locked, true);
    assert.equal(isSelectionLocked(doc, sel), true);
    assert.equal(doc.nodes[0].locked, true);

    // Unlock
    const unlocked = toggleSelectionLock(doc, sel);
    assert.equal(unlocked, false);
    assert.equal(isSelectionLocked(doc, sel), false);
    assert.equal(doc.nodes[0].locked, false);

    // Multi-selection locking
    const multiSel = { type: 'multi' as const, ids: ['n1', 'n2'] };
    toggleSelectionLock(doc, multiSel);
    assert.equal(doc.nodes[0].locked, true);
    assert.equal(doc.nodes[1].locked, true);
    assert.equal(isSelectionLocked(doc, multiSel), true);
  });

  it('groups and ungroups components with shared groupId', () => {
    const doc = makeTestDoc();
    const singleSel = { type: 'node' as const, id: 'n1' };
    const multiSel = { type: 'multi' as const, ids: ['n1', 'n2'] };

    assert.equal(canGroupSelection(singleSel), false);
    assert.equal(canGroupSelection(multiSel), true);

    const groupId = groupSelection(doc, multiSel);
    assert.ok(groupId && groupId.startsWith('grp-'));
    assert.equal(doc.nodes[0].groupId, groupId);
    assert.equal(doc.nodes[1].groupId, groupId);
    assert.equal(doc.nodes[2].groupId, undefined);

    // Sibling lookup finds both group members
    const siblings = getGroupSiblingIds(doc, 'n1');
    assert.deepEqual(siblings.sort(), ['n1', 'n2']);

    // Ungroup
    const changed = ungroupSelection(doc, multiSel);
    assert.equal(changed, true);
    assert.equal(doc.nodes[0].groupId, undefined);
    assert.equal(doc.nodes[1].groupId, undefined);
  });

  it('registers Z-order, lock, and group shortcuts in shortcuts registry', () => {
    const hasFront = SHORTCUTS.some((s) => s.keys.includes(']'));
    const hasBack = SHORTCUTS.some((s) => s.keys.includes('['));
    const hasLock = SHORTCUTS.some((s) => s.keys.includes('L'));
    const hasGroup = SHORTCUTS.some((s) => s.keys.includes('G'));

    assert.ok(hasFront, 'has bring to front shortcut');
    assert.ok(hasBack, 'has send to back shortcut');
    assert.ok(hasLock, 'has lock shortcut');
    assert.ok(hasGroup, 'has group shortcut');
  });
});
