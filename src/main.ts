/** Studio entry. Runtime lives in `src/studio/*`. */
import { onSelectionChange, setHistoryApplied } from './studio/state';
import { renderAll, requestInspectorRefresh, updateVisualSelectionHighlights } from './studio/render';
import { bootStudio } from './studio/interactions';
import { bindMinimap, scheduleMinimapPaint } from './studio/minimap';

setHistoryApplied(() => renderAll(true));
onSelectionChange(() => {
  updateVisualSelectionHighlights();
  requestInspectorRefresh();
  scheduleMinimapPaint();
});
bootStudio();
bindMinimap();
