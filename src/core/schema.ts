/**
 * Document schema versioning (T-03). The Blueprint JSON envelope carries `version`; a file with no envelope or no
 * version counts as version 1. Loading runs the file through `migrate`, which applies one step per version until it
 * reaches `CURRENT_SCHEMA_VERSION`, so a change to the shape of the document is one new step here plus the
 * coercion for any new field in `parseBlueprintJson`. Pure and DOM-free.
 *
 * To change the schema: bump `CURRENT_SCHEMA_VERSION`, add `MIGRATIONS[oldVersion]` that returns the document in
 * the next version's shape, and add a round-trip test (JSON, share link) for each new field.
 */
export const CURRENT_SCHEMA_VERSION = 10;

type RawDocument = Record<string, unknown>;

/** Each step upgrades a document from the version it is keyed by to the next one. */
export const MIGRATIONS: Record<number, (doc: RawDocument) => RawDocument> = {
  // 1 -> 2: version 2 is the first stamped version. The shape is unchanged; fields added from here on are optional
  // and default to absent, so older files need no rewriting.
  1: (doc) => doc,
  // 2 -> 3: wires may carry `protocol`, `sync` and `latencyMs` (F-17). All optional, so nothing to rewrite.
  2: (doc) => doc,
  // 3 -> 4: `tags` on components and wires, `owner` and `links` on components, `legend` on the document (F-26, F-27).
  // All optional, so nothing to rewrite.
  3: (doc) => doc,
  // 4 -> 5: `resilience` on components and `failures` on scenarios (F-01). Both optional, so nothing to rewrite.
  4: (doc) => doc,
  // 5 -> 6: `insights.muted` on the document and `budgetMs` on scenarios (F-02). Both optional, so nothing to rewrite.
  5: (doc) => doc,
  // 6 -> 7: components may carry `child`, a nested level (F-03). Optional, so nothing to rewrite.
  6: (doc) => doc,
  // 7 -> 8: components may carry `source`, where they were imported from (F-06). Optional, so nothing to rewrite.
  7: (doc) => doc,
  // 8 -> 9: note cards may carry `variant: 'text'`, a free text label (C1). Optional, so nothing to rewrite.
  8: (doc) => doc,
  // 9 -> 10: the document and each level may carry `frames`, and components `frameId` (F-09). Optional, so nothing to rewrite.
  9: (doc) => doc,
};

export type MigrateResult = { ok: true; doc: RawDocument; from: number } | { ok: false; error: string };

/** The schema version a parsed file declares. A missing, non-integer or non-positive value counts as 1. */
export function readSchemaVersion(declared: unknown): number {
  return typeof declared === 'number' && Number.isInteger(declared) && declared >= 1 ? declared : 1;
}

export function migrate(doc: RawDocument, declared: unknown): MigrateResult {
  const from = readSchemaVersion(declared);
  if (from > CURRENT_SCHEMA_VERSION) {
    return {
      ok: false,
      error: `This file was saved by a newer version of ConduitCraft (format ${from}). Update the app to open it.`,
    };
  }
  let current = doc;
  for (let version = from; version < CURRENT_SCHEMA_VERSION; version++) {
    const step = MIGRATIONS[version];
    if (!step) return { ok: false, error: `No way to upgrade this file from format ${version}.` };
    current = step(current);
  }
  return { ok: true, doc: current, from };
}
