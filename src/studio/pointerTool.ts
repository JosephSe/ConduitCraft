/**
 * The pointer tool: Select moves things, Connect draws wires. The tool rail, the palette and Esc all call
 * `setPointerTool`; the rail's pressed state follows `data-tool` on the workspace (see dock.ts).
 */
import { announceToolChange } from './a11y';
import { hudStatusTip, viewport, workspace } from './dom';
import { app } from './state';

type FrameStage = typeof import('./frameStage');
let frameStage: FrameStage | undefined;

function loadFrameStage(): Promise<FrameStage> {
  return import('./frameStage').then((m) => (frameStage = m));
}

/**
 * The Frame tool draws with a lazy chunk, fetched when the tool is picked. A drag that starts before it arrives is
 * held here (nothing under the pointer moves) and handed over once it loads, so the first frame is not lost.
 */
if (typeof window !== 'undefined' && viewport) {
  viewport.addEventListener(
    'pointerdown',
    (e) => {
      if (frameStage || app.pointerTool !== 'frame' || app.workspaceMode !== 'design' || e.button !== 0) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      const { clientX, clientY, pointerId } = e;
      let released: [number, number] | null = null;
      const onUp = (up: PointerEvent): void => {
        if (up.pointerId === pointerId) released = [up.clientX, up.clientY];
      };
      window.addEventListener('pointerup', onUp, true);
      void loadFrameStage().then(
        (m) => {
          window.removeEventListener('pointerup', onUp, true);
          m.beginFrameDraw(clientX, clientY, pointerId);
          if (released) m.finishFrameDraw(released[0], released[1]);
        },
        () => window.removeEventListener('pointerup', onUp, true),
      );
    },
    true,
  );
}

export type PointerTool = 'select' | 'connect' | 'hand' | 'text' | 'frame';

export const TOOL_TIPS: Record<PointerTool, string> = {
  select: 'Drag a shape onto the sheet, or drag from a port to connect.',
  connect: 'Drag from one component to another to connect them.',
  hand: 'Drag anywhere to move around the sheet.',
  text: 'Click the sheet to add a label.',
  frame: 'Drag on the sheet to draw a frame around components.',
};

export function setPointerTool(tool: PointerTool): void {
  if (app.pointerTool === tool && workspace.dataset.tool === tool) return;
  app.pointerTool = tool;
  workspace.dataset.tool = tool;
  app.connectSourceNodeId = null;
  // The code that draws frames loads the first time the tool is used.
  if (tool === 'frame') void loadFrameStage().catch(() => {});
  hudStatusTip.textContent = TOOL_TIPS[tool];
  announceToolChange(tool);
}
