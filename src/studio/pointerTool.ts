/**
 * The pointer tool: Select moves things, Connect draws wires. The tool rail, the palette and Esc all call
 * `setPointerTool`; the rail's pressed state follows `data-tool` on the workspace (see toolRail.ts).
 */
import { announceToolChange } from './a11y';
import { hudStatusTip, workspace } from './dom';
import { app } from './state';

export type PointerTool = 'select' | 'connect' | 'hand' | 'text';

const TIPS: Record<PointerTool, string> = {
  select: 'Drag stencils onto the grid · Drag from any port dot to draw an animated wire',
  connect: 'Connect Mode · Drag from any component or port to another component to draw an animated wire',
  hand: 'Hand tool · Drag anywhere to move around the canvas',
  text: 'Text tool · Click the canvas to add a text label',
};

export function setPointerTool(tool: PointerTool): void {
  if (app.pointerTool === tool && workspace.dataset.tool === tool) return;
  app.pointerTool = tool;
  workspace.dataset.tool = tool;
  app.connectSourceNodeId = null;
  hudStatusTip.textContent = TIPS[tool];
  announceToolChange(tool);
}
