import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const html = readFileSync('index.html', 'utf8');
const header = html.slice(html.indexOf('<header class="topbar">'), html.indexOf('</header>'));
const ids = [...header.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);

describe('B1b: the header holds only what the top bar shows', () => {
  it('keeps the title, undo/redo, lens switch, Share and search', () => {
    for (const id of ['btn-focus-doc-title', 'btn-undo', 'btn-redo', 'btn-share', 'btn-open-palette', 'save-status-pill']) {
      assert.ok(ids.includes(id), `#${id} is in the header`);
    }
    assert.equal((header.match(/name="workspace-mode"/g) ?? []).length, 3, 'three lenses');
  });

  it('has none of the old hidden click targets', () => {
    const gone = [
      'btn-new-canvas', 'btn-open-file', 'btn-file-save', 'btn-file-save-as', 'btn-open-snapshots', 'btn-import-file',
      'btn-open-code', 'btn-open-matrix', 'btn-file-export', 'btn-install-app', 'btn-file-menu', 'file-menu-popup',
      'btn-open-export', 'btn-enter-presentation', 'btn-open-shortcuts', 'btn-open-settings', 'btn-toggle-motion',
      'btn-toggle-palette', 'btn-toggle-inspector', 'btn-auto-layout', 'btn-auto-layout-menu', 'design-toolbar',
      'data-toolbar', 'sim-buttons-slot', 'doc-system-tag', 'doc-status-label',
    ];
    for (const id of gone) assert.ok(!ids.includes(id), `#${id} is not in the header`);
    assert.ok(!header.includes('eyebrow-row'));
    assert.ok(!html.includes('sim-playback-deck'));
  });

  it('keeps the file input for the palette import, inside a landmark', () => {
    assert.ok(html.includes('id="file-upload"'));
    assert.ok(!header.includes('id="file-upload"'));
  });
});
