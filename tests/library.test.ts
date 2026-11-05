import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { createZip, crc32, uniqueZipNames } from '../src/core/zip.ts';
import { parseBlueprintJson } from '../src/exporter/blueprintJson.ts';
import {
  createDiagram,
  deleteDiagram,
  duplicateDiagram,
  exportAllAsZip,
  getActiveDiagramId,
  listLibrary,
  renameDiagram,
  restoreDiagram,
  setActiveDiagramId,
  setThumbnail,
} from '../src/studio/library.ts';
import {
  AUTOSAVE_ID,
  RECOVERY_ID,
  DIAGRAM_PREFIX,
  createLocalStorageBackend,
  createMemoryBackend,
  flushWrites,
  getRecord,
  initStorage,
  putRecord,
  resetStorageForTests,
  type DiagramRecord,
} from '../src/studio/storage.ts';
import { createBlankDocument, createNodeFromStencil } from '../src/templates/presets.ts';
import type { DiagramDocument } from '../src/types.ts';

const docWith = (title: string, nodes = 1): DiagramDocument => ({
  ...createBlankDocument(),
  title,
  nodes: Array.from({ length: nodes }, (_, i) => createNodeFromStencil('service', i * 50, 0)),
});
const record = (id: string, title: string, updatedAt: number, nodes = 1): DiagramRecord => ({
  id,
  title,
  updatedAt,
  doc: docWith(title, nodes),
});

describe('diagram library (F-08 data)', () => {
  beforeEach(async () => {
    resetStorageForTests();
    // @ts-expect-error tests run without a browser
    delete globalThis.localStorage;
    await initStorage({ backend: createMemoryBackend() });
  });

  it('lists diagrams newest first and leaves the recovery copy out', async () => {
    await putRecord('diagrams', record(AUTOSAVE_ID, 'Old', 10));
    await putRecord('diagrams', record('d-2', 'New', 30));
    await putRecord('diagrams', record(RECOVERY_ID, 'Scratch', 99));
    assert.deepEqual(listLibrary().map((e) => e.title), ['New', 'Old']);
  });

  it('keeps the old autosave as the first entry and the open one', async () => {
    await putRecord('diagrams', record(AUTOSAVE_ID, 'Mine', 10));
    assert.equal(getActiveDiagramId(), AUTOSAVE_ID);
    const made = await createDiagram(docWith('Second'), 20);
    await setActiveDiagramId(made.id);
    assert.equal(getActiveDiagramId(), made.id);
    assert.equal(listLibrary().length, 2);
  });

  it('falls back when the remembered diagram is gone', async () => {
    const made = await createDiagram(docWith('Only'), 5);
    await setActiveDiagramId('d-missing');
    assert.equal(getActiveDiagramId(), made.id);
  });

  it('renames a diagram in its record and its document, and refuses an empty name', async () => {
    const made = await createDiagram(docWith('Before'), 1);
    assert.equal(await renameDiagram(made.id, '  After  ', 2), true);
    const stored = getRecord<DiagramRecord>('diagrams', made.id)!;
    assert.equal(stored.title, 'After');
    assert.equal(stored.doc.title, 'After');
    assert.equal(await renameDiagram(made.id, '   '), false);
    assert.equal(await renameDiagram('nope', 'X'), false);
  });

  it('duplicates with a new id, a copy title, and an untouched original', async () => {
    const made = await createDiagram(docWith('Plan', 3), 1);
    const copy = (await duplicateDiagram(made.id, 2))!;
    assert.notEqual(copy.id, made.id);
    assert.equal(copy.title, 'Plan copy');
    assert.equal(copy.doc.nodes.length, 3);
    assert.equal(getRecord<DiagramRecord>('diagrams', made.id)!.title, 'Plan');
    copy.doc.nodes.length = 0;
    assert.equal(getRecord<DiagramRecord>('diagrams', made.id)!.doc.nodes.length, 3);
    assert.equal(await duplicateDiagram('nope'), null);
  });

  it('deletes and brings back the same record', async () => {
    const made = await createDiagram(docWith('Keep me', 2), 7);
    const result = deleteDiagram(made.id)!;
    await result.done;
    assert.equal(listLibrary().length, 0);
    await restoreDiagram(result.removed);
    assert.equal(listLibrary().length, 1);
    assert.equal(getRecord<DiagramRecord>('diagrams', made.id)!.doc.nodes.length, 2);
    assert.equal(deleteDiagram(RECOVERY_ID), null);
  });

  it('sets a thumbnail without changing the document or the time', async () => {
    const made = await createDiagram(docWith('Pic'), 42);
    await setThumbnail(made.id, '<svg/>');
    const stored = getRecord<DiagramRecord>('diagrams', made.id)!;
    assert.equal(stored.thumbnail, '<svg/>');
    assert.equal(stored.updatedAt, 42);
  });

  it('exports every diagram as a Blueprint file inside a zip', async () => {
    await createDiagram(docWith('Same name', 1), 1);
    await createDiagram(docWith('Same name', 2), 2);
    const { bytes, count } = exportAllAsZip(new Date(2026, 0, 2, 3, 4, 6));
    assert.equal(count, 2);
    const files = readZip(bytes);
    assert.deepEqual(files.map((f) => f.name).sort(), ['same-name (2).blueprint.json', 'same-name.blueprint.json']);
    for (const file of files) {
      const parsed = parseBlueprintJson(new TextDecoder().decode(file.data));
      assert.equal(parsed.ok, true);
    }
  });

  it('keeps library entries in the localStorage fallback', async () => {
    resetStorageForTests();
    const map = new Map<string, string>();
    const storage = {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, String(v)),
      removeItem: (k: string) => void map.delete(k),
      key: (i: number) => [...map.keys()][i] ?? null,
      get length() {
        return map.size;
      },
    } as Storage;
    await initStorage({ backend: createLocalStorageBackend(storage) });
    await putRecord('diagrams', record(AUTOSAVE_ID, 'First', 1));
    const made = await createDiagram(docWith('Second'), 2);
    await flushWrites();
    assert.ok(map.has(DIAGRAM_PREFIX + AUTOSAVE_ID), 'the first entry is stored under the fallback\'s own key');

    resetStorageForTests();
    await initStorage({ backend: createLocalStorageBackend(storage) });
    assert.deepEqual(listLibrary().map((e) => e.title).sort(), ['First', 'Second']);
    assert.equal(getRecord<DiagramRecord>('diagrams', made.id)!.doc.title, 'Second');
  });
});

