import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readStudioCss } from './studioCss.ts';

const root = process.cwd();
const read = (rel: string) => readFileSync(resolve(root, rel), 'utf8');

describe('T3 primitives', () => {
  it('puts the primitives in the ui layer, after stage', () => {
    const entry = read('src/styles/studio.css');
    assert.match(entry, /@layer reset, tokens, layout, palette, stage, ui, components, inspector, dialogs, utilities;/);
    assert.match(entry, /@import "\.\/studio\/ui\.css";/);
    const ui = read('src/styles/studio/ui.css');
    assert.match(ui, /@layer ui \{/);
    for (const name of ['.btn {', '.btn.solid {', '.field {', '.switch {', '.stepper {', '.segmented-group {', '.popover {', '.dialog-shell {']) {
      assert.ok(ui.includes(name), name);
    }
    assert.match(ui, /^  dialog \{/m);
  });

  it('drops the old button, field, and shell names', () => {
    const studio = readStudioCss();
    const pages = [
      'index.html',
      'src/styles/home.css',
      'src/styles/snapshots.css',
      'src/studio/inspector.ts',
      'src/studio/bulkFields.ts',
      'src/studio/snapshots.ts',
      'src/studio/findReplaceDialog.ts',
      'src/studio/driftDialog.ts',
      'src/studio/homeScreen.ts',
      'src/studio/libraryUi.ts',
      'src/studio/templatesGallery.ts',
      'src/studio/interactions.ts',
    ].map(read).join('\n');
    const gone = [
      'btn-primary',
      'btn-ghost',
      'btn-sm',
      'btn-share-v2',
      'btn-action-compact',
      'prop-input',
      'prop-select(?!i)',
      'prop-textarea',
      'palette-modal-shell',
      'home-dialog-shell',
      'snapshots-dialog-shell',
    ];
    for (const name of gone) {
      const pattern = new RegExp(name);
      assert.ok(!pattern.test(studio), `studio css still has ${name}`);
      assert.ok(!pattern.test(pages), `markup still has ${name}`);
    }
  });

  it('serves every dialog from the one shell', () => {
    const html = read('index.html');
    const dialogs = html.match(/<dialog\b[\s\S]*?<\/dialog>/g) ?? [];
    assert.ok(dialogs.length >= 13, `expected at least 13 dialogs, found ${dialogs.length}`);
    for (const dialog of dialogs) {
      assert.match(dialog, /class="dialog-shell"/);
    }
    for (const file of ['src/studio/findReplaceDialog.ts', 'src/studio/driftDialog.ts', 'src/exporter/standaloneHtml.ts']) {
      assert.match(read(file), /class="dialog-shell"/);
    }
  });

  it('locks entry CSS at 128 KiB', () => {
    assert.match(read('tools/checkBundleSize.mjs'), /maxBytes: 128 \* 1024, label: 'entry CSS'/);
  });
});
