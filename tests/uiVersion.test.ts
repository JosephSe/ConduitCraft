import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_UI_VERSION, UI_VERSION_STORAGE_KEY, resolveUiVersion } from '../src/core/uiVersion.ts';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

describe('resolveUiVersion', () => {
  it('uses the default with no parameter and nothing stored', () => {
    assert.equal(resolveUiVersion('', memoryStorage()), DEFAULT_UI_VERSION);
  });

  it('?ui=2 selects the redesign and is remembered', () => {
    const storage = memoryStorage();
    assert.equal(resolveUiVersion('?ui=2', storage), 2);
    assert.equal(storage.getItem(UI_VERSION_STORAGE_KEY), '2');
    assert.equal(resolveUiVersion('', storage), 2);
  });

  it('?ui=1 switches back and is remembered', () => {
    const storage = memoryStorage({ [UI_VERSION_STORAGE_KEY]: '2' });
    assert.equal(resolveUiVersion('?ui=1', storage), 1);
    assert.equal(resolveUiVersion('', storage), 1);
  });

  it('ignores junk values and unavailable storage', () => {
    assert.equal(resolveUiVersion('?ui=banana', memoryStorage()), DEFAULT_UI_VERSION);
    assert.equal(resolveUiVersion('?ui=2', null), 2);
    const broken = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    assert.equal(resolveUiVersion('', broken), DEFAULT_UI_VERSION);
    assert.equal(resolveUiVersion('?ui=2', broken), 2);
  });
});
