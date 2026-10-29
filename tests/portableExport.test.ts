import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { parseBlueprintJson, serializeBlueprintJson } from '../src/exporter/blueprintJson.ts';
import { renderDiagramSvg, estimatePngExport } from '../src/exporter/diagramSvg.ts';
import { generateStandaloneHtml } from '../src/exporter/standaloneHtml.ts';
import { createBlankDocument, createNodeFromStencil } from '../src/templates/presets.ts';
import type { DiagramDocument, SelectionTarget } from '../src/types.ts';

// Lightweight Mock Node for testing DOM manipulation and cleanClonedStage
class MockDOMNode {
  tagName: string;
  id: string = '';
  className: string = '';
  attributes = new Map<string, string>();
  dataset: Record<string, string> = {};
  style: Record<string, unknown> = {
    setProperty: (k: string, v: string) => {
      (this.style as Record<string, unknown>)[k] = v;
    },
    removeProperty: (k: string) => {
      delete (this.style as Record<string, unknown>)[k];
    },
    getPropertyValue: (k: string) => (this.style as Record<string, unknown>)[k] || '',
  };
  children: MockDOMNode[] = [];
  parentNode: MockDOMNode | null = null;
  textContent: string = '';

  constructor(tagName: string = 'div') {
    this.tagName = tagName.toUpperCase();
  }

  get classList() {
    return {
      add: (...tokens: string[]) => {
        const set = new Set(this.className.split(/\s+/).filter(Boolean));
        tokens.forEach((t) => set.add(t));
        this.className = [...set].join(' ');
      },
      remove: (...tokens: string[]) => {
        const set = new Set(this.className.split(/\s+/).filter(Boolean));
        tokens.forEach((t) => set.delete(t));
        this.className = [...set].join(' ');
      },
      contains: (token: string) => {
        return this.className.split(/\s+/).includes(token);
      },
      toggle: (token: string, force?: boolean) => {
        const has = this.className.split(/\s+/).includes(token);
        const shouldHave = force !== undefined ? force : !has;
        if (shouldHave) this.classList.add(token);
        else this.classList.remove(token);
        return shouldHave;
      },
    };
  }

  setAttribute(k: string, v: string) {
    this.attributes.set(k, String(v));
    if (k === 'id') this.id = v;
    if (k === 'class') this.className = v;
  }
  getAttribute(k: string) {
    if (k === 'class') return this.className;
    if (k === 'id') return this.id;
    return this.attributes.get(k) ?? null;
  }
  removeAttribute(k: string) {
    this.attributes.delete(k);
    if (k === 'id') this.id = '';
    if (k === 'class') this.className = '';
  }
  hasAttribute(k: string) {
    if (k === 'class') return Boolean(this.className);
    if (k === 'id') return Boolean(this.id);
    return this.attributes.has(k);
  }
  getAttributeNames(): string[] {
    return Array.from(this.attributes.keys());
  }

  appendChild(child: MockDOMNode) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  append(...nodes: (MockDOMNode | string)[]) {
    for (const n of nodes) {
      if (typeof n === 'string') {
        const textNode = new MockDOMNode('#text');
        textNode.textContent = n;
        this.appendChild(textNode);
      } else {
        this.appendChild(n);
      }
    }
  }

  remove() {
    if (this.parentNode) {
      const idx = this.parentNode.children.indexOf(this);
      if (idx !== -1) this.parentNode.children.splice(idx, 1);
      this.parentNode = null;
    }
  }

  cloneNode(deep: boolean = false): MockDOMNode {
    const copy = new MockDOMNode(this.tagName);
    copy.id = this.id;
    copy.className = this.className;
    copy.textContent = this.textContent;
    for (const [k, v] of this.attributes.entries()) copy.attributes.set(k, v);
    for (const [k, v] of Object.entries(this.dataset)) copy.dataset[k] = v;
    for (const [k, v] of Object.entries(this.style)) {
      if (typeof v === 'string') (copy.style as Record<string, unknown>)[k] = v;
    }
    if (deep) {
      for (const ch of this.children) {
        copy.appendChild(ch.cloneNode(true));
      }
    }
    return copy;
  }

  matches(selector: string): boolean {
    const parts = selector.split(',').map((s) => s.trim());
    return parts.some((part) => {
      // Attribute selector [name="val"]
      const attrMatch = part.match(/\[([a-zA-Z0-9_-]+)="([^"]+)"\]/);
      if (attrMatch) {
        const [, attr, val] = attrMatch;
        return this.getAttribute(attr) === val;
      }
      // ID selector #id
      if (part.startsWith('#')) {
        return this.id === part.slice(1);
      }
      // Class selector .class
      if (part.startsWith('.')) {
        return this.classList.contains(part.slice(1));
      }
      return this.tagName.toLowerCase() === part.toLowerCase();
    });
  }

  querySelectorAll(selector: string): MockDOMNode[] {
    const results: MockDOMNode[] = [];
    const walk = (node: MockDOMNode) => {
      for (const ch of node.children) {
        if (ch.matches(selector)) {
          results.push(ch);
        }
        walk(ch);
      }
    };
    walk(this);
    return results;
  }

  querySelector(selector: string): MockDOMNode | null {
    const all = this.querySelectorAll(selector);
    return all.length > 0 ? all[0] : null;
  }
}