/** Read a zip back by its central directory, checking sizes and checksums on the way. */
function readZip(bytes: Uint8Array): Array<{ name: string; data: Uint8Array }> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = bytes.length - 22;
  assert.equal(view.getUint32(end, true), 0x06054b50);
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const out: Array<{ name: string; data: Uint8Array }> = [];
  for (let i = 0; i < count; i += 1) {
    assert.equal(view.getUint32(at, true), 0x02014b50);
    const crc = view.getUint32(at + 16, true);
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const local = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength));
    assert.equal(view.getUint32(local, true), 0x04034b50);
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = bytes.slice(start, start + size);
    assert.equal(crc32(data), crc);
    out.push({ name, data });
    at += 46 + nameLength;
  }
  return out;
}

describe('store-only zip writer', () => {
  it('matches the known checksum of "123456789"', () => {
    assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  });

  it('round-trips names and bytes, including an empty file and UTF-8 names', () => {
    const files = [
      { name: 'a.txt', data: new TextEncoder().encode('hello') },
      { name: 'empty.txt', data: new Uint8Array(0) },
      { name: 'café.json', data: new Uint8Array([0, 1, 2, 255]) },
    ];
    const back = readZip(createZip(files));
    assert.deepEqual(back.map((f) => f.name), files.map((f) => f.name));
    assert.deepEqual(back.map((f) => [...f.data]), files.map((f) => [...f.data]));
  });

  it('makes names safe and unique without caring about case', () => {
    assert.deepEqual(uniqueZipNames(['a.json', 'A.json', 'b/c:d.json', '']), [
      'a.json',
      'A (2).json',
      'b-c-d.json',
      'untitled',
    ]);
  });
});
