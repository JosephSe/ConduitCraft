/**
 * The entry-bundle side of the text outline panel. The panel itself (`outlinePanel.ts`, with the outline tree in
 * `core/outline.ts`) is a lazy chunk, loaded the first time the outline is opened. After that, every render asks it
 * to repaint; while the panel is closed nothing is loaded and the repaint costs one DOM lookup.
 */
const isOpen = (): boolean => {
  const el = document.getElementById('outline-panel');
  return Boolean(el && !el.hidden);
};

let loaded: Promise<typeof import('./outlinePanel')> | null = null;
const load = () => (loaded ??= import('./outlinePanel'));

/** Called after every render. Loads the panel only when it is already open (for example restored by a reload). */
export function paintOutline(): void {
  if (isOpen() || loaded) void load().then((m) => m.paintOutline());
}

export function toggleOutline(): void {
  void load().then((m) => m.toggleOutline());
}
