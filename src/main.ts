/** Studio entry. Runtime lives in `src/studio/*`. */
import { setHistoryApplied } from './studio/state';
import { renderAll } from './studio/render';
import { bootStudio } from './studio/interactions';

setHistoryApplied(() => renderAll(true));
bootStudio();
