import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { layoutInlineEdit, resolveInlineEdit } from '../src/studio/inlineEdit.ts';

describe('resolveInlineEdit', () => {
  it('commits a changed, trimmed value', () => {
    assert.deepEqual(resolveInlineEdit('API', '  Billing API  '), { action: 'commit', value: 'Billing API' });
  });

  it('cancels when nothing changed, so no undo step is recorded', () => {
    assert.deepEqual(resolveInlineEdit('API', 'API'), { action: 'cancel' });
    assert.deepEqual(resolveInlineEdit('API', '  API '), { action: 'cancel' });
    assert.deepEqual(resolveInlineEdit('API  ', 'API'), { action: 'cancel' });
  });

  it('refuses to empty a name that must not be empty', () => {
    assert.deepEqual(resolveInlineEdit('API', ''), { action: 'cancel' });
    assert.deepEqual(resolveInlineEdit('API', '   '), { action: 'cancel' });
  });

  it('lets an optional label be cleared, but not "cleared" when it is already empty', () => {
    assert.deepEqual(resolveInlineEdit('gRPC', '', { allowEmpty: true }), { action: 'commit', value: '' });
    assert.deepEqual(resolveInlineEdit('', '', { allowEmpty: true }), { action: 'cancel' });
  });

  it('turns line breaks into single spaces', () => {
    assert.deepEqual(resolveInlineEdit('A', 'Order\n  Service'), { action: 'commit', value: 'Order Service' });
    assert.deepEqual(resolveInlineEdit('A', 'One\r\nTwo'), { action: 'commit', value: 'One Two' });
  });

  it('caps the length and trims what is left', () => {
    const result = resolveInlineEdit('A', 'x'.repeat(50), { maxLength: 10 });
    assert.deepEqual(result, { action: 'commit', value: 'x'.repeat(10) });
    assert.deepEqual(resolveInlineEdit('A', 'ab   cd', { maxLength: 3 }), { action: 'commit', value: 'ab' });
  });

  it('keeps markup-looking text as plain text for the caller to store', () => {
    assert.deepEqual(resolveInlineEdit('A', '<img src=x>'), { action: 'commit', value: '<img src=x>' });
  });
});

describe('layoutInlineEdit', () => {
  const viewport = { width: 1000, height: 700 };

  it('centres the field on the text and gives short text a readable minimum width', () => {
    const box = layoutInlineEdit({ left: 400, top: 300, width: 40, height: 16 }, viewport);
    assert.equal(box.width, 160);
    assert.equal(box.left + box.width / 2, 420);
    assert.ok(box.height >= 26);
  });

  it('is at least as wide as long text', () => {
    assert.equal(layoutInlineEdit({ left: 100, top: 100, width: 400, height: 20 }, viewport).width, 424);
  });

  it('stays inside the window near every edge', () => {
    const topLeft = layoutInlineEdit({ left: -50, top: -20, width: 30, height: 14 }, viewport);
    assert.ok(topLeft.left >= 6 && topLeft.top >= 6);
    const bottomRight = layoutInlineEdit({ left: 990, top: 695, width: 30, height: 14 }, viewport);
    assert.ok(bottomRight.left + bottomRight.width <= 994);
    assert.ok(bottomRight.top + bottomRight.height <= 694);
  });

  it('never exceeds the viewport width', () => {
    const box = layoutInlineEdit({ left: 0, top: 0, width: 5000, height: 20 }, { width: 390, height: 800 });
    assert.ok(box.width <= 390 - 12);
  });
});
