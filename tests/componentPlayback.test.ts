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

function wire(from: string, to: string, i: number) {
  return {
    id: `w${i}`, from, to, sourcePort: 'right' as const, targetPort: 'left' as const, tone: 'blue' as const,
    route: 'straight' as const, label: '', animated: false,
  };
}

function build(kinds: Record<string, any>, wires: Array<[string, string]>, patch: Record<string, any> = {}): DiagramDocument {
  const doc = createBlankDocument();
  doc.nodes = Object.entries(kinds).map(([id, kind], i) => ({
    ...createNodeFromStencil(kind, i * 100, 40, i),
    id,
    title: id.toUpperCase(),
    ...patch[id],
  }));
  doc.edges = wires.map(([a, b], i) => wire(a, b, i));
  return doc;
}

const step = (nodes: string[], label = nodes.join('+')) => ({ label, trace: label, nodes, tone: 'blue' as const });

function start(doc: DiagramDocument, steps: SimulationScenario['steps'], loop: boolean) {
  app.doc = doc;
  app.lens = 'traffic';
  clearFailures();
  const ctrl = new SimulationPlaybackController();
  ctrl.setLoop(loop);
  ctrl.loadScenario({ id: 's', name: 'Read', tone: 'emerald', steps }, true);
  return ctrl;
}

/** Steps visited, in order, by ticking the clock. */
function visits(ctrl: InstanceType<typeof SimulationPlaybackController>, ticks: number): number[] {
  const seen = [ctrl.currentIndex];
  for (let i = 0; i < ticks; i += 1) {
    mock.timers.tick(950);
    if (seen[seen.length - 1] !== ctrl.currentIndex) seen.push(ctrl.currentIndex);
  }
  return seen;
}

const cacheDoc = (hitRate?: number) =>
  build(
    { u: 'actor', api: 'service', c: 'cache', db: 'store' },
    [['u', 'api'], ['api', 'c'], ['c', 'db']],
    hitRate === undefined ? {} : { c: { cache: { hitRate } } },
  );
const cacheSteps = () => [step(['u', 'api']), step(['api', 'c']), step(['c', 'db']), step(['api', 'u'])];

describe('cache in playback (K3, spec 5.1)', () => {
  it('a hit skips the backing store step and goes back to the caller', () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
      const ctrl = start(cacheDoc(100), cacheSteps(), false);
      assert.deepEqual(visits(ctrl, 6), [0, 1, 3]);
      ctrl.clear();
    } finally {
      mock.timers.reset();
    }
  });

  it('a miss plays on through the store', () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
      const ctrl = start(cacheDoc(0), cacheSteps(), false);
      assert.deepEqual(visits(ctrl, 6), [0, 1, 2, 3]);
      ctrl.clear();
    } finally {
      mock.timers.reset();
    }
  });

  it('80% hits 4 packets in every 5, the same way each run', () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
      const runs: number[][] = [];
      for (let r = 0; r < 2; r += 1) {
        const ctrl = start(cacheDoc(), cacheSteps(), true);
        const seen = visits(ctrl, 60);
        // A pass that visits step 2 was a miss.
        const passes = seen.join(',').split('0,').filter(Boolean);
        runs.push(passes.slice(0, 5).map((p) => (p.includes('2') ? 0 : 1)));
        ctrl.clear();
      }
      assert.deepEqual(runs[0], runs[1]);
      assert.equal(runs[0].filter(Boolean).length, 4);
    } finally {
      mock.timers.reset();
    }
  });

  it('a hit on the last backing step ends the pass and loops', () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
      const ctrl = start(cacheDoc(100), cacheSteps().slice(0, 3), true);
      assert.deepEqual(visits(ctrl, 8).slice(0, 4), [0, 1, 0, 1]);
      assert.equal(ctrl.playing, true);
      ctrl.clear();
    } finally {
      mock.timers.reset();
    }
  });

  it('a cache with no store behind it plays its own steps', () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
      const doc = build({ u: 'actor', c: 'cache', s: 'service' }, [['u', 'c'], ['c', 's']], { c: { cache: { hitRate: 100 } } });
      const ctrl = start(doc, [step(['u', 'c']), step(['c', 's'])], false);
      assert.deepEqual(visits(ctrl, 4), [0, 1]);
      ctrl.clear();
    } finally {
      mock.timers.reset();
    }
  });
});

describe('rate limiter in playback (K4, spec 5.2)', () => {
  const limiterDoc = (limiter?: object) =>
    build({ u: 'actor', l: 'limiter', api: 'service' }, [['u', 'l'], ['l', 'api']], limiter ? { l: { limiter } } : {});
  const limiterSteps = () => [step(['u']), step(['l']), step(['api'])];

  it('the first four packets pass and the fifth is rejected (4 of 5)', () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
      const ctrl = start(limiterDoc(), limiterSteps(), true);
      const seen = visits(ctrl, 80);
      // Full passes reach step 2; a rejected packet stops at step 1 and the run starts over.
      const passes = seen.join(',').split('0,').filter(Boolean);
      assert.deepEqual(passes.slice(0, 6).map((p) => p.includes('2')), [true, true, true, true, false, true]);
      ctrl.clear();
    } finally {
      mock.timers.reset();
    }
  });

  it('a rejected packet pauses the run when it is not looping', () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
      const ctrl = start(limiterDoc({ admit: 1, per: 2 }), limiterSteps(), false);
      visits(ctrl, 4); // first packet passes
      assert.equal(ctrl.playing, false);
      ctrl.play();
      assert.equal(ctrl.currentIndex, 0);
      visits(ctrl, 4); // second packet is rejected at the limiter
      assert.equal(ctrl.currentIndex, 1);
      assert.equal(ctrl.playing, false);
      ctrl.clear();
    } finally {
      mock.timers.reset();
    }
  });

  it('a limiter that is bypassed lets the run through', () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
      const doc = limiterDoc({ failOpen: true });
      app.doc = doc;
      const ctrl = start(doc, limiterSteps(), false);
      setFailures(['l']);
      assert.deepEqual(visits(ctrl, 4), [0, 1, 2]);
      ctrl.clear();
    } finally {
      mock.timers.reset();
      clearFailures();
    }
  });
});

describe('scheduler in playback (K5, spec 5.3)', () => {
  const doc = () => build({ s: 'scheduler', job: 'service', db: 'store' }, [['s', 'job'], ['job', 'db']]);
  const steps = () => [step(['s', 'job']), step(['job', 'db'])];

  it('a looping run that starts at a scheduler waits twice as long before it starts again', () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
      const ctrl = start(doc(), steps(), true);
      mock.timers.tick(950);
      assert.equal(ctrl.currentIndex, 1);
      mock.timers.tick(950);
      assert.equal(ctrl.currentIndex, 1, 'still waiting');
      mock.timers.tick(950);
      assert.equal(ctrl.currentIndex, 0);
      ctrl.clear();
    } finally {
      mock.timers.reset();
    }
  });

  it('any other looping run starts again after one step', () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
      const d = build({ u: 'actor', job: 'service', db: 'store' }, [['u', 'job'], ['job', 'db']]);
      const ctrl = start(d, [step(['u', 'job']), step(['job', 'db'])], true);
      mock.timers.tick(950);
      assert.equal(ctrl.currentIndex, 1);
      mock.timers.tick(950);
      assert.equal(ctrl.currentIndex, 0);
      ctrl.clear();
    } finally {
      mock.timers.reset();
    }
  });
});
