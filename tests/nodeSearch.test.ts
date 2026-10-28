import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  filterNodesByQuery,
  initNodeSearch,
  applySearchHighlightsToStage,
  clearSearchHighlightsFromStage,
} from '../src/studio/nodeSearch.ts';
import { SHORTCUTS } from '../src/studio/commands.ts';
import type { DiagramDocument, DiagramNode } from '../src/types.ts';
import { createBlankDocument } from '../src/templates/presets.ts';

const SAMPLE_NODES: DiagramNode[] = [
  {
    id: 'api-gw',
    kind: 'gate',
    accent: 'blue',
    title: 'API Gateway',
    subtitle: 'Kong Ingress Proxy',
    eyebrow: 'PERIMETER',
    footerLeft: '',
    chip: 'REST / GraphQL',
    zoneLabel: 'Edge',
    interfaceLabel: '',
    summary: 'Handles TLS termination and JWT authorization.',
    metrics: [],
    code: '',
    x: 100,
    y: 100,
    width: 240,
    height: 110,
  },
  {
    id: 'auth-server',
    kind: 'gate',
    accent: 'violet',
    title: 'OIDC Identity Provider',
    subtitle: 'OAuth 2.1 Server',
    eyebrow: 'SECURITY',
    footerLeft: '',
    chip: 'Token Issuer',
    zoneLabel: 'Security',
    interfaceLabel: '',
    summary: 'Issues RS256 signed access tokens and checks MFA.',
    metrics: [],
    code: '',
    x: 400,
    y: 100,
    width: 240,
    height: 110,
  },
  {
    id: 'redis-cache',
    kind: 'store',
    accent: 'amber',
    title: 'Redis Sentinel',
    subtitle: 'In-Memory Cache',
    eyebrow: 'CACHING TIER',
    footerLeft: '',
    chip: 'Sub-ms',
    zoneLabel: 'Cache',
    interfaceLabel: '',
    summary: 'Caches user sessions and rate-limiting counters.',
    metrics: [],
    code: '',
    x: 400,
    y: 300,
    width: 240,
    height: 110,
  },
  {
    id: 'pg-primary',
    kind: 'store',
    accent: 'rose',
    title: 'PostgreSQL Primary',
    subtitle: 'Transactional Master',
    eyebrow: 'PERSISTENCE',
    footerLeft: '',
    chip: 'Write Leader',
    zoneLabel: 'Data',
    interfaceLabel: '',
    summary: 'Stores ACID transactional entities.',
    metrics: [],
    code: '',
    x: 700,
    y: 300,
    width: 240,
    height: 110,
  },
];

