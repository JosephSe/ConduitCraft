import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { STENCIL_CATALOG } from '../src/templates/presets';
import { DEFAULT_FAVOURITES, FAVOURITE_COUNT, normaliseFavourites } from '../src/studio/dockFavourites';

describe('dock favourites (7.2)', () => {
  it('defaults to six real stencils', () => {
    const known = new Set(STENCIL_CATALOG.map((s) => s.id));
    assert.equal(DEFAULT_FAVOURITES.length, FAVOURITE_COUNT);
    for (const id of DEFAULT_FAVOURITES) assert.ok(known.has(id), id);
  });

  it('keeps a saved list in order, drops unknown ids, and fills the gaps from the defaults', () => {
    assert.deepEqual(normaliseFavourites(['cache', 'nope', 'actor']).slice(0, 2), ['cache', 'actor']);
    assert.equal(normaliseFavourites(['cache', 'nope', 'actor']).length, FAVOURITE_COUNT);
  });

  it('never repeats a default it fills in, and ignores anything that is not a list', () => {
    const list = normaliseFavourites(['service', 'store']);
    assert.equal(new Set(list).size, list.length);
    assert.deepEqual(normaliseFavourites('x'), DEFAULT_FAVOURITES);
    assert.deepEqual(normaliseFavourites(null), DEFAULT_FAVOURITES);
  });
});
