/**
 * Browser storage for documents (T-04). One IndexedDB database, `conduitcraft`, with three stores: `diagrams`
 * (the autosave and the recovery copy), `snapshots` and `meta`. No library.
 *
 * The rest of the app reads and writes synchronously, so this module keeps an in-memory copy of every record. It is
 * filled once at boot by `initStorage()`, and every write updates the copy first and then persists in order. A write
 * that fails rolls the copy back and rejects, so callers can show the failure; nothing is swallowed.
 *
 * Fallbacks: if IndexedDB can't be opened (private mode in some browsers) records go to `localStorage` under the
 * keys older releases used, and the status says so. If that is missing too, they live in memory for the session.
 * The old `localStorage` copies are never deleted here: they are read once, on first load, and then left alone.
 */
import type { DiagramDocument } from '../types';

export const DB_NAME = 'conduitcraft';
export const DB_VERSION = 1;
export const STORE_NAMES = ['diagrams', 'snapshots', 'meta'] as const;
export type StoreName = (typeof STORE_NAMES)[number];

/** The `localStorage` keys that releases before this one wrote document data to. */
export const LEGACY_KEYS = {
  autosave: 'conduitcraft-autosave-v1',
  autosaveOlder: 'blueprint-studio-autosave-v1',
  recovery: 'conduitcraft-recovery-v1',
  snapshots: 'conduitcraft-snapshots-v1',
} as const;
const META_PREFIX = 'conduitcraft-meta:';
const DIAGRAM_PREFIX = 'conduitcraft-diagram:';

export const AUTOSAVE_ID = 'autosave';
export const RECOVERY_ID = 'recovery';
const MIGRATED_ID = 'legacy-migrated';

export interface DiagramRecord {
  id: string;
  title: string;
  updatedAt: number;
  doc: DiagramDocument;
  /** A 320 × 200 picture of the diagram (a `data:image/webp` URL), made on idle after a save (B3). */
  thumbnail?: string;
}
export interface MetaRecord {
  id: string;
  value: unknown;
}
export type StoredRecord = { id: string };
export type StoreContents = Record<StoreName, StoredRecord[]>;

export interface Backend {
  kind: 'indexeddb' | 'localstorage' | 'memory';
  load(): Promise<StoreContents>;
  put(store: StoreName, record: StoredRecord): Promise<void>;
  remove(store: StoreName, id: string): Promise<void>;
}

export interface StorageStatus {
  backend: Backend['kind'];
  /** Set when the app is not using IndexedDB; shown to the person once. */
  notice: string | null;
}

const emptyContents = (): StoreContents => ({ diagrams: [], snapshots: [], meta: [] });

// ---------------------------------------------------------------------------------------------------------------
// Errors

export interface StorageFailure {
  /** True when the browser said it is out of room. */
  quota: boolean;
  what: string;
}

export function isQuotaError(err: unknown): boolean {
  const e = err as { name?: string; code?: number; message?: string } | null;
  return (
    e?.name === 'QuotaExceededError' ||
    e?.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    e?.code === 22 ||
    e?.code === 1014 ||
    /quota|storage is full/i.test(e?.message ?? '')
  );
}

let failureHandler: ((failure: StorageFailure) => void) | null = null;

/** The one place that tells the person a write failed. Registered at boot. */
export function setStorageFailureHandler(handler: ((failure: StorageFailure) => void) | null): void {
  failureHandler = handler;
}

export function reportStorageFailure(err: unknown, what: string): void {
  failureHandler?.({ quota: isQuotaError(err), what });
}

// ---------------------------------------------------------------------------------------------------------------
// Backends

function openDatabase(factory: IDBFactory, timeoutMs = 4000): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('IndexedDB did not open')), timeoutMs);
    let request: IDBOpenDBRequest;
    try {
      request = factory.open(DB_NAME, DB_VERSION);
    } catch (err) {
      clearTimeout(timer);
      reject(err);
      return;
    }
    request.onupgradeneeded = () => {
      for (const name of STORE_NAMES) {
        if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => {
      clearTimeout(timer);
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => {
      clearTimeout(timer);
      reject(request.error ?? new Error('IndexedDB did not open'));
    };
    request.onblocked = () => {
      clearTimeout(timer);
      reject(new Error('IndexedDB is blocked by another tab'));
    };
  });
}

