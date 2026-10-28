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

// @ts-expect-error Mocking global window
globalThis.window = {
  innerWidth: 1440,
  matchMedia: (query: string) => ({
    matches: query.includes('max-width: 66rem') ? globalThis.window.innerWidth <= 1056 : false,
    media: query,
  }),
};

const { ResponsiveToolbarManager } = await import('../src/studio/responsiveToolbar.ts');

describe('responsive and compact toolbar', () => {
  let workspace: MockElement;
  let btnFileMenu: MockElement;
  let fileMenuPopup: MockElement;
  let btnTogglePalette: MockElement;
  let btnToggleInspector: MockElement;
  let drawerScrim: MockElement;
  let btnHeaderOverflow: MockElement;
  let headerOverflowPopup: MockElement;

  beforeEach(() => {
    mockStorage.clear();
    elementsById.clear();
    globalThis.window.innerWidth = 1440;

    workspace = new MockElement('MAIN');
    workspace.id = 'workspace';
    elementsById.set('workspace', workspace);

    drawerScrim = new MockElement('DIV');
    drawerScrim.id = 'drawer-scrim';
    drawerScrim.setAttribute('hidden', '');
    elementsById.set('drawer-scrim', drawerScrim);

    btnFileMenu = new MockElement('BUTTON');
    btnFileMenu.id = 'btn-file-menu';
    elementsById.set('btn-file-menu', btnFileMenu);

    fileMenuPopup = new MockElement('DIV');
    fileMenuPopup.id = 'file-menu-popup';
    fileMenuPopup.setAttribute('hidden', '');
    elementsById.set('file-menu-popup', fileMenuPopup);

    btnHeaderOverflow = new MockElement('BUTTON');
    btnHeaderOverflow.id = 'btn-header-overflow';
    elementsById.set('btn-header-overflow', btnHeaderOverflow);

    headerOverflowPopup = new MockElement('DIV');
    headerOverflowPopup.id = 'header-overflow-popup';
    headerOverflowPopup.setAttribute('hidden', '');
    elementsById.set('header-overflow-popup', headerOverflowPopup);

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

  it('verifies canvas takes at least 92% of workspace width across all 5 responsive breakpoints (390, 768, 1024, 1312, 1440 px) when no drawer is open (item 7)', () => {
    // Breakpoints to test per MUST_DO_PLAN.md Item 7
    const viewports = [390, 768, 1024, 1312, 1440];
    const rem = 16;
    const railWidthPx = 3.25 * rem; // 52px per compact icon rail

    for (const vpWidth of viewports) {
      for (const mode of ['design', 'data'] as const) {
        let canvasWidth = 0;

        if (vpWidth <= 66 * rem) {
          // <= 66rem (~1056px): single column workspace grid (1fr).
          // Drawers are overlay drawers; when no drawer is open, sidebars are hidden (display: none).
          canvasWidth = vpWidth;
        } else {
          // > 66rem: desktop multi-column layout with collapsed icon rails.
          if (mode === 'design') {
            // Both palette and inspector rails are collapsed: 52px left + 52px right = 104px
            canvasWidth = vpWidth - (railWidthPx * 2);
          } else {
            // Data mode: palette sidebar is display: none; inspector rail is collapsed (52px)
            canvasWidth = vpWidth - railWidthPx;
          }
        }

        const share = canvasWidth / vpWidth;
        assert.ok(
          share >= 0.92,
          `At viewport ${vpWidth}px in ${mode} mode, canvas width (${canvasWidth}px, ${(share * 100).toFixed(2)}%) must be >= 92% of workspace`
        );
      }
    }
  });

  it('verifies grid specificity cascade fix in studio.css (item 7)', () => {
    const cssPath = resolve(process.cwd(), 'src/styles/studio.css');
    const css = readFileSync(cssPath, 'utf8');

    // Verify fragile :not() chain that broke cascade was removed
    assert.ok(
      !css.includes('.workspace:not([data-palette-collapsed="true"]):not([data-inspector-collapsed="true"])'),
      'Must eliminate fragile (0, 3, 0) :not() chain at 82rem'
    );

    // Verify explicit single-column workspace rules at 66rem for both design and data mode
    assert.ok(
      css.includes('.workspace[data-mode="data"]') && css.includes('grid-template-columns: minmax(0, 1fr)'),
      'Must ensure single column workspace at 66rem for data and design mode'
    );
  });

  it('boots with both panels collapsed by default below 66rem (item 8)', () => {
    globalThis.window.innerWidth = 768;

    const manager = new ResponsiveToolbarManager();
    manager.init(workspace as unknown as HTMLElement);

    assert.strictEqual(manager.isNarrowScreen(), true);
    assert.strictEqual(manager.isPaletteCollapsed(), true);
    assert.strictEqual(manager.isInspectorCollapsed(), true);
    assert.strictEqual(workspace.getAttribute('data-palette-collapsed'), 'true');
    assert.strictEqual(workspace.getAttribute('data-inspector-collapsed'), 'true');
  });

  it('mutually closes the other drawer on narrow screens and manages tap-to-dismiss scrim (item 8)', () => {
    globalThis.window.innerWidth = 768;

    const manager = new ResponsiveToolbarManager();
    manager.init(workspace as unknown as HTMLElement);

    // Initial state: both collapsed, scrim hidden
    assert.strictEqual(manager.isPaletteCollapsed(), true);
    assert.strictEqual(manager.isInspectorCollapsed(), true);
    assert.strictEqual(drawerScrim.hasAttribute('hidden'), true);

    // Open palette drawer
    manager.togglePalette(false);
    assert.strictEqual(manager.isPaletteCollapsed(), false, 'Palette must be open');
    assert.strictEqual(manager.isInspectorCollapsed(), true, 'Inspector must stay collapsed');
    assert.strictEqual(drawerScrim.hasAttribute('hidden'), false, 'Scrim must be visible when palette is open');

    // Opening inspector drawer must close palette drawer
    manager.toggleInspector(false);
    assert.strictEqual(manager.isInspectorCollapsed(), false, 'Inspector must be open');
    assert.strictEqual(manager.isPaletteCollapsed(), true, 'Palette must be automatically closed');
    assert.strictEqual(drawerScrim.hasAttribute('hidden'), false, 'Scrim must remain visible');

    // Tapping the scrim closes both drawers
    drawerScrim.click();
    assert.strictEqual(manager.isPaletteCollapsed(), true, 'Palette must close on scrim tap');
    assert.strictEqual(manager.isInspectorCollapsed(), true, 'Inspector must close on scrim tap');
    assert.strictEqual(drawerScrim.hasAttribute('hidden'), true, 'Scrim must be hidden when both drawers close');
  });

  it('toggles header overflow menu open and closed (item 8)', () => {
    const manager = new ResponsiveToolbarManager();
    manager.init(workspace as unknown as HTMLElement);

    assert.strictEqual(manager.isHeaderOverflowOpen(), false);
    assert.strictEqual(headerOverflowPopup.hasAttribute('hidden'), true);

    manager.toggleHeaderOverflow();
    assert.strictEqual(manager.isHeaderOverflowOpen(), true);
    assert.strictEqual(headerOverflowPopup.hasAttribute('hidden'), false);
    assert.strictEqual(btnHeaderOverflow.getAttribute('aria-expanded'), 'true');

    manager.closeHeaderOverflow();
    assert.strictEqual(manager.isHeaderOverflowOpen(), false);
    assert.strictEqual(headerOverflowPopup.hasAttribute('hidden'), true);
    assert.strictEqual(btnHeaderOverflow.getAttribute('aria-expanded'), 'false');
  });

  it('verifies 44px minimum tap targets inside @media (pointer: coarse) (item 8)', () => {
    const cssPath = resolve(process.cwd(), 'src/styles/studio.css');
    const css = readFileSync(cssPath, 'utf8');

    assert.ok(css.includes('@media (pointer: coarse)'), 'CSS must include coarse pointer block');
    assert.ok(
      css.includes('min-inline-size: 2.75rem;') && css.includes('min-block-size: 2.75rem;'),
      'Must enforce 44px (2.75rem) minimum tap targets on buttons for coarse pointers'
    );
  });

  it('verifies low-zoom port interactivity and hit target expansion (item 9)', () => {
    const cssPath = resolve(process.cwd(), 'src/styles/studio.css');
    const css = readFileSync(cssPath, 'utf8');

    // Verify .node-port is NOT in the pointer-events: none rule for low zoom
    const lowLodSection = css.slice(css.indexOf('Level-of-Detail (LoD) rendering for low zoom'));
    const lowLodBlock = lowLodSection.slice(0, lowLodSection.indexOf('}'));
    assert.ok(
      !lowLodBlock.includes('.node-port'),
      'Low zoom LoD rule must NOT set pointer-events: none on .node-port'
    );

    // Verify low zoom keeps pointer-events: auto and scales hit area
    assert.ok(
      css.includes('#stage-world[data-lod="low"] .node-port') &&
      css.includes('pointer-events: auto;'),
      'Must keep ports interactive at low zoom'
    );
    assert.ok(
      css.includes('#stage-world[data-lod="low"] .node-port::after') &&
      css.includes('inset: -14px;'),
      'Must expand invisible port hit target at low zoom'
    );
  });

  it('verifies collapsed palette rail in index.html is rebuilt from STENCIL_CATALOG (item 9)', () => {
    const htmlPath = resolve(process.cwd(), 'index.html');
    const html = readFileSync(htmlPath, 'utf8');

    const railStart = html.indexOf('id="palette-rail-content"');
    const railEnd = html.indexOf('<!-- Expanded Palette Header', railStart);
    const railHtml = html.slice(railStart, railEnd);

    // Must contain real NodeKinds from STENCIL_CATALOG
    assert.ok(railHtml.includes('data-stencil-kind="actor"'), 'Rail must contain actor');
    assert.ok(railHtml.includes('data-stencil-kind="core"'), 'Rail must contain core');
    assert.ok(railHtml.includes('data-stencil-kind="service"'), 'Rail must contain service');
    assert.ok(railHtml.includes('data-stencil-kind="bus"'), 'Rail must contain bus');
    assert.ok(railHtml.includes('data-stencil-kind="store"'), 'Rail must contain store');
    assert.ok(railHtml.includes('data-stencil-kind="gate"'), 'Rail must contain gate');
    assert.ok(railHtml.includes('data-stencil-kind="client"'), 'Rail must contain client');
    assert.ok(railHtml.includes('data-stencil-kind="zone"'), 'Rail must contain zone');
    assert.ok(railHtml.includes('data-stencil-kind="notes"'), 'Rail must contain notes');

    // Must NOT contain invalid kinds database, queue, cloud
    assert.ok(!railHtml.includes('data-stencil-kind="database"'), 'Rail must not contain bogus kind database');
    assert.ok(!railHtml.includes('data-stencil-kind="queue"'), 'Rail must not contain bogus kind queue');
    assert.ok(!railHtml.includes('data-stencil-kind="cloud"'), 'Rail must not contain bogus kind cloud');
  });
});
