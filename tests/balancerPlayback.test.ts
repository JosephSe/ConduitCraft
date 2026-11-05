import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

// A permissive stand-in for the page, as in queuePlayback.test.ts: rendering runs for real without a browser.
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
(globalThis as any).requestAnimationFrame = () => 1;
(globalThis as any).cancelAnimationFrame = () => {};
(globalThis as any).getComputedStyle = () => stub;
(globalThis as any).MutationObserver = class {
  observe() {}
  disconnect() {}
};

const { SimulationPlaybackController } = await import('../src/studio/simulationPlayback.ts');
const { app } = await import('../src/studio/state.ts');
const { setFailures, clearFailures } = await import('../src/studio/chaos.ts');
const { createBlankDocument, createNodeFromStencil } = await import('../src/templates/presets.ts');
import type { DiagramDocument, SimulationScenario } from '../src/types.ts';

function balanced(): { doc: DiagramDocument; scenario: SimulationScenario } {
  const doc = createBlankDocument();
  const kinds = { u: 'actor', lb: 'balancer', a: 'service', b: 'service', db: 'store' } as const;
  doc.nodes = Object.entries(kinds).map(([id, kind], i) => ({
    ...createNodeFromStencil(kind, i * 100, 40, i),
    id,
    title: id.toUpperCase(),
  }));
  const wire = (from: string, to: string, i: number) => ({
    id: `w${i}`, from, to, sourcePort: 'right' as const, targetPort: 'left' as const, tone: 'blue' as const,
    route: 'straight' as const, label: '', animated: false,
  });
  doc.edges = [wire('u', 'lb', 0), wire('lb', 'a', 1), wire('lb', 'b', 2), wire('a', 'db', 3), wire('b', 'db', 4)];
  const scenario: SimulationScenario = {
    id: 's',
    name: 'Read',
    tone: 'emerald',
    steps: [
      { label: 'Request', trace: 'u to lb', nodes: ['u', 'lb'], tone: 'blue' },
      { label: 'Route', trace: 'lb to a', nodes: ['a'], tone: 'blue' },
      { label: 'Read', trace: 'a to db', nodes: ['a', 'db'], tone: 'emerald' },
    ],
  };
  return { doc, scenario };
}

function setup() {
  const { doc, scenario } = balanced();
  app.doc = doc;
  app.lens = 'traffic';
  clearFailures();
  return scenario;
}

describe('load balancer in playback (K2, spec 4.2)', () => {
  it('with A failed, the packet goes to B instead and the run keeps going', () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
      const scenario = setup();
      setFailures(['a']);
      const ctrl = new SimulationPlaybackController();
      ctrl.loadScenario(scenario, true);
      const seen: string[][] = [];
      for (let i = 0; i < 4 && ctrl.currentIndex < 1; i += 1) mock.timers.tick(1000);
      seen.push([...(ctrl.currentStep?.nodes ?? [])]);
      assert.deepEqual(seen[0], ['b']);
      assert.match(ctrl.currentStep?.label ?? '', /→ B$/);
      assert.equal(ctrl.playing, true, 'playback did not stop at the failed target');
      ctrl.clear();
    } finally {
      mock.timers.reset();
      clearFailures();
    }
  });

  it('the stand-in follows the packet for the rest of the pass, so it does not stop at the failed target later', () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
      const scenario = setup();
      setFailures(['a']);
      const ctrl = new SimulationPlaybackController();
      ctrl.loadScenario(scenario, true);
      for (let i = 0; i < 6 && ctrl.currentIndex < 2; i += 1) mock.timers.tick(1000);
      assert.equal(ctrl.currentIndex, 2);
      assert.deepEqual(ctrl.currentStep?.nodes, ['b', 'db']);
      assert.equal(ctrl.playing, true);
      ctrl.clear();
    } finally {
      mock.timers.reset();
      clearFailures();
    }
  });

  it('the saved scenario is not changed by a substituted render', () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
      const scenario = setup();
      setFailures(['a']);
      const ctrl = new SimulationPlaybackController();
      ctrl.loadScenario(scenario, true);
      for (let i = 0; i < 4 && ctrl.currentIndex < 1; i += 1) mock.timers.tick(1000);
      assert.deepEqual(scenario.steps[1].nodes, ['a']);
      assert.equal(scenario.steps[1].label, 'Route');
      ctrl.clear();
    } finally {
      mock.timers.reset();
      clearFailures();
    }
  });

  it('with nothing failed the scenario plays its own steps', () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
      const scenario = setup();
      const ctrl = new SimulationPlaybackController();
      ctrl.loadScenario(scenario, true);
      for (let i = 0; i < 4 && ctrl.currentIndex < 1; i += 1) mock.timers.tick(1000);
      assert.deepEqual(ctrl.currentStep?.nodes, ['a']);
      assert.equal(ctrl.currentStep?.label, 'Route');
      ctrl.clear();
    } finally {
      mock.timers.reset();
      clearFailures();
    }
  });

  it('with every target failed the packet stops, as it did before', () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
      const scenario = setup();
      setFailures(['a', 'b']);
      const ctrl = new SimulationPlaybackController();
      ctrl.loadScenario(scenario, true);
      for (let i = 0; i < 6; i += 1) mock.timers.tick(1000);
      assert.equal(ctrl.playing, false);
      ctrl.clear();
    } finally {
      mock.timers.reset();
      clearFailures();
    }
  });

  it('two loops give the same substitutions every time (deterministic round robin)', () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
      const doc = balanced();
      app.doc = doc.doc;
      // Add a third target so the round robin has something to alternate over.
      const c = { ...createNodeFromStencil('service', 500, 40, 5), id: 'c', title: 'C' };
      app.doc.nodes.push(c);
      app.doc.edges.push({
        id: 'w9', from: 'lb', to: 'c', sourcePort: 'right', targetPort: 'left', tone: 'blue',
        route: 'straight', label: '', animated: false,
      });
      const runs: string[][] = [];
      for (let run = 0; run < 2; run += 1) {
        clearFailures();
        setFailures(['a']);
        const ctrl = new SimulationPlaybackController();
        ctrl.setLoop(true);
        ctrl.loadScenario(doc.scenario, true);
        const picks: string[] = [];
        let last = -1;
        for (let i = 0; i < 40 && picks.length < 4; i += 1) {
          mock.timers.tick(1000);
          if (ctrl.currentIndex === 1 && last !== 1) picks.push(ctrl.currentStep?.nodes[0] ?? '');
          last = ctrl.currentIndex;
        }
        runs.push(picks);
        ctrl.clear();
      }
      assert.deepEqual(runs[0], runs[1]);
      assert.deepEqual(runs[0].slice(0, 2), ['b', 'c']);
    } finally {
      mock.timers.reset();
      clearFailures();
    }
  });
});