export function createIndexedDbBackend(db: IDBDatabase): Backend {
  const run = <T>(store: StoreName, mode: IDBTransactionMode, act: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> =>
    new Promise((resolve, reject) => {
      let tx: IDBTransaction;
      try {
        tx = db.transaction(store, mode);
      } catch (err) {
        reject(err);
        return;
      }
      let result: T;
      const request = act(tx.objectStore(store));
      request.onsuccess = () => {
        result = request.result;
      };
      // A write is only durable once its transaction completes; a quota failure arrives as an abort.
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error ?? request.error);
      tx.onabort = () => reject(tx.error ?? request.error ?? new Error('IndexedDB transaction aborted'));
    });
  return {
    kind: 'indexeddb',
    async load() {
      const out = emptyContents();
      for (const name of STORE_NAMES) out[name] = (await run(name, 'readonly', (s) => s.getAll())) as StoredRecord[];
      return out;
    },
    put: (store, record) => run(store, 'readwrite', (s) => s.put(record)).then(() => undefined),
    remove: (store, id) => run(store, 'readwrite', (s) => s.delete(id)).then(() => undefined),
  };
}

/** Read what releases before this one stored. Used by the migration and by the `localStorage` fallback. */
export function readLegacyContents(storage: Storage | null): StoreContents {
  const out = emptyContents();
  if (!storage) return out;
  const readJson = (key: string): unknown => {
    try {
      const raw = storage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };
  const asRecord = (id: string, doc: unknown): DiagramRecord | null => {
    const d = doc as DiagramDocument | null;
    if (!d || typeof d !== 'object' || !Array.isArray(d.nodes) || !Array.isArray(d.edges)) return null;
    return { id, title: d.title || 'Untitled', updatedAt: 0, doc: d };
  };
  const autosave = asRecord(AUTOSAVE_ID, readJson(LEGACY_KEYS.autosave) ?? readJson(LEGACY_KEYS.autosaveOlder));
  const recovery = asRecord(RECOVERY_ID, readJson(LEGACY_KEYS.recovery));
  if (autosave) out.diagrams.push(autosave);
  if (recovery) out.diagrams.push(recovery);
  const snaps = readJson(LEGACY_KEYS.snapshots);
  if (Array.isArray(snaps)) {
    out.snapshots = snaps.filter((s): s is StoredRecord => typeof s?.id === 'string');
  }
  return out;
}

/** Fallback: the same keys older releases used, so nothing needs moving and a downgrade still finds its data. */
export function createLocalStorageBackend(storage: Storage): Backend {
  let snapshots: StoredRecord[] = [];
  const keyFor = (store: StoreName, id: string): string | null => {
    if (store === 'diagrams') {
      if (id === RECOVERY_ID) return LEGACY_KEYS.recovery;
      return id === AUTOSAVE_ID ? LEGACY_KEYS.autosave : DIAGRAM_PREFIX + id;
    }
    if (store === 'meta') return META_PREFIX + id;
    return null;
  };
  return {
    kind: 'localstorage',
    async load() {
      const out = readLegacyContents(storage);
      snapshots = [...out.snapshots];
      for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i);
        if (key?.startsWith(DIAGRAM_PREFIX)) {
          // Library entries other than the first (B3) keep the whole record, so title and time survive.
          try {
            const record = JSON.parse(storage.getItem(key) ?? 'null') as DiagramRecord | null;
            if (record && typeof record.id === 'string' && record.doc) out.diagrams.push(record);
          } catch {
            // An unreadable entry is skipped; the others still load.
          }
        } else if (key?.startsWith(META_PREFIX)) {
          try {
            out.meta.push({ id: key.slice(META_PREFIX.length), value: JSON.parse(storage.getItem(key) ?? 'null') } as MetaRecord);
          } catch {
            // An unreadable meta value is just treated as absent.
          }
        }
      }
      return out;
    },
    async put(store, record) {
      if (store === 'snapshots') {
        const next = [record, ...snapshots.filter((s) => s.id !== record.id)];
        storage.setItem(LEGACY_KEYS.snapshots, JSON.stringify(next));
        snapshots = next;
        return;
      }
      const key = keyFor(store, record.id);
      if (!key) return;
      const value =
        store === 'diagrams'
          ? key.startsWith(DIAGRAM_PREFIX)
            ? record
            : (record as DiagramRecord).doc
          : (record as MetaRecord).value;
      storage.setItem(key, JSON.stringify(value));
    },
    async remove(store, id) {
      if (store === 'snapshots') {
        const next = snapshots.filter((s) => s.id !== id);
        storage.setItem(LEGACY_KEYS.snapshots, JSON.stringify(next));
        snapshots = next;
        return;
      }
      const key = keyFor(store, id);
      if (key) storage.removeItem(key);
    },
  };
}

