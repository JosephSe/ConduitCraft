/** Studio entry. Runtime lives in `src/studio/*`. */
import { app, onSelectionChange, setHistoryApplied } from './studio/state';
import { renderAll, requestInspectorRefresh, updateVisualSelectionHighlights } from './studio/render';
import { bootStudio } from './studio/interactions';
import { bindMinimap, scheduleMinimapPaint } from './studio/minimap';
import { announceSelectionChange } from './studio/a11y';

setHistoryApplied(() => renderAll(true));
onSelectionChange(() => {
  updateVisualSelectionHighlights();
  requestInspectorRefresh();
  scheduleMinimapPaint();
  announceSelectionChange(app.selection, app.doc);
});
bootStudio();
bindMinimap();
