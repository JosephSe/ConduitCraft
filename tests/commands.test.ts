import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SHORTCUTS, renderShortcutsHtml, getModifierKey } from '../src/studio/commands.ts';

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

  it('elevates tooltip stacking context and defines all 4 directional positions in studio.css', () => {
    const cssPath = resolve(process.cwd(), 'src/styles/studio.css');
    const css = readFileSync(cssPath, 'utf8');

    // Elevate stacking context on hover/focus so tooltips never render behind subsequent sibling elements
    assert.ok(
      css.includes('[data-tip]:hover,\n[data-tip]:focus-visible {\n  z-index: 100;'),
      'elevates [data-tip] stacking context on hover and focus',
    );
    assert.ok(
      css.includes('.stencil-card {\n    position: relative;'),
      'ensures stencil card has position relative for stacking and absolute containment',
    );
    assert.ok(
      css.includes('.stencil-card:hover {') && css.includes('z-index: 100;'),
      'elevates hovered stencil card to z-index 100 above subsequent cards in grid',
    );

    // Directional positioning coverage
    assert.ok(css.includes('[data-tip-pos="top"]::after'), 'defines data-tip-pos="top"');
    assert.ok(css.includes('[data-tip-pos="bottom"]::after'), 'defines data-tip-pos="bottom"');
    assert.ok(css.includes('[data-tip-pos="right"]::after'), 'defines data-tip-pos="right"');
    assert.ok(css.includes('[data-tip-pos="left"]::after'), 'defines data-tip-pos="left"');

    // Collapsed rail tooltips & overflow visibility
    assert.ok(
      css.includes('.palette-rail-content [data-tip]::after'),
      'defines palette rail tooltip styling',
    );
    assert.ok(
      css.includes('.workspace[data-palette-collapsed="true"] .palette-sidebar {\n    overflow: visible;'),
      'keeps collapsed palette sidebar overflow visible for rail tooltips',
    );
  });
});
