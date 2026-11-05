import type { SimulationScenario, SimulationStep } from '../types';
import { getNodeCenter } from '../core/layout';
import { hopDelayMs, latenciesBetween } from '../core/wire';
import { TONE_CSS } from '../shared/tones';
import { app } from './state';
import { holdingQueue } from '../core/queues';
import { blockedNodeIn, bufferingQueueIds, downIds } from './chaos';
import { holdMessage, setBacklogSpeedProvider } from './queueBacklog';
import { announce } from './a11y';
import { nodesLayer, simPacket, simPacketDot, simPacketLabel, traceList, wiresGroup } from './dom';

export type SimulationSpeed = 0.5 | 1 | 2;

export interface SimulationPlaybackState {
  scenario: SimulationScenario | null;
  currentStepIndex: number;
  totalSteps: number;
  isPlaying: boolean;
  isLooping: boolean;
  speed: SimulationSpeed;
}

const playbackListeners = new Set<(state: SimulationPlaybackState) => void>();

/** Subscribe to every change of the shared playback (used by the run bar). */
export function onPlaybackChange(listener: (state: SimulationPlaybackState) => void): void {
  playbackListeners.add(listener);
}

export class SimulationPlaybackController {
  private scenario: SimulationScenario | null = null;
  private currentStepIndex = -1;
  private isPlaying = false;
  private isLooping = false;
  private speedMultiplier: SimulationSpeed = 1;
  private baseStepMs = 950;
  private timer: any = null;

  private onStateChange?: (state: SimulationPlaybackState) => void;

  public constructor(onStateChange?: (state: SimulationPlaybackState) => void) {
    this.onStateChange = onStateChange;
  }

  public get activeScenario(): SimulationScenario | null {
    return this.scenario;
  }

  public get currentIndex(): number {
    return this.currentStepIndex;
  }

  public get totalSteps(): number {
    return this.scenario ? this.scenario.steps.length : 0;
  }

  public get playing(): boolean {
    return this.isPlaying;
  }

  public get looping(): boolean {
    return this.isLooping;
  }

  public get speed(): SimulationSpeed {
    return this.speedMultiplier;
  }

  public get currentStep(): SimulationStep | null {
    if (!this.scenario || this.currentStepIndex < 0 || this.currentStepIndex >= this.scenario.steps.length) {
      return null;
    }
    return this.scenario.steps[this.currentStepIndex];
  }

  public getState(): SimulationPlaybackState {
    return {
      scenario: this.scenario,
      currentStepIndex: this.currentStepIndex,
      totalSteps: this.totalSteps,
      isPlaying: this.isPlaying,
      isLooping: this.isLooping,
      speed: this.speedMultiplier,
    };
  }

  public loadScenario(scenario: SimulationScenario, autoPlay = true): void {
    this.clearTimer();
    this.scenario = scenario;
    this.currentStepIndex = -1;

    if (scenario.steps.length === 0) {
      this.isPlaying = false;
      this.notifyState();
      return;
    }

    if (autoPlay) {
      this.isPlaying = true;
      this.goToStep(0);
      this.scheduleNextStep();
    } else {
      this.isPlaying = false;
      this.goToStep(0);
    }
  }

  public play(): void {
    if (!this.scenario || this.scenario.steps.length === 0) return;
    if (this.isPlaying) return;

    this.isPlaying = true;

    // If at the end, wrap to start
    if (this.currentStepIndex >= this.scenario.steps.length - 1) {
      this.goToStep(0);
    }

    this.scheduleNextStep();
    this.notifyState();
  }

  public pause(): void {
    if (!this.isPlaying) return;
    this.clearTimer();
    this.isPlaying = false;
    this.notifyState();
  }

  public togglePlay(): boolean {
    if (this.isPlaying) {
      this.pause();
      return false;
    } else {
      this.play();
      return true;
    }
  }

  public stepForward(): void {
    if (!this.scenario || this.scenario.steps.length === 0) return;
    this.pause();

    const nextIndex = this.currentStepIndex + 1;
    if (nextIndex < this.scenario.steps.length) {
      this.goToStep(nextIndex);
    } else if (this.isLooping) {
      this.goToStep(0);
    }
  }

  public stepBackward(): void {
    if (!this.scenario || this.scenario.steps.length === 0) return;
    this.pause();

    const prevIndex = this.currentStepIndex - 1;
    if (prevIndex >= 0) {
      this.goToStep(prevIndex);
    } else if (this.isLooping) {
      this.goToStep(this.scenario.steps.length - 1);
    }
  }

  public goToStep(index: number): void {
    if (!this.scenario || this.scenario.steps.length === 0) return;

    const clamped = Math.max(0, Math.min(index, this.scenario.steps.length - 1));
    this.currentStepIndex = clamped;

    this.renderCurrentStep();
    this.notifyState();
  }

