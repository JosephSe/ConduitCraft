import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

// A permissive stand-in for the page: every element lookup returns something that accepts any read, write or call.
// Rendering then runs for real without a browser, and the tests read the result from the studio modules.
const stub: any = new Proxy(function () {}, {
  get: (_t, prop) => {
    if (prop === Symbol.toPrimitive) return () => '';
    if (prop === 'length') return 0;
    if (prop === 'then') return undefined;
    if (prop === Symbol.iterator) return function* () {};
    if (prop === 'dataset' || prop === 'style' || prop === 'classList') return stubObject();
    return stub;
  },
  set: () => true,
  apply: () => stub,
});
function stubObject(): any {
  return new Proxy({}, { get: () => stub, set: () => true });
}
if (typeof (globalThis as any).document === 'undefined') {
  (globalThis as any).document = {
    getElementById: () => stub,
    querySelector: () => stub,
    querySelectorAll: () => [],
    createElement: () => stub,
    createElementNS: () => stub,
    addEventListener: () => {},
    body: stub,
    documentElement: stub,
  };
}
if (typeof (globalThis as any).window === 'undefined') (globalThis as any).window = globalThis;
// Frames never run, so the minimap and other deferred paints stay out of the way.
(globalThis as any).requestAnimationFrame = () => 1;
(globalThis as any).cancelAnimationFrame = () => {};
(globalThis as any).getComputedStyle = () => stub;
(globalThis as any).MutationObserver = class {
  observe() {}
  disconnect() {}
};

const { SimulationPlaybackController } = await import('../src/studio/simulationPlayback.ts');
const { app } = await import('../src/studio/state.ts');
const { setFailures, toggleFailure, clearFailures } = await import('../src/studio/chaos.ts');
const { backlogDepth, clearBacklogs, initQueueBacklog, totalHeld } = await import('../src/studio/queueBacklog.ts');
const { createBlankDocument, createNodeFromStencil } = await import('../src/templates/presets.ts');
import type { DiagramDocument, SimulationScenario } from '../src/types.ts';

function pipeline(): { doc: DiagramDocument; scenario: SimulationScenario } {
  const doc = createBlankDocument();
  const kinds = { u: 'actor', p: 'service', q: 'queue', c: 'service' } as const;
  doc.nodes = Object.entries(kinds).map(([id, kind], i) => ({
    ...createNodeFromStencil(kind, i * 100, 40, i),
    id,
    title: id.toUpperCase(),
  }));
  const wire = (from: string, to: string, i: number) => ({
    id: `w${i}`, from, to, sourcePort: 'right' as const, targetPort: 'left' as const, tone: 'amber' as const,
    route: 'straight' as const, label: '', animated: false, sync: 'async' as const,
  });
  doc.edges = [wire('u', 'p', 0), wire('p', 'q', 1), wire('q', 'c', 2)];
  const scenario: SimulationScenario = {
    id: 's',
    name: 'Order',
    tone: 'emerald',
    steps: [
      { label: 'Place', trace: 'p to q', nodes: ['p', 'q'], tone: 'amber' },
      { label: 'Fulfil', trace: 'q to c', nodes: ['q', 'c'], tone: 'emerald' },
    ],
  };
  return { doc, scenario };
}

function setup() {
  const { doc, scenario } = pipeline();
  app.doc = doc;
  app.lens = 'traffic';
  initQueueBacklog();
  clearFailures();
  clearBacklogs();
  return scenario;
}

describe('queue backlog in playback (K1, spec 3.4)', () => {
  it('a looping run keeps going and the queue fills: 3 loops, depth 3', () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
      const scenario = setup();
      setFailures(['c']);
      const ctrl = new SimulationPlaybackController();
      ctrl.setLoop(true);
      ctrl.loadScenario(scenario, true);
      // Each loop is a step wait plus a wait after the hold; run a generous 3.5 loops.
      for (let i = 0; i < 12 && backlogDepth('q') < 3; i += 1) mock.timers.tick(1000);
      assert.equal(backlogDepth('q'), 3);
      assert.equal(ctrl.playing, true, 'playback did not stop');
      assert.equal(totalHeld(), 3);
      ctrl.clear();
    } finally {
      mock.timers.reset();
      clearFailures();
    }
  });

  it('without looping, the run pauses after one hold', () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
      const scenario = setup();
      setFailures(['c']);
      const ctrl = new SimulationPlaybackController();
      ctrl.loadScenario(scenario, true);
      for (let i = 0; i < 6; i += 1) mock.timers.tick(1000);
      assert.equal(backlogDepth('q'), 1);
      assert.equal(ctrl.playing, false);
      ctrl.clear();
    } finally {
      mock.timers.reset();
      clearFailures();
    }
  });

  it('without a queue holding it, a packet still stops at a failed component', () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
      const scenario = setup();
      app.doc.nodes = app.doc.nodes.filter((n) => n.id !== 'q');
      app.doc.edges = [];
      const noQueue: SimulationScenario = { ...scenario, steps: [{ label: 'a', trace: '', nodes: ['p'], tone: 'blue' }, { label: 'b', trace: '', nodes: ['c'], tone: 'blue' }] };
      setFailures(['c']);
      const ctrl = new SimulationPlaybackController();
      ctrl.loadScenario(noQueue, true);
      for (let i = 0; i < 4; i += 1) mock.timers.tick(1000);
      assert.equal(ctrl.playing, false);
      assert.equal(totalHeld(), 0);
      ctrl.clear();
    } finally {
      mock.timers.reset();
      clearFailures();
    }
  });

  it('a full queue with a dead-letter queue sends overflow there and the depth stays at the limit', () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
      const scenario = setup();
      const dlq = { ...createNodeFromStencil('queue', 400, 40, 9), id: 'dlq', title: 'DLQ' };
      app.doc.nodes.push(dlq);
      app.doc.nodes.find((n) => n.id === 'q')!.queue = { maxDepth: 2, deadLetterId: 'dlq' };
      setFailures(['c']);
      const ctrl = new SimulationPlaybackController();
      ctrl.setLoop(true);
      ctrl.loadScenario(scenario, true);
      for (let i = 0; i < 30; i += 1) mock.timers.tick(1000);
      assert.equal(backlogDepth('q'), 2);
      ctrl.clear();
    } finally {
      mock.timers.reset();
      clearFailures();
    }
  });

  it('restoring the consumer drains the queue, and "Restore all" resets it without a drain', () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
      const scenario = setup();
      setFailures(['c']);
      const ctrl = new SimulationPlaybackController();
      ctrl.setLoop(true);
      ctrl.loadScenario(scenario, true);
      for (let i = 0; i < 12 && backlogDepth('q') < 3; i += 1) mock.timers.tick(1000);
      ctrl.clear();
      assert.equal(backlogDepth('q'), 3);

      toggleFailure('c'); // press X on the consumer again
      for (let i = 0; i < 6; i += 1) mock.timers.tick(300);
      assert.equal(backlogDepth('q'), 0, 'drained');

      setFailures(['c']);
      const ctrl2 = new SimulationPlaybackController();
      ctrl2.loadScenario(scenario, true);
      for (let i = 0; i < 6; i += 1) mock.timers.tick(1000);
      assert.equal(backlogDepth('q'), 1);
      clearFailures();
      assert.equal(backlogDepth('q'), 0, 'Restore all resets');
      ctrl2.clear();
    } finally {
      mock.timers.reset();
      clearFailures();
    }
  });
});
