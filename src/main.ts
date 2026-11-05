/** Studio entry. Runtime lives in `src/studio/*`. */
import { app, onSelectionChange, setHistoryApplied } from './studio/state';
import { renderAll, renderWiresOnly, requestInspectorRefresh, updateVisualSelectionHighlights } from './studio/render';
import { bindLegendPreference, bindViewFilters, bootStudio } from './studio/interactions';
import { bindMinimap, scheduleMinimapPaint } from './studio/minimap';
import { announceSelectionChange } from './studio/a11y';
import { initRovingFocus } from './studio/rovingFocus';
import { initContextMenu } from './studio/contextMenu';
import { initPageTabs } from './studio/pageTabs';
import { initGroupOutlines } from './studio/groupOutlines';
import { findPaletteCommand } from './studio/palette';
import { initToolRail } from './studio/toolRail';
import { initAppMenu } from './studio/appMenu';
import { initInspectorAutoShow } from './studio/inspectorAutoShow';
import { initContextToolbar } from './studio/contextToolbar';
import { notify } from './studio/toast';

setHistoryApplied(() => renderAll(true));
onSelectionChange(() => {
  // A selected wire shows grab handles, so wires are repainted whenever the selection changes.
  renderWiresOnly();
  updateVisualSelectionHighlights();
  requestInspectorRefresh();
  scheduleMinimapPaint();
  announceSelectionChange(app.selection, app.doc);
});
// The component list starts folded into the rail; opening it later is remembered as usual.
try {
  if (!localStorage.getItem('conduitcraft:ui2-rail-seeded')) {
    localStorage.setItem('conduitcraft:ui2-rail-seeded', '1');
    if (localStorage.getItem('conduitcraft:palette-collapsed') === null) {
      localStorage.setItem('conduitcraft:palette-collapsed', 'true');
    }
  }
} catch {
  // Storage unavailable: the palette just opens.
}
// The old layout is gone (see RELEASE_NOTES.md). A stored preference for it is dropped once, with a note.
try {
  if (localStorage.getItem('conduitcraft-ui') !== null) {
    const wasOld = localStorage.getItem('conduitcraft-ui') === '1';
    localStorage.removeItem('conduitcraft-ui');
    if (wasOld) notify('The old layout has been retired. You are now using the new layout.');
  }
} catch {
  // Storage unavailable: nothing was stored that we could read.
}
bindLegendPreference();
bindViewFilters();
bootStudio();
initToolRail();
initAppMenu();
initPageTabs();
initInspectorAutoShow();
initContextToolbar();
initRovingFocus();
initContextMenu();
initGroupOutlines();
document.getElementById('btn-share')?.addEventListener('click', () => findPaletteCommand('copy-share-link')?.run());
bindMinimap();
