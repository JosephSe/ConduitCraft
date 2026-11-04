import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import {
  AUTOSAVE_ID,
  LEGACY_KEYS,
  RECOVERY_ID,
  createLocalStorageBackend,
  createMemoryBackend,
  flushWrites,
  getRecord,
  getStorageStatus,
  hasRecord,
  initStorage,
  isQuotaError,
  listRecords,
  putRecord,
  removeRecord,
  resetStorageForTests,
  type Backend,
  type DiagramRecord,
} from '../src/studio/storage.ts';
import { createBlankDocument, createNodeFromStencil } from '../src/templates/presets.ts';
import type { DiagramDocument } from '../src/types.ts';

function fakeLocalStorage(initial: Record<string, string> = {}): Storage & { map: Map<string, string> } {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  } as Storage & { map: Map<string, string> };
}

const docWith = (title: string, nodes = 1): DiagramDocument => ({
  ...createBlankDocument(),
  title,
  nodes: Array.from({ length: nodes }, (_, i) => createNodeFromStencil('service', i * 50, 0)),
});
const record = (id: string, doc: DiagramDocument): DiagramRecord => ({ id, title: doc.title, updatedAt: 1, doc });

describe('storage layer (T-04)', () => {
  beforeEach(() => {
    resetStorageForTests();
    // @ts-expect-error tests run without a browser
    delete globalThis.localStorage;
  });

  it('reads back what it wrote, and hands out copies', async () => {
    await initStorage({ backend: createMemoryBackend() });
    await putRecord('diagrams', record(AUTOSAVE_ID, docWith('One')));
    const first = getRecord<DiagramRecord>('diagrams', AUTOSAVE_ID)!;
    first.doc.title = 'Changed by a caller';
    assert.equal(getRecord<DiagramRecord>('diagrams', AUTOSAVE_ID)!.doc.title, 'One');
    await removeRecord('diagrams', AUTOSAVE_ID);
    assert.equal(hasRecord('diagrams', AUTOSAVE_ID), false);
  });

  it('writes in the order they were made', async () => {
    const seen: string[] = [];
    const slow: Backend = {
      ...createMemoryBackend(),
      async put(_s, r) {
        await new Promise((res) => setTimeout(res, r.id === 'a' ? 15 : 0));
        seen.push(r.id);
      },
    };
    await initStorage({ backend: slow });
    void putRecord('snapshots', { id: 'a' });
    void putRecord('snapshots', { id: 'b' });
    await flushWrites();
    assert.deepEqual(seen, ['a', 'b']);
  });

  it('rolls the copy back and rejects when a write fails, and says whether it was a quota error', async () => {
    const full: Backend = {
      ...createMemoryBackend(),
      async put() {
        throw Object.assign(new Error('x'), { name: 'QuotaExceededError' });
      },
    };
    await initStorage({ backend: full });
    await assert.rejects(putRecord('snapshots', { id: 's1' }), (err) => isQuotaError(err));
    assert.equal(hasRecord('snapshots', 's1'), false);
    assert.equal(isQuotaError(new Error('boom')), false);
  });

  it('never loses a saved record when a delete fails', async () => {
    const stuck: Backend = {
      ...createMemoryBackend({ snapshots: [{ id: 's1' }] }),
      async remove() {
        throw new Error('nope');
      },
    };
    await initStorage({ backend: stuck });
    await assert.rejects(removeRecord('snapshots', 's1'));
    assert.equal(hasRecord('snapshots', 's1'), true);
  });

  it('localStorage fallback uses the keys older releases used, so nothing needs moving', async () => {
    const ls = fakeLocalStorage({
      [LEGACY_KEYS.autosave]: JSON.stringify(docWith('Old autosave', 2)),
      [LEGACY_KEYS.snapshots]: JSON.stringify([{ id: 'snap-1', name: 'Base', timestamp: 1, nodeCount: 0, edgeCount: 0, doc: docWith('S') }]),
    });
    await initStorage({ backend: createLocalStorageBackend(ls) });
    assert.equal(getRecord<DiagramRecord>('diagrams', AUTOSAVE_ID)!.doc.title, 'Old autosave');
    assert.equal(listRecords('snapshots').length, 1);

    await putRecord('diagrams', record(AUTOSAVE_ID, docWith('New autosave')));
    assert.equal(JSON.parse(ls.map.get(LEGACY_KEYS.autosave)!).title, 'New autosave');
    await putRecord('snapshots', { id: 'snap-2' });
    assert.equal(JSON.parse(ls.map.get(LEGACY_KEYS.snapshots)!).length, 2);
    await removeRecord('snapshots', 'snap-1');
    assert.deepEqual(JSON.parse(ls.map.get(LEGACY_KEYS.snapshots)!).map((s: { id: string }) => s.id), ['snap-2']);
  });

  it('without IndexedDB it falls back to localStorage and says so', async () => {
    const ls = fakeLocalStorage({ [LEGACY_KEYS.recovery]: JSON.stringify(docWith('Recovered', 3)) });
    globalThis.localStorage = ls;
    const status = await initStorage();
    assert.equal(status.backend, 'localstorage');
    assert.match(status.notice ?? '', /smaller browser store/);
    assert.equal(getRecord<DiagramRecord>('diagrams', RECOVERY_ID)!.doc.nodes.length, 3);
    assert.equal(getStorageStatus().backend, 'localstorage');
  });

  it('with no storage at all it keeps work in memory and warns that it will not last', async () => {
    const status = await initStorage();
    assert.equal(status.backend, 'memory');
    assert.match(status.notice ?? '', /only until you close this tab/);
  });
});
