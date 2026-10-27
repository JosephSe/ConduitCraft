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

const { SimulationPlaybackController } = await import('../src/studio/simulationPlayback.ts');
import type { SimulationScenario } from '../src/types.ts';

describe('simulation playback controls (step, scrub, speed, loop)', () => {
  const sampleScenario: SimulationScenario = {
    id: 'sim-checkout',
    name: 'Checkout Flow',
    tone: 'emerald',
    steps: [
      {
        label: 'Auth Check',
        trace: 'JWT validated by edge service',
        nodes: ['gateway', 'auth'],
        tone: 'blue',
      },
      {
        label: 'Charge Card',
        trace: 'Payment gateway captured transaction',
        nodes: ['auth', 'billing'],
        tone: 'emerald',
      },
      {
        label: 'Inventory Reserve',
        trace: 'Decremented stock counter in database',
        nodes: ['billing', 'inventory'],
        tone: 'violet',
      },
      {
        label: 'Notify Customer',
        trace: 'Sent order confirmation push notification',
        nodes: ['inventory', 'notifier'],
        tone: 'emerald',
      },
    ],
  };

  it('loads a scenario and initializes playback state', () => {
    const ctrl = new SimulationPlaybackController();
    assert.equal(ctrl.activeScenario, null);
    assert.equal(ctrl.currentIndex, -1);
    assert.equal(ctrl.totalSteps, 0);

    ctrl.loadScenario(sampleScenario, false);
    assert.equal(ctrl.activeScenario?.name, 'Checkout Flow');
    assert.equal(ctrl.totalSteps, 4);
    assert.equal(ctrl.currentIndex, 0);
    assert.equal(ctrl.playing, false);
    assert.equal(ctrl.currentStep?.label, 'Auth Check');
  });

  it('supports play, pause, and togglePlay transitions', () => {
    const ctrl = new SimulationPlaybackController();
    ctrl.loadScenario(sampleScenario, false);

    assert.equal(ctrl.playing, false);
    ctrl.play();
    assert.equal(ctrl.playing, true);

    ctrl.pause();
    assert.equal(ctrl.playing, false);

    const isPlaying = ctrl.togglePlay();
    assert.equal(isPlaying, true);
    assert.equal(ctrl.playing, true);

    const isPaused = !ctrl.togglePlay();
    assert.equal(isPaused, true);
    assert.equal(ctrl.playing, false);

    ctrl.clear();
  });

  it('steps forward and backward through scenario steps with boundaries', () => {
    const ctrl = new SimulationPlaybackController();
    ctrl.loadScenario(sampleScenario, false);
    assert.equal(ctrl.currentIndex, 0);

    ctrl.stepForward();
    assert.equal(ctrl.currentIndex, 1);
    assert.equal(ctrl.currentStep?.label, 'Charge Card');

    ctrl.stepForward();
    assert.equal(ctrl.currentIndex, 2);

    ctrl.stepForward();
    assert.equal(ctrl.currentIndex, 3);
    assert.equal(ctrl.currentStep?.label, 'Notify Customer');

    // At the end without looping: clamps at last step
    ctrl.stepForward();
    assert.equal(ctrl.currentIndex, 3);

    // Step backward
    ctrl.stepBackward();
    assert.equal(ctrl.currentIndex, 2);

    ctrl.stepBackward();
    assert.equal(ctrl.currentIndex, 1);

    ctrl.stepBackward();
    assert.equal(ctrl.currentIndex, 0);

    // At the start without looping: clamps at step 0
    ctrl.stepBackward();
    assert.equal(ctrl.currentIndex, 0);

    ctrl.clear();
  });

  it('handles wrap-around when loop mode is enabled', () => {
    const ctrl = new SimulationPlaybackController();
    ctrl.loadScenario(sampleScenario, false);
    assert.equal(ctrl.looping, false);

    ctrl.setLoop(true);
    assert.equal(ctrl.looping, true);

    // Stepping backward from 0 wraps to last step
    ctrl.stepBackward();
    assert.equal(ctrl.currentIndex, 3);

    // Stepping forward from last wraps to 0
    ctrl.stepForward();
    assert.equal(ctrl.currentIndex, 0);

    ctrl.toggleLoop();
    assert.equal(ctrl.looping, false);

    ctrl.clear();
  });

  it('jumps directly to any step with goToStep and clamps out-of-bounds indices', () => {
    const ctrl = new SimulationPlaybackController();
    ctrl.loadScenario(sampleScenario, false);

    ctrl.goToStep(2);
    assert.equal(ctrl.currentIndex, 2);
    assert.equal(ctrl.currentStep?.label, 'Inventory Reserve');

    // Clamps high
    ctrl.goToStep(99);
    assert.equal(ctrl.currentIndex, 3);

    // Clamps low
    ctrl.goToStep(-10);
    assert.equal(ctrl.currentIndex, 0);

    ctrl.clear();
  });

  it('cycles through speed multipliers (0.5x, 1x, 2x)', () => {
    const ctrl = new SimulationPlaybackController();
    ctrl.loadScenario(sampleScenario, false);

    assert.equal(ctrl.speed, 1);

    assert.equal(ctrl.toggleSpeed(), 2);
    assert.equal(ctrl.speed, 2);

    assert.equal(ctrl.toggleSpeed(), 0.5);
    assert.equal(ctrl.speed, 0.5);

    assert.equal(ctrl.toggleSpeed(), 1);
    assert.equal(ctrl.speed, 1);

    ctrl.clear();
  });

  it('defines simulation playback deck and active wire glow in studio.css', () => {
    const cssPath = path.resolve('src/styles/studio.css');
    const css = fs.readFileSync(cssPath, 'utf-8');

    assert.ok(css.includes('.sim-playback-deck'), 'defines .sim-playback-deck');
    assert.ok(css.includes('.sim-scrubber'), 'defines .sim-scrubber range slider');
    assert.ok(css.includes('.trace-item.is-active-step'), 'defines active step trace highlight');
    assert.ok(css.includes('.conduit-group[data-sim-active="true"]'), 'defines active wire pulse glow');
  });
});