  public setSpeed(speed: SimulationSpeed): void {
    this.speedMultiplier = speed;
    if (this.isPlaying) {
      this.clearTimer();
      this.scheduleNextStep();
    }
    this.notifyState();
  }

  public toggleSpeed(): SimulationSpeed {
    const nextSpeed: SimulationSpeed =
      this.speedMultiplier === 0.5 ? 1 : this.speedMultiplier === 1 ? 2 : 0.5;
    this.setSpeed(nextSpeed);
    return nextSpeed;
  }

  public setLoop(loop: boolean): void {
    this.isLooping = loop;
    this.notifyState();
  }

  public toggleLoop(): boolean {
    this.isLooping = !this.isLooping;
    this.notifyState();
    return this.isLooping;
  }

  public clear(): void {
    this.clearTimer();
    this.scenario = null;
    this.currentStepIndex = -1;
    this.isPlaying = false;

    if (typeof document !== 'undefined') {
      if (simPacket) simPacket.hidden = true;
      if (nodesLayer) {
        for (const w of nodesLayer.querySelectorAll<HTMLElement>('.arch-node')) {
          delete w.dataset.simActive;
        }
      }
      if (wiresGroup) {
        for (const g of wiresGroup.querySelectorAll<SVGGElement>('.conduit-group')) {
          delete g.dataset.simActive;
        }
      }
    }

    this.notifyState();
  }

  private scheduleNextStep(): void {
    this.clearTimer();
    if (!this.isPlaying || !this.scenario) return;

    // The wait before the next step follows the typical latency of the wires the packet is about to cross.
    const current = this.scenario.steps[this.currentStepIndex];
    const next = this.scenario.steps[this.currentStepIndex + 1];
    const hopMs =
      current && next
        ? hopDelayMs(this.baseStepMs, latenciesBetween(app.doc.edges, current.nodes, next.nodes))
        : this.baseStepMs;
    const delayMs = Math.round(hopMs / this.speedMultiplier);

    this.timer = setTimeout(() => {
      if (!this.isPlaying || !this.scenario) return;

      const nextIndex = this.currentStepIndex + 1;
      if (nextIndex < this.scenario.steps.length) {
        this.goToStep(nextIndex);
        // A packet that reaches a queue whose consumers are down parks there instead of stopping (K1).
        const held = holdingQueue(
          app.doc,
          current?.nodes ?? [],
          this.scenario.steps[nextIndex].nodes,
          bufferingQueueIds(),
          downIds(),
        );
        if (held) {
          this.parkPacket(held, delayMs);
          return;
        }
        // A packet that reaches a failed or cut-off component goes no further.
        const blocked = blockedNodeIn(this.scenario.steps[nextIndex].nodes);
        if (blocked) {
          this.pause();
          announce(`Traffic stopped at ${app.doc.nodes.find((n) => n.id === blocked)?.title || blocked}.`);
          return;
        }
        this.scheduleNextStep();
      } else if (this.isLooping) {
        this.goToStep(0);
        this.scheduleNextStep();
      } else {
        this.pause();
      }
    }, delayMs);
  }

  /** The message stays in the queue: show where it went, then carry on from the top when looping, else pause. */
  private parkPacket(queueId: string, delayMs: number): void {
    const { outcome, deadLetterId } = holdMessage(queueId);
    this.showHeld(queueId, outcome, deadLetterId);
    if (this.isLooping) {
      this.timer = setTimeout(() => {
        if (!this.isPlaying || !this.scenario) return;
        this.goToStep(0);
        this.scheduleNextStep();
      }, delayMs);
    } else {
      this.pause();
    }
  }

