/**
 * The pointer tool: Select moves things, Connect draws wires. The tool rail, the palette and Esc all call
 * `setPointerTool`; the rail's pressed state follows `data-tool` on the workspace (see dock.ts).
 */
import { announceToolChange } from './a11y';
import { hudStatusTip, workspace } from './dom';
import { app } from './state';

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
  if (tool === 'frame') void import('./frameStage');
  hudStatusTip.textContent = TOOL_TIPS[tool];
  announceToolChange(tool);
}
