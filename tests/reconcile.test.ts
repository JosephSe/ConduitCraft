import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { reconcileKeyed } from '../src/studio/reconcile.ts';

interface FakeEl {
  children: FakeEl[];
  parent: FakeEl | null;
  attrs: Map<string, string>;
  key: string;
  id: number;
  appendChild(child: FakeEl): FakeEl;
  remove(): void;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
}

let nextId = 1;

function fakeEl(key = ''): FakeEl {
  const el: FakeEl = {
    children: [],
    parent: null,
    attrs: new Map(),
    key,
    id: nextId++,
    appendChild(child) {
      child.remove();
      this.children.push(child);
      child.parent = this;
      return child;
    },
    remove() {
      this.parent?.children.splice(this.parent.children.indexOf(this), 1);
      this.parent = null;
    },
    getAttribute(name) {
      return this.attrs.get(name) ?? null;
    },
    setAttribute(name, value) {
      this.attrs.set(name, value);
    },
  };
  if (key) el.attrs.set('data-key', key);
  return el;
}

describe('keyed reconciliation', () => {
  it('reuses elements with the same key and structure, drops the rest, and preserves order', () => {
    const parent = fakeEl();
    const first = fakeEl('a');
    const second = fakeEl('b');
    first.setAttribute('data-structure', 'kind');
    second.setAttribute('data-structure', 'kind');
    parent.appendChild(first);
    parent.appendChild(second);

    const updated: string[] = [];
    const created: string[] = [];
    reconcileKeyed(
      parent as unknown as Element,
      ['b', 'c'],
      (item) => item,
      (el) => (el as unknown as FakeEl).key,
      () => 'kind',
      (item) => {
        created.push(item);
        return fakeEl(item) as unknown as Element;
      },
      (el) => {
        updated.push((el as unknown as FakeEl).key);
      },
    );

    assert.deepEqual(created, ['c']);
    assert.deepEqual(updated, ['b', 'c']);
    assert.deepEqual(
      parent.children.map((child) => child.key),
      ['b', 'c'],
    );
    assert.equal(parent.children[0].id, second.id);
    assert.equal(parent.children[0].parent, parent);
    assert.equal(first.parent, null);
  });

  it('recreates an element when its structure signature changes', () => {
    const parent = fakeEl();
    const original = fakeEl('a');
    original.setAttribute('data-structure', 'actor');
    parent.appendChild(original);
    const created: number[] = [];

    reconcileKeyed(
      parent as unknown as Element,
      ['a'],
      (item) => item,
      (el) => (el as unknown as FakeEl).key,
      () => 'service',
      (item) => {
        const el = fakeEl(item);
        created.push(el.id);
        return el as unknown as Element;
      },
      () => {},
    );

    assert.equal(created.length, 1);
    assert.notEqual(parent.children[0].id, original.id);
    assert.equal(parent.children[0].getAttribute('data-structure'), 'service');
  });
});
