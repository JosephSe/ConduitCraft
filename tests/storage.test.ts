import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import {
  AUTOSAVE_ID,
  DIAGRAM_PREFIX,
  RECOVERY_ID,
  SNAPSHOTS_KEY,
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
  retireOldCopies,
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

  it('localStorage fallback keeps records under its own keys and reads them back', async () => {
    const ls = fakeLocalStorage();
    await initStorage({ backend: createLocalStorageBackend(ls) });
    await putRecord('diagrams', record(AUTOSAVE_ID, docWith('New autosave', 2)));
    assert.equal(JSON.parse(ls.map.get(DIAGRAM_PREFIX + AUTOSAVE_ID)!).doc.title, 'New autosave');
    await putRecord('snapshots', { id: 'snap-1' });
    await putRecord('snapshots', { id: 'snap-2' });
    assert.equal(JSON.parse(ls.map.get(SNAPSHOTS_KEY)!).length, 2);
    await removeRecord('snapshots', 'snap-1');
    assert.deepEqual(JSON.parse(ls.map.get(SNAPSHOTS_KEY)!).map((s: { id: string }) => s.id), ['snap-2']);

    resetStorageForTests();
    await initStorage({ backend: createLocalStorageBackend(ls) });
    assert.equal(getRecord<DiagramRecord>('diagrams', AUTOSAVE_ID)!.doc.nodes.length, 2);
    assert.deepEqual(listRecords('snapshots').map((s) => s.id), ['snap-2']);
  });

  it('does not read the keys that releases before 2.1 used', async () => {
    const ls = fakeLocalStorage({
      'conduitcraft-autosave-v1': JSON.stringify(docWith('Old autosave', 2)),
      'conduitcraft-snapshots-v1': JSON.stringify([{ id: 'snap-1' }]),
    });
    await initStorage({ backend: createLocalStorageBackend(ls) });
    assert.equal(hasRecord('diagrams', AUTOSAVE_ID), false);
    assert.equal(listRecords('snapshots').length, 0);
  });

  it('retires the old copies once they were moved, and only then', () => {
    const old = {
      'conduitcraft-autosave-v1': '{}',
      'blueprint-studio-autosave-v1': '{}',
      'conduitcraft-recovery-v1': '{}',
      'conduitcraft-snapshots-v1': '[]',
    };
    const keep = { 'conduitcraft-diagram:autosave': '{}', 'conduitcraft-home-shown': '1', 'unrelated': 'x' };
    const notMoved = fakeLocalStorage({ ...old, ...keep });
    assert.equal(retireOldCopies(notMoved, false), 0);
    assert.equal(notMoved.map.size, 7, 'nothing is deleted before the move is confirmed');

    const moved = fakeLocalStorage({ ...old, ...keep });
    assert.equal(retireOldCopies(moved, true), 4);
    assert.deepEqual([...moved.map.keys()].sort(), Object.keys(keep).sort());
    assert.equal(retireOldCopies(null, true), 0);
  });

  it('without IndexedDB it falls back to localStorage and says so', async () => {
    const ls = fakeLocalStorage({
      [DIAGRAM_PREFIX + RECOVERY_ID]: JSON.stringify(record(RECOVERY_ID, docWith('Recovered', 3))),
    });
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
