import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

class MockElement {
  tagName: string;
  id = '';
  className = '';
  textContent = '';
  style: Record<string, string> = {};
  children: MockElement[] = [];
  parentNode: MockElement | null = null;
  attributes = new Map<string, string>();
  listeners = new Map<string, Array<(e?: unknown) => void>>();

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

  hasAttribute(name: string) {
    return this.attributes.has(name);
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

  addEventListener(event: string, fn: (e?: unknown) => void) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(fn);
  }

  dispatchEvent(event: string, eventObj?: unknown) {
    for (const fn of this.listeners.get(event) ?? []) {
      fn(eventObj);
    }
  }

  closest<T extends MockElement>(selector: string): T | null {
    if (selector.startsWith('.') && this.className.includes(selector.slice(1))) {
      return this as unknown as T;
    }
    if (selector.startsWith('#') && this.id === selector.slice(1)) {
      return this as unknown as T;
    }
    return this.parentNode ? this.parentNode.closest(selector) : null;
  }

  querySelector<T extends MockElement>(selector: string): T | null {
    for (const child of this.children) {
      if (selector.startsWith('.') && child.className.includes(selector.slice(1))) {
        return child as unknown as T;
      }
      if (selector.startsWith('#') && child.id === selector.slice(1)) {
        return child as unknown as T;
      }
      const match = child.querySelector<T>(selector);
      if (match) return match;
    }
    return null;
  }

  focus() {
    // mock focus
  }

  click() {
    this.dispatchEvent('click', { target: this, stopPropagation: () => {} });
  }
}

const mockStorage = new Map<string, string>();
const fakeLocalStorage = {
  getItem: (key: string) => mockStorage.get(key) ?? null,
  setItem: (key: string, val: string) => mockStorage.set(key, val),
  removeItem: (key: string) => mockStorage.delete(key),
  clear: () => mockStorage.clear(),
};

const elementsById = new Map<string, MockElement>();

// @ts-expect-error Mocking global document and localStorage
globalThis.document = {
  createElement: (tag: string) => new MockElement(tag),
  getElementById: (id: string) => {
    let el = elementsById.get(id);
    if (!el) {
      el = new MockElement('DIV');
      el.id = id;
      elementsById.set(id, el);
    }
    return el;
  },
  querySelector: (sel: string) => {
    for (const el of elementsById.values()) {
      const match = el.querySelector(sel);
      if (match) return match;
    }
    return null;
  },
  querySelectorAll: () => [],
  addEventListener: (event: string, fn: (e?: unknown) => void) => {
    let docEl = elementsById.get('__document__');
    if (!docEl) {
      docEl = new MockElement('DOCUMENT');
      elementsById.set('__document__', docEl);
    }
    docEl.addEventListener(event, fn);
  },
};
// @ts-expect-error Mocking global localStorage
globalThis.localStorage = fakeLocalStorage;

const { ResponsiveToolbarManager } = await import('../src/studio/responsiveToolbar.ts');

