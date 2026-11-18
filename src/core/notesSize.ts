/**
 * The size of a note card. A card stores its width (absent means the default) and never its height: the height
 * follows the wrapped text of its items. On the canvas the browser lays that out; everywhere that cannot read
 * layout (fit, the minimap, frames, the vector export) uses the estimate here. Pure and DOM-free.
 */
import type { DiagramNotesCard } from '../types';

/** Width of a card that has never been resized, the studio's original `.blueprint-spec` width. */
export const NOTES_CARD_WIDTH = 404;
export const NOTES_MIN_WIDTH = 200;
export const NOTES_MAX_WIDTH = 960;

/** A whole-pixel width inside the allowed range, or undefined for anything that is not a finite number. */
export function clampNotesWidth(raw: unknown): number | undefined {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return undefined;
  return Math.max(NOTES_MIN_WIDTH, Math.min(NOTES_MAX_WIDTH, Math.round(n)));
}

/** The width a card is drawn at. */
export function notesCardWidth(card: Pick<DiagramNotesCard, 'width'>): number {
  return clampNotesWidth(card.width) ?? NOTES_CARD_WIDTH;
}

/** Vector export metrics: 12px sans items, a line every 18px, 6px between items. */
const EXPORT_CHAR_WIDTH = 6.3;
const EXPORT_TEXT_INSET = 18;
export const NOTES_EXPORT_FIRST_LINE = 54;
export const NOTES_EXPORT_LINE = 18;
export const NOTES_EXPORT_ITEM_GAP = 6;
const NOTES_EXPORT_BOTTOM = 22;

/** Break `text` into lines of at most `maxChars`, at spaces where it can and mid-word only when a word is too long. */
export function wrapNotesText(text: string, maxChars: number): string[] {
  const limit = Math.max(8, Math.floor(maxChars));
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    let rest = word;
    while (rest.length > limit) {
      if (line) {
        lines.push(line);
        line = '';
      }
      lines.push(rest.slice(0, limit));
      rest = rest.slice(limit);
    }
    if (!rest) continue;
    if (!line) line = rest;
    else if (line.length + 1 + rest.length <= limit) line += ` ${rest}`;
    else {
      lines.push(line);
      line = rest;
    }
  }
  if (line || lines.length === 0) lines.push(line);
  return lines;
}

function itemText(item: unknown): string {
  if (typeof item === 'string') return item;
  if (item && typeof item === 'object') {
    const { title, text } = item as { title?: string; text?: string };
    return (title ? `${title}: ` : '') + (text || '');
  }
  return '';
}

/** Each item's lines as the vector export draws them, at this card's width. */
export function notesExportLines(card: Pick<DiagramNotesCard, 'width' | 'items'>): string[][] {
  const maxChars = (notesCardWidth(card) - EXPORT_TEXT_INSET * 2 - 12) / EXPORT_CHAR_WIDTH;
  return (card.items ?? []).map((item) => wrapNotesText(`• ${itemText(item)}`, maxChars));
}

/** Height of the card in the vector export, which grows and shrinks with its wrapped items. */
export function notesExportHeight(card: Pick<DiagramNotesCard, 'width' | 'items'>): number {
  const lines = notesExportLines(card);
  if (lines.length === 0) return NOTES_EXPORT_FIRST_LINE;
  const total = lines.reduce((sum, l) => sum + l.length, 0);
  return NOTES_EXPORT_FIRST_LINE + (total - 1) * NOTES_EXPORT_LINE + (lines.length - 1) * NOTES_EXPORT_ITEM_GAP + NOTES_EXPORT_BOTTOM;
}

/**
 * Estimated height of the card on the canvas, from its padding, header and wrapped items (12.5px text on a 17.5px
 * line, an 8px gap between items). Used to frame the card without reading layout.
 */
export function notesCardHeight(card: Pick<DiagramNotesCard, 'width' | 'items'>): number {
  const textWidth = notesCardWidth(card) - 40 - 26;
  const maxChars = textWidth / 6.4;
  const items = card.items ?? [];
  const lines = items.reduce((sum, item) => sum + wrapNotesText(itemText(item), maxChars).length, 0);
  return Math.round(64 + lines * 17.5 + Math.max(0, items.length - 1) * 8);
}
