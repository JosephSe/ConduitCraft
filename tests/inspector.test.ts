import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Mock minimal document and localStorage for Node test runner
class MockElement {
  tagName: string;
  id = '';
  className = '';
  textContent = '';
  open = false;
  dataset: Record<string, string> = {};
  style: Record<string, string> = {};
  classList = {
    add: (cls: string) => {
      const parts = new Set(this.className.split(' ').filter(Boolean));
      parts.add(cls);
      this.className = Array.from(parts).join(' ');
    },
    remove: (cls: string) => {
      const parts = new Set(this.className.split(' ').filter(Boolean));
      parts.delete(cls);
      this.className = Array.from(parts).join(' ');
    },
    contains: (cls: string) => {
      return this.className.split(' ').includes(cls);
    },
  };
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

  remove() {
    if (this.parentNode) {
      const idx = this.parentNode.children.indexOf(this);
      if (idx >= 0) this.parentNode.children.splice(idx, 1);
    }
  }

  append(...children: MockElement[]) {
    for (const child of children) {
      this.appendChild(child);
    }
  }

  replaceChildren(...children: MockElement[]) {
    this.children = [];
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
// @ts-expect-error Mocking global HTMLElement
globalThis.HTMLElement = MockElement as unknown as typeof HTMLElement;
// @ts-expect-error Mocking global HTMLButtonElement
globalThis.HTMLButtonElement = MockElement as unknown as typeof HTMLButtonElement;

const { makeCollapsibleSection, makeTonePicker, isScenarioCollapsed, setScenarioCollapsed, duplicateSimulationScenario, moveSimulationScenario } = await import('../src/studio/inspector.ts');

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

    // Collapsible scenarios
    assert.ok(studioCss.includes('.sim-card-header {'), 'sim-card-header exists in studio.css');
    assert.ok(studioCss.includes('.sim-card-toggle {'), 'sim-card-toggle exists in studio.css');
    assert.ok(studioCss.includes('.sim-editor-card[data-collapsed="true"] .sim-card-body'), 'sim-card-body is hidden when collapsed');
    assert.ok(studioCss.includes('.sim-card-title {') && studioCss.includes('white-space: normal;'), 'sim-card-title wraps scenario name');
    assert.ok(studioCss.includes('.sim-card-title {') && studioCss.includes('word-break: break-word;'), 'sim-card-title breaks long words');
    assert.ok(studioCss.includes('.micro-chip {') && studioCss.includes('white-space: nowrap;'), 'micro-chip keeps count on single line');
  });

  it('manages collapsible scenario cards with toggle and persistence', () => {
    assert.strictEqual(isScenarioCollapsed('sim-1'), false, 'defaults to open');
    setScenarioCollapsed('sim-1', true);
    assert.strictEqual(isScenarioCollapsed('sim-1'), true, 'collapses scenario');
    assert.strictEqual(mockStorage.get('conduitcraft-sim-collapsed-sim-1'), 'true');

    setScenarioCollapsed('sim-1', false);
    assert.strictEqual(isScenarioCollapsed('sim-1'), false, 'expands scenario');
    assert.strictEqual(mockStorage.get('conduitcraft-sim-collapsed-sim-1'), undefined);
  });

  it('duplicates a scenario with fresh IDs, cloned steps, and (Copy) name', async () => {
    const { app } = await import('../src/studio/state.ts');
    app.doc.simulations = [
      {
        id: 'sim-flow-1',
        name: 'Happy Path',
        tone: 'emerald',
        steps: [
          {
            id: 'step-1',
            nodes: ['node-a', 'node-b'],
            tone: 'emerald',
            label: 'AUTH',
            trace: 'Token validated',
          },
        ],
      },
      {
        id: 'sim-flow-2',
        name: 'Failover',
        tone: 'rose',
        steps: [],
      },
    ];

    const dup = duplicateSimulationScenario('sim-flow-1');
    assert.ok(dup);
    assert.strictEqual(dup.name, 'Happy Path (Copy)');
    assert.strictEqual(dup.tone, 'emerald');
    assert.notStrictEqual(dup.id, 'sim-flow-1');
    assert.strictEqual(dup.steps.length, 1);
    assert.notStrictEqual(dup.steps[0].id, 'step-1');
    assert.strictEqual(dup.steps[0].label, 'AUTH');
    assert.deepStrictEqual(dup.steps[0].nodes, ['node-a', 'node-b']);

    // Check that duplicate was inserted right after sim-flow-1
    assert.strictEqual(app.doc.simulations.length, 3);
    assert.strictEqual(app.doc.simulations[0].id, 'sim-flow-1');
    assert.strictEqual(app.doc.simulations[1].id, dup.id);
    assert.strictEqual(app.doc.simulations[2].id, 'sim-flow-2');
  });

  it('orders simulation scenarios up and down with bounds checking', async () => {
    const { app } = await import('../src/studio/state.ts');
    app.doc.simulations = [
      { id: 'sim-a', name: 'Scenario A', tone: 'blue', steps: [] },
      { id: 'sim-b', name: 'Scenario B', tone: 'emerald', steps: [] },
      { id: 'sim-c', name: 'Scenario C', tone: 'rose', steps: [] },
    ];

    // Attempt to move top scenario up -> should return false and not change order
    assert.strictEqual(moveSimulationScenario('sim-a', -1), false);
    assert.deepStrictEqual(app.doc.simulations.map((s) => s.id), ['sim-a', 'sim-b', 'sim-c']);

    // Attempt to move bottom scenario down -> should return false and not change order
    assert.strictEqual(moveSimulationScenario('sim-c', 1), false);
    assert.deepStrictEqual(app.doc.simulations.map((s) => s.id), ['sim-a', 'sim-b', 'sim-c']);

    // Move Scenario A down
    assert.strictEqual(moveSimulationScenario('sim-a', 1), true);
    assert.deepStrictEqual(app.doc.simulations.map((s) => s.id), ['sim-b', 'sim-a', 'sim-c']);

    // Move Scenario C up
    assert.strictEqual(moveSimulationScenario('sim-c', -1), true);
    assert.deepStrictEqual(app.doc.simulations.map((s) => s.id), ['sim-b', 'sim-c', 'sim-a']);

    // Move Scenario B down
    assert.strictEqual(moveSimulationScenario('sim-b', 1), true);
    assert.deepStrictEqual(app.doc.simulations.map((s) => s.id), ['sim-c', 'sim-b', 'sim-a']);
  });
});
