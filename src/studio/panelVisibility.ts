/**
 * Hide the side panels in any tab. The left side holds the Review issues list; the right side holds the inspector
 * (Design properties, Traffic telemetry) and the text outline. A hidden side stays hidden across selections, lens
 * changes and reloads until it is shown again, and it wins over the inspector opening itself on a selection.
 *
 * Controls: the two panel buttons in the zoom card, `{` and `}` (Shift+[ and Shift+]), and the command palette.
 */
import { responsiveToolbar } from './responsiveToolbar';

export type PanelSide = 'left' | 'right';

const STORAGE_KEY: Record<PanelSide, string> = {
  left: 'conduitcraft:hide-left-panel',
  right: 'conduitcraft:hide-right-panel',
};
const ATTR: Record<PanelSide, string> = { left: 'data-hide-left', right: 'data-hide-right' };
const NAME: Record<PanelSide, string> = { left: 'left panel', right: 'right panel' };

function workspace(): HTMLElement | null {
  return document.getElementById('workspace');
}

export function isPanelHidden(side: PanelSide): boolean {
  return workspace()?.getAttribute(ATTR[side]) === 'true';
}

function syncButton(side: PanelSide, hidden: boolean): void {
  const btn = document.getElementById(`btn-toggle-${side}-panel`);
  if (!btn) return;
  const label = `${hidden ? 'Show' : 'Hide'} ${NAME[side]}`;
  btn.setAttribute('aria-label', label);
  btn.setAttribute('aria-pressed', String(hidden));
  btn.dataset.tip = `${label} (${side === 'left' ? '{' : '}'})`;
}

export function setPanelHidden(side: PanelSide, hidden: boolean, persist = true): void {
  const ws = workspace();
  if (!ws) return;
  if (hidden) ws.setAttribute(ATTR[side], 'true');
  else ws.removeAttribute(ATTR[side]);
  syncButton(side, hidden);
  if (persist) {
    try {
      if (hidden) localStorage.setItem(STORAGE_KEY[side], '1');
      else localStorage.removeItem(STORAGE_KEY[side]);
    } catch {
      // Storage unavailable: the choice lasts for this visit only.
    }
  }
  if (side === 'right') responsiveToolbar.updateScrim();
}

export function togglePanel(side: PanelSide): void {
  setPanelHidden(side, !isPanelHidden(side));
}

function editing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return Boolean(el?.closest?.('input, textarea, select, [contenteditable="true"], [contenteditable=""]'));
}

export function initPanelVisibility(): void {
  for (const side of ['left', 'right'] as const) {
    let saved = false;
    try {
      saved = localStorage.getItem(STORAGE_KEY[side]) === '1';
    } catch {
      // Storage unavailable: start with the panel shown.
    }
    setPanelHidden(side, saved, false);
    document.getElementById(`btn-toggle-${side}-panel`)?.addEventListener('click', () => togglePanel(side));
  }
  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || editing(e.target)) return;
    if (e.key !== '{' && e.key !== '}') return;
    e.preventDefault();
    togglePanel(e.key === '{' ? 'left' : 'right');
  });
}
