import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  filterNodesByQuery,
  initNodeSearch,
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
});