  private showHeld(queueId: string, outcome: 'held' | 'dead-lettered' | 'dropped', deadLetterId?: string): void {
    if (typeof document === 'undefined') return;
    const queue = app.doc.nodes.find((n) => n.id === queueId);
    if (queue && simPacket && simPacketLabel) {
      const [cx, cy] = getNodeCenter(queue);
      simPacketLabel.textContent = outcome === 'held' ? 'HELD' : outcome === 'dead-lettered' ? 'DLQ' : 'DROPPED';
      simPacket.style.setProperty('--px', String(cx));
      simPacket.style.setProperty('--py', String(cy));
      if (outcome !== 'held' && simPacketDot) simPacketDot.style.background = TONE_CSS.rose[0];
    }
    if (outcome === 'dead-lettered' && deadLetterId && nodesLayer) {
      const wrapper = Array.from(nodesLayer.querySelectorAll<HTMLElement>('.arch-node')).find(
        (w) => w.dataset.node === deadLetterId,
      );
      if (wrapper) {
        wrapper.dataset.simActive = 'true';
        wrapper.style.setProperty('--sim-accent', TONE_CSS.rose[0]);
        wrapper.style.setProperty('--sim-accent-soft', TONE_CSS.rose[1]);
        setTimeout(() => delete wrapper.dataset.simActive, 600);
      }
    }
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private notifyState(): void {
    if (this.onStateChange) {
      this.onStateChange(this.getState());
    }
    for (const listener of playbackListeners) listener(this.getState());
  }

  private renderCurrentStep(): void {
    const step = this.currentStep;
    if (!step || typeof document === 'undefined') return;

    const [accent, soft] = TONE_CSS[step.tone] || TONE_CSS.emerald;

    // 1. Highlight participating nodes
    if (nodesLayer) {
      const wrappers = Array.from(nodesLayer.querySelectorAll<HTMLElement>('.arch-node'));
      for (const w of wrappers) {
        const nid = w.dataset.node || '';
        if (step.nodes.includes(nid)) {
          w.dataset.simActive = 'true';
          w.style.setProperty('--sim-accent', accent);
          w.style.setProperty('--sim-accent-soft', soft);
        } else {
          delete w.dataset.simActive;
        }
      }
    }

    // 2. Highlight active wire connecting participating nodes
    if (wiresGroup && app?.doc?.edges) {
      const activeWireIds = new Set<string>();
      for (const edge of app.doc.edges) {
        if (
          step.nodes.length >= 2 &&
          step.nodes.includes(edge.from) &&
          step.nodes.includes(edge.to)
        ) {
          activeWireIds.add(edge.id);
        }
      }
      for (const g of wiresGroup.querySelectorAll<SVGGElement>('.conduit-group')) {
        const edgeId = g.dataset.edgeId || '';
        if (activeWireIds.has(edgeId)) {
          g.dataset.simActive = 'true';
          g.style.setProperty('--sim-accent', accent);
        } else {
          delete g.dataset.simActive;
        }
      }
    }

    // 3. Position simPacket
    const nodeMap = new Map(app?.doc?.nodes?.map((n) => [n.id, n]) ?? []);
    const anchorNode = nodeMap.get(step.nodes[0]);
    if (anchorNode && simPacket && simPacketDot && simPacketLabel) {
      const [cx, cy] = getNodeCenter(anchorNode);
      simPacket.hidden = false;
      simPacket.dataset.tone = step.tone;
      simPacketDot.style.background = accent;
      simPacketLabel.textContent = step.label;
      simPacket.style.setProperty('--px', String(cx));
      simPacket.style.setProperty('--py', String(cy - 62));
    }

    // 4. Highlight active trace row in trace list
    if (traceList) {
      const rows = traceList.querySelectorAll<HTMLElement>('.trace-item');
      for (const r of rows) {
        const rowIdx = parseInt(r.dataset.stepIndex || '-1', 10);
        if (rowIdx === this.currentStepIndex) {
          r.classList.add('is-active-step');
          r.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
        } else {
          r.classList.remove('is-active-step');
        }
      }
    }
  }
}

export const simulationPlayback = new SimulationPlaybackController();
setBacklogSpeedProvider(() => simulationPlayback.speed);

/**
 * Builds the initial trace rows when a simulation starts so all steps
 * can be inspected and scrubbed through.
 */
export function populateTraceRows(scenario: SimulationScenario): void {
  if (typeof document === 'undefined' || !traceList) return;

  traceList.replaceChildren();

  for (let i = 0; i < scenario.steps.length; i++) {
    const step = scenario.steps[i];
    const li = document.createElement('li');
    li.className = 'trace-item';
    li.dataset.tone = step.tone;
    li.dataset.stepIndex = String(i);
    li.setAttribute('role', 'button');
    li.setAttribute('tabindex', '0');
    li.setAttribute('title', `Click to jump to Step ${i + 1}`);

    const meta = document.createElement('div');
    meta.className = 'trace-meta';

    const s1 = document.createElement('span');
    s1.className = 'trace-step';
    s1.textContent = `STEP 0${i + 1} · ${scenario.name.toUpperCase()}`;

    const s2 = document.createElement('span');
    s2.className = 'trace-time';
    s2.textContent = new Date().toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    meta.append(s1, s2);

    const body = document.createElement('p');
    body.className = 'trace-body';
    body.textContent = step.trace;

    li.append(meta, body);
    traceList.appendChild(li);
  }
}

/** Lets a click on a row of the trace list jump to that step. */
export function initSimulationPlaybackUi(): void {
  if (typeof document === 'undefined') return;

  // Clicking a row in the trace list jumps directly to that step
  traceList?.addEventListener('click', (e) => {
    const item = (e.target as HTMLElement).closest('.trace-item') as HTMLElement | null;
    if (!item || !item.dataset.stepIndex) return;
    const idx = parseInt(item.dataset.stepIndex, 10);
    if (!isNaN(idx)) {
      simulationPlayback.goToStep(idx);
    }
  });
}
