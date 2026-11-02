import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LENSES, lensForKey, lensOfWorkspaceMode, workspaceModeOf } from '../src/core/lens.ts';

test('keys 1 to 4 pick the lenses in order', () => {
  assert.deepEqual(['1', '2', '3', '4'].map(lensForKey), ['design', 'traffic', 'review', 'present']);
  for (const key of ['0', '5', 'a', '', '1.5']) assert.equal(lensForKey(key), null);
});

test('workspaceMode derives from the lens and round-trips for design and traffic', () => {
  assert.equal(workspaceModeOf('design'), 'design');
  for (const lens of LENSES.filter((l) => l !== 'design')) assert.equal(workspaceModeOf(lens), 'data');
  assert.equal(lensOfWorkspaceMode('design'), 'design');
  assert.equal(lensOfWorkspaceMode('data'), 'traffic');
});
