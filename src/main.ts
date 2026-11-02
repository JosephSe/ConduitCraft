/** Studio entry. Runtime lives in `src/studio/*`. */
import { app, onSelectionChange, setHistoryApplied } from './studio/state';
import { renderAll, renderWiresOnly, requestInspectorRefresh, updateVisualSelectionHighlights } from './studio/render';
import { bootStudio } from './studio/interactions';
import { bindMinimap, scheduleMinimapPaint } from './studio/minimap';
import { announceSelectionChange } from './studio/a11y';
import { initRovingFocus } from './studio/rovingFocus';
import { initContextMenu } from './studio/contextMenu';
import { initGroupOutlines } from './studio/groupOutlines';
import { findPaletteCommand } from './studio/palette';
import { initToolRail } from './studio/toolRail';
import { resolveUiVersion } from './core/uiVersion';

// Choose the interface generation before anything paints: `?ui=2` is the redesign, remembered per browser.
try {
  document.documentElement.dataset.ui = String(resolveUiVersion(window.location.search, window.localStorage));
} catch {
  document.documentElement.dataset.ui = String(resolveUiVersion(window.location.search, null));
}

setHistoryApplied(() => renderAll(true));
onSelectionChange(() => {
  // A selected wire shows grab handles, so wires are repainted whenever the selection changes.
  renderWiresOnly();
  updateVisualSelectionHighlights();
  requestInspectorRefresh();
  scheduleMinimapPaint();
  announceSelectionChange(app.selection, app.doc);
});
// The redesign starts with the component list folded into the rail; opening it later is remembered as usual.
try {
  if (document.documentElement.dataset.ui === '2' && !localStorage.getItem('conduitcraft:ui2-rail-seeded')) {
    localStorage.setItem('conduitcraft:ui2-rail-seeded', '1');
    if (localStorage.getItem('conduitcraft:palette-collapsed') === null) {
      localStorage.setItem('conduitcraft:palette-collapsed', 'true');
    }
  }
} catch {
  // Storage unavailable: the palette just opens as it does in the classic layout.
}
bootStudio();
initToolRail();
initRovingFocus();
initContextMenu();
initGroupOutlines();
document.getElementById('btn-share')?.addEventListener('click', () => findPaletteCommand('copy-share-link')?.run());
bindMinimap();
