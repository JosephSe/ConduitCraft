import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  renderUiIconMarkup,
  renderIconMarkup,
  ICON_LIST,
  ICON_BOX,
  ICON_STROKE,
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
  'template',
  'play',
  'pause',
  'help',
  'sidebarLeft',
  'sidebarRight',
];

describe('UI and node SVG icons', () => {
  it('renders valid SVG markup for all UI icon types', () => {
    for (const name of ALL_UI_ICONS) {
      const markup = renderUiIconMarkup(name, 18);
      assert.ok(markup.startsWith('<svg'), `icon ${name} starts with <svg`);
      assert.ok(markup.endsWith('</svg>'), `icon ${name} ends with </svg>`);
      assert.ok(markup.includes('width="18"'), `icon ${name} has custom size`);
      assert.ok(markup.includes('height="18"'), `icon ${name} has custom height`);
      assert.ok(markup.includes(`viewBox="0 0 ${ICON_BOX} ${ICON_BOX}"`), `icon ${name} has standard viewBox`);
      assert.ok(markup.includes(`stroke-width="${ICON_STROKE}"`), `icon ${name} uses the 1.6 stroke`);
      assert.ok(markup.includes('stroke-linecap="round"'), `icon ${name} has round caps`);
      assert.ok(markup.includes('fill="none"'), `icon ${name} has no fill`);
      assert.equal(markup.includes('fill="#'), false, `icon ${name} is not painted`);
      assert.ok(markup.includes('aria-hidden="true"'), `icon ${name} is decorative`);
    }
  });

  it('renders node icons and normalizes names', () => {
    assert.strictEqual(normalizeIconName('DATABASE', 'server'), 'database');
    assert.strictEqual(normalizeIconName('unknown-name', 'server'), 'server');
    const nodeSvg = renderIconMarkup('database', 20);
    assert.ok(nodeSvg.includes(`viewBox="0 0 ${ICON_BOX} ${ICON_BOX}"`));
    assert.ok(nodeSvg.includes(`stroke-width="${ICON_STROKE}"`));
    assert.ok(nodeSvg.includes('fill="none"'));
  });

  it('draws every chrome icon in the 24 box at 1.6 with round caps and no fill', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    const tags = html.match(/<svg class="ui-icon"[^>]*>/g) ?? [];
    assert.ok(tags.length > 20);
    for (const tag of tags) {
      assert.match(tag, /viewBox="0 0 24 24"/);
      assert.match(tag, /stroke-width="1\.6"/);
      assert.match(tag, /stroke-linecap="round"/);
      assert.match(tag, /stroke-linejoin="round"/);
      assert.match(tag, /fill="none"/);
    }
  });

  it('has a queue icon (K1): three stacked bars and an arrow, in the same box as the others', () => {
    assert.strictEqual(normalizeIconName('Queue', 'server'), 'queue');
    const svg = renderIconMarkup('queue', 18);
    assert.ok(svg.includes('viewBox="0 0 24 24"'));
    assert.strictEqual((svg.match(/<rect/g) ?? []).length, 3);
    assert.ok(ICON_LIST.some((i) => i.id === 'queue'));
  });
});
