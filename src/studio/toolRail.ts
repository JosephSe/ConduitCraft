/**
 * Tool buttons at the top of the left rail (redesigned interface). They are another surface for the same
 * actions the palette and shortcuts run: clicking Select or Wire runs `tool-select` / `tool-connect`, and the
 * pressed state follows `data-tool` on the workspace, so it stays right however the tool was changed.
 */
import { findPaletteCommand } from './palette';

const TOOL_ACTION: Record<string, string> = {
  select: 'tool-select',
  connect: 'tool-connect',
  hand: 'tool-hand',
  text: 'tool-text',
  frame: 'tool-frame',
};

export function initToolRail(): void {
  const rail = document.getElementById('palette-rail-content');
  const workspace = document.getElementById('workspace');
  if (!rail || !workspace) return;

  const buttons = Array.from(rail.querySelectorAll<HTMLButtonElement>('[data-rail-tool]'));
  const sync = () => {
    const tool = workspace.dataset.tool || 'select';
    for (const btn of buttons) btn.setAttribute('aria-pressed', String(btn.dataset.railTool === tool));
  };

  for (const btn of buttons) {
    btn.addEventListener('click', () => {
      const id = TOOL_ACTION[btn.dataset.railTool || ''];
      if (id) findPaletteCommand(id)?.run();
    });
  }
  new MutationObserver(sync).observe(workspace, { attributes: true, attributeFilter: ['data-tool'] });
  sync();
}
