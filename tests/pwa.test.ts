import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { buildId, injectPrecache, selectPrecacheAssets } from '../tools/swPrecache';

// Minimal mock document and localStorage for node test runner
const storageMap = new Map<string, string>();
const fakeStorage = {
  getItem: (key: string) => storageMap.get(key) ?? null,
  setItem: (key: string, value: string) => storageMap.set(key, String(value)),
  removeItem: (key: string) => storageMap.delete(key),
  clear: () => storageMap.clear(),
  key: (index: number) => Array.from(storageMap.keys())[index] ?? null,
  get length() {
    return storageMap.size;
  },
} as Storage;

// @ts-expect-error Mocking global localStorage
globalThis.localStorage = fakeStorage;

// @ts-expect-error Mocking global document
globalThis.document = {
  title: 'Untitled Architecture — ConduitCraft',
  getElementById: (id: string) => ({
    id,
    dataset: {},
    style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener() {},
    setAttribute() {},
    removeAttribute() {},
    getAttribute: () => null,
  }),
  querySelector: () => null,
  querySelectorAll: () => [],
};

import {
  isFileSystemAccessSupported,
  isServiceWorkerSupported,
  setActiveFile,
  getActiveFileHandle,
  getActiveFileName,
  isFileDiskDirty,
  setDiskDirty,
  resetActiveFile,
  saveWithNativeFileSystem,
  serializeForFilename,
  isMermaidFileName,
  blueprintNameFor,
  type FileSystemFileHandleLike,
  type FileSystemWritableFileStreamLike,
} from '../src/studio/pwa';
const {
  app,
  setPendingRestoreOffer,
  getPendingRestoreOffer,
  clearPendingRestoreOffer,
  discardPendingRestoreOffer,
  flushAutosave,
  setSaveState,
  getSaveState,
  setSaveErrorHandler,
  updateDocumentTitle,
} = await import('../src/studio/state.ts');
import {
  AUTOSAVE_ID,
  RECOVERY_ID,
  createMemoryBackend,
  flushWrites,
  getRecord,
  initStorage,
  resetStorageForTests,
  type Backend,
  type DiagramRecord,
} from '../src/studio/storage';
import { createBlankDocument, createNodeFromStencil } from '../src/templates/presets';
import type { DiagramDocument } from '../src/types';

