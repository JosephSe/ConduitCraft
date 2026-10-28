import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

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
  type FileSystemFileHandleLike,
  type FileSystemWritableFileStreamLike,
} from '../src/studio/pwa';
const {
  app,
  AUTOSAVE_KEY,
  RECOVERY_KEY,
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
import { createBlankDocument, createNodeFromStencil } from '../src/templates/presets';
import type { DiagramDocument } from '../src/types';

describe('PWA install, manifest, service worker and file system access (suggestion 16)', () => {
  it('validates public/manifest.webmanifest structure and properties', () => {
    const manifestPath = path.resolve('public/manifest.webmanifest');
    assert.ok(fs.existsSync(manifestPath), 'manifest.webmanifest must exist in public/');

    const content = fs.readFileSync(manifestPath, 'utf8');
    const manifest = JSON.parse(content);

    assert.strictEqual(manifest.name, 'ConduitCraft — Architecture & Telemetry Studio');
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

    // .mmd extension -> Mermaid flowchart
    const mmd = serializeForFilename(doc, 'architecture.mmd');
    assert.strictEqual(mmd.format, 'mermaid');
    assert.strictEqual(mmd.mime, 'text/plain;charset=utf-8');
    assert.ok(mmd.content.includes('flowchart') || mmd.content.includes('graph'));
    assert.ok(mmd.content.includes('Auth Service'));

    // .mermaid extension -> Mermaid flowchart
    const mermaid = serializeForFilename(doc, 'cluster.mermaid');
    assert.strictEqual(mermaid.format, 'mermaid');
    assert.strictEqual(mermaid.mime, 'text/plain;charset=utf-8');

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

    // Test 1: Active file is .mmd -> saves Mermaid text directly to file stream
    let mmdWritten = '';
    const mmdHandle: FileSystemFileHandleLike = {
      kind: 'file',
      name: 'topology.mmd',
      getFile: async () => new File([''], 'topology.mmd'),
      createWritable: async () => ({
        write: async (data) => {
          mmdWritten = String(data);
        },
        close: async () => {},
      }),
    };

    setActiveFile(mmdHandle, 'topology.mmd');
    setDiskDirty(true);
    assert.strictEqual(isFileDiskDirty(), true);

    const resMmd = await saveWithNativeFileSystem(serializer, 'topology.mmd', false);
    assert.strictEqual(resMmd.success, true);
    assert.strictEqual(resMmd.directSaved, true);
    assert.ok(mmdWritten.includes('flowchart') || mmdWritten.includes('graph'));
    assert.ok(mmdWritten.includes('Orders DB'));
    assert.strictEqual(isFileDiskDirty(), false, 'Save clears disk dirty state');

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

  it('protects larger saved session from being overwritten by smaller session before acceptance (item 4)', () => {
    storageMap.clear();

    // User previously had a diagram with 3 nodes in local storage
    const previousSavedDoc: DiagramDocument = {
      ...createBlankDocument(),
      title: 'Previous Saved Production Architecture',
      nodes: [
        createNodeFromStencil('service', 50, 50),
        createNodeFromStencil('database', 250, 50),
        createNodeFromStencil('queue', 450, 50),
      ],
    };
    storageMap.set(AUTOSAVE_KEY, JSON.stringify(previousSavedDoc));

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

    // AUTOSAVE_KEY MUST NOT be overwritten by the smaller scratch session!
    const preservedRaw = storageMap.get(AUTOSAVE_KEY);
    assert.ok(preservedRaw, 'AUTOSAVE_KEY must still exist');
    const preserved = JSON.parse(preservedRaw!) as DiagramDocument;
    assert.strictEqual(preserved.title, 'Previous Saved Production Architecture');
    assert.strictEqual(preserved.nodes.length, 3, 'Preserved session must still have 3 nodes');

    // The smaller scratch session is safely routed to RECOVERY_KEY
    const recoveryRaw = storageMap.get(RECOVERY_KEY);
    assert.ok(recoveryRaw, 'RECOVERY_KEY must hold the smaller scratch session');
    const recovery = JSON.parse(recoveryRaw!) as DiagramDocument;
    assert.strictEqual(recovery.title, 'Quick Scratch');
    assert.strictEqual(recovery.nodes.length, 1);

    // Discarding the pending offer deletes AUTOSAVE_KEY and clears the offer
    discardPendingRestoreOffer();
    assert.strictEqual(getPendingRestoreOffer(), null);
    assert.strictEqual(fakeStorage.getItem(AUTOSAVE_KEY), null);
    assert.strictEqual(storageMap.has(AUTOSAVE_KEY), false);

    // Once discarded, future autosaves write normally to AUTOSAVE_KEY
    flushAutosave();
    assert.ok(fakeStorage.getItem(AUTOSAVE_KEY), 'Normal autosave resumes after offer is resolved');
  });

  it('manages save states, document title dirty indicator, and honest quota failure (item 6)', () => {
    setSaveState('saving');
    assert.strictEqual(getSaveState(), 'saving');

    setSaveState('saved');
    assert.strictEqual(getSaveState(), 'saved');

    // Test honest error reporting when localStorage quota is exceeded
    let errorHandlerCalled = false;
    setSaveErrorHandler(() => {
      errorHandlerCalled = true;
    });

    const originalSetItem = fakeStorage.setItem;
    // Simulate quota exceeded
    fakeStorage.setItem = () => {
      throw new Error('QuotaExceededError: storage is full');
    };

    app.doc = {
      ...createBlankDocument(),
      title: 'Full Diagram',
      nodes: [createNodeFromStencil('service', 50, 50)],
    };
    clearPendingRestoreOffer();

    flushAutosave();

    assert.strictEqual(getSaveState(), 'error', 'Save state transitions to error on storage quota failure');
    assert.strictEqual(errorHandlerCalled, true, 'Error handler is called to surface Save to file toast');

    // Document title dirty indicator
    updateDocumentTitle();
    assert.ok(
      document.title.startsWith('• '),
      `document.title should have dirty bullet when saveState is error: "${document.title}"`,
    );

    // Restore fakeStorage.setItem
    fakeStorage.setItem = originalSetItem;
    setSaveState('saved');
    updateDocumentTitle();
    assert.ok(
      !document.title.startsWith('• '),
      `document.title should not have dirty bullet when saved cleanly: "${document.title}"`,
    );
  });
});
