import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { STENCIL_CATALOG } from '../src/templates/presets.ts';
import { searchTray, displayName, WORDS, type TrayEntry } from '../src/studio/trayWords.ts';

const entries: TrayEntry[] = STENCIL_CATALOG.map((s) => ({ id: s.id, title: s.paletteTitle }));

describe('tray search (7.3)', () => {
  it('an empty query matches everything, with no names', () => {
    const all = searchTray('  ', entries);
    assert.equal(all.length, entries.length);
    assert.ok(all.every((m) => m.named === undefined));
  });

  it('matches a component by its own name', () => {
    assert.deepEqual(searchTray('balanc', entries), [{ id: 'balancer' }]);
    assert.deepEqual(searchTray('QUEUE', entries).map((m) => m.id), ['queue']);
  });

  it('typing kafka leaves one row, the Stream, named Kafka', () => {
    assert.deepEqual(searchTray('kafka', entries), [{ id: 'stream', named: 'Kafka' }]);
  });

  it('knows what people run: redis and postgres are data stores, s3 is object storage, cron is a scheduler, nginx a gate', () => {
    assert.deepEqual(searchTray('redis', entries), [{ id: 'store', named: 'Redis' }]);
    assert.deepEqual(searchTray('postgres', entries), [{ id: 'store', named: 'Postgres' }]);
    assert.deepEqual(searchTray('s3', entries), [{ id: 'object-store', named: 'S3' }]);
    assert.deepEqual(searchTray('cron', entries), [{ id: 'scheduler', named: 'Cron' }]);
    assert.deepEqual(searchTray('nginx', entries), [{ id: 'gate', named: 'Nginx' }]);
    assert.deepEqual(searchTray('lambda', entries), [{ id: 'service', named: 'Lambda' }]);
  });

  it('a partial word names the whole word, and an exact one wins', () => {
    assert.deepEqual(searchTray('kaf', entries), [{ id: 'stream', named: 'Kafka' }]);
    assert.equal(searchTray('minio', entries)[0].id, 'object-store');
  });

  it('finds nothing for something it does not know', () => {
    assert.deepEqual(searchTray('zzzzz', entries), []);
  });

  it('every word points at a real stencil', () => {
    const ids = new Set(STENCIL_CATALOG.map((s) => s.id));
    for (const [word, id] of WORDS) assert.ok(ids.has(id), `${word} -> ${id}`);
  });

  it('capitalises the first letter only', () => {
    assert.equal(displayName('kafka'), 'Kafka');
    assert.equal(displayName('s3'), 'S3');
  });
});
