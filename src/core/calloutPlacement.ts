import type { DiagramDocument, DiagramNode, DiagramNotesCard } from '../types';
import { nextUid } from '../templates/presets';
import { CALLOUT_DEFAULT_WIDTH, CALLOUT_EST_HEIGHT, CALLOUT_GAP } from './callouts';

/**
 * A callout bubble for `node`, above it and centred, stacked over the callouts already above it. With no room above
 * (the top of the sheet) it goes below, under any callouts already there. The card is not added to the document.
 * Only "Add callout" uses this, so it loads with that command, outside the entry bundle.
 */
export function createCalloutCard(doc: DiagramDocument, node: DiagramNode, text = ''): DiagramNotesCard {
  const x = Math.round(node.x + node.width / 2 - CALLOUT_DEFAULT_WIDTH / 2);
  const ys = doc.notesCards.filter((c) => c.variant === 'callout' && c.anchorId === node.id).map((c) => c.y);
  const above = ys.filter((y) => y < node.y);
  const below = ys.filter((y) => y >= node.y);
  let y = Math.round((above.length ? Math.min(...above) : node.y) - CALLOUT_GAP - CALLOUT_EST_HEIGHT);
  if (y < 16) y = Math.round((below.length ? Math.max(...below) + CALLOUT_EST_HEIGHT : node.y + node.height) + CALLOUT_GAP);
  return {
    id: nextUid('callout'),
    title: text,
    code: '',
    x,
    y,
    items: [],
    variant: 'callout',
    anchorId: node.id,
    dx: x - node.x,
    dy: y - node.y,
  };
}
