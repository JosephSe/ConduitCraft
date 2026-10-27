import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  renderUiIconMarkup,
  renderIconMarkup,
  normalizeIconName,
  type UiIconName,
} from '../src/ui/icons.ts';

const ALL_UI_ICONS: UiIconName[] = [
  'undo',
  'redo',
  'pencil',
  'select',
  'connect',
  'settings',
  'swimlane',
  'notes',
  'upload',
  'trash',
  'copy',
  'zoomIn',
  'zoomOut',
  'fit',
  'layout',
  'play',
  'pause',
  'help',
];

describe('UI and node SVG icons', () => {
  it('renders valid SVG markup for all UI icon types', () => {
    for (const name of ALL_UI_ICONS) {
      const markup = renderUiIconMarkup(name, 18);
      assert.ok(markup.startsWith('<svg'), `icon ${name} starts with <svg`);
      assert.ok(markup.endsWith('</svg>'), `icon ${name} ends with </svg>`);
      assert.ok(markup.includes('width="18"'), `icon ${name} has custom size`);
      assert.ok(markup.includes('height="18"'), `icon ${name} has custom height`);
      assert.ok(markup.includes('viewBox="0 0 24 24"'), `icon ${name} has standard viewBox`);
      assert.ok(markup.includes('aria-hidden="true"'), `icon ${name} is decorative`);
    }
  });

  it('renders node icons and normalizes names', () => {
    assert.strictEqual(normalizeIconName('DATABASE', 'server'), 'database');
    assert.strictEqual(normalizeIconName('unknown-name', 'server'), 'server');
    const nodeSvg = renderIconMarkup('database', 20);
    assert.ok(nodeSvg.includes('viewBox="0 0 24 24"'));
  });
});
