/** Central registry of application shortcuts, commands, and guide items. */

export interface ShortcutItem {
  keys: string[];
  description: string;
  category: 'Drafting & Selection' | 'Navigation & View' | 'Document & Simulation';
}

export function isMac(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
}

export function getModifierKey(): string {
  return isMac() ? '⌘' : 'Ctrl';
}

export const SHORTCUTS: ShortcutItem[] = [
  // Drafting & Selection
  { keys: ['⌘', 'Z'], description: 'Undo last action', category: 'Drafting & Selection' },
  { keys: ['⌘', '⇧', 'Z'], description: 'Redo last action', category: 'Drafting & Selection' },
  { keys: ['⌘', 'C'], description: 'Copy selected components', category: 'Drafting & Selection' },
  { keys: ['⌘', 'V'], description: 'Paste components from clipboard', category: 'Drafting & Selection' },
  { keys: ['⌘', 'D'], description: 'Duplicate selection', category: 'Drafting & Selection' },
  { keys: ['⌘', 'G'], description: 'Group selected components', category: 'Drafting & Selection' },
  { keys: ['⌘', '⇧', 'G'], description: 'Ungroup components', category: 'Drafting & Selection' },
  { keys: ['⌘', 'L'], description: 'Lock or unlock selected components', category: 'Drafting & Selection' },
  { keys: [']'], description: 'Bring selection to front', category: 'Drafting & Selection' },
  { keys: ['['], description: 'Send selection to back', category: 'Drafting & Selection' },
  { keys: ['⌘', ']'], description: 'Bring selection forward', category: 'Drafting & Selection' },
  { keys: ['⌘', '['], description: 'Send selection backward', category: 'Drafting & Selection' },
  { keys: ['⌘', 'A'], description: 'Select all components', category: 'Drafting & Selection' },
  { keys: ['Del', 'Backspace'], description: 'Delete selection', category: 'Drafting & Selection' },
  { keys: ['Shift', 'Click'], description: 'Toggle node in multi-selection', category: 'Drafting & Selection' },
  { keys: ['Shift', 'Drag'], description: 'Marquee box-select components', category: 'Drafting & Selection' },
  { keys: ['Arrow keys'], description: 'Nudge focused/selected node 16px', category: 'Drafting & Selection' },
  { keys: ['Shift', 'Arrow'], description: 'Fine-nudge focused node 4px', category: 'Drafting & Selection' },
  { keys: ['Esc'], description: 'Clear selection or Connect mode', category: 'Drafting & Selection' },

  // Navigation & View
  { keys: ['['], description: 'Toggle component palette (or send to back)', category: 'Navigation & View' },
  { keys: [']'], description: 'Toggle properties inspector (or bring to front)', category: 'Navigation & View' },
  { keys: ['⌘', '\\'], description: 'Toggle component palette rail', category: 'Navigation & View' },
  { keys: ['P'], description: 'Toggle presentation mode & guided tour', category: 'Navigation & View' },
  { keys: ['⌘', 'F'], description: 'Find & focus node on canvas', category: 'Navigation & View' },
  { keys: ['⌘', 'K'], description: 'Open command palette', category: 'Navigation & View' },
  { keys: ['Wheel / Trackpad'], description: 'Zoom into pointer position', category: 'Navigation & View' },
  { keys: ['Drag Canvas'], description: 'Pan stage workspace', category: 'Navigation & View' },
  { keys: ['+', '−'], description: 'Zoom in or out', category: 'Navigation & View' },
  { keys: ['Fit'], description: 'Fit whole architecture to viewport', category: 'Navigation & View' },
  { keys: ['Fit Selection'], description: 'Zoom and center selected items', category: 'Navigation & View' },
  { keys: ['Click Minimap'], description: 'Center canvas on clicked location', category: 'Navigation & View' },

  // Document & Simulation
  { keys: ['?'], description: 'Open this keyboard shortcuts cheat-sheet', category: 'Document & Simulation' },
  { keys: ['Enter', 'Space'], description: 'Drop focused stencil or activate wire', category: 'Document & Simulation' },
  { keys: ['Tab'], description: 'Navigate focus through ports and wires', category: 'Document & Simulation' },
];

/** Render shortcuts into categorized HTML markup. */
export function renderShortcutsHtml(): string {
  const mac = isMac();
  const categories = ['Drafting & Selection', 'Navigation & View', 'Document & Simulation'] as const;

  return `
    <div class="shortcuts-grid">
      ${categories
        .map((cat) => {
          const items = SHORTCUTS.filter((s) => s.category === cat);
          return `
          <div class="shortcuts-category">
            <h3 class="shortcuts-category-title">${cat}</h3>
            ${items
              .map((item) => {
                const renderedKeys = item.keys
                  .map((k) => {
                    let label = k;
                    if (!mac) {
                      if (k === '⌘') label = 'Ctrl';
                      else if (k === '⇧') label = 'Shift';
                      else if (k === '⌥') label = 'Alt';
                    }
                    return `<kbd>${label}</kbd>`;
                  })
                  .join(' + ');
                return `
                <div class="shortcut-row">
                  <span class="shortcut-desc">${item.description}</span>
                  <span class="shortcut-keys">${renderedKeys}</span>
                </div>
              `;
              })
              .join('')}
          </div>
        `;
        })
        .join('')}
    </div>
  `;
}
