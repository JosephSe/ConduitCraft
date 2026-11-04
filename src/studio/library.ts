/**
 * The diagram library (F-08, data and commands). One record per diagram in the `diagrams` store, one of them open at
 * a time. The first entry is the old autosave, so it keeps its id (`autosave`); new entries get an id of their own.
 * The `recovery` record is a scratch copy, not a library entry. Which entry is open is remembered in `meta`.
 *
 * Everything here is plain data over `storage.ts`, with no DOM, so it is unit tested. The commands that change the
 * canvas (open, new) live in `interactions.ts` and call these.
 */
import { createZip, uniqueZipNames } from '../core/zip';
import { serializeBlueprintJson } from '../exporter/blueprintJson';
import type { DiagramDocument } from '../types';
import {
  AUTOSAVE_ID,
  RECOVERY_ID,
  getRecord,
  listRecords,
  putRecord,
  removeRecord,
  type DiagramRecord,
  type MetaRecord,
} from './storage';

export const ACTIVE_DIAGRAM_META_ID = 'active-diagram';
/** How long a deleted diagram can be brought back. */
export const DELETE_UNDO_MS = 10_000;

export interface LibraryEntry {
  id: string;
  title: string;
  updatedAt: number;
  thumbnail?: string;
}

const isEntry = (record: DiagramRecord): boolean => record.id !== RECOVERY_ID;

/** Every diagram, newest first. Equal times keep their stored order. */
export function listLibrary(): LibraryEntry[] {
  return listRecords<DiagramRecord>('diagrams')
    .filter(isEntry)
    .map((r, index) => ({ r, index }))
    .sort((a, b) => b.r.updatedAt - a.r.updatedAt || a.index - b.index)
    .map(({ r }) => ({ id: r.id, title: r.title, updatedAt: r.updatedAt, thumbnail: r.thumbnail }));
}

export function hasDiagram(id: string): boolean {
  return id !== RECOVERY_ID && getRecord<DiagramRecord>('diagrams', id) !== undefined;
}

/** The open diagram's id: the remembered one if it still exists, else the first entry (`autosave`), else the newest. */
export function getActiveDiagramId(): string {
  const remembered = getRecord<MetaRecord>('meta', ACTIVE_DIAGRAM_META_ID)?.value;
  if (typeof remembered === 'string' && hasDiagram(remembered)) return remembered;
  if (hasDiagram(AUTOSAVE_ID)) return AUTOSAVE_ID;
  return listLibrary()[0]?.id ?? AUTOSAVE_ID;
}

export function setActiveDiagramId(id: string): Promise<void> {
  const record: MetaRecord = { id: ACTIVE_DIAGRAM_META_ID, value: id };
  return putRecord('meta', record);
}

export function newDiagramId(): string {
  return `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Add a diagram to the library. The caller decides whether to open it. */
export async function createDiagram(doc: DiagramDocument, now: number = Date.now()): Promise<DiagramRecord> {
  const record: DiagramRecord = { id: newDiagramId(), title: doc.title || 'Untitled', updatedAt: now, doc: structuredClone(doc) };
  await putRecord('diagrams', record);
  return record;
}

export async function renameDiagram(id: string, title: string, now: number = Date.now()): Promise<boolean> {
  const clean = title.trim();
  const record = hasDiagram(id) ? getRecord<DiagramRecord>('diagrams', id) : undefined;
  if (!record || !clean) return false;
  const next: DiagramRecord = { ...record, title: clean, updatedAt: now, doc: { ...record.doc, title: clean } };
  await putRecord('diagrams', next);
  return true;
}

export async function duplicateDiagram(id: string, now: number = Date.now()): Promise<DiagramRecord | null> {
  const source = hasDiagram(id) ? getRecord<DiagramRecord>('diagrams', id) : undefined;
  if (!source) return null;
  const title = `${source.title} copy`;
  const record: DiagramRecord = {
    id: newDiagramId(),
    title,
    updatedAt: now,
    doc: { ...structuredClone(source.doc), title },
    thumbnail: source.thumbnail,
  };
  await putRecord('diagrams', record);
  return record;
}

/**
 * Take a diagram out of the library and hand back what was removed, so the caller can offer Undo with
 * `restoreDiagram`. The in-memory copy changes at once; the promise settles when the delete is saved.
 */
export function deleteDiagram(id: string): { removed: DiagramRecord; done: Promise<void> } | null {
  const removed = hasDiagram(id) ? getRecord<DiagramRecord>('diagrams', id) : undefined;
  if (!removed) return null;
  return { removed, done: removeRecord('diagrams', id) };
}

export function restoreDiagram(record: DiagramRecord): Promise<void> {
  return putRecord('diagrams', record);
}

/** Save a fresh thumbnail on an existing entry without touching its document or its time. */
export async function setThumbnail(id: string, thumbnail: string): Promise<void> {
  const record = hasDiagram(id) ? getRecord<DiagramRecord>('diagrams', id) : undefined;
  if (!record) return;
  const next: DiagramRecord = { ...record, thumbnail };
  await putRecord('diagrams', next);
}

const slug = (title: string): string =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'diagram';

/** Every diagram as a `.blueprint.json` file in one store-only zip. */
export function exportAllAsZip(now: Date = new Date()): { bytes: Uint8Array; count: number } {
  const entries = listLibrary()
    .map((e) => getRecord<DiagramRecord>('diagrams', e.id))
    .filter((r): r is DiagramRecord => Boolean(r));
  const names = uniqueZipNames(entries.map((r) => `${slug(r.title)}.blueprint.json`));
  const encoder = new TextEncoder();
  const bytes = createZip(
    entries.map((r, i) => ({ name: names[i], data: encoder.encode(serializeBlueprintJson(r.doc)) })),
    now,
  );
  return { bytes, count: entries.length };
}
