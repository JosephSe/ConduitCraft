import type { DiagramDocument } from '../types';

/** The strip every picture export carries along its bottom edge (8.7): mark, title, system tag, status, page and date. */
export interface TitleBlock {
  title: string;
  systemTag?: string;
  statusLabel?: string;
  /** "2 of 3"; absent for a one-page file. */
  page?: string;
  date: string;
}

export const TITLE_BLOCK_HEIGHT = 28;

const COLOURS = {
  light: { fill: '#FFFFFF', hair: '#D0D1D2', ink: '#15181C', secondary: '#565C64' },
  dark: { fill: '#2A2C2F', hair: '#555659', ink: '#F2F3F1', secondary: '#B7BBBF' },
} as const;

const SANS = 'Instrument Sans, ui-sans-serif, system-ui, sans-serif';

let enabled = true;
/** The export dialog's "Title block" switch. On by default (Q7). */
export function setTitleBlockEnabled(on: boolean): void {
  enabled = on;
}
export function titleBlockEnabled(): boolean {
  return enabled;
}

function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function titleBlockFor(
  doc: DiagramDocument,
  page?: { index: number; count: number },
  now: Date = new Date(),
): TitleBlock {
  return {
    title: doc.title.trim() || 'Untitled diagram',
    systemTag: doc.systemTag,
    statusLabel: doc.statusLabel,
    page: page && page.count > 1 ? [doc.pageTitle?.trim(), `${page.index + 1} of ${page.count}`].filter(Boolean).join(' · ') : undefined,
    date: now.toISOString().slice(0, 10),
  };
}

/** The strip as an SVG group, `width` wide, sitting on the bottom edge of a picture `height` tall. */
export function titleBlockSvg(block: TitleBlock, width: number, height: number, scheme: 'light' | 'dark'): string {
  const c = COLOURS[scheme];
  const y = height - TITLE_BLOCK_HEIGHT;
  const cells = [block.title, block.systemTag, block.statusLabel, block.page, block.date].filter((v): v is string => Boolean(v));
  const first = cells[0];
  const rest = cells.slice(1);
  const restWidths = rest.map((text) => Math.min(220, Math.max(64, text.length * 6.6 + 24)));
  const used = restWidths.reduce((a, b) => a + b, 0);
  const markWidth = TITLE_BLOCK_HEIGHT;
  const out: string[] = [
    `<g data-title-block="true" font-family="${SANS}" font-size="11">`,
    `<rect x="0" y="${y}" width="${width}" height="${TITLE_BLOCK_HEIGHT}" fill="${c.fill}"/>`,
    `<line x1="0" y1="${y + 0.5}" x2="${width}" y2="${y + 0.5}" stroke="${c.hair}"/>`,
    // The mark: a wire between two nodes.
    `<g stroke="${c.ink}" stroke-width="1.5" fill="none"><rect x="6" y="${y + 9}" width="5" height="5" rx="1"/><rect x="17" y="${y + 14}" width="5" height="5" rx="1"/><path d="M11 ${y + 11.5} H14 V${y + 16.5} H17"/></g>`,
    `<line x1="${markWidth}" y1="${y}" x2="${markWidth}" y2="${y + TITLE_BLOCK_HEIGHT}" stroke="${c.hair}"/>`,
    `<text x="${markWidth + 10}" y="${y + 18}" fill="${c.ink}" font-weight="600">${esc(first)}</text>`,
  ];
  let x = width - used;
  rest.forEach((text, i) => {
    out.push(
      `<line x1="${x}" y1="${y}" x2="${x}" y2="${y + TITLE_BLOCK_HEIGHT}" stroke="${c.hair}"/>`,
      `<text x="${x + 12}" y="${y + 18}" fill="${c.secondary}">${esc(text)}</text>`,
    );
    x += restWidths[i];
  });
  out.push('</g>');
  return out.join('');
}
