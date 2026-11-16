import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { STENCIL_CATALOG, createNodeFromStencil, findStencil, kindStencils, likelyNext } from '../src/templates/presets.ts';

describe('stencil ids (phase 0)', () => {
  it('gives every stencil an id; the existing ones equal their kind', () => {
    for (const s of STENCIL_CATALOG) assert.ok(s.id, `stencil for ${s.kind} has an id`);
    const ids = STENCIL_CATALOG.map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length, 'ids are unique');
    for (const k of ['actor', 'core', 'service', 'bus', 'gate', 'store', 'client']) {
      assert.equal(STENCIL_CATALOG.find((s) => s.kind === k)?.id, k);
    }
  });

  it('createNodeFromStencil still accepts a plain kind', () => {
    const n = createNodeFromStencil('service', 32, 48, 0);
    assert.equal(n.kind, 'service');
    assert.equal(n.title, 'Service API 1');
  });

  it('findStencil looks up the id first, then the kind', () => {
    assert.equal(findStencil('store')?.id, 'store');
    assert.equal(findStencil('nope'), undefined);
  });

  it('two stencils that share a kind create different nodes', () => {
    STENCIL_CATALOG.push({
      id: 'test-bucket',
      kind: 'store',
      paletteTitle: 'Bucket',
      paletteSub: 'x',
      defaultTitle: 'Bucket',
      defaultSubtitle: 'Objects',
      eyebrow: 'OBJECTS',
      footerLeft: 'S3',
      chip: 'BUCKET',
      icon: 'database',
      accent: 'emerald',
      interfaceLabel: 'S3',
      preset: { footerLeft: 'Object API' },
    });
    try {
      const plain = createNodeFromStencil('store', 0, 0, 0);
      const bucket = createNodeFromStencil('test-bucket', 0, 0, 0);
      assert.equal(plain.kind, 'store');
      assert.equal(bucket.kind, 'store');
      assert.equal(bucket.title, 'Bucket 1');
      assert.notEqual(plain.title, bucket.title);
      assert.equal(bucket.footerLeft, 'Object API');
    } finally {
      STENCIL_CATALOG.pop();
    }
  });

  it('kindStencils returns one entry per kind (the first stencil of each kind)', () => {
    STENCIL_CATALOG.push({ ...STENCIL_CATALOG[5], id: 'dup-store', paletteTitle: 'Dup' });
    try {
      const kinds = kindStencils().map((s) => s.kind);
      assert.equal(new Set(kinds).size, kinds.length);
      assert.equal(kindStencils().find((s) => s.kind === 'store')?.id, 'store');
    } finally {
      STENCIL_CATALOG.pop();
    }
  });
});

describe('likely next kinds (7.4)', () => {
  it('every stencil names four different stencils that exist', () => {
    for (const s of STENCIL_CATALOG.filter((x) => x.id !== 'test-bucket')) {
      assert.equal(s.next?.length, 4, `${s.id} lists four`);
      assert.equal(new Set(s.next).size, 4, `${s.id} lists four different kinds`);
      for (const id of s.next!) assert.ok(findStencil(id), `${s.id} -> ${id} exists`);
    }
  });

  it('follows the table the plan names', () => {
    const ids = (from: string) => likelyNext(from).map((s) => s.id);
    assert.deepEqual(ids('gate').slice(0, 2), ['balancer', 'service']);
    for (const id of ['store', 'queue', 'cache']) assert.ok(ids('service').includes(id), `after a service: ${id}`);
  });

  it('falls back to the service kinds for something it does not know', () => {
    assert.equal(likelyNext('nope').length, 4);
    assert.equal(likelyNext('nope')[0].id, 'service');
  });
});
