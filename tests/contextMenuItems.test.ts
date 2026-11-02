import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MENU_SEPARATOR, contextMenuCommandIds, tidySeparators, type ContextSelectionType } from '../src/core/contextMenuItems.ts';

const TYPES: ContextSelectionType[] = ['none', 'node', 'edge', 'zone', 'notes', 'multi'];

describe('context menu items', () => {
  it('offers Ungroup only when the selection is grouped', () => {
    assert.ok(!contextMenuCommandIds('node', { grouped: false }).includes('edit-ungroup'));
    assert.ok(contextMenuCommandIds('node', { grouped: true }).includes('edit-ungroup'));
    assert.ok(contextMenuCommandIds('multi', { grouped: true }).includes('edit-ungroup'));
  });

  it('offers Group only for several items, and Delete for every real selection', () => {
    assert.ok(contextMenuCommandIds('multi', { grouped: false }).includes('edit-group'));
    assert.ok(!contextMenuCommandIds('node', { grouped: false }).includes('edit-group'));
    for (const type of TYPES.filter((t) => t !== 'none')) {
      assert.ok(contextMenuCommandIds(type, { grouped: false }).includes('edit-delete'), type);
    }
  });

  it('never starts, ends or doubles a separator', () => {
    for (const type of TYPES) {
      for (const grouped of [true, false]) {
        const ids = contextMenuCommandIds(type, { grouped });
        assert.notEqual(ids[0], MENU_SEPARATOR, type);
        assert.notEqual(ids[ids.length - 1], MENU_SEPARATOR, type);
        ids.forEach((id, i) => assert.ok(!(id === MENU_SEPARATOR && ids[i - 1] === MENU_SEPARATOR), type));
      }
    }
  });

  it('only references ids the command palette defines', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(new URL('../src/studio/palette.ts', import.meta.url), 'utf8');
    for (const type of TYPES) {
      for (const id of contextMenuCommandIds(type, { grouped: true })) {
        if (id === MENU_SEPARATOR) continue;
        assert.ok(source.includes(`id: '${id}'`), `${type}: ${id}`);
      }
    }
  });

  it('tidies separators after filtering', () => {
    assert.deepEqual(tidySeparators(['-', 'a', '-', '-', 'b', '-']), ['a', '-', 'b']);
    assert.deepEqual(tidySeparators(['-']), []);
  });
});
