/**
 * The size of a note card. A card stores its width (absent means the default) and never its height: the height
 * follows the wrapped text of its items. On the canvas the browser lays that out; everywhere that cannot read
 * layout (fit, the minimap, frames, the vector export) uses the estimate here. Pure and DOM-free.
 */
import type { DiagramNotesCard, StreamTone } from '../types';

/** Width of a card that has never been resized, the studio's original `.blueprint-spec` width. */
export const NOTES_CARD_WIDTH = 404;
export const NOTES_MIN_WIDTH = 200;
export const NOTES_MAX_WIDTH = 960;

/** A text label can be much narrower than a note: a single short word. */
export const TEXT_MIN_WIDTH = 40;
export const TEXT_FONT_SIZE = 16;
export const TEXT_MIN_FONT_SIZE = 8;
export const TEXT_MAX_FONT_SIZE = 96;

function finite(raw: unknown): number {
  return typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
}

/** A whole-pixel width inside the allowed range, or undefined for anything that is not a finite number. */
export function clampNotesWidth(raw: unknown, min = NOTES_MIN_WIDTH): number | undefined {
  const n = finite(raw);
  if (!Number.isFinite(n)) return undefined;
  return Math.max(min, Math.min(NOTES_MAX_WIDTH, Math.round(n)));
}

/** A text label's width: like a note's, but it may be as narrow as {@link TEXT_MIN_WIDTH}. */
export function clampTextWidth(raw: unknown): number | undefined {
  return clampNotesWidth(raw, TEXT_MIN_WIDTH);
}

/** A whole-pixel font size for a text label, or undefined for anything that is not a finite number. */
export function clampTextFontSize(raw: unknown): number | undefined {
  const n = finite(raw);
  if (!Number.isFinite(n)) return undefined;
  return Math.max(TEXT_MIN_FONT_SIZE, Math.min(TEXT_MAX_FONT_SIZE, Math.round(n)));
}

/** The font size a text label is drawn at. */
export function textFontSize(card: Pick<DiagramNotesCard, 'fontSize'>): number {
  return clampTextFontSize(card.fontSize) ?? TEXT_FONT_SIZE;
}

/**
 * Estimated size of a text label, for everything that cannot read layout. Without a width it is as wide as its
 * words (about 0.56em a character, plus its 8px side padding); with one, the words wrap inside it.
 */
export function textLabelRect(card: Pick<DiagramNotesCard, 'x' | 'y' | 'title' | 'width' | 'fontSize'>): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const size = textFontSize(card);
  const charW = size * 0.56;
  const natural = Math.max(TEXT_MIN_WIDTH, Math.ceil(card.title.length * charW) + 16);
  const width = clampTextWidth(card.width) ?? Math.min(natural, NOTES_CARD_WIDTH);
  const lines = wrapNotesText(card.title, (width - 16) / charW).length;
  return { x: card.x, y: card.y, width, height: Math.round(lines * size * 1.3 + 8) };
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

const TEXT_TONES: readonly StreamTone[] = ['blue', 'emerald', 'rose', 'violet', 'amber', 'cyan', 'fuchsia'];

/** A text label's width, font size and colour read from a file, keeping only the valid ones. */
export function textStyleOf(raw: { width?: unknown; fontSize?: unknown; color?: unknown }): Pick<
  DiagramNotesCard,
  'width' | 'fontSize' | 'color'
> {
  const width = clampTextWidth(raw.width);
  const fontSize = clampTextFontSize(raw.fontSize);
  const color = TEXT_TONES.find((t) => t === raw.color);
  return {
    ...(width !== undefined ? { width } : {}),
    ...(fontSize !== undefined && fontSize !== TEXT_FONT_SIZE ? { fontSize } : {}),
    ...(color ? { color } : {}),
  };
}
