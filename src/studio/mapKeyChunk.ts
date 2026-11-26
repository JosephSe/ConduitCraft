/**
 * Lazy loader for the SW always-visible map Key (`mapKey.ts`, DK4).
 * Keeps the Key interaction & rename logic out of the entry JS bundle while preserving synchronous callers.
 */
type MapKeyMod = typeof import('./mapKey');

let mod: MapKeyMod | undefined;
let pending: Promise<MapKeyMod> | undefined;
let queuedSync = false;
let queuedBind = false;

function loadMapKey(): Promise<MapKeyMod> {
  pending ??= import('./mapKey').then(
    (m) => {
      mod = m;
      m.initMapKeyControls();
      if (queuedBind) {
        queuedBind = false;
        m.bindLegendPreference();
      }
      if (queuedSync) {
        queuedSync = false;
        m.syncMapKey();
      }
      return m;
    },
    (error: unknown) => {
      pending = undefined;
      throw error;
    },
  );
  return pending;
}

/** Re-render the SW Key for the current page, wire tones, and "Colour by" mode. */
export function syncMapKey(): void {
  if (mod) {
    mod.syncMapKey();
  } else {
    queuedSync = true;
    loadMapKey().catch(() => {});
  }
}

/** Bind the "Show colour legend on the canvas" setting and load Key controls on boot. */
export function bindLegendPreference(): void {
  if (mod) {
    mod.bindLegendPreference();
  } else {
    queuedBind = true;
    loadMapKey().catch(() => {});
  }
}