describe('node search and focus (Cmd/Ctrl+F)', () => {
  it('filters nodes by single token across title, subtitle, eyebrow, and summary', () => {
    const titleMatch = filterNodesByQuery(SAMPLE_NODES, 'gateway');
    assert.strictEqual(titleMatch.length, 1);
    assert.strictEqual(titleMatch[0].id, 'api-gw');

    const subtitleMatch = filterNodesByQuery(SAMPLE_NODES, 'oauth');
    assert.strictEqual(subtitleMatch.length, 1);
    assert.strictEqual(subtitleMatch[0].id, 'auth-server');

    const eyebrowMatch = filterNodesByQuery(SAMPLE_NODES, 'caching');
    assert.strictEqual(eyebrowMatch.length, 1);
    assert.strictEqual(eyebrowMatch[0].id, 'redis-cache');

    const summaryMatch = filterNodesByQuery(SAMPLE_NODES, 'acid');
    assert.strictEqual(summaryMatch.length, 1);
    assert.strictEqual(summaryMatch[0].id, 'pg-primary');
  });

  it('filters nodes by multiple tokens across fields', () => {
    const multiMatch = filterNodesByQuery(SAMPLE_NODES, 'security oidc');
    assert.strictEqual(multiMatch.length, 1);
    assert.strictEqual(multiMatch[0].id, 'auth-server');

    const storeMatch = filterNodesByQuery(SAMPLE_NODES, 'store');
    assert.strictEqual(storeMatch.length, 2);
    const storeIds = storeMatch.map((n) => n.id);
    assert.ok(storeIds.includes('redis-cache'));
    assert.ok(storeIds.includes('pg-primary'));
  });

  it('handles empty query and non-matching queries gracefully', () => {
    assert.deepStrictEqual(filterNodesByQuery(SAMPLE_NODES, ''), []);
    assert.deepStrictEqual(filterNodesByQuery(SAMPLE_NODES, '   '), []);
    assert.deepStrictEqual(filterNodesByQuery(SAMPLE_NODES, 'nonexistent-xyz-search'), []);
  });

  it('registers Cmd/Ctrl+F in keyboard shortcuts registry', () => {
    const findShortcut = SHORTCUTS.find((s) => s.description.toLowerCase().includes('find'));
    assert.ok(findShortcut, 'Find shortcut exists in SHORTCUTS');
    assert.deepStrictEqual(findShortcut.keys, ['⌘', 'F']);
  });

  it('steps through matched nodes with nextMatch and prevMatch', () => {
    class MockElement {
      value = '';
      textContent = '';
      hidden = false;
      listeners: Record<string, ((e: any) => void)[]> = {};
      addEventListener(type: string, fn: (e: any) => void) {
        this.listeners[type] = this.listeners[type] || [];
        this.listeners[type].push(fn);
      }
      blur() {}
      focus() {}
      select() {}
    }

    const searchInput = new MockElement() as any;
    const searchCount = new MockElement() as any;
    const clearButton = new MockElement() as any;

    const focusedNodes: DiagramNode[] = [];
    const doc: DiagramDocument = {
      ...createBlankDocument(),
      nodes: SAMPLE_NODES,
    };

    const controller = initNodeSearch({
      searchInput,
      searchCount,
      clearButton,
      getDoc: () => doc,
      onFocusNode: (n) => focusedNodes.push(n),
    });

    controller.search('store');
    assert.strictEqual(controller.getMatchedNodes().length, 2);
    assert.strictEqual(controller.getCurrentIndex(), 0);
    assert.strictEqual(focusedNodes[0].id, 'redis-cache');

    controller.nextMatch();
    assert.strictEqual(controller.getCurrentIndex(), 1);
    assert.strictEqual(focusedNodes[1].id, 'pg-primary');

    // Wraps around
    controller.nextMatch();
    assert.strictEqual(controller.getCurrentIndex(), 0);
    assert.strictEqual(focusedNodes[2].id, 'redis-cache');

    // Steps back
    controller.prevMatch();
    assert.strictEqual(controller.getCurrentIndex(), 1);
    assert.strictEqual(focusedNodes[3].id, 'pg-primary');

    // Clear
    controller.clear();
    assert.strictEqual(controller.getMatchedNodes().length, 0);
    assert.strictEqual(controller.getCurrentIndex(), -1);
    assert.strictEqual(searchCount.hidden, true);
  });

  it('does not zoom-frame on keystroke, but frames on Enter / next match', () => {
    class MockElement {
      value = '';
      textContent = '';
      hidden = false;
      listeners: Record<string, ((e: any) => void)[]> = {};
      addEventListener(type: string, fn: (e: any) => void) {
        this.listeners[type] = this.listeners[type] || [];
        this.listeners[type].push(fn);
      }
      trigger(type: string, e: any = {}) {
        for (const fn of this.listeners[type] || []) fn(e);
      }
      blur() {}
      focus() {}
      select() {}
    }

    const searchInput = new MockElement() as any;
    const searchCount = new MockElement() as any;
    const clearButton = new MockElement() as any;

    const focusEvents: { node: DiagramNode; frame?: boolean }[] = [];
    const doc: DiagramDocument = {
      ...createBlankDocument(),
      nodes: SAMPLE_NODES,
    };

    initNodeSearch({
      searchInput,
      searchCount,
      clearButton,
      getDoc: () => doc,
      onFocusNode: (node, frame) => focusEvents.push({ node, frame }),
    });

    // User types query
    searchInput.value = 'store';
    searchInput.trigger('input');
    assert.strictEqual(focusEvents.length, 1);
    assert.strictEqual(focusEvents[0].frame, false, 'typing search query does not zoom-frame');

    // User presses Enter
    searchInput.trigger('keydown', { key: 'Enter', preventDefault() {} });
    assert.strictEqual(focusEvents.length, 2);
    assert.strictEqual(focusEvents[1].frame, true, 'Enter key frames on matched node');
  });

  it('verifies node DOM identity contract (id and dataset) and search highlighting via renderNodes', async () => {
    class MockDomElement {
      children: MockDomElement[] = [];
      parentElement: MockDomElement | null = null;
      tagName = 'DIV';
      id = '';
      className = '';
      dataset: Record<string, string> = {};
      style = {
        setProperty: () => {},
        display: '',
      };
      classList = {
        _set: new Set<string>(),
        add: (...cls: string[]) => cls.forEach((c) => this.classList._set.add(c)),
        remove: (...cls: string[]) => cls.forEach((c) => this.classList._set.delete(c)),
        toggle: (c: string, force?: boolean) => {
          if (force !== undefined) {
            if (force) this.classList._set.add(c);
            else this.classList._set.delete(c);
          } else {
            if (this.classList._set.has(c)) this.classList._set.delete(c);
            else this.classList._set.add(c);
          }
        },
        contains: (c: string) => this.classList._set.has(c),
      };
      attributes = new Map<string, string>();
      setAttribute(k: string, v: string) { this.attributes.set(k, String(v)); }
      getAttribute(k: string) { return this.attributes.get(k) ?? null; }
      removeAttribute(k: string) { this.attributes.delete(k); }
      appendChild(c: MockDomElement) {
        this.children.push(c);
        c.parentElement = this;
        return c;
      }
      append(...kids: MockDomElement[]) { kids.forEach((k) => this.appendChild(k)); }
      replaceChildren(...kids: MockDomElement[]) { this.children = [...kids]; }
      insertBefore(newChild: MockDomElement, refChild: MockDomElement) {
        const idx = this.children.indexOf(refChild);
        if (idx === -1) this.children.push(newChild);
        else this.children.splice(idx, 0, newChild);
        newChild.parentElement = this;
        return newChild;
      }
      removeChild(c: MockDomElement) {
        const idx = this.children.indexOf(c);
        if (idx !== -1) this.children.splice(idx, 1);
        c.parentElement = null;
        return c;
      }
      remove() { if (this.parentElement) this.parentElement.removeChild(this); }
      addEventListener() {}
      querySelector(sel: string): any {
        if (sel === '.node-select-hit') {
          const hit = new MockDomElement();
          hit.className = 'node-select-hit';
          return hit;
        }
        return null;
      }
      querySelectorAll(sel: string): any[] {
        const matches: MockDomElement[] = [];
        const walk = (el: MockDomElement) => {
          if (sel === '.arch-node' && (el.className.includes('arch-node') || el.classList.contains('arch-node'))) {
            matches.push(el);
          }
          for (const child of el.children) walk(child);
        };
        walk(this);
        return matches;
      }
    }

    const nodesLayer = new MockDomElement();
    nodesLayer.id = 'nodes-layer';

    const prevDoc = (globalThis as any).document;
    const prevWin = (globalThis as any).window;
    const prevRaf = (globalThis as any).requestAnimationFrame;

    (globalThis as any).document = {
      getElementById(id: string) {
        if (id === 'nodes-layer') return nodesLayer;
        for (const child of nodesLayer.children) {
          if (child.id === id) return child;
        }
        return null;
      },
      createElement(tag: string) {
        const el = new MockDomElement();
        el.tagName = tag.toUpperCase();
        return el;
      },
      createElementNS(_ns: string, tag: string) {
        const el = new MockDomElement();
        el.tagName = tag;
        return el;
      },
      querySelector: () => null,
      querySelectorAll(sel: string) {
        return nodesLayer.querySelectorAll(sel);
      },
      body: new MockDomElement(),
    };
    (globalThis as any).window = globalThis;
    (globalThis as any).requestAnimationFrame = (cb: () => void) => { cb(); return 1; };

    try {
      const { renderNodes } = await import('../src/studio/keyedStage.ts');
      const { app } = await import('../src/studio/state.ts');

      app.doc.nodes = [SAMPLE_NODES[0], SAMPLE_NODES[1]];
      renderNodes();

      assert.strictEqual(nodesLayer.children.length, 2, 'renders 2 node elements');
      const firstNodeEl = nodesLayer.children[0];

      // Verify DOM identity contract
      assert.strictEqual(firstNodeEl.id, 'node-api-gw', 'wrapper.id must be node-${id}');
      assert.strictEqual(firstNodeEl.dataset.node, 'api-gw', 'dataset.node must be set');
      assert.strictEqual(firstNodeEl.dataset.nodeId, 'api-gw', 'dataset.nodeId must be set');

      // Verify document.getElementById lookup (used by tagEnteringNodes and beginPortWireDrag)
      const lookedUp = (globalThis as any).document.getElementById('node-api-gw');
      assert.strictEqual(lookedUp, firstNodeEl, 'document.getElementById("node-" + id) finds the node element');

      // Verify search highlights on real rendered nodes
      applySearchHighlightsToStage(new Set(['api-gw']), 'api-gw');
      assert.strictEqual(firstNodeEl.classList.contains('is-search-match'), true, 'matching node has is-search-match');
      assert.strictEqual(firstNodeEl.classList.contains('is-active-match'), true, 'active node has is-active-match');
      assert.strictEqual(firstNodeEl.classList.contains('is-dimmed'), false, 'matching node is NOT dimmed');

      const secondNodeEl = nodesLayer.children[1];
      assert.strictEqual(secondNodeEl.classList.contains('is-search-match'), false, 'non-matching node does not have is-search-match');
      assert.strictEqual(secondNodeEl.classList.contains('is-dimmed'), true, 'non-matching node is dimmed');

      clearSearchHighlightsFromStage();
      assert.strictEqual(firstNodeEl.classList.contains('is-search-match'), false, 'clears search match');
      assert.strictEqual(firstNodeEl.classList.contains('is-dimmed'), false, 'clears dimmed');
    } finally {
      (globalThis as any).document = prevDoc;
      (globalThis as any).window = prevWin;
      (globalThis as any).requestAnimationFrame = prevRaf;
    }
  });
});
