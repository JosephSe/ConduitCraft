/**
 * The pointer tool: Select moves things, Connect draws wires. The tool rail, the palette and Esc all call
 * `setPointerTool`; the rail's pressed state follows `data-tool` on the workspace (see dock.ts).
 */
import { announceToolChange } from './a11y';
import { hudStatusTip, workspace } from './dom';
import { app } from './state';

export type PointerTool = 'select' | 'connect' | 'hand' | 'text' | 'frame';

export const TOOL_TIPS: Record<PointerTool, string> = {
  select: 'Drag stencils onto the grid · Drag from any port dot to draw an animated wire',
  connect: 'Connect Mode · Drag from any component or port to another component to draw an animated wire',
  hand: 'Hand tool · Drag anywhere to move around the canvas',
  text: 'Text tool · Click the canvas to add a text label',
  frame: 'Frame tool · Drag on the canvas to draw a frame around components',
};

export function setPointerTool(tool: PointerTool): void {
  if (app.pointerTool === tool && workspace.dataset.tool === tool) return;
  app.pointerTool = tool;
  workspace.dataset.tool = tool;
  app.connectSourceNodeId = null;
  // The code that draws frames loads the first time the tool is used.
  if (tool === 'frame') void import('./frameStage');
  hudStatusTip.textContent = TOOL_TIPS[tool];
  announceToolChange(tool);
}
