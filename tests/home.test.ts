import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { filterByTitle, gridTarget, relativeTime, shouldOpenHomeAtBoot, storageWarning } from '../src/core/home.ts';

describe('home screen rules', () => {
  it('opens at boot only for a returning visitor with no share link, once per tab', () => {
    const base = { hasShareLink: false, entryCount: 2, shownThisSession: false };
    assert.equal(shouldOpenHomeAtBoot(base), true);
    assert.equal(shouldOpenHomeAtBoot({ ...base, hasShareLink: true }), false);
    assert.equal(shouldOpenHomeAtBoot({ ...base, entryCount: 0 }), false);
    assert.equal(shouldOpenHomeAtBoot({ ...base, shownThisSession: true }), false);
  });

  it('searches titles by every word, ignoring case', () => {
    const entries = [{ title: 'Payments flow' }, { title: 'Auth flow' }, { title: 'CI/CD' }];
    assert.equal(filterByTitle(entries, '').length, 3);
    assert.deepEqual(filterByTitle(entries, 'FLOW').map((e) => e.title), ['Payments flow', 'Auth flow']);
    assert.deepEqual(filterByTitle(entries, 'auth  flow').map((e) => e.title), ['Auth flow']);
    assert.equal(filterByTitle(entries, 'zzz').length, 0);
  });

  it('labels times the way people say them', () => {
    const now = new Date(2026, 10, 4, 12, 0, 0).getTime();
    assert.equal(relativeTime(now - 10_000, now), 'Just now');
    assert.equal(relativeTime(now - 2 * 60_000, now), '2 min ago');
    assert.equal(relativeTime(now - 3 * 3_600_000, now), '3 h ago');
    assert.equal(relativeTime(now - 30 * 3_600_000, now), 'Yesterday');
    assert.equal(relativeTime(now - 3 * 86_400_000, now), '3 days ago');
    assert.equal(relativeTime(new Date(2026, 9, 12).getTime(), now), 'Oct 12');
    assert.equal(relativeTime(new Date(2025, 9, 12).getTime(), now), 'Oct 12, 2025');
    assert.equal(relativeTime(0, now), 'Saved earlier');
  });

  it('warns above 80% of the storage quota only', () => {
    assert.equal(storageWarning(undefined, 100), null);
    assert.equal(storageWarning(80, 100), null);
    assert.match(storageWarning(81, 100) ?? '', /81% full/);
    assert.match(storageWarning(500, 100) ?? '', /100% full/);
    assert.equal(storageWarning(10, 0), null);
  });

  it('moves through a grid with the arrow keys and stops at the edges', () => {
    assert.equal(gridTarget(0, 'ArrowRight', 5, 3), 1);
    assert.equal(gridTarget(1, 'ArrowDown', 5, 3), 4);
    assert.equal(gridTarget(2, 'ArrowDown', 5, 3), 2);
    assert.equal(gridTarget(0, 'ArrowLeft', 5, 3), 0);
    assert.equal(gridTarget(4, 'ArrowUp', 5, 3), 1);
    assert.equal(gridTarget(2, 'Home', 5, 3), 0);
    assert.equal(gridTarget(2, 'End', 5, 3), 4);
    assert.equal(gridTarget(0, 'ArrowRight', 0, 3), -1);
  });
});
