import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SHORTCUTS, renderShortcutsHtml, getModifierKey, platformShortcut } from '../src/studio/commands.ts';

describe('commands and keyboard shortcuts registry', () => {
  it('contains categorized shortcut entries with valid descriptions and keys', () => {
    assert.ok(SHORTCUTS.length >= 15, 'has comprehensive shortcut definitions');
    for (const item of SHORTCUTS) {
      assert.ok(item.keys.length > 0, `shortcut ${item.description} has keys`);
      assert.ok(item.description.trim().length > 0, 'has description');
      assert.ok(
        item.category === 'Drafting & Selection' ||
          item.category === 'Navigation & View' ||
          item.category === 'Document & Simulation',
        `category is valid: ${item.category}`,
      );
    }
  });

  it('renders structured HTML cheat-sheet markup with <kbd> tags', () => {
    const html = renderShortcutsHtml();
    assert.ok(html.includes('shortcuts-grid'));
    assert.ok(html.includes('Drafting &amp; Selection') || html.includes('Drafting & Selection'));
    assert.ok(html.includes('<kbd>'));
    assert.ok(html.includes('Undo last action'));
    assert.ok(html.includes('Duplicate selection'));
  });

  it('returns a valid modifier key for platform', () => {
    const mod = getModifierKey();
    assert.ok(mod === '⌘' || mod === 'Ctrl');
  });

  it('rewrites Mac modifier glyphs for other platforms and leaves Mac text alone', () => {
    assert.equal(platformShortcut('⌘Z', false), 'Ctrl+Z');
    assert.equal(platformShortcut('⌘⇧S', false), 'Ctrl+Shift+S');
    assert.equal(platformShortcut('⌘⌥K', false), 'Ctrl+Alt+K');
    assert.equal(platformShortcut('Find node… (⌘F)', false), 'Find node… (Ctrl+F)');
    assert.equal(platformShortcut('Group / Ungroup (⌘G)', false), 'Group / Ungroup (Ctrl+G)');
    assert.equal(platformShortcut('P', false), 'P');
    assert.equal(platformShortcut('⌘⇧S', true), '⌘⇧S');
  });
});
