import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { KEY_BINDINGS, matchBinding, type KeyEventLike } from '../src/core/keymap.ts';

const ev = (key: string, extra: Partial<KeyEventLike> = {}): KeyEventLike => ({
  key,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...extra,
});
const design = { mode: 'design', hasSelection: true } as const;

describe('keymap', () => {
  it('maps the editing chords to registry action ids', () => {
    assert.equal(matchBinding(ev('z', { ctrlKey: true }), design), 'edit-undo');
    assert.equal(matchBinding(ev('Z', { metaKey: true, shiftKey: true }), design), 'edit-redo');
    assert.equal(matchBinding(ev('y', { ctrlKey: true }), design), 'edit-redo');
    assert.equal(matchBinding(ev('g', { ctrlKey: true }), design), 'edit-group');
    assert.equal(matchBinding(ev('G', { ctrlKey: true, shiftKey: true }), design), 'edit-ungroup');
    assert.equal(matchBinding(ev(']', { metaKey: true }), design), 'edit-bring-forward');
    assert.equal(matchBinding(ev('F2'), design), 'edit-rename');
  });

  it('ignores unbound chords, extra modifiers and Alt', () => {
    assert.equal(matchBinding(ev('z'), design), null);
    assert.equal(matchBinding(ev('z', { ctrlKey: true, altKey: true }), design), null);
    assert.equal(matchBinding(ev('d', { ctrlKey: true, shiftKey: true }), design), null);
    assert.equal(matchBinding(ev(']'), design), null, 'bare ] keeps its panel/z-order behaviour elsewhere');
  });

  it('keeps Delete for the browser when nothing is selected, and editing keys off in Data View', () => {
    assert.equal(matchBinding(ev('Delete'), design), 'edit-delete');
    assert.equal(matchBinding(ev('Backspace'), design), 'edit-delete');
    assert.equal(matchBinding(ev('Delete'), { mode: 'design', hasSelection: false }), null);
    assert.equal(matchBinding(ev('d', { ctrlKey: true }), { mode: 'data', hasSelection: true }), null);
    assert.equal(matchBinding(ev('z', { ctrlKey: true }), { mode: 'data', hasSelection: true }), 'edit-undo');
  });

  it('never binds one chord to two actions', () => {
    const seen = new Set<string>();
    for (const b of KEY_BINDINGS) {
      const chord = `${b.mod ? 'mod+' : ''}${b.shift ? 'shift+' : ''}${b.key.toLowerCase()}`;
      assert.ok(!seen.has(chord), chord);
      seen.add(chord);
    }
  });

  it('only binds ids the command palette defines', () => {
    const source = readFileSync(new URL('../src/studio/palette.ts', import.meta.url), 'utf8');
    for (const b of KEY_BINDINGS) assert.ok(source.includes(`id: '${b.actionId}'`), b.actionId);
  });

  it('binds the tool-rail letters only in the redesigned interface', () => {
    const v2 = { mode: 'design', hasSelection: false, ui: 2 } as const;
    assert.equal(matchBinding(ev('v'), v2), 'tool-select');
    assert.equal(matchBinding(ev('W', { shiftKey: true }), v2), null, 'shifted letters are not tool keys');
    assert.equal(matchBinding(ev('w'), v2), 'tool-connect');
    assert.equal(matchBinding(ev('z'), v2), 'add-zone');
    assert.equal(matchBinding(ev('n'), v2), 'add-notes');
    assert.equal(matchBinding(ev('c'), v2), 'open-insert');
    assert.equal(matchBinding(ev('v'), { mode: 'design', hasSelection: false }), null);
    assert.equal(matchBinding(ev('v'), { mode: 'data', hasSelection: false, ui: 2 }), null);
    assert.equal(matchBinding(ev('c', { ctrlKey: true }), v2), null, 'Cmd/Ctrl+C is copy, not Insert');
  });
});