// Setup minimal global environment for node test runner before loading studio modules
if (typeof (globalThis as any).document === 'undefined') {
  (globalThis as any).document = {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: (tag: string) => new MockDOMNode(tag),
    documentElement: new MockDOMNode('html'),
    body: new MockDOMNode('body'),
    styleSheets: [],
  };
}
if (typeof (globalThis as any).window === 'undefined') {
  (globalThis as any).window = {
    matchMedia: () => ({ matches: false }),
  };
}
if (typeof (globalThis as any).getComputedStyle === 'undefined') {
  (globalThis as any).getComputedStyle = () => ({
    getPropertyValue: () => '',
    color: '#0b1324',
    fontFamily: 'system-ui',
    fontSize: '16px',
    lineHeight: '1.5',
    colorScheme: 'light',
  });
}
if (typeof (globalThis as any).XMLSerializer === 'undefined') {
  (globalThis as any).XMLSerializer = class {
    serializeToString(node: any): string {
      if (!node) return '';
      const tag = (node.tagName || 'div').toLowerCase();
      const attrs: string[] = [];
      if (node.id) attrs.push(`id="${node.id}"`);
      if (node.className) attrs.push(`class="${node.className}"`);
      if (node.style) {
        const parts: string[] = [];
        if (typeof node.style.cssText === 'string' && node.style.cssText) {
          parts.push(node.style.cssText);
        }
        for (const [k, v] of Object.entries(node.style)) {
          if (typeof v === 'string' && v && k !== 'cssText' && typeof (node.style as any)[k] !== 'function') {
            const cssProp = k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
            parts.push(`${cssProp}: ${v}`);
          }
        }
        if (parts.length > 0) {
          attrs.push(`style="${parts.join('; ')}"`);
        }
      }
      if (node.attributes && typeof node.attributes.entries === 'function') {
        for (const [k, v] of node.attributes.entries()) {
          if (k !== 'id' && k !== 'class' && k !== 'style') attrs.push(`${k}="${v}"`);
        }
      }
      const childrenStr = (node.children || []).map((ch: any) => this.serializeToString(ch)).join('');
      const text = node.textContent || '';
      return `<${tag}${attrs.length ? ' ' + attrs.join(' ') : ''}>${text}${childrenStr}</${tag}>`;
    }
  };
}

const {
  cleanClonedStage,
  resolveCssVariables,
  renderStagePictureSvg,
  WL_RESOLVED_TOKENS,
} = await import('../src/studio/stagePicture.ts');

