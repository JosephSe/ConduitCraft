/**
 * The properties panel (`inspector.ts`, the largest studio module) is a lazy chunk, fetched as boot paints the canvas.
 * These stand-ins keep its calls synchronous once it has arrived. Before then each kind of refresh is remembered once
 * and run, in the order asked, as soon as it loads: every refresh reads the current state, so one is enough.
 */
type Inspector = typeof import('./inspector');
type Refresh = 'design' | 'data' | 'simulations';

let mod: Inspector | undefined;
let pending: Promise<Inspector> | undefined;
const queued: Refresh[] = [];
let forceSimulations = false;

function flush(m: Inspector): void {
  const order = queued.splice(0);
  for (const refresh of order) {
    if (refresh === 'design') m.renderPropertyEditor();
    else if (refresh === 'data') m.syncDataViewInspector();
    else m.renderSimulationEditor(forceSimulations);
  }
  forceSimulations = false;
}

export function loadInspector(): Promise<Inspector> {
  pending ??= import('./inspector').then(
    (m) => {
      mod = m;
      flush(m);
      return m;
    },
    (error: unknown) => {
      pending = undefined; // A later refresh tries again (e.g. once back online).
      throw error;
    },
  );
  return pending;
}

function request(refresh: Refresh): void {
  if (!queued.includes(refresh)) queued.push(refresh);
  loadInspector().catch(() => {});
}

export function renderPropertyEditor(): void {
  if (mod) mod.renderPropertyEditor();
  else request('design');
}

export function syncDataViewInspector(): void {
  if (mod) mod.syncDataViewInspector();
  else request('data');
}

export function renderSimulationEditor(force = false): void {
  if (mod) return mod.renderSimulationEditor(force);
  forceSimulations ||= force;
  request('simulations');
}

export function addSimulationScenario(): void {
  if (mod) mod.addSimulationScenario();
  else void loadInspector().then((m) => m.addSimulationScenario(), () => {});
}
