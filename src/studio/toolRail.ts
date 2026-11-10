/**
 * Tool buttons in the dock. They are another surface for the same actions the palette and shortcuts run: clicking
 * Select or Wire runs `tool-select` / `tool-connect`, and the pressed state follows `data-tool` on the workspace, so it
 * stays right however the tool was changed. The component list's Stage containers repeat Frame and Text.
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
  const workspace = document.getElementById('workspace');
  if (!workspace) return;

  const toolOf = (btn: HTMLButtonElement) => btn.dataset.railTool ?? btn.dataset.paletteTool ?? '';
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-rail-tool], [data-palette-tool]'));
  const sync = () => {
    const tool = workspace.dataset.tool || 'select';
    for (const btn of buttons) btn.setAttribute('aria-pressed', String(toolOf(btn) === tool));
  };

  for (const btn of buttons) {
    btn.addEventListener('click', () => {
      const id = TOOL_ACTION[toolOf(btn)];
      if (id) findPaletteCommand(id)?.run();
      // The tray is not over the sheet the tool is about to be used on.
      void import('./tray').then((m) => m.closeTray());
    });
  }
  new MutationObserver(sync).observe(workspace, { attributes: true, attributeFilter: ['data-tool'] });
  sync();
}
