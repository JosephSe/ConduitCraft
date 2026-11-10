/**
 * The popovers that open from the corner islands (6.3): the legend from the Key button in SW, and the view options
 * (minimap, "Colour by", tag filter) from the zoom readout in SE. They are not islands: each is anchored to its slot,
 * only one is open at a time, and Escape or a press anywhere else puts it away.
 */
import { scheduleMinimapPaint } from './minimap';

interface Pair {
  button: HTMLElement;
  popover: HTMLElement;
  onOpen?: () => void;
}

export function initSlotPopovers(): void {
  const pairs: Pair[] = [];
  const add = (buttonId: string, popoverId: string, onOpen?: () => void) => {
    const button = document.getElementById(buttonId);
    const popover = document.getElementById(popoverId);
    if (button && popover) pairs.push({ button, popover, onOpen });
  };
  add('btn-legend-key', 'legend-card');
  add('zoom-readout', 'view-popover', scheduleMinimapPaint);

  const close = (pair: Pair) => {
    pair.popover.hidden = true;
    pair.button.setAttribute('aria-expanded', 'false');
  };
  const closeAll = () => pairs.forEach(close);

  for (const pair of pairs) {
    pair.button.addEventListener('click', () => {
      const opening = pair.popover.hidden;
      closeAll();
      if (!opening) return;
      pair.popover.hidden = false;
      pair.button.setAttribute('aria-expanded', 'true');
      pair.onOpen?.();
    });
  }

  document.addEventListener('pointerdown', (event) => {
    const target = event.target as Node;
    for (const pair of pairs) {
      if (!pair.popover.hidden && !pair.popover.contains(target) && !pair.button.contains(target)) close(pair);
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const open = pairs.find((pair) => !pair.popover.hidden);
    if (!open) return;
    close(open);
    open.button.focus();
  });
  // The find box opens over the same corner as the view options.
  document.getElementById('hud-search-input')?.addEventListener('focus', closeAll);
}
