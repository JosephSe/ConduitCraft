/**
 * The dock's component half (6.4, 7.1, 7.2): six favourite cut-outs, click to arm, and the "All components" button.
 * The tool buttons are handled by toolRail.ts. A favourite can be dragged onto the sheet, or clicked: the pointer then
 * carries a ghost of the component and the next click on the sheet places it (Shift keeps placing, Esc puts it back).
 * From the keyboard, Enter places it at the centre of the view, as the old palette did.
 */
import { getNodeDimensions } from '../core/layout';
import { findStencil } from '../templates/presets';
import { TONE_CSS } from '../shared/tones';
import { cutoutDrawing, renderCutoutMarkup } from '../ui/cutout';
import { FAVOURITE_COUNT, normaliseFavourites } from './dockFavourites';
import { hudStatusTip, viewport } from './dom';
import { addNodeAt, attachStencilDragAndDrop } from './interactions';
import { TOOL_TIPS } from './pointerTool';
import { app, screenToWorld } from './state';

const STORAGE_KEY = 'conduitcraft:dock-favourites';
export function getFavourites(): string[] {
  try {
    return normaliseFavourites(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'));
  } catch {
    return normaliseFavourites(null);
  }
}

/** Replace one slot (S4's tray drops a cut-out onto the dock through this). */
export function setFavourite(index: number, id: string): void {
  const list = getFavourites();
  if (index < 0 || index >= FAVOURITE_COUNT || !findStencil(id)) return;
  list[index] = id;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Storage unavailable: the change lasts until reload.
  }
  renderFavourites();
}

let armedId: string | null = null;
let armedName: string | undefined;
let ghost: HTMLElement | null = null;

function favButtons(): HTMLButtonElement[] {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('.dock-fav'));
}

function syncArmed(): void {
  const workspace = document.getElementById('workspace');
  if (workspace) {
    if (armedId) workspace.dataset.armed = armedId;
    else delete workspace.dataset.armed;
  }
  for (const btn of favButtons()) btn.setAttribute('aria-pressed', String(btn.dataset.stencilId === armedId));
}

export function disarm(): void {
  if (!armedId) return;
  armedId = null;
  ghost?.remove();
  ghost = null;
  syncArmed();
  hudStatusTip.textContent = TOOL_TIPS[app.pointerTool];
}

function moveGhost(x: number, y: number): void {
  ghost?.style.setProperty('--gx', String(x));
  ghost?.style.setProperty('--gy', String(y));
}

export function arm(id: string, x?: number, y?: number, name?: string): void {
  const stencil = findStencil(id);
  if (!stencil) return;
  ghost?.remove();
  armedId = id;
  armedName = name;
  const drawing = cutoutDrawing(stencil);
  ghost = document.createElement('div');
  ghost.className = 'stencil-drag-ghost cutout-carry is-full';
  ghost.style.setProperty('--t', TONE_CSS[stencil.accent][0]);
  // The size it will have on the sheet at the current zoom, so the next click lands where the outline shows.
  ghost.style.setProperty('--carry-w', `${drawing.width * app.scale}px`);
  ghost.style.setProperty('--carry-h', `${drawing.height * app.scale}px`);
  ghost.innerHTML = renderCutoutMarkup(stencil, { carried: true });
  document.body.appendChild(ghost);
  moveGhost(x ?? window.innerWidth / 2, y ?? window.innerHeight / 2);
  syncArmed();
  hudStatusTip.textContent = `Click the sheet to place ${stencil.paletteTitle} · Shift keeps placing · Esc puts it back`;
}

function placeArmed(clientX: number, clientY: number): void {
  if (!armedId) return;
  const dims = getNodeDimensions(findStencil(armedId)?.kind ?? 'service');
  const [wx, wy] = screenToWorld(clientX, clientY);
  addNodeAt(armedId, wx - dims.width / 2, wy - dims.height / 2, armedName);
}

function renderFavourites(): void {
  const host = document.getElementById('dock-favs');
  if (!host) return;
  host.replaceChildren();
  for (const id of getFavourites()) {
    const stencil = findStencil(id);
    if (!stencil) continue;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dock-fav cut';
    btn.dataset.stencilId = stencil.id;
    btn.dataset.stencilKind = stencil.kind;
    btn.setAttribute('aria-pressed', 'false');
    btn.setAttribute('aria-label', `${stencil.paletteTitle}: click to place, or drag onto the sheet`);
    btn.setAttribute('data-tip', stencil.paletteTitle);
    btn.setAttribute('data-tip-pos', 'top');
    btn.style.setProperty('--t', TONE_CSS[stencil.accent][0]);
    btn.innerHTML = renderCutoutMarkup(stencil);
    attachStencilDragAndDrop(btn, stencil.id, stencil.paletteTitle, {
      // A tap or click carries the component to the sheet; a drag takes it there directly.
      onTap: (e) => (armedId === stencil.id ? disarm() : arm(stencil.id, e.clientX, e.clientY)),
    });
    host.appendChild(btn);
  }
  syncArmed();
}

export function initDock(): void {
  renderFavourites();

  document.addEventListener('pointermove', (e) => {
    if (ghost) moveGhost(e.clientX, e.clientY);
  });
  // The next press on the sheet places the component. Capture phase, so selecting or panning does not also happen.
  viewport.addEventListener(
    'pointerdown',
    (e) => {
      if (!armedId || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      placeArmed(e.clientX, e.clientY);
      if (!e.shiftKey) disarm();
    },
    true,
  );
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Escape' && armedId) {
        e.stopImmediatePropagation();
        disarm();
      }
    },
    true,
  );
  // Choosing a tool, or leaving Design, puts the component back.
  new MutationObserver(() => {
    if (armedId && (app.pointerTool !== 'select' || app.workspaceMode !== 'design')) disarm();
  }).observe(document.getElementById('workspace')!, { attributes: true, attributeFilter: ['data-tool', 'data-mode'] });

  // "All components" opens the tray (7.3). It loads the first time it is asked for.
  document.getElementById('btn-all-components')?.addEventListener('click', (e) => {
    void import('./tray').then((m) => m.toggleTray(e.currentTarget as HTMLElement));
  });
}
