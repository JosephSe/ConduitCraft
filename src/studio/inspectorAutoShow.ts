/**
 * The inspector slides in while something is selected and folds away when nothing is,
 * unless the user pins it.
 */
import { responsiveToolbar } from './responsiveToolbar';
import { app, onSelectionChange } from './state';

const PIN_KEY = 'conduitcraft:inspector-pinned';

let pinned = false;
let hold = false;

function readPinned(): boolean {
  try {
    return localStorage.getItem(PIN_KEY) === '1';
  } catch {
    return false;
  }
}

/** Keep the inspector open until the next selection change, e.g. after the user clicks the document title. */
export function holdInspectorOpen(): void {
  hold = true;
  responsiveToolbar.toggleInspector(false, false);
}

function sync(): void {
  if (app.workspaceMode !== 'design') return;
  // On narrow screens the inspector is an overlay with a scrim; opening it unasked would cover the canvas.
  if (responsiveToolbar.isNarrowScreen()) return;
  const hasSelection = app.selection.type !== 'none';
  if (hasSelection) hold = false;
  const wantOpen = hasSelection || pinned || hold;
  responsiveToolbar.toggleInspector(!wantOpen, false);
}

export function initInspectorAutoShow(): void {
  const pin = document.getElementById('btn-pin-inspector');
  pinned = readPinned();
  pin?.setAttribute('aria-pressed', String(pinned));
  pin?.addEventListener('click', () => {
    pinned = !pinned;
    pin.setAttribute('aria-pressed', String(pinned));
    pin.setAttribute('aria-label', pinned ? 'Unpin inspector' : 'Keep inspector open');
    try {
      if (pinned) localStorage.setItem(PIN_KEY, '1');
      else localStorage.removeItem(PIN_KEY);
    } catch {
      // The pin just lasts for this page view.
    }
    sync();
  });
  onSelectionChange(sync);
  document.querySelectorAll<HTMLInputElement>('input[name="workspace-mode"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      // Data View has its own overview even with no selection: leave the panel where it is.
      if (radio.checked && radio.value === 'design') sync();
    });
  });
  sync();
}