describe('PWA install, manifest, service worker and file system access (suggestion 16)', () => {
  it('validates public/manifest.webmanifest structure and properties', () => {
    const manifestPath = path.resolve('public/manifest.webmanifest');
    assert.ok(fs.existsSync(manifestPath), 'manifest.webmanifest must exist in public/');

    const content = fs.readFileSync(manifestPath, 'utf8');
    const manifest = JSON.parse(content);

    assert.strictEqual(manifest.name, 'ConduitCraft — Architecture Diagramming Studio');
    assert.strictEqual(manifest.short_name, 'ConduitCraft');
    assert.strictEqual(manifest.display, 'standalone');
    assert.strictEqual(manifest.start_url, './');
    assert.strictEqual(manifest.background_color, '#0c0e14');
    assert.strictEqual(manifest.theme_color, '#0c0e14');
    assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 1);
    assert.strictEqual(manifest.icons[0].src, 'icon.svg');
    assert.strictEqual(manifest.icons[0].type, 'image/svg+xml');
  });

  it('validates public/icon.svg is a valid scalable SVG icon', () => {
    const iconPath = path.resolve('public/icon.svg');
    assert.ok(fs.existsSync(iconPath), 'icon.svg must exist in public/');

    const content = fs.readFileSync(iconPath, 'utf8');
    assert.ok(content.startsWith('<svg'), 'icon.svg must start with <svg tag');
    assert.ok(content.includes('viewBox="0 0 512 512"'), 'icon.svg must have a 512x512 viewBox');
    assert.ok(content.includes('</svg>'), 'icon.svg must terminate with </svg>');
  });

  it('validates public/sw.js caches core shell and handles navigation fallback', () => {
    const swPath = path.resolve('public/sw.js');
    assert.ok(fs.existsSync(swPath), 'sw.js must exist in public/');

    const sw = fs.readFileSync(swPath, 'utf8');
    assert.ok(sw.includes('conduitcraft-v'), 'sw.js must declare cache name');
    assert.ok(sw.includes('install'), 'sw.js must have install event listener');
    assert.ok(sw.includes('activate'), 'sw.js must have activate event listener');
    assert.ok(sw.includes('fetch'), 'sw.js must have fetch event listener');
    assert.ok(sw.includes('manifest.webmanifest'), 'sw.js must cache manifest');
    assert.ok(sw.includes('icon.svg'), 'sw.js must cache icon');
  });

  it('manages active file handle state for File System Access API', () => {
    resetActiveFile();
    assert.strictEqual(getActiveFileHandle(), null);
    assert.strictEqual(getActiveFileName(), null);

    const mockHandle: FileSystemFileHandleLike = {
      kind: 'file',
      name: 'system-architecture.blueprint.json',
      getFile: async () => new File(['{}'], 'system-architecture.blueprint.json'),
      createWritable: async () => ({
        write: async () => {},
        close: async () => {},
      }),
    };

    setActiveFile(mockHandle, 'system-architecture.blueprint.json');
    assert.strictEqual(getActiveFileHandle(), mockHandle);
    assert.strictEqual(getActiveFileName(), 'system-architecture.blueprint.json');

    resetActiveFile();
    assert.strictEqual(getActiveFileHandle(), null);
    assert.strictEqual(getActiveFileName(), null);
  });

  it('performs direct overwrite save when active file handle is present', async () => {
    let writtenData: string | null = null;
    let closed = false;

    const mockStream: FileSystemWritableFileStreamLike = {
      write: async (data) => {
        writtenData = String(data);
      },
      close: async () => {
        closed = true;
      },
    };

    const mockHandle: FileSystemFileHandleLike = {
      kind: 'file',
      name: 'my-cluster.blueprint.json',
      getFile: async () => new File([''], 'my-cluster.blueprint.json'),
      createWritable: async () => mockStream,
    };

    setActiveFile(mockHandle, 'my-cluster.blueprint.json');

    const result = await saveWithNativeFileSystem(
      '{"version": 1, "nodes": []}',
      'default.blueprint.json',
      false
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.directSaved, true);
    assert.strictEqual(result.filename, 'my-cluster.blueprint.json');
    assert.strictEqual(writtenData, '{"version": 1, "nodes": []}');
    assert.strictEqual(closed, true);

    resetActiveFile();
  });

  it('detects environmental capability flags safely', () => {
    // In Node test environment, window.showOpenFilePicker is undefined
    assert.strictEqual(isFileSystemAccessSupported(), false);
    // In Node test environment, navigator.serviceWorker is undefined
    assert.strictEqual(isServiceWorkerSupported(), false);
  });

  it('resolves serializer and MIME type based on active file extension (suggestion 16 / item 5)', () => {
    const doc = createBlankDocument();
    doc.title = 'Payment Gateway';
    const n1 = createNodeFromStencil('service', 100, 100);
    n1.title = 'Auth Service';
    doc.nodes.push(n1);

    // D8: Mermaid is import only, so a Mermaid name never gets a Mermaid writer
    assert.strictEqual(serializeForFilename(doc, 'architecture.mmd').format, 'json');
    assert.strictEqual(serializeForFilename(doc, 'cluster.mermaid').format, 'json');
    assert.strictEqual(isMermaidFileName('Cluster.MERMAID'), true);
    assert.strictEqual(isMermaidFileName('notes.md'), false);
    assert.strictEqual(blueprintNameFor('topology.mmd'), 'topology.md');
    assert.strictEqual(blueprintNameFor('cluster.Mermaid'), 'cluster.md');

    // .md extension -> Blueprint Markdown
    const md = serializeForFilename(doc, 'architecture.md');
    assert.strictEqual(md.format, 'blueprint-md');
    assert.strictEqual(md.mime, 'text/markdown;charset=utf-8');
    assert.ok(md.content.startsWith('---\n'), 'Blueprint Markdown must start with YAML frontmatter');
    assert.ok(md.content.includes('```mermaid'), 'Blueprint Markdown must contain Mermaid fence');
    assert.ok(md.content.includes('Auth Service'));

    // .markdown extension -> Blueprint Markdown
    const markdown = serializeForFilename(doc, 'overview.markdown');
    assert.strictEqual(markdown.format, 'blueprint-md');

    // .json / .blueprint.json -> Blueprint JSON
    const json = serializeForFilename(doc, 'system.blueprint.json');
    assert.strictEqual(json.format, 'json');
    assert.strictEqual(json.mime, 'application/json;charset=utf-8');
    const parsed = JSON.parse(json.content) as { document: DiagramDocument };
    assert.strictEqual(parsed.document.title, 'Payment Gateway');
    assert.strictEqual(parsed.document.nodes.length, 1);
    assert.strictEqual(parsed.document.nodes[0].title, 'Auth Service');

    // Unknown extension defaults safely to JSON
    const fallback = serializeForFilename(doc, 'backup.dat');
    assert.strictEqual(fallback.format, 'json');
  });

  it('saves in the format matching active file extension using serializer function (item 5)', async () => {
    const doc = createBlankDocument();
    doc.title = 'Order Service';
    const n1 = createNodeFromStencil('database', 120, 120);
    n1.title = 'Orders DB';
    doc.nodes.push(n1);

    const serializer = (name: string) => serializeForFilename(doc, name).content;

    // Test 1: Active file is .mmd -> never written (D8); without a save picker nothing is saved
    let mmdWrites = 0;
    const mmdHandle: FileSystemFileHandleLike = {
      kind: 'file',
      name: 'topology.mmd',
      getFile: async () => new File([''], 'topology.mmd'),
      createWritable: async () => ({
        write: async () => {
          mmdWrites += 1;
        },
        close: async () => {},
      }),
    };

    setActiveFile(mmdHandle, 'topology.mmd');
    setDiskDirty(true);
    const resMmd = await saveWithNativeFileSystem(serializer, 'topology.mmd', false);
    assert.strictEqual(resMmd.success, false);
    assert.strictEqual(resMmd.filename, 'topology.md', 'Save As is offered a Blueprint file name');
    assert.strictEqual(mmdWrites, 0, 'the opened .mmd file is never written');
    assert.strictEqual(isFileDiskDirty(), true, 'unsaved work stays marked unsaved');

    // Test 2: Active file is .md -> saves Blueprint Markdown text
    let mdWritten = '';
    const mdHandle: FileSystemFileHandleLike = {
      kind: 'file',
      name: 'topology.md',
      getFile: async () => new File([''], 'topology.md'),
      createWritable: async () => ({
        write: async (data) => {
          mdWritten = String(data);
        },
        close: async () => {},
      }),
    };

    setActiveFile(mdHandle, 'topology.md');
    const resMd = await saveWithNativeFileSystem(serializer, 'topology.md', false);
    assert.strictEqual(resMd.success, true);
    assert.ok(mdWritten.startsWith('---\n'), 'Saved Markdown file must start with YAML frontmatter');
    assert.ok(mdWritten.includes('```mermaid'), 'Saved Markdown file must contain Mermaid block');
    assert.ok(mdWritten.includes('Orders DB'));

    resetActiveFile();
    assert.strictEqual(getActiveFileHandle(), null);
    assert.strictEqual(getActiveFileName(), null);
    assert.strictEqual(isFileDiskDirty(), false);
  });

  it('protects larger saved session from being overwritten by smaller session before acceptance (item 4)', async () => {
    resetStorageForTests();
    // User previously had a diagram with 3 nodes saved in this browser
    const previousSavedDoc: DiagramDocument = {
      ...createBlankDocument(),
      title: 'Previous Saved Production Architecture',
      nodes: [
        createNodeFromStencil('service', 50, 50),
        createNodeFromStencil('database', 250, 50),
        createNodeFromStencil('queue', 450, 50),
      ],
    };
    await initStorage({
      backend: createMemoryBackend({
        diagrams: [{ id: AUTOSAVE_ID, title: previousSavedDoc.title, updatedAt: 1, doc: previousSavedDoc } as DiagramRecord],
      }),
    });

    // Offer is registered at boot
    setPendingRestoreOffer(previousSavedDoc);
    assert.strictEqual(getPendingRestoreOffer()?.nodes.length, 3);

    // User starts editing canvas with only 1 scratch node
    app.doc = {
      ...createBlankDocument(),
      title: 'Quick Scratch',
      nodes: [createNodeFromStencil('service', 100, 100)],
    };

    // Autosave triggers
    flushAutosave();
    await flushWrites();

    // The autosave record MUST NOT be overwritten by the smaller scratch session!
    const preserved = getRecord<DiagramRecord>('diagrams', AUTOSAVE_ID)?.doc;
    assert.ok(preserved, 'the autosave record must still exist');
    assert.strictEqual(preserved.title, 'Previous Saved Production Architecture');
    assert.strictEqual(preserved.nodes.length, 3, 'Preserved session must still have 3 nodes');

    // The smaller scratch session is safely routed to the recovery record
    const recovery = getRecord<DiagramRecord>('diagrams', RECOVERY_ID)?.doc;
    assert.ok(recovery, 'the recovery record must hold the smaller scratch session');
    assert.strictEqual(recovery.title, 'Quick Scratch');
    assert.strictEqual(recovery.nodes.length, 1);

    // Discarding the pending offer deletes the autosave record and clears the offer
    discardPendingRestoreOffer();
    await flushWrites();
    assert.strictEqual(getPendingRestoreOffer(), null);
    assert.strictEqual(getRecord('diagrams', AUTOSAVE_ID), undefined);

    // Once discarded, future autosaves write normally
    flushAutosave();
    await flushWrites();
    assert.ok(getRecord('diagrams', AUTOSAVE_ID), 'Normal autosave resumes after offer is resolved');
  });

  it('waits for storage to be read before writing, so a saved session is never replaced (item 5)', async () => {
    resetStorageForTests();
    const saved: DiagramDocument = { ...createBlankDocument(), title: 'Saved', nodes: [createNodeFromStencil('service', 1, 1), createNodeFromStencil('queue', 90, 1)] };
    const backend = createMemoryBackend({
      diagrams: [{ id: AUTOSAVE_ID, title: 'Saved', updatedAt: 1, doc: saved } as DiagramRecord],
    });
    app.doc = { ...createBlankDocument(), title: 'Early edit', nodes: [createNodeFromStencil('queue', 5, 5)] };
    clearPendingRestoreOffer();
    // Boot starts reading first and registers the restore offer; an edit made meanwhile has to wait its turn.
    const booted = initStorage({ backend }).then(() => setPendingRestoreOffer(saved));
    flushAutosave();
    assert.strictEqual(app.hasPendingAutosave, true, 'the edit stays pending');
    await booted;
    await flushWrites();
    await new Promise((r) => setTimeout(r, 0));
    assert.strictEqual(getRecord<DiagramRecord>('diagrams', AUTOSAVE_ID)?.doc.title, 'Saved');
  });

  it('manages save states, document title dirty indicator, and honest quota failure (item 6)', async () => {
    resetStorageForTests();
    const failing: Backend = {
      ...createMemoryBackend(),
      async put() {
        throw Object.assign(new Error('The quota has been exceeded.'), { name: 'QuotaExceededError' });
      },
    };
    await initStorage({ backend: failing });

    setSaveState('saving');
    assert.strictEqual(getSaveState(), 'saving');

    setSaveState('saved');
    assert.strictEqual(getSaveState(), 'saved');

    let quotaReported: boolean | null = null;
    setSaveErrorHandler((quota) => {
      quotaReported = quota;
    });

    app.doc = {
      ...createBlankDocument(),
      title: 'Full Diagram',
      nodes: [createNodeFromStencil('service', 50, 50)],
    };
    clearPendingRestoreOffer();

    flushAutosave();
    await flushWrites();
    await new Promise((r) => setTimeout(r, 0));

    assert.strictEqual(getSaveState(), 'error', 'Save state transitions to error on storage quota failure');
    assert.strictEqual(quotaReported, true, 'Error handler is told the storage is full');
    assert.strictEqual(getRecord('diagrams', AUTOSAVE_ID), undefined, 'a failed write leaves nothing in the copy');

    // Document title dirty indicator
    updateDocumentTitle();
    assert.ok(
      document.title.startsWith('• '),
      `document.title should have dirty bullet when saveState is error: "${document.title}"`,
    );

    setSaveState('saved');
    updateDocumentTitle();
    assert.ok(
      !document.title.startsWith('• '),
      `document.title should not have dirty bullet when saved cleanly: "${document.title}"`,
    );
  });
});

describe('service worker precache injection', () => {
  const sw = fs.readFileSync(path.resolve('public/sw.js'), 'utf8');

  it('selects only js/css build outputs with relative paths', () => {
    assert.deepStrictEqual(
      selectPrecacheAssets(['index.html', 'assets/b.css', 'assets/a.js', 'icon.svg']),
      ['./assets/a.js', './assets/b.css'],
    );
  });

  it('fills every placeholder in sw.js and leaves valid precache entries', () => {
    const assets = ['./assets/a.js', './assets/b.css'];
    const out = injectPrecache(sw, assets);
    assert.ok(!out.includes('__BUILD_ID__'), 'no build id placeholder may remain');
    assert.ok(!out.includes('__PRECACHE__'), 'no precache placeholder may remain');
    assert.ok(out.includes('"./assets/a.js", "./assets/b.css"'));
    assert.match(out, new RegExp(`conduitcraft-v3-${buildId(assets)}`));
  });

  it('changes the cache name when the asset set changes', () => {
    assert.notStrictEqual(buildId(['./assets/a.js']), buildId(['./assets/a2.js']));
  });

  it('refuses a template that lost its placeholders', () => {
    assert.throws(() => injectPrecache('const x = 1;', []));
  });
});
