import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import {
  isFileSystemAccessSupported,
  isServiceWorkerSupported,
  setActiveFile,
  getActiveFileHandle,
  getActiveFileName,
  resetActiveFile,
  saveWithNativeFileSystem,
  type FileSystemFileHandleLike,
  type FileSystemWritableFileStreamLike,
} from '../src/studio/pwa';

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
    assert.ok(sw.includes('conduitcraft-v1'), 'sw.js must declare cache name');
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
});
