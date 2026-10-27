import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Mock minimal document and localStorage for Node test runner
class MockElement {
  tagName: string;
  id = '';
  className = '';
  textContent = '';
  open = false;
  style: Record<string, string> = {};
  children: MockElement[] = [];
  parentNode: MockElement | null = null;
  attributes = new Map<string, string>();
  listeners = new Map<string, Array<() => void>>();

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }

  getAttribute(name: string) {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name: string) {
    this.attributes.delete(name);
  }

  appendChild(child: MockElement) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  append(...children: MockElement[]) {
    for (const child of children) {
      this.appendChild(child);
    }
  }

  addEventListener(event: string, fn: () => void) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(fn);
  }

  dispatchEvent(event: string) {
    for (const fn of this.listeners.get(event) ?? []) {
      fn();
    }
  }

  querySelector(selector: string): MockElement | null {
    return this.children.find((c) => c.tagName.toLowerCase() === selector.toLowerCase()) ?? null;
  }
}

const mockStorage = new Map<string, string>();
const fakeLocalStorage = {
  getItem: (key: string) => mockStorage.get(key) ?? null,
  setItem: (key: string, val: string) => mockStorage.set(key, val),
  removeItem: (key: string) => mockStorage.delete(key),
  clear: () => mockStorage.clear(),
};

// @ts-expect-error Mocking global document and localStorage
globalThis.document = {
  createElement: (tag: string) => new MockElement(tag),
  getElementById: (id: string) => {
    const el = new MockElement('DIV');
    el.id = id;
    return el;
  },
  querySelector: () => null,
  querySelectorAll: () => [],
};
// @ts-expect-error Mocking global localStorage
globalThis.localStorage = fakeLocalStorage;

const { makeCollapsibleSection, makeTonePicker } = await import('../src/studio/inspector.ts');

describe('inspector collapsible sections and tone picker', () => {
  beforeEach(() => {
    mockStorage.clear();
  });

  it('creates a collapsible <details> section with localStorage persistence', () => {
    const child = new MockElement('DIV');
    child.textContent = 'Content here';
    const section = makeCollapsibleSection('basics', 'Basics', true, [child as unknown as HTMLElement]);

    assert.strictEqual(section.tagName, 'DETAILS');
    assert.strictEqual(section.open, true, 'is open by default');

    const summary = section.children.find((c) => c.tagName === 'SUMMARY');
    assert.ok(summary);
    assert.strictEqual(summary.textContent, 'Basics');

    // Toggle to closed
    section.open = false;
    section.dispatchEvent('toggle');
    assert.strictEqual(mockStorage.get('conduitcraft-section-basics'), 'closed');

    // Create next instance - should read saved state
    const nextSection = makeCollapsibleSection('basics', 'Basics', true, []);
    assert.strictEqual(nextSection.open, false, 'reads closed state from storage');
  });

  it('creates compact dot swatches with tooltip and aria-label', () => {
    let chosenTone = '';
    const picker = makeTonePicker('test-tones', 'blue', (tone) => {
      chosenTone = tone;
    });

    assert.strictEqual(picker.tagName, 'FIELDSET');
    const options = picker.children.filter((c) => c.className.includes('swatch-option'));
    assert.strictEqual(options.length, 5, 'renders all 5 stream tones');

    const first = options[0];
    assert.ok(first.className.includes('swatch-dot-only'));
    assert.ok(first.getAttribute('data-tip'), 'has data-tip for hover tooltip');
    assert.ok(first.getAttribute('aria-label'), 'has aria-label for accessibility');
  });
});
