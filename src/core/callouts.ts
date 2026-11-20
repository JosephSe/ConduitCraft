import type { CalloutTone, DiagramDocument, DiagramNode, DiagramNotesCard } from '../types';
import { clampNotesWidth } from './notesSize';

/** Space between a callout and its component, and between stacked callouts. */
export const CALLOUT_GAP = 12;
export const CALLOUT_DEFAULT_WIDTH = 220;
/** The height assumed when placing a new callout, before it has been drawn. */
export const CALLOUT_EST_HEIGHT = 44;

/** The icon drawn before a callout's text, by tone. */
export const CALLOUT_ICONS: Record<CalloutTone, string> = { info: 'ⓘ', warning: '⚠', time: '⏱' };

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

/**
 * Where the tail sits along the bubble's edge (px from the bubble's left or top): lined up with the component's
 * middle, but clear of the 10 px rounded corners (12 px from each end), or centred on a side too short for that.
 * The tail is a 10 px square, so this is its near edge.
 */
export function calloutTailAt(
  card: DiagramNotesCard,
  node: DiagramNode,
  side: 'top' | 'bottom' | 'left' | 'right',
  cardW: number,
  cardH: number,
): number {
  const across = side === 'top' || side === 'bottom';
  const middle = across ? node.x + node.width / 2 - card.x : node.y + node.height / 2 - card.y;
  const size = across ? cardW : cardH;
  return Math.round(size < 34 ? (size - 10) / 2 : Math.max(12, Math.min(size - 22, middle - 5)));
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

/** The ids of the callouts attached to any of `nodeIds`, so copying a component takes its callouts along. */
export function calloutIdsOn(doc: Pick<DiagramDocument, 'notesCards'>, nodeIds: ReadonlySet<string>): string[] {
  return doc.notesCards.filter((c) => isCallout(c) && c.anchorId && nodeIds.has(c.anchorId)).map((c) => c.id);
}

/**
 * Copies of the callouts on the components in `idMap` (original id to copy id), attached to the copies at the same
 * offset. Callouts in `skip` are being copied by the caller already. The copies are not added to the document.
 */
export function calloutCopiesFor(
  doc: { notesCards?: DiagramNotesCard[] },
  idMap: ReadonlyMap<string, string>,
  skip: ReadonlySet<string>,
  newId: (prefix: string) => string,
): DiagramNotesCard[] {
  return (doc.notesCards ?? []).flatMap((c) => {
    const anchor = isCallout(c) && c.anchorId && !skip.has(c.id) ? idMap.get(c.anchorId) : undefined;
    if (!anchor) return [];
    const copy = structuredClone(c);
    copy.id = newId('callout');
    copy.anchorId = anchor;
    delete copy.groupId;
    return [copy];
  });
}

/** A callout's tone, `info` when it has none or an unknown one. */
export const calloutTone = (card: DiagramNotesCard): CalloutTone => (TONES.includes(card.tone!) ? card.tone! : 'info');

/** A callout's drawn width: its stored width, clamped, or the default. */
export const calloutWidth = (card: DiagramNotesCard): number => clampNotesWidth(card.width) ?? CALLOUT_DEFAULT_WIDTH;

/** Drop a callout's tone and width when they are not a known tone and a number (a pasted clip is untrusted). */
export function cleanCallout(card: DiagramNotesCard): void {
  if (card.tone !== undefined && calloutTone(card) !== card.tone) delete card.tone;
  const width = clampNotesWidth(card.width);
  if (width === undefined) delete card.width;
  else card.width = width;
}
