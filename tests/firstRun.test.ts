import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { FIRST_RUN_TEMPLATE_ID, pickFirstRunFailure, shouldShowFirstRun } from '../src/core/firstRun.ts';
import { reachableFrom, entryPointIds } from '../src/core/reachability.ts';
import { parseBlueprintJson } from '../src/exporter/blueprintJson.ts';

const fresh = { redesign: true, hasSavedWork: false, hasShareLink: false, seenBefore: false, documentEmpty: true };

describe('shouldShowFirstRun', () => {
  it('shows for a fresh visitor in the redesign', () => {
    assert.equal(shouldShowFirstRun(fresh), true);
  });
  it('never shows over an autosave, a share link, a returning visitor or a document with content', () => {
    assert.equal(shouldShowFirstRun({ ...fresh, hasSavedWork: true }), false);
    assert.equal(shouldShowFirstRun({ ...fresh, hasShareLink: true }), false);
    assert.equal(shouldShowFirstRun({ ...fresh, seenBefore: true }), false);
    assert.equal(shouldShowFirstRun({ ...fresh, documentEmpty: false }), false);
  });
  it('stays out of the classic layout', () => {
    assert.equal(shouldShowFirstRun({ ...fresh, redesign: false }), false);
  });
});

describe('pickFirstRunFailure', () => {
  const raw = readFileSync(new URL(`../src/examples/${FIRST_RUN_TEMPLATE_ID}.blueprint.json`, import.meta.url), 'utf8');
  const parsed = parseBlueprintJson(raw);

  it('fails a component that cuts other components off in the first-run example', () => {
    assert.ok(parsed.ok);
    if (!parsed.ok) return;
    const id = pickFirstRunFailure(parsed.doc);
    assert.ok(id, 'a component is chosen');
    const result = reachableFrom(parsed.doc, entryPointIds(parsed.doc), [id]);
    assert.ok(result.unreachable.length > 0);
    assert.ok(!entryPointIds(parsed.doc).includes(id));
  });

  it('returns null when nothing can be cut off', () => {
    assert.ok(parsed.ok);
    if (!parsed.ok) return;
    assert.equal(pickFirstRunFailure({ ...parsed.doc, nodes: [parsed.doc.nodes[0]], edges: [] }), null);
  });
});
