import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Set up minimal document mock before loading studio DOM modules
if (typeof (globalThis as any).document === 'undefined') {
  (globalThis as any).document = {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({
      setAttribute: () => {},
      classList: { add: () => {}, remove: () => {}, contains: () => false },
      addEventListener: () => {},
    }),
    body: {
      dataset: {},
      appendChild: () => {},
      classList: { add: () => {}, remove: () => {}, contains: () => false },
    },
  };
}
if (typeof (globalThis as any).window === 'undefined') {
  (globalThis as any).window = globalThis;
}

const { buildTourSteps, PresentationManager } = await import('../src/studio/presentation.ts');
import { createBlankDocument } from '../src/templates/presets.ts';
import { generateStandaloneHtml } from '../src/exporter/standaloneHtml.ts';
import { SHORTCUTS } from '../src/studio/commands.ts';
import type { DiagramDocument } from '../src/types.ts';

describe('presentation mode and guided tour (P key)', () => {
  const sampleDoc: DiagramDocument = {
    ...createBlankDocument(),
    title: 'Distributed Event Bus',
    overviewSummary: 'High-throughput real-time Kafka event streaming topology with failover.',
    nodes: [
      {
        id: 'gateway',
        kind: 'ingress',
        title: 'API Gateway',
        subtitle: 'Ingress Tier',
        eyebrow: 'INGRESS',
        icon: 'server',
        accent: 'blue',
        summary: 'Reverse proxy terminating TLS and routing ingress traffic.',
        tone: 'blue',
        x: 100,
        y: 120,
        width: 180,
        height: 80,
      },
      {
        id: 'stream',
        kind: 'service',
        title: 'Stream Broker',
        subtitle: 'Core Messaging',
        eyebrow: 'SERVICE',
        icon: 'server',
        accent: 'emerald',
        summary: 'Kafka partition cluster with Raft consensus.',
        tone: 'emerald',
        x: 360,
        y: 120,
        width: 180,
        height: 80,
      },
      {
        id: 'sink',
        kind: 'database',
        title: 'Analytics Sink',
        subtitle: 'Storage Tier',
        eyebrow: 'DATABASE',
        icon: 'database',
        accent: 'violet',
        summary: 'Columnar storage storing historical event logs.',
        tone: 'violet',
        x: 620,
        y: 120,
        width: 180,
        height: 80,
      },
    ],
  };

  it('builds an ordered tour starting with overview followed by all diagram nodes', () => {
    const steps = buildTourSteps(sampleDoc);
    assert.equal(steps.length, 4, '1 overview step + 3 node steps');

    // Overview step
    assert.equal(steps[0].type, 'overview');
    assert.equal(steps[0].title, 'Distributed Event Bus');
    assert.equal(steps[0].subtitle, 'System Architecture');
    assert.ok(steps[0].summary.includes('High-throughput'));

    // Node steps
    assert.equal(steps[1].type, 'node');
    assert.equal(steps[1].nodeId, 'gateway');
    assert.equal(steps[1].title, 'API Gateway');
    assert.equal(steps[1].tone, 'blue');
    assert.ok(steps[1].bounds);

    assert.equal(steps[2].type, 'node');
    assert.equal(steps[2].nodeId, 'stream');
    assert.equal(steps[2].title, 'Stream Broker');
    assert.equal(steps[2].tone, 'emerald');

    assert.equal(steps[3].type, 'node');
    assert.equal(steps[3].nodeId, 'sink');
    assert.equal(steps[3].title, 'Analytics Sink');
    assert.equal(steps[3].tone, 'violet');
  });

  it('handles empty documents with just an overview step', () => {
    const emptyDoc = createBlankDocument();
    const steps = buildTourSteps(emptyDoc);
    assert.equal(steps.length, 1);
    assert.equal(steps[0].type, 'overview');
  });

  it('navigates tour steps forward, backward, and wraps around cleanly', () => {
    const manager = new PresentationManager();
    assert.equal(manager.isPresenting, false);

    manager.enter(sampleDoc, 0);
    assert.equal(manager.isPresenting, true);
    assert.equal(manager.currentIndex, 0);
    assert.equal(manager.totalSteps, 4);

    manager.next();
    assert.equal(manager.currentIndex, 1);
    assert.equal(manager.currentStep?.title, 'API Gateway');

    manager.next();
    assert.equal(manager.currentIndex, 2);
    assert.equal(manager.currentStep?.title, 'Stream Broker');

    manager.next();
    assert.equal(manager.currentIndex, 3);
    assert.equal(manager.currentStep?.title, 'Analytics Sink');

    // Wrap around to 0
    manager.next();
    assert.equal(manager.currentIndex, 0);
    assert.equal(manager.currentStep?.type, 'overview');

    // Previous wraps back to end
    manager.prev();
    assert.equal(manager.currentIndex, 3);

    // Direct jump
    manager.goTo(1);
    assert.equal(manager.currentIndex, 1);

    // Clamps out of bound indices
    manager.goTo(99);
    assert.equal(manager.currentIndex, 3);

    manager.exit();
    assert.equal(manager.isPresenting, false);
  });

  it('manages auto-play timer state', () => {
    const manager = new PresentationManager();
    manager.enter(sampleDoc);
    assert.equal(manager.isAutoPlaying, false);

    const started = manager.toggleAutoPlay();
    assert.equal(started, true);
    assert.equal(manager.isAutoPlaying, true);

    const stopped = manager.toggleAutoPlay();
    assert.equal(stopped, false);
    assert.equal(manager.isAutoPlaying, false);

    manager.exit();
  });

  it('defines presentation mode and caption styling in studio.css and viewer.css', () => {
    const studioCss = fs.readFileSync(path.resolve('src/styles/studio.css'), 'utf-8');
    const viewerCss = fs.readFileSync(path.resolve('src/styles/viewer.css'), 'utf-8');

    for (const css of [studioCss, viewerCss]) {
      assert.ok(css.includes('body[data-presenting="true"]'), 'defines presenting body selector');
      assert.ok(css.includes('.presentation-bar'), 'defines .presentation-bar');
      assert.ok(css.includes('.presentation-caption'), 'defines .presentation-caption');
      assert.ok(css.includes('@keyframes captionFadeIn'), 'defines caption fade-in animation');
    }
  });

  it('includes presentation mode and tour elements in exported standalone HTML', () => {
    const html = generateStandaloneHtml(sampleDoc);

    assert.ok(html.includes('id="btn-enter-presentation"'), 'includes Present button in topbar');
    assert.ok(html.includes('id="presentation-bar"'), 'includes presentation-bar markup');
    assert.ok(html.includes('id="presentation-caption"'), 'includes presentation-caption markup');
    assert.ok(html.includes('enterPresentation'), 'includes presentation JS controller');
    assert.ok(html.includes('Distributed Event Bus'), 'embeds diagram title in tour');
  });

  it('registers P keyboard shortcut in shortcuts registry', () => {
    const pShortcut = SHORTCUTS.find((s) => s.keys.includes('P'));
    assert.ok(pShortcut, 'P shortcut registered');
    assert.ok(pShortcut.description.toLowerCase().includes('presentation'));
    assert.equal(pShortcut.category, 'Navigation & View');
  });
});