describe('responsive and compact toolbar', () => {
  let workspace: MockElement;
  let btnFileMenu: MockElement;
  let fileMenuPopup: MockElement;
  let btnTogglePalette: MockElement;
  let btnToggleInspector: MockElement;

  beforeEach(() => {
    mockStorage.clear();
    elementsById.clear();

    workspace = new MockElement('MAIN');
    workspace.id = 'workspace';
    elementsById.set('workspace', workspace);

    btnFileMenu = new MockElement('BUTTON');
    btnFileMenu.id = 'btn-file-menu';
    elementsById.set('btn-file-menu', btnFileMenu);

    fileMenuPopup = new MockElement('DIV');
    fileMenuPopup.id = 'file-menu-popup';
    fileMenuPopup.setAttribute('hidden', '');
    elementsById.set('file-menu-popup', fileMenuPopup);

    btnTogglePalette = new MockElement('BUTTON');
    btnTogglePalette.id = 'btn-toggle-palette';
    elementsById.set('btn-toggle-palette', btnTogglePalette);

    btnToggleInspector = new MockElement('BUTTON');
    btnToggleInspector.id = 'btn-toggle-inspector';
    elementsById.set('btn-toggle-inspector', btnToggleInspector);
  });

  it('toggles the File dropdown menu open and closed', () => {
    const manager = new ResponsiveToolbarManager();
    manager.init(workspace as unknown as HTMLElement);

    assert.strictEqual(manager.isFileMenuOpen(), false);
    assert.strictEqual(fileMenuPopup.hasAttribute('hidden'), true);

    manager.toggleFileMenu();
    assert.strictEqual(manager.isFileMenuOpen(), true);
    assert.strictEqual(fileMenuPopup.hasAttribute('hidden'), false);
    assert.strictEqual(btnFileMenu.getAttribute('aria-expanded'), 'true');

    manager.closeFileMenu();
    assert.strictEqual(manager.isFileMenuOpen(), false);
    assert.strictEqual(fileMenuPopup.hasAttribute('hidden'), true);
    assert.strictEqual(btnFileMenu.getAttribute('aria-expanded'), 'false');
  });

  it('toggles palette collapsed state and persists in localStorage', () => {
    const manager = new ResponsiveToolbarManager();
    manager.init(workspace as unknown as HTMLElement);

    assert.strictEqual(manager.isPaletteCollapsed(), false);

    // Collapse
    const collapsed = manager.togglePalette();
    assert.strictEqual(collapsed, true);
    assert.strictEqual(workspace.getAttribute('data-palette-collapsed'), 'true');
    assert.strictEqual(mockStorage.get('conduitcraft:palette-collapsed'), 'true');
    assert.strictEqual(btnTogglePalette.getAttribute('aria-expanded'), 'false');

    // Expand
    const expanded = manager.togglePalette();
    assert.strictEqual(expanded, false);
    assert.strictEqual(workspace.hasAttribute('data-palette-collapsed'), false);
    assert.strictEqual(mockStorage.has('conduitcraft:palette-collapsed'), false);
    assert.strictEqual(btnTogglePalette.getAttribute('aria-expanded'), 'true');
  });

  it('toggles inspector collapsed state and persists in localStorage', () => {
    const manager = new ResponsiveToolbarManager();
    manager.init(workspace as unknown as HTMLElement);

    assert.strictEqual(manager.isInspectorCollapsed(), false);

    // Collapse
    const collapsed = manager.toggleInspector();
    assert.strictEqual(collapsed, true);
    assert.strictEqual(workspace.getAttribute('data-inspector-collapsed'), 'true');
    assert.strictEqual(mockStorage.get('conduitcraft:inspector-collapsed'), 'true');
    assert.strictEqual(btnToggleInspector.getAttribute('aria-expanded'), 'false');

    // Expand
    const expanded = manager.toggleInspector();
    assert.strictEqual(expanded, false);
    assert.strictEqual(workspace.hasAttribute('data-inspector-collapsed'), false);
    assert.strictEqual(mockStorage.has('conduitcraft:inspector-collapsed'), false);
    assert.strictEqual(btnToggleInspector.getAttribute('aria-expanded'), 'true');
  });

  it('restores collapsed states from localStorage on initialization', () => {
    mockStorage.set('conduitcraft:palette-collapsed', 'true');
    mockStorage.set('conduitcraft:inspector-collapsed', 'true');

    const manager = new ResponsiveToolbarManager();
    manager.init(workspace as unknown as HTMLElement);

    assert.strictEqual(manager.isPaletteCollapsed(), true);
    assert.strictEqual(manager.isInspectorCollapsed(), true);
    assert.strictEqual(workspace.getAttribute('data-palette-collapsed'), 'true');
    assert.strictEqual(workspace.getAttribute('data-inspector-collapsed'), 'true');
  });

  it('verifies responsive stylesheet rules for compact toolbar and rails', () => {
    const cssPath = resolve(process.cwd(), 'src/styles/studio.css');
    const css = readFileSync(cssPath, 'utf8');

    assert.ok(css.includes('.menu-dropdown-wrapper'), 'CSS defines menu dropdown wrapper');
    assert.ok(css.includes('.menu-dropdown-popup'), 'CSS defines menu dropdown popup');
    assert.ok(css.includes('.doc-history-controls'), 'CSS defines doc history controls next to title');
    assert.ok(css.includes('workspace[data-palette-collapsed="true"]'), 'CSS defines palette collapsed rail layout');
    assert.ok(css.includes('workspace[data-inspector-collapsed="true"]'), 'CSS defines inspector collapsed rail layout');
    assert.ok(css.includes('@media (max-width: 82rem)'), 'CSS defines 82rem breakpoint');
    assert.ok(css.includes('@media (max-width: 66rem)'), 'CSS defines 66rem breakpoint');
    assert.ok(css.includes('@media (max-width: 52rem)'), 'CSS defines 52rem breakpoint');
  });
});