export function createMemoryBackend(initial?: Partial<StoreContents>): Backend {
  const data: Record<StoreName, Map<string, StoredRecord>> = {
    diagrams: new Map(),
    snapshots: new Map(),
    meta: new Map(),
  };
  for (const name of STORE_NAMES) for (const r of initial?.[name] ?? []) data[name].set(r.id, structuredClone(r));
  return {
    kind: 'memory',
    async load() {
      const out = emptyContents();
      for (const name of STORE_NAMES) out[name] = [...data[name].values()].map((r) => structuredClone(r));
      return out;
    },
    async put(store, record) {
      data[store].set(record.id, structuredClone(record));
    },
    async remove(store, id) {
      data[store].delete(id);
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// The in-memory copy and the write queue

const cache: Record<StoreName, Map<string, StoredRecord>> = {
  diagrams: new Map(),
  snapshots: new Map(),
  meta: new Map(),
};
let backend: Backend | null = null;
let status: StorageStatus = { backend: 'memory', notice: null };
let ready = false;
let readyPromise: Promise<StorageStatus> | null = null;
/** Settles when `initStorage` finishes, even if it has not been called yet. */
let gate = makeGate();
function makeGate(): { promise: Promise<StorageStatus>; open: (s: StorageStatus) => void } {
  let open!: (s: StorageStatus) => void;
  const promise = new Promise<StorageStatus>((resolve) => {
    open = resolve;
  });
  return { promise, open };
}
let queue: Promise<unknown> = Promise.resolve();

export function isStorageReady(): boolean {
  return ready;
}
export function getStorageStatus(): StorageStatus {
  return status;
}
/** Resolves once `initStorage` has finished (it never rejects: a failed open falls back), whenever that is. */
export function whenStorageReady(): Promise<StorageStatus> {
  return gate.promise;
}

function hydrate(contents: StoreContents): void {
  for (const name of STORE_NAMES) {
    cache[name].clear();
    for (const record of contents[name]) cache[name].set(record.id, record);
  }
}

function localStorageOrNull(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

async function useFallback(reason: string): Promise<void> {
  const ls = localStorageOrNull();
  if (ls) {
    backend = createLocalStorageBackend(ls);
    hydrate(await backend.load());
    status = {
      backend: 'localstorage',
      notice: `${reason} ConduitCraft is saving to a smaller browser store instead, which holds fewer and smaller diagrams.`,
    };
  } else {
    backend = createMemoryBackend();
    hydrate(emptyContents());
    status = {
      backend: 'memory',
      notice: `${reason} Your work is kept only until you close this tab, so save a file before you leave.`,
    };
  }
}

/** Copy what older releases kept in `localStorage` into IndexedDB, once. The old copies stay where they are. */
async function migrateLegacy(target: Backend): Promise<void> {
  if (cache.meta.has(MIGRATED_ID)) return;
  const legacy = readLegacyContents(localStorageOrNull());
  for (const name of ['diagrams', 'snapshots'] as const) {
    for (const record of legacy[name]) {
      if (cache[name].has(record.id)) continue; // never overwrite something already in the database
      const stored = { ...(record as StoredRecord), ...(name === 'diagrams' ? { updatedAt: Date.now() } : {}) };
      await target.put(name, stored);
      cache[name].set(stored.id, stored);
    }
  }
  const marker: MetaRecord = { id: MIGRATED_ID, value: Date.now() };
  await target.put('meta', marker);
  cache.meta.set(marker.id, marker);
}

export interface InitOptions {
  /** For tests. Skips detection and uses this backend as is. */
  backend?: Backend;
}

/** Open storage and fill the in-memory copy. Call once at boot. Safe to call again: it returns the same result. */
export function initStorage(options: InitOptions = {}): Promise<StorageStatus> {
  readyPromise ??= (async () => {
    if (options.backend) {
      backend = options.backend;
      hydrate(await backend.load());
      status = { backend: backend.kind, notice: null };
    } else {
      let db: IDBDatabase | null = null;
      try {
        if (typeof indexedDB === 'undefined') throw new Error('IndexedDB is not available');
        db = await openDatabase(indexedDB);
      } catch {
        await useFallback('This browser would not open its database.');
      }
      if (db) {
        const idb = createIndexedDbBackend(db);
        try {
          hydrate(await idb.load());
          await migrateLegacy(idb);
          backend = idb;
          status = { backend: 'indexeddb', notice: null };
        } catch {
          // The old copies are untouched, so the fallback finds them. Nothing is lost.
          db.close();
          await useFallback('ConduitCraft could not move your saved work into the new store.');
        }
      }
    }
    ready = true;
    gate.open(status);
    return status;
  })();
  // The same promise `whenStorageReady` gives, so callbacks run in the order they were registered: boot's restore
  // offer is set before an edit that was waiting can write.
  return gate.promise;
}

/** Tests only: forget everything and start over. */
export function resetStorageForTests(): void {
  for (const name of STORE_NAMES) cache[name].clear();
  backend = null;
  status = { backend: 'memory', notice: null };
  ready = false;
  readyPromise = null;
  gate = makeGate();
  queue = Promise.resolve();
  failureHandler = null;
}

// ---------------------------------------------------------------------------------------------------------------
// Reading and writing

export function getRecord<T extends StoredRecord>(store: StoreName, id: string): T | undefined {
  const found = cache[store].get(id);
  return found ? (structuredClone(found) as T) : undefined;
}
export function hasRecord(store: StoreName, id: string): boolean {
  return cache[store].has(id);
}
export function listRecords<T extends StoredRecord>(store: StoreName): T[] {
  return [...cache[store].values()].map((r) => structuredClone(r) as T);
}

function enqueue(job: () => Promise<void>): Promise<void> {
  const run = queue.then(() => gate.promise).then(job);
  queue = run.catch(() => undefined);
  return run;
}

/** Store a record. The in-memory copy changes at once; the promise settles when the write is durable. */
export function putRecord(store: StoreName, record: StoredRecord): Promise<void> {
  const copy = structuredClone(record);
  const previous = cache[store].get(copy.id);
  cache[store].set(copy.id, copy);
  return enqueue(async () => {
    if (!backend) throw new Error('Storage is not ready');
    try {
      await backend.put(store, copy);
    } catch (err) {
      // Keep the copy in step with what is really saved, unless a newer write already replaced it.
      if (cache[store].get(copy.id) === copy) {
        if (previous) cache[store].set(copy.id, previous);
        else cache[store].delete(copy.id);
      }
      throw err;
    }
  });
}

/** Remove a record. The in-memory copy changes at once. */
export function removeRecord(store: StoreName, id: string): Promise<void> {
  const previous = cache[store].get(id);
  cache[store].delete(id);
  return enqueue(async () => {
    if (!backend) throw new Error('Storage is not ready');
    try {
      await backend.remove(store, id);
    } catch (err) {
      if (previous && !cache[store].has(id)) cache[store].set(id, previous);
      throw err;
    }
  });
}

/** Resolves when every write queued so far has settled. */
export function flushWrites(): Promise<void> {
  return queue.then(() => undefined);
}
