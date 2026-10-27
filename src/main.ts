/** Studio entry. Runtime lives in `src/studio/*`. */
import { onSelectionChange, setHistoryApplied } from './studio/state';
import { renderAll, requestInspectorRefresh, updateVisualSelectionHighlights } from './studio/render';
import { bootStudio } from './studio/interactions';

setHistoryApplied(() => renderAll(true));
onSelectionChange(() => {
  updateVisualSelectionHighlights();
  requestInspectorRefresh();
});
bootStudio();
