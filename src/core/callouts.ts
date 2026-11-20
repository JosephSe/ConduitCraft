import type { CalloutTone, DiagramDocument, DiagramNode, DiagramNotesCard } from '../types';

/** Space between a callout and its component, and between stacked callouts. */
export const CALLOUT_GAP = 12;
export const CALLOUT_DEFAULT_WIDTH = 220;
/** The height assumed when placing a new callout, before it has been drawn. */
export const CALLOUT_EST_HEIGHT = 44;

/** The x/y each callout had after the last sync, to tell a user move from a component move. */
const lastSynced = new WeakMap<DiagramNotesCard, { x: number; y: number }>();

export function isCallout(card: DiagramNotesCard): boolean {
  return card.variant === 'callout';
}

/**
 * Keeps every callout with its component. A callout the user moved since the last sync takes a new offset;
 * any other follows its component by its offset. A callout whose component is gone is removed.
 */
export function syncCallouts(doc: DiagramDocument): void {
  if (!doc.notesCards.some(isCallout)) return;
  const nodes = new Map(doc.nodes.map((n) => [n.id, n]));
  doc.notesCards = doc.notesCards.filter((card) => {
    if (!isCallout(card)) return true;
    const node = card.anchorId ? nodes.get(card.anchorId) : undefined;
    if (!node) return false;
    const last = lastSynced.get(card);
    const moved = last !== undefined && (last.x !== card.x || last.y !== card.y);
    if (moved || !Number.isFinite(card.dx) || !Number.isFinite(card.dy)) {
      card.dx = Math.round(card.x - node.x);
      card.dy = Math.round(card.y - node.y);
    } else {
      card.x = node.x + (card.dx as number);
      card.y = node.y + (card.dy as number);
    }
    lastSynced.set(card, { x: card.x, y: card.y });
    return true;
  });
}

/** The side of the bubble its tail sits on: the side facing the component. */
export function calloutTailSide(
  card: DiagramNotesCard,
  node: DiagramNode,
  cardW: number,
  cardH: number,
): 'top' | 'bottom' | 'left' | 'right' {
  const ddx = node.x + node.width / 2 - (card.x + cardW / 2);
  const ddy = node.y + node.height / 2 - (card.y + cardH / 2);
  // Compare the gaps between the boxes, not the centre distances, so a wide bubble above stays "bottom".
  const gapX = Math.abs(ddx) - (cardW + node.width) / 2;
  const gapY = Math.abs(ddy) - (cardH + node.height) / 2;
  if (gapY >= gapX) return ddy > 0 ? 'bottom' : 'top';
  return ddx > 0 ? 'right' : 'left';
}

const TONES: readonly CalloutTone[] = ['info', 'warning', 'time'];

/**
 * The callout fields of a stored note card, for the file and code-view parsers: `{}` when it is not a callout.
 * A bad tone is dropped; offsets are rounded; a missing offset is left for `syncCallouts` to derive.
 */
export function calloutFieldsOf(
  raw: Record<string, unknown>,
): Pick<DiagramNotesCard, 'variant' | 'anchorId' | 'dx' | 'dy' | 'tone'> {
  if (raw.variant !== 'callout') return {};
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : undefined);
  const dx = num(raw.dx);
  const dy = num(raw.dy);
  return {
    variant: 'callout',
    anchorId: typeof raw.anchorId === 'string' ? raw.anchorId : '',
    ...(dx !== undefined ? { dx } : {}),
    ...(dy !== undefined ? { dy } : {}),
    ...(TONES.includes(raw.tone as CalloutTone) ? { tone: raw.tone as CalloutTone } : {}),
  };
}
