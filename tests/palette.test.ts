import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Mock minimal document for Node test runner
// @ts-expect-error Mocking global document
globalThis.document = {
  createElement: () => ({ setAttribute: () => {}, appendChild: () => {}, addEventListener: () => {} }),
  getElementById: (id: string) => ({ id, addEventListener: () => {}, querySelectorAll: () => [] }),
  querySelector: () => null,
  querySelectorAll: () => [],
};

const {
  getPaletteCommands,
  filterPaletteCommands,
} = await import('../src/studio/palette.ts');
import type { PaletteDeps } from '../src/studio/palette.ts';
const { app } = await import('../src/studio/state.ts');

describe('command palette (Cmd/Ctrl+K)', () => {
  const dummyDeps: PaletteDeps = {
    openCodeDialog: () => {},
    openExportDialog: () => {},
    openSettingsDialog: () => {},
    openShortcutsDialog: () => {},
    deleteSelected: () => {},
    duplicateSelected: () => {},
    loadShowcase: () => {},
    runSimulationById: () => {},
  };

  it('provides a catalog of core studio commands', () => {
    const commands = getPaletteCommands(dummyDeps);
    assert.ok(commands.length >= 15, 'has extensive command set');

    const categories = new Set(commands.map((c) => c.category));
    assert.ok(categories.has('Components'));
    assert.ok(categories.has('Canvas & Layout'));
    assert.ok(categories.has('Mode & View'));
    assert.ok(categories.has('Edit & History'));
    assert.ok(categories.has('Export & Sync'));
    assert.ok(categories.has('Preferences'));
  });

  it('filters commands by multiple keywords and tokens', () => {
    const commands = getPaletteCommands(dummyDeps);

    const autoLayoutMatches = filterPaletteCommands(commands, 'auto layout');
    assert.ok(autoLayoutMatches.some((c) => c.id === 'auto-layout'));

    const exportMatches = filterPaletteCommands(commands, 'export json');
    assert.ok(exportMatches.some((c) => c.id === 'open-export'));

    const noMatches = filterPaletteCommands(commands, 'xyznonexistent123');
    assert.strictEqual(noMatches.length, 0);
  });

  it('dynamically generates jump targets for nodes in the document', () => {
    app.doc.nodes = [
      {
        id: 'node-ledger',
        kind: 'store',
        accent: 'blue',
        icon: 'database',
        title: 'Primary Ledger',
        subtitle: 'PostgreSQL DB',
        eyebrow: 'STORAGE',
        footerLeft: 'SQL',
        chip: 'TIER 1',
        zoneLabel: '',
        interfaceLabel: 'PostgreSQL / Port 5432',
        summary: 'Primary database ledger',
        metrics: [],
        x: 100,
        y: 100,
        width: 180,
        height: 100,
      },
    ];

    const commands = getPaletteCommands(dummyDeps);
    const jumpCmd = commands.find((c) => c.id === 'jump-node-node-ledger');
    assert.ok(jumpCmd, 'found dynamic jump command for ledger node');
    assert.strictEqual(jumpCmd.category, 'Nodes');
    assert.ok(jumpCmd.title.includes('Primary Ledger'));

    // Searching "ledger" should find the jump command
    const searchMatches = filterPaletteCommands(commands, 'ledger');
    assert.ok(searchMatches.some((c) => c.id === 'jump-node-node-ledger'));
  });
});
