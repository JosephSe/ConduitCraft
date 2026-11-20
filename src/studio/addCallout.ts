import { app, pushHistory, setSelection } from './state';
import { renderAll } from './render';
import { renameNotesInline } from './inlineRename';
import { createCalloutCard } from '../core/calloutPlacement';
import { expandStageToFit } from '../core/layout';

/**
 * Attach a new info callout to a component, above it, and open its text for typing (the placeholder words are
 * selected, so typing replaces them).
 */
export function addCalloutTo(nodeId: string): void {
  const node = app.doc.nodes.find((n) => n.id === nodeId);
  if (!node || app.workspaceMode !== 'design') return;
  pushHistory();
  const card = createCalloutCard(app.doc, node, 'Callout');
  app.doc.notesCards.push(card);
  expandStageToFit(app.doc);
  setSelection({ type: 'notes', id: card.id });
  renderAll(true);
  requestAnimationFrame(() => renameNotesInline(card.id));
}
