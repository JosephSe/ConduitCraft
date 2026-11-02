/** Studio entry. Runtime lives in `src/studio/*`. */
import { app, onSelectionChange, setHistoryApplied } from './studio/state';
import { renderAll, renderWiresOnly, requestInspectorRefresh, updateVisualSelectionHighlights } from './studio/render';
import { bootStudio } from './studio/interactions';
import { bindMinimap, scheduleMinimapPaint } from './studio/minimap';
import { announceSelectionChange } from './studio/a11y';
import { initRovingFocus } from './studio/rovingFocus';

setHistoryApplied(() => renderAll(true));
onSelectionChange(() => {
  // A selected wire shows grab handles, so wires are repainted whenever the selection changes.
  renderWiresOnly();
  updateVisualSelectionHighlights();
  requestInspectorRefresh();
  scheduleMinimapPaint();
  announceSelectionChange(app.selection, app.doc);
});
bootStudio();
initRovingFocus();
bindMinimap();