describe('portable export', () => {
  it('round-trips a diagram through blueprint JSON and draws it as SVG', () => {
    const doc = createBlankDocument();
    doc.title = 'Mesh & Core';
    const left = createNodeFromStencil('service', 48, 64, 0);
    left.title = 'Ingress <edge>';
    const right = createNodeFromStencil('core', 360, 64, 1);
    right.shape = 'pill';
    right.title = 'Core';
    doc.nodes.push(left, right);
    doc.edges.push({
      id: 'wire-1',
      from: left.id,
      to: right.id,
      sourcePort: 'right',
      targetPort: 'left',
      tone: 'emerald',
      route: 'straight',
      label: 'Events',
      animated: true,
    });

    const parsed = parseBlueprintJson(serializeBlueprintJson(doc));
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.doc.title, 'Mesh & Core');
    assert.equal(parsed.doc.nodes[0].title, 'Ingress <edge>');
    assert.equal(parsed.doc.nodes[1].shape, 'pill');
    assert.equal(parsed.doc.edges[0].route, 'straight');
    assert.equal(parsed.doc.edges[0].label, 'Events');

    const svg = renderDiagramSvg(parsed.doc);
    assert.match(svg, /Ingress &lt;edge&gt;/);
    assert.match(svg, /<path d="[^"]+"/);
    assert.match(svg, /stroke="#047857"/);
    assert.match(svg, /rx="[^"]+"/);
    assert.doesNotMatch(svg, /<script/);
  });

  it('rejects JSON that is not a blueprint document', () => {
    const broken = parseBlueprintJson('{');
    assert.equal(broken.ok, false);
    const missing = parseBlueprintJson('{"title":"Nope"}');
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.match(missing.error, /nodes/);
  });

  it('verifies default SVG from renderDiagramSvg is portable, foreignObject-free, and contains NO var(--wl-)', () => {
    const doc: DiagramDocument = createBlankDocument();
    doc.title = 'Cloud Architecture';
    doc.stageWidth = 1680;
    doc.stageHeight = 920;

    // Add nodes with various shapes and accents
    const n1 = createNodeFromStencil('service', 100, 150, 0);
    n1.shape = 'card';
    n1.title = 'API Gateway';
    n1.subtitle = 'Express / Envoy';
    n1.accent = 'blue';

    const n2 = createNodeFromStencil('core', 450, 150, 1);
    n2.shape = 'hexagon';
    n2.title = 'Orchestrator';
    n2.accent = 'emerald';

    const n3 = createNodeFromStencil('store', 800, 150, 2);
    n3.shape = 'diamond';
    n3.title = 'Decision Engine';
    n3.accent = 'rose';

    const n4 = createNodeFromStencil('client', 100, 450, 3);
    n4.shape = 'circle';
    n4.title = 'Edge Worker';
    n4.accent = 'amber';

    const n5 = createNodeFromStencil('broker', 450, 450, 4);
    n5.shape = 'rounded';
    n5.title = 'Event Stream';
    n5.accent = 'violet';

    doc.nodes.push(n1, n2, n3, n4, n5);

    // Add zones
    doc.zones.push({
      id: 'zone-1',
      number: '01',
      title: 'Ingress Perimeter',
      x: 50,
      width: 350,
    });

    // Add notes card with items
    doc.notesCards.push({
      id: 'notes-1',
      title: 'Architectural Invariants',
      code: 'SEC-01',
      x: 1000,
      y: 100,
      items: [
        { title: 'Zero Trust', text: 'mTLS required between all clusters' },
        { title: 'Rate Limiting', text: '10,000 req/s ceiling per client' },
      ],
    });

    // Add wires
    doc.edges.push(
      {
        id: 'wire-1',
        from: n1.id,
        to: n2.id,
        sourcePort: 'right',
        targetPort: 'left',
        tone: 'blue',
        route: 'orthogonal',
        label: 'REST/HTTPS',
        animated: true,
      },
      {
        id: 'wire-2',
        from: n2.id,
        to: n3.id,
        sourcePort: 'right',
        targetPort: 'left',
        tone: 'emerald',
        route: 'curved',
        label: 'gRPC stream',
        animated: false,
      },
    );

    const svg = renderDiagramSvg(doc);

    // 1. Must be completely free of foreignObject
    assert.doesNotMatch(svg, /foreignObject/i, 'Default SVG must contain NO foreignObject');

    // 2. Must contain NO unresolved var(--wl- tokens
    assert.doesNotMatch(svg, /var\(--wl-/i, 'Default SVG must contain NO CSS variables var(--wl-');

    // 3. Must be standalone standard vector XML
    assert.match(svg, /^<\?xml version="1.0" encoding="UTF-8"\?>/, 'SVG has XML declaration');
    assert.match(svg, /<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/, 'SVG has standard XML namespace');
    assert.match(svg, /viewBox="0 0 1680 920"/, 'SVG viewBox matches stage coordinates');

    // 4. Must render node titles and shapes
    assert.match(svg, /API Gateway/);
    assert.match(svg, /Orchestrator/);
    assert.match(svg, /Decision Engine/);
    assert.match(svg, /<polygon points="/, 'Renders polygon for hexagon and diamond');
    assert.match(svg, /<rect x="/, 'Renders rect for card and rounded');

    // 5. Must render notes card items and zones
    assert.match(svg, /Architectural Invariants/);
    assert.match(svg, /Zero Trust/);
    assert.match(svg, /Ingress Perimeter/);

    // 6. Must render arrows with explicit hex fills, NOT CSS vars
    assert.match(svg, /fill="#1d4ed8"/, 'Uses direct hex color for blue');
    assert.match(svg, /fill="#047857"/, 'Uses direct hex color for emerald');
    assert.match(svg, /fill="#be123c"/, 'Uses direct hex color for rose');
  });

  it('calculates PNG export scaling and estimated file size accurately (1×, 2×, 4×)', () => {
    const stageWidth = 1680;
    const stageHeight = 920;

    // 1× Scale
    const est1 = estimatePngExport(stageWidth, stageHeight, 1);
    assert.equal(est1.scale, 1);
    assert.equal(est1.width, 1680);
    assert.equal(est1.height, 920);
    assert.equal(est1.formattedSize, '~302 KB');
    assert.equal(est1.summary, '~302 KB (1680 × 920 px)');

    // 2× Scale (Retina / High-DPI)
    const est2 = estimatePngExport(stageWidth, stageHeight, 2);
    assert.equal(est2.scale, 2);
    assert.equal(est2.width, 3360);
    assert.equal(est2.height, 1840);
    assert.equal(est2.formattedSize, '~1.2 MB');
    assert.equal(est2.summary, '~1.2 MB (3360 × 1840 px)');

    // 4× Scale (Ultra-HD / Print)
    const est4 = estimatePngExport(stageWidth, stageHeight, 4);
    assert.equal(est4.scale, 4);
    assert.equal(est4.width, 6720);
    assert.equal(est4.height, 3680);
    assert.equal(est4.formattedSize, '~4.7 MB');
    assert.equal(est4.summary, '~4.7 MB (6720 × 3680 px)');

    // Custom dimensions (e.g. 2400 × 1200)
    const custom = estimatePngExport(2400, 1200, 2);
    assert.equal(custom.width, 4800);
    assert.equal(custom.height, 2400);
    assert.equal(custom.bytes, Math.round(4800 * 2400 * 0.2));
    assert.equal(custom.summary, '~2.2 MB (4800 × 2400 px)');

    // Edge case: invalid scale defaults to 1
    const fallback = estimatePngExport(1680, 920, 0);
    assert.equal(fallback.scale, 1);
    assert.equal(fallback.width, 1680);
    assert.equal(fallback.height, 920);
  });

  it('inlines and resolves --wl-* CSS variables to concrete static values', () => {
    assert.ok(WL_RESOLVED_TOKENS['--wl-blue']);
    assert.ok(WL_RESOLVED_TOKENS['--wl-canvas']);
    assert.ok(WL_RESOLVED_TOKENS['--wl-ink']);

    const sampleCss = `
      .canvas { background: var(--wl-canvas); color: var(--wl-ink); }
      .accent { stroke: var(--wl-blue); fill: var(--wl-emerald); }
      .fallback { border: 1px solid var(--wl-border-ui, #b6c5db); }
      .custom-fallback { color: var(--wl-unknown-token, #123456); }
    `;

    const resolved = resolveCssVariables(sampleCss, WL_RESOLVED_TOKENS);

    // Verified that CSS variables are substituted with concrete values
    assert.ok(resolved.includes('background: #f4f7fb'));
    assert.ok(resolved.includes('color: #0b1324'));
    assert.ok(resolved.includes('stroke: #1d4ed8'));
    assert.ok(resolved.includes('fill: #047857'));
    assert.ok(resolved.includes('border: 1px solid #b6c5db'));
    assert.ok(resolved.includes('color: #123456'));

    // Verified no leftover --wl- variables for known keys
    assert.doesNotMatch(resolved, /var\(--wl-canvas\)/);
    assert.doesNotMatch(resolved, /var\(--wl-ink\)/);
    assert.doesNotMatch(resolved, /var\(--wl-blue\)/);
    assert.doesNotMatch(resolved, /var\(--wl-emerald\)/);
  });

  it('strips selection, dimming, drag handles, ports, and waypoint handles from cloned stage', () => {
    const stage = new MockDOMNode('div');
    stage.id = 'stage-world';

    // 1. Node with selected state and interactive handles
    const node1 = new MockDOMNode('div');
    node1.className = 'arch-node is-selected is-dimmed is-related';
    const hitBtn = new MockDOMNode('button');
    hitBtn.className = 'node-select-hit';
    hitBtn.setAttribute('aria-pressed', 'true');
    const dragHandle = new MockDOMNode('div');
    dragHandle.className = 'node-drag-handle';
    const portTop = new MockDOMNode('button');
    portTop.className = 'node-port';
    portTop.setAttribute('data-port', 'top');
    const portRight = new MockDOMNode('button');
    portRight.className = 'node-port';
    portRight.setAttribute('data-port', 'right');
    node1.append(hitBtn, dragHandle, portTop, portRight);

    // 2. Wire group with waypoint handle and selection
    const wireGroup = new MockDOMNode('g');
    wireGroup.className = 'conduit-group is-selected is-dimmed';
    const stream = new MockDOMNode('path');
    stream.className = 'conduit-stream';
    const waypointHandle = new MockDOMNode('circle');
    waypointHandle.className = 'conduit-waypoint-handle';
    wireGroup.append(stream, waypointHandle);

    // 3. Selection overlays, guides, and ghost elements
    const marquee = new MockDOMNode('div');
    marquee.className = 'marquee-box';
    const guide = new MockDOMNode('div');
    guide.className = 'align-guide';
    const draftWire = new MockDOMNode('path');
    draftWire.id = 'draft-wire';
    const dragGhost = new MockDOMNode('div');
    dragGhost.className = 'stencil-drag-ghost is-drag-ghost';

    stage.append(node1, wireGroup, marquee, guide, draftWire, dragGhost);

    // Sanity check before cleaning
    assert.equal(stage.querySelectorAll('.drag-handle, .node-drag-handle').length, 1);
    assert.equal(stage.querySelectorAll('.node-port').length, 2);
    assert.equal(stage.querySelectorAll('.waypoint-handle, .conduit-waypoint-handle').length, 1);
    assert.equal(stage.querySelectorAll('.marquee-box').length, 1);
    assert.equal(stage.querySelectorAll('.stencil-drag-ghost').length, 1);
    assert.equal(stage.querySelectorAll('.is-selected').length, 2);
    assert.equal(stage.querySelectorAll('.is-dimmed').length, 2);
    assert.equal(stage.querySelectorAll('[aria-pressed="true"]').length, 1);

    // Run cleanClonedStage
    cleanClonedStage(stage as unknown as HTMLElement);

    // All interactive handles, ports, and waypoints stripped
    assert.equal(stage.querySelectorAll('.drag-handle, .node-drag-handle, .sim-drag-handle').length, 0);
    assert.equal(stage.querySelectorAll('.node-port').length, 0);
    assert.equal(stage.querySelectorAll('.waypoint-handle, .conduit-waypoint-handle, .wire-handle').length, 0);

    // All temporary overlays and drag ghosts stripped
    assert.equal(
      stage.querySelectorAll(
        '.align-guide, .marquee-box, #draft-wire, .selection-box, .selection-ring, .stencil-drag-ghost, .is-drag-ghost',
      ).length,
      0,
    );

    // All selection and dimming classes stripped
    assert.equal(
      stage.querySelectorAll('.is-selected, .is-dimmed, .is-related, .is-highlighted, .is-drag-ghost').length,
      0,
    );

    // Selection hit outline deactivated
    assert.equal(stage.querySelectorAll('.node-select-hit[aria-pressed="true"]').length, 0);
    assert.equal(hitBtn.getAttribute('aria-pressed'), 'false');
  });

  it('verifies renderStagePictureSvg creates clean DOM clone SVG with stripped handles and resolved variables', () => {
    // Set up mock DOM elements in globalThis.document
    const prevDoc = (globalThis as any).document;
    const stageEl = new MockDOMNode('div');
    stageEl.id = 'stage-world';

    const nodeEl = new MockDOMNode('div');
    nodeEl.className = 'arch-node is-selected';
    const hitBtn = new MockDOMNode('button');
    hitBtn.className = 'node-select-hit';
    hitBtn.setAttribute('aria-pressed', 'true');
    const handleEl = new MockDOMNode('div');
    handleEl.className = 'node-drag-handle';
    const portEl = new MockDOMNode('button');
    portEl.className = 'node-port';
    nodeEl.append(hitBtn, handleEl, portEl);

    const wireGroup = new MockDOMNode('g');
    wireGroup.className = 'conduit-group is-selected';
    const wireHandle = new MockDOMNode('circle');
    wireHandle.className = 'conduit-waypoint-handle';
    wireGroup.append(wireHandle);

    stageEl.append(nodeEl, wireGroup);

    const viewportEl = new MockDOMNode('div');
    viewportEl.id = 'viewport';

    const workspaceEl = new MockDOMNode('div');
    workspaceEl.id = 'workspace';

    (globalThis as any).document = {
      getElementById: (id: string) => {
        if (id === 'stage-world') return stageEl;
        if (id === 'viewport') return viewportEl;
        if (id === 'workspace') return workspaceEl;
        return null;
      },
      createElement: (tag: string) => new MockDOMNode(tag),
      documentElement: new MockDOMNode('html'),
      body: new MockDOMNode('body'),
      styleSheets: [],
    };

    try {
      const svg = renderStagePictureSvg(1680, 920);

      // SVG structure
      assert.match(svg, /<foreignObject/i, 'DOM clone SVG contains foreignObject');
      assert.match(svg, /width="1680" height="920"/, 'Dimensions match specified raster width and height');

      // Cloned contents must have stripped drag handles, ports, waypoint handles
      assert.doesNotMatch(svg, /node-drag-handle/, 'Stripped node-drag-handle');
      assert.doesNotMatch(svg, /node-port/, 'Stripped node-port');
      assert.doesNotMatch(svg, /conduit-waypoint-handle/, 'Stripped conduit-waypoint-handle');

      // Cloned contents must have stripped selection states
      assert.doesNotMatch(svg, /class="[^"]*\bis-selected\b[^"]*"/, 'Stripped is-selected class');
      assert.doesNotMatch(svg, /aria-pressed="true"/, 'Deactivated selection aria-pressed');
    } finally {
      (globalThis as any).document = prevDoc;
    }
  });

  it('verifies export dialog HTML structure in index.html contains PNG scale choice and DOM clone option', () => {
    const indexPath = path.resolve('index.html');
    const html = fs.readFileSync(indexPath, 'utf-8');

    // 1. #export-png-scale select exists
    assert.match(html, /id="export-png-scale"/, 'index.html has #export-png-scale element');
    assert.match(html, /<option[^>]*value="1"/, '#export-png-scale contains 1× option');
    assert.match(html, /<option[^>]*value="2"/, '#export-png-scale contains 2× option');
    assert.match(html, /<option[^>]*value="4"/, '#export-png-scale contains 4× option');

    // 2. #export-png-estimate exists
    assert.match(html, /id="export-png-estimate"/, 'index.html has #export-png-estimate');

    // 3. #btn-export-svg points to vector picture (portable)
    assert.match(html, /id="btn-export-svg"/, 'index.html has #btn-export-svg');
    assert.match(html, /foreignObject-free/, 'btn-export-svg description mentions foreignObject-free');

    // 4. #btn-export-svg-clone explicitly labelled Pixel-Perfect (DOM Clone)
    assert.match(html, /id="btn-export-svg-clone"/, 'index.html has #btn-export-svg-clone');
    assert.match(html, /Pixel-Perfect \(DOM Clone\)/, 'btn-export-svg-clone labelled Pixel-Perfect (DOM Clone)');
  });

  it('checks that the resulting SVG is clean, portable, and renders in standard image viewers / Figma / Illustrator', () => {
    const doc = createBlankDocument();
    doc.stageWidth = 1920;
    doc.stageHeight = 1080;

    const ingress = createNodeFromStencil('service', 80, 80, 0);
    ingress.title = 'Public Ingress';
    ingress.subtitle = 'AWS ALB';

    const auth = createNodeFromStencil('core', 480, 80, 1);
    auth.title = 'Auth Cluster';
    auth.subtitle = 'OIDC / JWT';

    doc.nodes.push(ingress, auth);
    doc.edges.push({
      id: 'edge-auth',
      from: ingress.id,
      to: auth.id,
      sourcePort: 'right',
      targetPort: 'left',
      tone: 'violet',
      route: 'straight',
      label: 'OAuth 2.0 Token',
      animated: true,
    });

    const svg = renderDiagramSvg(doc);

    // Standard vector XML attributes for external viewers
    assert.ok(svg.startsWith('<?xml version="1.0" encoding="UTF-8"?>'), 'Has standard XML preamble');
    assert.ok(svg.includes('xmlns="http://www.w3.org/2000/svg"'), 'Root SVG has standard namespace');
    assert.ok(svg.includes('viewBox="0 0 1920 1080"'), 'Proper viewBox for scaling');

    // Clean vector elements (no HTML divs, no external CSS dependency, no scripts)
    assert.doesNotMatch(svg, /<div[\s>]/i, 'No HTML <div> elements');
    assert.doesNotMatch(svg, /<style[\s>]/i, 'No style blocks relying on external web components');
    assert.doesNotMatch(svg, /<script[\s>]/i, 'No executable scripts');

    // Every text label has font-family and explicit fill color
    const textMatches = svg.match(/<text[^>]+>/g) || [];
    assert.ok(textMatches.length >= 2, 'Has text elements for titles');
    for (const textTag of textMatches) {
      assert.match(textTag, /font-family="[^"]+"/, 'Text element specifies font-family');
      assert.match(textTag, /fill="[^"]+"/, 'Text element specifies explicit fill color');
    }
  });

  it('renders bidirectional conduits without end arrows and with dual stream paths in exports', () => {
    const doc = createBlankDocument();
    const n1 = createNodeFromStencil('service', 100, 100, 0);
    const n2 = createNodeFromStencil('core', 500, 100, 1);
    doc.nodes.push(n1, n2);

    doc.edges.push(
      {
        id: 'bidirectional-wire',
        from: n1.id,
        to: n2.id,
        sourcePort: 'right',
        targetPort: 'left',
        tone: 'blue',
        route: 'straight',
        label: 'Duplex Stream',
        animated: true,
        flow: 'both',
      },
      {
        id: 'unidirectional-wire',
        from: n2.id,
        to: n1.id,
        sourcePort: 'bottom',
        targetPort: 'bottom',
        tone: 'emerald',
        route: 'under',
        label: 'Ack',
        animated: true,
        flow: 'forward',
      },
    );

    // 1. Vector SVG Export (static and animated frame)
    const staticSvg = renderDiagramSvg(doc);
    // Bidirectional conduit wire must NOT have marker-end
    assert.doesNotMatch(
      staticSvg,
      /<path[^>]+stroke="#1d4ed8"[^>]*marker-end/,
      'Bidirectional wire has no marker-end',
    );
    // Unidirectional conduit wire MUST have marker-end
    assert.match(
      staticSvg,
      /<path[^>]+stroke="#047857"[^>]*marker-end="url\(#arrow-emerald\)"/,
      'Unidirectional wire has marker-end',
    );

    const animatedSvg = renderDiagramSvg(doc, { frameIndex: 1, totalFrames: 10, dashOffset: 12 });
    // Animated bidirectional conduit must produce dual stream paths (dashOffset and -dashOffset) with period 22 (6 16)
    assert.match(animatedSvg, /stroke-dasharray="6 16" stroke-dashoffset="12"/);
    assert.match(animatedSvg, /stroke-dasharray="6 16" stroke-dashoffset="-12"/);
    // Animated unidirectional conduit has period 18 (8 10)
    assert.match(animatedSvg, /stroke-dasharray="8 10" stroke-dashoffset="12"/);

    // 2. Standalone HTML Export
    const html = generateStandaloneHtml(doc);
    // Both-ways conduit group has data-flow="both"
    assert.match(html, /data-edge="bidirectional-wire"[^>]*data-flow="both"/);
    // Unidirectional conduit group has data-flow="forward"
    assert.match(html, /data-edge="unidirectional-wire"[^>]*data-flow="forward"/);

    // In HTML, bidirectional edge has .conduit-stream-reverse, NO marker-end on conduit-stream, and NO port-dot
    const bidiGroupMatch = html.match(/<g class="conduit-group"[^>]*data-edge="bidirectional-wire"[\s\S]*?<\/g>/);
    assert.ok(bidiGroupMatch, 'Found bidirectional wire group in HTML');
    const bidiGroup = bidiGroupMatch[0];
    assert.match(bidiGroup, /<path class="conduit-stream-reverse"/, 'Includes reverse stream path');
    assert.doesNotMatch(bidiGroup, /marker-end=/, 'No marker-end on bidirectional stream');
    assert.doesNotMatch(bidiGroup, /<circle class="port-dot"/, 'No port-dot on bidirectional stream');

    // In HTML, unidirectional edge has marker-end, has port-dot, and NO reverse stream
    const uniGroupMatch = html.match(/<g class="conduit-group"[^>]*data-edge="unidirectional-wire"[\s\S]*?<\/g>/);
    assert.ok(uniGroupMatch, 'Found unidirectional wire group in HTML');
    const uniGroup = uniGroupMatch[0];
    assert.match(uniGroup, /marker-end="url\(#arrow-emerald\)"/, 'Includes marker-end arrow');
    assert.match(uniGroup, /<circle class="port-dot"/, 'Includes start port-dot');
    assert.doesNotMatch(uniGroup, /<path class="conduit-stream-reverse"/, 'No reverse stream path');
  });

  it('scales large diagrams down to fit inside export bounds (e.g. 1987 × 2048) without cutting off elements', async () => {
    const { app } = await import('../src/studio/state.ts');
    const { expandStageToFit } = await import('../src/core/layout.ts');
    const prevDoc = (globalThis as any).document;

    const doc = createBlankDocument();
    // Create nodes and waypoints that extend into a large ~4000x4100 stage
    const farNode = createNodeFromStencil('core', 3600, 3800, 0);
    doc.nodes.push(farNode);
    doc.edges.push({
      id: 'far-wire',
      from: farNode.id,
      to: farNode.id,
      sourcePort: 'right',
      targetPort: 'left',
      tone: 'blue',
      route: 'bezier',
      label: 'Loop',
      animated: true,
      waypoint: [3900, 4000],
    });

    expandStageToFit(doc);
    assert.ok(doc.stageWidth >= 3960, `stageWidth (${doc.stageWidth}) encompasses far waypoint at 3900`);
    assert.ok(doc.stageHeight >= 4060, `stageHeight (${doc.stageHeight}) encompasses far waypoint at 4000`);

    const stageEl = new MockDOMNode('div');
    stageEl.id = 'stage-world';
    const viewportEl = new MockDOMNode('div');
    viewportEl.id = 'viewport';
    const workspaceEl = new MockDOMNode('div');
    workspaceEl.id = 'workspace';

    (globalThis as any).document = {
      getElementById: (id: string) => {
        if (id === 'stage-world') return stageEl;
        if (id === 'viewport') return viewportEl;
        if (id === 'workspace') return workspaceEl;
        return null;
      },
      createElement: (tag: string) => new MockDOMNode(tag),
      documentElement: new MockDOMNode('html'),
      body: new MockDOMNode('body'),
      styleSheets: [],
    };

    app.doc = doc;

    try {
      // Simulate exporting a GIF downscaled to 1987 × 2048
      const svg = renderStagePictureSvg(1987, 2048);

      // SVG root dimensions and viewBox must match the scaled raster size exactly
      assert.match(svg, /width="1987" height="2048"/, 'Matches requested raster dimensions');
      assert.match(svg, /viewBox="0 0 1987 2048"/, 'viewBox matches raster dimensions to avoid browser viewBox clipping');
      assert.match(svg, /<foreignObject[^>]+width="1987" height="2048"/, 'foreignObject matches raster dimensions');

      // Stage world must have transform: scale(...) so elements are scaled into the canvas
      assert.match(svg, /transform:\s*scale\(/, 'Stage is scaled via CSS transform');
      assert.match(svg, /transform-origin:\s*0px 0px|transform-origin:\s*0 0/, 'Scale transform origin is top-left');
    } finally {
      (globalThis as any).document = prevDoc;
    }
  });

  it('preserves multi-select highlights when preserveSelection: true is passed to cleanClonedStage', () => {
    const stage = new MockDOMNode('div');
    stage.id = 'stage-world';

    const selectedNode = new MockDOMNode('div');
    selectedNode.className = 'arch-node is-selected';
    const hitBtn = new MockDOMNode('button');
    hitBtn.className = 'node-select-hit';
    hitBtn.setAttribute('aria-pressed', 'true');
    const handleEl = new MockDOMNode('div');
    handleEl.className = 'node-drag-handle';
    const portEl = new MockDOMNode('button');
    portEl.className = 'node-port';
    selectedNode.append(hitBtn, handleEl, portEl);

    const dimmedNode = new MockDOMNode('div');
    dimmedNode.className = 'arch-node is-dimmed';

    const relatedNode = new MockDOMNode('div');
    relatedNode.className = 'arch-node is-related';

    const wireGroup = new MockDOMNode('g');
    wireGroup.className = 'conduit-group is-highlighted is-selected';
    const wireHandle = new MockDOMNode('circle');
    wireHandle.className = 'conduit-waypoint-handle';
    wireGroup.append(wireHandle);

    const dimmedWire = new MockDOMNode('g');
    dimmedWire.className = 'conduit-group is-dimmed';

    const zoneBanner = new MockDOMNode('div');
    zoneBanner.className = 'zone-banner is-selected';

    const notesCard = new MockDOMNode('aside');
    notesCard.className = 'blueprint-spec is-selected';

    const marquee = new MockDOMNode('div');
    marquee.className = 'marquee-box';

    stage.append(
      selectedNode,
      dimmedNode,
      relatedNode,
      wireGroup,
      dimmedWire,
      zoneBanner,
      notesCard,
      marquee,
    );

    // Call cleanClonedStage with preserveSelection: true
    cleanClonedStage(stage as unknown as HTMLElement, { preserveSelection: true });

    // Interactive handles and temporary marquee must be stripped
    assert.equal(stage.querySelectorAll('.node-drag-handle').length, 0);
    assert.equal(stage.querySelectorAll('.node-port').length, 0);
    assert.equal(stage.querySelectorAll('.conduit-waypoint-handle').length, 0);
    assert.equal(stage.querySelectorAll('.marquee-box').length, 0);

    // But selection, dimming, related, and pressed highlights are preserved
    assert.equal(stage.querySelectorAll('.is-selected').length, 4);
    assert.equal(stage.querySelectorAll('.is-dimmed').length, 2);
    assert.equal(stage.querySelectorAll('.is-related').length, 1);
    assert.equal(stage.querySelectorAll('.is-highlighted').length, 1);
    assert.equal(stage.querySelectorAll('.node-select-hit[aria-pressed="true"]').length, 1);
  });

  it('preserves multi-select highlights across vector SVG export (renderDiagramSvg)', () => {
    const doc = createBlankDocument();
    const n1 = createNodeFromStencil('service', 100, 150, 0);
    n1.id = 'node-a';
    n1.title = 'Service A';
    const n2 = createNodeFromStencil('core', 450, 150, 1);
    n2.id = 'node-b';
    n2.title = 'Core B';
    const n3 = createNodeFromStencil('store', 800, 150, 2);
    n3.id = 'node-c';
    n3.title = 'Store C';
    doc.nodes.push(n1, n2, n3);

    doc.edges.push(
      {
        id: 'wire-ab',
        from: 'node-a',
        to: 'node-b',
        sourcePort: 'right',
        targetPort: 'left',
        tone: 'blue',
        route: 'orthogonal',
      },
      {
        id: 'wire-bc',
        from: 'node-b',
        to: 'node-c',
        sourcePort: 'right',
        targetPort: 'left',
        tone: 'emerald',
        route: 'orthogonal',
      },
    );

    doc.zones.push({
      id: 'zone-1',
      number: '01',
      title: 'Zone Alpha',
      x: 50,
      width: 400,
    });

    doc.notesCards.push({
      id: 'notes-1',
      title: 'Spec Sheet',
      code: 'SPEC-01',
      x: 100,
      y: 500,
      items: [{ title: 'Requirement', text: 'Auth' }],
    });

    const selection: SelectionTarget = {
      type: 'multi',
      ids: ['node-a'],
      edgeIds: ['wire-ab'],
      zoneIds: ['zone-1'],
      notesIds: ['notes-1'],
    };

    const svg = renderDiagramSvg(doc, undefined, selection);

    // Selected node gets selection ring (rx + 4, stroke-opacity="0.45")
    assert.match(svg, /stroke-opacity="0\.45"/, 'Contains selection ring for selected node');

    // Unselected and unrelated node-c gets dimmed opacity
    assert.match(svg, /opacity="0\.28"/, 'Contains dimmed group for unselected node C');

    // Inactive wire-bc is dimmed
    assert.match(svg, /opacity="0\.16"/, 'Contains dimmed opacity for inactive wire');

    // Selected zone has highlight stroke
    assert.match(svg, /stroke="#1d4ed8" stroke-width="2\.5"/, 'Contains highlight stroke for selected zone and notes');
  });

  it('preserves multi-select highlights in standalone HTML export (generateStandaloneHtml)', () => {
    const doc = createBlankDocument();
    const n1 = createNodeFromStencil('service', 100, 150, 0);
    n1.id = 'node-1';
    n1.title = 'Ingress';
    const n2 = createNodeFromStencil('core', 450, 150, 1);
    n2.id = 'node-2';
    n2.title = 'Worker';
    const n3 = createNodeFromStencil('store', 800, 150, 2);
    n3.id = 'node-3';
    n3.title = 'Database';
    doc.nodes.push(n1, n2, n3);

    doc.edges.push(
      {
        id: 'wire-12',
        from: 'node-1',
        to: 'node-2',
        sourcePort: 'right',
        targetPort: 'left',
        tone: 'blue',
        route: 'orthogonal',
      },
      {
        id: 'wire-23',
        from: 'node-2',
        to: 'node-3',
        sourcePort: 'right',
        targetPort: 'left',
        tone: 'emerald',
        route: 'orthogonal',
      },
    );

    doc.zones.push({
      id: 'zone-1',
      number: '01',
      title: 'Perimeter',
      x: 50,
      width: 400,
    });

    doc.notesCards.push({
      id: 'notes-1',
      title: 'Notes Card',
      code: 'N-1',
      x: 100,
      y: 500,
      items: [{ text: 'Item 1' }],
    });

    const selection: SelectionTarget = {
      type: 'multi',
      ids: ['node-1'],
      edgeIds: ['wire-12'],
      zoneIds: ['zone-1'],
      notesIds: ['notes-1'],
    };

    const html = generateStandaloneHtml(doc, { initialSelection: selection });

    // HTML includes selection payload and multi-selection handler
    assert.match(html, /"initialSelection":\{"type":"multi"/, 'Embeds initial multi-selection in script payload');
    assert.match(html, /applyMultiSelection\(DATA\.initialSelection\)/, 'Applies multi-selection on initial boot');

    // Selected node has aria-pressed="true"
    assert.match(html, /data-node="node-1"[^>]*aria-pressed="true"/, 'Selected node has aria-pressed="true"');

    // Connected node has is-related
    assert.match(html, /class="[^"]*is-related[^"]*"[^>]*data-node="node-2"/, 'Connected node has is-related');

    // Unconnected node has is-dimmed
    assert.match(html, /class="[^"]*is-dimmed[^"]*"[^>]*data-node="node-3"/, 'Unconnected node has is-dimmed');

    // Wires have is-highlighted and is-selected
    assert.match(html, /class="[^"]*is-highlighted[^"]*is-selected[^"]*"[^>]*data-edge="wire-12"/, 'Active selected wire has classes');
    assert.match(html, /class="[^"]*is-dimmed[^"]*"[^>]*data-edge="wire-23"/, 'Inactive wire has is-dimmed');

    // Zone and notes card have is-selected
    assert.match(html, /class="zone-banner is-selected"[^>]*data-zone-id="zone-1"/, 'Zone banner has is-selected');
    assert.match(html, /class="blueprint-spec is-selected"[^>]*data-notes-id="notes-1"/, 'Notes card has is-selected');
  });
});
