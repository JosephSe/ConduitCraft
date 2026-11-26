/**
 * Nested levels in the studio (F-03): boundary ports drawn on the open level and the fade when
 * a level opens. The NW breadcrumb lives in `breadcrumb.ts`; tree logic is in `core/levels.ts`.
 */
import { boundaryPorts, breadcrumb } from '../core/levels';
import { chaosLensActive, isFailedAt, levelOpened } from './chaos';
import { stageWorld } from './dom';
import { app, goToLevel, openPageDocument, setSelection } from './state';

let portLayer: HTMLElement | null = null;
let paintedKey = '';
let paintedPath = '';

function ensurePortLayer(): void {
  if (!portLayer) {
    portLayer = document.createElement('div');
    portLayer.className = 'level-ports';
    portLayer.id = 'level-ports';
    portLayer.hidden = true;
    stageWorld.appendChild(portLayer);
  }
}

/** Repaint the boundary ports for the open level. Cheap when nothing about them changed. */
export function paintLevels(): void {
  if (typeof document === 'undefined') return;
  ensurePortLayer();
  const path = app.levelPath;
  const root = path.length > 0 ? openPageDocument() : app.doc;
  const crumbs = breadcrumb(root, path);
  const ports = boundaryPorts(root, path);
  // A wire to an outside component that has failed leads nowhere: its port is cut off (D5).
  const cutOff = (outsideId: string) => chaosLensActive() && isFailedAt(path.slice(0, -1), outsideId);
  const key = JSON.stringify([crumbs.map((c) => c.title), ports, ports.map((p) => cutOff(p.outsideId))]);
  const pathKey = path.join('/');
  document.documentElement.dataset.level = path.length > 0 ? 'nested' : 'root';
  if (pathKey !== paintedPath) {
    paintedPath = pathKey;
    stageWorld.classList.remove('level-enter');
    // Restart the fade-in.
    void stageWorld.offsetWidth;
    if (path.length > 0 || paintedKey) stageWorld.classList.add('level-enter');
    levelOpened();
  }
  if (key === paintedKey) return;
  paintedKey = key;

  if (portLayer) {
    portLayer.hidden = ports.length === 0;
    portLayer.replaceChildren();
    const rows = { in: 0, out: 0 };
    for (const port of ports) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'level-port';
      chip.dataset.direction = port.direction;
      chip.dataset.edgeId = port.edgeId;
      const arrow = port.direction === 'in' ? '▸' : '◂';
      chip.textContent = port.direction === 'in' ? `${port.outsideTitle} ${arrow}` : `${arrow} ${port.outsideTitle}`;
      const verb = port.direction === 'in' ? 'comes in from' : 'goes out to';
      const isCut = cutOff(port.outsideId);
      if (isCut) chip.dataset.cutOff = 'true';
      chip.setAttribute(
        'aria-label',
        `Wire ${verb} ${port.outsideTitle}${port.label ? `: ${port.label}` : ''}${isCut ? ', cut off because it has failed' : ''}`,
      );
      chip.setAttribute('data-tip', port.label ? `${port.outsideTitle} · ${port.label}` : port.outsideTitle);
      chip.style.top = `${24 + rows[port.direction] * 34}px`;
      rows[port.direction] += 1;
      chip.addEventListener('click', () => {
        if (goToLevel(path.slice(0, -1))) setSelection({ type: 'node', id: port.outsideId });
      });
      portLayer.appendChild(chip);
    }
  }
}
