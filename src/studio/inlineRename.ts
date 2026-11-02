import { app, mutateWithHistory } from './state';
import { renderAll } from './render';
import { notify } from './toast';
import { announce } from './a11y';
import { beginInlineEdit, type InlineEditAnchor, type InlineEditTextStyle } from './inlineEdit';

/** Rename things where they are: double-click, or F2 for the current selection. Design mode only. */

function anchorOf(el: Element): InlineEditAnchor {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

/** The element's text styling, scaled to what is on screen (the stage is zoomed with a CSS transform). */
function textStyleOf(el: Element): Partial<InlineEditTextStyle> {
  const cs = getComputedStyle(el);
  return {
    fontSize: parseFloat(cs.fontSize) * app.scale,
    fontWeight: cs.fontWeight,
    fontFamily: cs.fontFamily,
    letterSpacing: cs.letterSpacing === 'normal' ? undefined : cs.letterSpacing,
    textTransform: cs.textTransform === 'none' ? undefined : cs.textTransform,
  };
}

function commitRename(what: string, mutate: () => void, value: string): void {
  if (!mutateWithHistory(mutate)) return;
  renderAll(true);
  announce(`${what} renamed to ${value || 'no label'}`);
}

function startTextEdit(
  textEl: Element | null,
  current: string,
  ariaLabel: string,
  onCommit: (value: string) => void,
): void {
  if (!textEl) return;
  beginInlineEdit({
    anchor: anchorOf(textEl),
    style: textStyleOf(textEl),
    value: current,
    ariaLabel,
    onCommit,
  });
}

export function renameNodeInline(id: string): void {
  if (app.workspaceMode !== 'design') return;
  const node = app.doc.nodes.find((n) => n.id === id);
  if (!node) return;
  if (node.locked) {
    notify(`"${node.title}" is locked. Unlock it to rename.`);
    return;
  }
  const textEl = document.querySelector(`.arch-node[data-node="${CSS.escape(id)}"] .node-title`);
  startTextEdit(textEl, node.title, 'Component name', (value) =>
    commitRename('Component', () => {
      const live = app.doc.nodes.find((n) => n.id === id);
      if (live) live.title = value;
    }, value),
  );
}

export function renameZoneInline(id: string): void {
  if (app.workspaceMode !== 'design') return;
  const zone = app.doc.zones.find((z) => z.id === id);
  if (!zone) return;
  if (zone.locked) {
    notify(`"${zone.title}" is locked. Unlock it to rename.`);
    return;
  }
  const textEl = document.querySelector(`.zone-banner[data-zone-id="${CSS.escape(id)}"] .zone-title`);
  startTextEdit(textEl, zone.title, 'Swimlane name', (value) =>
    commitRename('Swimlane', () => {
      const live = app.doc.zones.find((z) => z.id === id);
      if (live) live.title = value;
    }, value),
  );
}

export function renameNotesInline(id: string): void {
  if (app.workspaceMode !== 'design') return;
  const card = app.doc.notesCards.find((c) => c.id === id);
  if (!card) return;
  if (card.locked) {
    notify(`"${card.title}" is locked. Unlock it to rename.`);
    return;
  }
  const textEl = document.querySelector(`.blueprint-spec[data-notes-id="${CSS.escape(id)}"] .notes-title`);
  startTextEdit(textEl, card.title, 'Note title', (value) =>
    commitRename('Note', () => {
      const live = app.doc.notesCards.find((c) => c.id === id);
      if (live) live.title = value;
    }, value),
  );
}

/** Edit a wire's label. `at` is where to put the field (the double-click point); otherwise the wire's centre. */
export function renameWireInline(id: string, at?: { x: number; y: number }): void {
  if (app.workspaceMode !== 'design') return;
  const edge = app.doc.edges.find((e) => e.id === id);
  if (!edge) return;
  let anchor: InlineEditAnchor;
  if (at) {
    anchor = { left: at.x - 80, top: at.y - 12, width: 160, height: 24 };
  } else {
    const group = document.querySelector(`.conduit-group[data-edge-id="${CSS.escape(id)}"]`);
    if (!group) return;
    const r = group.getBoundingClientRect();
    anchor = { left: r.left + r.width / 2 - 80, top: r.top + r.height / 2 - 12, width: 160, height: 24 };
  }
  beginInlineEdit({
    anchor,
    value: edge.label,
    ariaLabel: 'Wire label',
    placeholder: 'Wire label',
    allowEmpty: true,
    maxLength: 80,
    onCommit: (value) =>
      commitRename('Wire', () => {
        const live = app.doc.edges.find((e) => e.id === id);
        if (live) live.label = value;
      }, value),
  });
}

/** F2 and the command palette: rename whatever is selected. Returns false if the selection can't be renamed. */
export function renameSelectionInline(): boolean {
  const sel = app.selection;
  if (sel.type === 'node') renameNodeInline(sel.id);
  else if (sel.type === 'zone') renameZoneInline(sel.id);
  else if (sel.type === 'notes') renameNotesInline(sel.id);
  else if (sel.type === 'edge') renameWireInline(sel.id);
  else return false;
  return true;
}
