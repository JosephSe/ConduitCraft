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

  it('verifies responsive inspector rules that prevent right-side truncation', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');

    const studioCss = readFileSync(resolve(process.cwd(), 'src/styles/studio.css'), 'utf8');
    const sharedCss = readFileSync(resolve(process.cwd(), 'src/styles/shared.css'), 'utf8');

    // Body bounds preventing horizontal blowout
    assert.ok(sharedCss.includes('max-inline-size: 100vw;'), 'body is constrained to 100vw in shared.css');
    assert.ok(sharedCss.includes('overflow: hidden;'), 'body prevents page horizontal overflow in shared.css');

    // Inspector and pane bounds
    assert.ok(studioCss.includes('.inspector {') && studioCss.includes('overflow: hidden;'), 'inspector has overflow hidden');
    assert.ok(studioCss.includes('.inspector-mode-pane {') && studioCss.includes('min-inline-size: 0;'), 'inspector-mode-pane sets min-inline-size: 0 to prevent min-content blowout');
    assert.ok(studioCss.includes('.inspector-tabs {') && studioCss.includes('flex-wrap: wrap;'), 'inspector-tabs wraps action buttons to avoid overflowing right edge');
    assert.ok(studioCss.includes('.inspector-scroll {') && studioCss.includes('overflow-x: hidden;'), 'inspector-scroll clips horizontal overflow');

    // Form inputs and triggers contained within bounds
    assert.ok(studioCss.includes('.prop-row-2 {') && studioCss.includes('repeat(auto-fit'), 'prop-row-2 uses responsive auto-fit columns');
    assert.ok(studioCss.includes('.prop-input,') && studioCss.includes('box-sizing: border-box;'), 'prop inputs use border-box sizing');
    assert.ok(studioCss.includes('.custom-icon-upload-zone {') && studioCss.includes('box-sizing: border-box;'), 'custom icon upload zone uses border-box sizing');
  });
});
