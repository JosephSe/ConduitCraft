/**
 * Tool buttons in the left panel (redesigned interface). They are another surface for the same actions the palette
 * and shortcuts run: clicking Select or Wire runs `tool-select` / `tool-connect`, and the pressed state follows
 * `data-tool` on the workspace, so it stays right however the tool was changed. The rail's buttons show whether the
 * panel is folded or open (the CSS turns them into a row when it is open); Stage Containers repeats Frame and Text.
 */
import { findPaletteCommand } from './palette';
import { responsiveToolbar } from './responsiveToolbar';

const TOOL_ACTION: Record<string, string> = {
  select: 'tool-select',
  connect: 'tool-connect',
  hand: 'tool-hand',
  text: 'tool-text',
  frame: 'tool-frame',
};

export function initToolRail(): void {
  const panel = document.getElementById('palette-sidebar');
  const workspace = document.getElementById('workspace');
  if (!panel || !workspace) return;

  const toolOf = (btn: HTMLButtonElement) => btn.dataset.railTool ?? btn.dataset.paletteTool ?? '';
  const buttons = Array.from(panel.querySelectorAll<HTMLButtonElement>('[data-rail-tool], [data-palette-tool]'));
  const sync = () => {
    const tool = workspace.dataset.tool || 'select';
    for (const btn of buttons) btn.setAttribute('aria-pressed', String(toolOf(btn) === tool));
  };

  for (const btn of buttons) {
    btn.addEventListener('click', () => {
      const id = TOOL_ACTION[toolOf(btn)];
      if (id) findPaletteCommand(id)?.run();
      // On a narrow screen the panel is a drawer over the canvas the tool is about to be used on.
      if (responsiveToolbar.isNarrowScreen()) responsiveToolbar.togglePalette(true);
    });
  }
  new MutationObserver(sync).observe(workspace, { attributes: true, attributeFilter: ['data-tool'] });
  sync();
}
