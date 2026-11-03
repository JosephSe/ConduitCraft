/**
 * Run bar (redesigned interface, R-04): the scenario picker and transport controls for the Traffic lens. It replaces
 * the playback deck that used to sit inside the Live Trace tab. It is another view on `simulationPlayback`, so the
 * trace list, the packet and the canvas highlight all keep working unchanged.
 */
import { getEffectiveSimulations } from '../core/layout';
import { app } from './state';
import { onPlaybackChange, simulationPlayback, type SimulationPlaybackState } from './simulationPlayback';

const PLACEHOLDER = '';

export function initRunBar(deps: { run: (scenarioId: string) => void }): void {
  const bar = document.getElementById('run-bar');
  const workspace = document.getElementById('workspace');
  if (!bar || !workspace) return;

  const select = bar.querySelector<HTMLSelectElement>('#run-bar-scenario')!;
  const scrubber = bar.querySelector<HTMLInputElement>('#run-bar-scrubber')!;
  const playBtn = bar.querySelector<HTMLButtonElement>('#run-bar-play')!;
  const speedBtn = bar.querySelector<HTMLButtonElement>('#run-bar-speed')!;
  const loopBtn = bar.querySelector<HTMLButtonElement>('#run-bar-loop')!;
  const stepLabel = bar.querySelector<HTMLElement>('#run-bar-step')!;

  const isV2 = () => document.documentElement.dataset.ui === '2';
  let optionsKey = '';

  const syncVisibility = () => {
    bar.hidden = !(isV2() && app.lens === 'traffic');
  };

  const syncScenarios = () => {
    const scenarios = getEffectiveSimulations(app.doc).filter((s) => s.steps.length > 0);
    const key = scenarios.map((s) => `${s.id}\u0000${s.name}`).join('\u0001');
    if (key !== optionsKey) {
      optionsKey = key;
      select.replaceChildren(
        new Option(scenarios.length ? 'Pick a scenario' : 'No scenarios yet', PLACEHOLDER),
        ...scenarios.map((s) => new Option(s.name, s.id)),
      );
    }
    select.value = simulationPlayback.activeScenario?.id ?? PLACEHOLDER;
    select.disabled = scenarios.length === 0;
  };

  const syncTransport = (state: SimulationPlaybackState) => {
    const loaded = Boolean(state.scenario) && state.totalSteps > 0;
    for (const control of [scrubber, playBtn, speedBtn, loopBtn, ...bar.querySelectorAll<HTMLButtonElement>('[data-run-step]')]) {
      (control as HTMLInputElement | HTMLButtonElement).disabled = !loaded;
    }
    scrubber.max = String(Math.max(0, state.totalSteps - 1));
    scrubber.value = String(Math.max(0, state.currentStepIndex));
    stepLabel.textContent = loaded ? `step ${Math.max(1, state.currentStepIndex + 1)}/${state.totalSteps}` : 'no run';
    playBtn.setAttribute('aria-label', state.isPlaying ? 'Pause' : 'Play');
    playBtn.setAttribute('aria-pressed', String(state.isPlaying));
    const icon = playBtn.querySelector('svg');
    if (icon) {
      icon.innerHTML = state.isPlaying
        ? '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>'
        : '<polygon points="6 4 20 12 6 20 6 4"/>';
    }
    speedBtn.textContent = `${state.speed}×`;
    loopBtn.setAttribute('aria-pressed', String(state.isLooping));
  };

  select.addEventListener('change', () => {
    if (select.value) deps.run(select.value);
  });
  playBtn.addEventListener('click', () => {
    simulationPlayback.togglePlay();
  });
  bar.querySelector('[data-run-step="-1"]')?.addEventListener('click', () => simulationPlayback.stepBackward());
  bar.querySelector('[data-run-step="1"]')?.addEventListener('click', () => simulationPlayback.stepForward());
  scrubber.addEventListener('input', () => simulationPlayback.goToStep(parseInt(scrubber.value, 10)));
  speedBtn.addEventListener('click', () => simulationPlayback.toggleSpeed());
  loopBtn.addEventListener('click', () => simulationPlayback.toggleLoop());

  onPlaybackChange((state) => {
    syncScenarios();
    syncTransport(state);
  });
  new MutationObserver(syncVisibility).observe(workspace, { attributes: true, attributeFilter: ['data-mode', 'data-lens'] });

  const refresh = () => {
    syncVisibility();
    syncScenarios();
    syncTransport(simulationPlayback.getState());
  };
  refreshRunBar = refresh;
  refresh();
}

/** Call when the document's scenarios may have changed (added, renamed, removed, or a new diagram loaded). */
export let refreshRunBar: () => void = () => {};
