/** Standalone SVG picture of a diagram. No studio CSS or external assets. */
import { describeDiagram } from '../core/describe';
import type { DiagramDocument, DiagramNode, StreamTone, SelectionTarget } from '../types';
import { relatedNodeIds, routeDiagramEdges } from '../core/layout';
import { queueCardText, streamLanes } from '../core/queues';
import { cylinderPlate, drawnShape, nodeShapePlate, pipePlate, queueDrawsPipe, sanitizeIconImage, storeDrawsBucket, storeDrawsCylinder } from '../core/nodeStyle';
import { ICON_STROKE, nodeIconShapes } from '../ui/icons';

export type SvgScheme = 'light' | 'dark';

/** The studio's colours for each scheme, resolved to plain values because an exported file has no stylesheet. */
interface Palette {
  canvas: string;
  surface: string;
  elevated: string;
  ink: string;
  secondary: string;
  muted: string;
  border: string;
  subtle: string;
  tone: Record<StreamTone, string>;
}

const PALETTES: Record<SvgScheme, Palette> = {
  light: {
    canvas: '#ECEFEE',
    surface: '#FFFFFF',
    elevated: '#F2F3F2',
    ink: '#15181C',
    secondary: '#565C64',
    muted: '#5C626A',
    border: '#D0D1D2',
    subtle: '#E5E6E6',
    tone: { blue: '#1d4ed8', emerald: '#047857', rose: '#be123c', violet: '#5b21b6', amber: '#b45309', cyan: '#0b7c9e', fuchsia: '#b5179e' },
  },
  dark: {
    canvas: '#1D1F21',
    surface: '#2A2C2F',
    elevated: '#393B3E',
    ink: '#F2F3F1',
    secondary: '#B7BBBF',
    muted: '#92979C',
    border: '#555659',
    subtle: '#3F4144',
    tone: { blue: '#60a5fa', emerald: '#34d399', rose: '#fb7185', violet: '#a78bfa', amber: '#fbbf24', cyan: '#22d3ee', fuchsia: '#f0abfc' },
  },
};

const SANS = 'ui-sans-serif, system-ui, sans-serif';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

/** `amount` (0 to 1) of colour `a` over colour `b`, both as #rrggbb. */
function mix(a: string, b: string, amount: number): string {
  const parse = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  const channel = (x: number, y: number) => Math.round(x * amount + y * (1 - amount)).toString(16).padStart(2, '0');
  return `#${channel(ar, br)}${channel(ag, bg)}${channel(ab, bb)}`;
}

function escapeXml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function notesHeight(itemCount: number): number {
  return 72 + Math.max(0, itemCount) * 40;
}

/** The outline of a node. Something someone else runs gets a dashed stroke and a small EXTERNAL label (K7). */
function nodeOutline(node: DiagramNode, pal: Palette, isSelected = false, direction: 'LR' | 'TD' = 'LR'): string {
  const outline = nodeOutlineBase(node, pal, isSelected, direction);
  if (!node.external) return outline;
  const dashed = outline.replace(/ stroke-width="/g, ' stroke-dasharray="6 4" stroke-width="');
  const label = `<text x="${node.x + node.width - 14}" y="${node.y - 6}" text-anchor="end" font-family="${SANS}" font-size="11" font-weight="600" fill="${pal.muted}">External</text>`;
  return dashed + label;
}

function nodeOutlineBase(node: DiagramNode, pal: Palette, isSelected = false, direction: 'LR' | 'TD' = 'LR'): string {
  const { x, y, width, height } = node;
  const shape = drawnShape(node.kind, node.shape) || 'card';
  const accent = pal.tone[node.accent] || pal.tone.blue;
  const strokeColor = isSelected ? accent : pal.border;
  const strokeWidth = isSelected ? '2.75' : '1.75';
  const tinted = node.kind === 'core' || node.kind === 'gate' || node.kind === 'store';
  const fill = tinted ? mix(accent, pal.surface, 0.09) : pal.surface;
  if (storeDrawsCylinder(node.kind, node.shape)) {
    const c = cylinderPlate(width, height, storeDrawsBucket(node.kind, node.shape));
    const body = mix(accent, pal.surface, 0.16);
    const lid = mix(accent, pal.surface, 0.07);
    return (
      `<g transform="translate(${x} ${y})"><path d="${c.body}" fill="${body}" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-linejoin="round"/>` +
      `<ellipse cx="${c.cx}" cy="${c.cy}" rx="${c.rx}" ry="${c.ry}" fill="${lid}" stroke="${strokeColor}" stroke-width="${strokeWidth}"/></g>`
    );
  }
  if (queueDrawsPipe(node.kind, node.shape)) {
    const p = pipePlate(width, height, streamLanes(node));
    const body = mix(accent, pal.surface, 0.1);
    const cap = mix(accent, pal.surface, 0.2);
    return (
      `<g transform="translate(${x} ${y})"><path d="${p.body}" fill="${body}" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-linejoin="round"/>` +
      (p.lanes ? `<path d="${p.lanes}" fill="none" stroke="${strokeColor}" stroke-width="1" opacity="0.4"/>` : '') +
      `<ellipse cx="${p.cx}" cy="${p.cy}" rx="${p.rx}" ry="${p.ry}" fill="${cap}" stroke="${strokeColor}" stroke-width="${strokeWidth}"/></g>`
    );
  }
  const common = `fill="${fill}" stroke="${strokeColor}" stroke-width="${strokeWidth}"`;
  let outline = '';
  if (shape === 'diamond') {
    const points = `${x + width / 2},${y} ${x + width},${y + height / 2} ${x + width / 2},${y + height} ${x},${y + height / 2}`;
    outline = `<polygon points="${points}" ${common}/>`;
    if (isSelected) {
      const pad = 4;
      const ringPoints = `${x + width / 2},${y - pad} ${x + width + pad},${y + height / 2} ${x + width / 2},${y + height + pad} ${x - pad},${y + height / 2}`;
      outline += `<polygon points="${ringPoints}" fill="none" stroke="${strokeColor}" stroke-width="2" stroke-opacity="0.45"/>`;
    }
    return outline;
  }
  if (shape === 'hexagon') {
    const points = [
      [x + width * 0.22, y],
      [x + width * 0.78, y],
      [x + width, y + height / 2],
      [x + width * 0.78, y + height],
      [x + width * 0.22, y + height],
      [x, y + height / 2],
    ]
      .map(([px, py]) => `${px},${py}`)
      .join(' ');
    outline = `<polygon points="${points}" ${common}/>`;
    if (isSelected) {
      const pad = 4;
      const ringPoints = [
        [x + width * 0.22, y - pad],
        [x + width * 0.78, y - pad],
        [x + width + pad, y + height / 2],
        [x + width * 0.78, y + height + pad],
        [x + width * 0.22, y + height + pad],
        [x - pad, y + height / 2],
      ]
        .map(([px, py]) => `${px},${py}`)
        .join(' ');
      outline += `<polygon points="${ringPoints}" fill="none" stroke="${strokeColor}" stroke-width="2" stroke-opacity="0.45"/>`;
    }
    return outline;
  }
  if (shape === 'trapezoid') {
    const plate = nodeShapePlate('trapezoid', width, height, direction);
    const pts = plate?.kind === 'polygon' ? plate.points : '';
    const shifted = pts
      .split(' ')
      .map((p) => {
        const [px, py] = p.split(',').map(Number);
        return `${px + x},${py + y}`;
      })
      .join(' ');
    outline = `<polygon points="${shifted}" ${common} stroke-linejoin="round"/>`;
    if (isSelected) outline += `<polygon points="${shifted}" fill="none" stroke="${strokeColor}" stroke-width="6" stroke-opacity="0.25" stroke-linejoin="round"/>`;
    return outline;
  }
  const rx =
    shape === 'circle' || shape === 'pill' ? Math.min(width, height) / 2 : shape === 'rounded' ? 28 : 18;
  outline = `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${rx}" ${common}/>`;
  if (isSelected) {
    outline += `<rect x="${x - 4}" y="${y - 4}" width="${width + 8}" height="${height + 8}" rx="${rx + 4}" fill="none" stroke="${strokeColor}" stroke-width="2" stroke-opacity="0.45"/>`;
  }
  return outline;
}

/** Width of `text` set in a monospace face at `size`, close enough to size a chip around it. */
function monoWidth(text: string, size: number): number {
  return Math.ceil(text.length * size * 0.6);
}

function chipMarkup(text: string, right: number, midY: number, pal: Palette): string {
  const w = monoWidth(text, 11) + 14;
  return `<rect x="${right - w}" y="${midY - 10}" width="${w}" height="20" rx="6" fill="${pal.elevated}" stroke="${pal.subtle}"/><text x="${right - w / 2}" y="${midY + 4}" text-anchor="middle" font-family="${SANS}" font-size="11" fill="${pal.secondary}">${escapeXml(text)}</text>`;
}

/** Icon in a tinted square, or the node's own picture. `size` is the square's side. */
function iconMarkup(node: DiagramNode, x: number, y: number, size: number, pal: Palette): string {
  const image = sanitizeIconImage(node.iconImage);
  if (image) {
    return `<image x="${x}" y="${y}" width="${size}" height="${size}" href="${escapeXml(image)}" xlink:href="${escapeXml(image)}"/>`;
  }
  const color = pal.tone[node.accent] || pal.tone.blue;
  const glyph = Math.round(size * 0.6);
  const offset = (size - glyph) / 2;
  return `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="8" fill="${mix(color, pal.surface, 0.14)}"/><g transform="translate(${x + offset} ${y + offset}) scale(${glyph / 24})" fill="none" stroke="${color}" stroke-width="${ICON_STROKE}" stroke-linecap="round" stroke-linejoin="round">${nodeIconShapes(node.icon)}</g>`;
}

const CENTERED = new Set(['circle', 'diamond', 'hexagon', 'trapezoid']);

/** Text of a node drawn inside a circle, diamond or hexagon: centred, stacked, no icon box. */
function centeredText(node: DiagramNode, pal: Palette): string {
  const cx = node.x + node.width / 2;
  const lines: Array<{ text: string; size: number; weight: number; color: string; mono?: boolean; gap: number }> = [];
  if (node.eyebrow) lines.push({ text: node.eyebrow, size: 11, weight: 600, color: pal.muted, mono: true, gap: 14 });
  lines.push({ text: node.title, size: 16, weight: 700, color: pal.ink, gap: 22 });
  if (node.subtitle) lines.push({ text: node.subtitle, size: 12, weight: 400, color: pal.secondary, gap: 18 });
  const foot = [node.footerLeft, queueCardText(node).chip].filter(Boolean).join('  ·  ');
  if (foot) lines.push({ text: foot, size: 11, weight: 400, color: pal.muted, mono: true, gap: 16 });
  const total = lines.reduce((sum, line) => sum + line.gap, 0);
  let y = node.y + node.height / 2 - total / 2;
  return lines
    .map((line) => {
      y += line.gap;
      return `<text x="${cx}" y="${y - 5}" text-anchor="middle" font-family="${line.mono ? MONO : SANS}" font-size="${line.size}" font-weight="${line.weight}" fill="${line.color}">${escapeXml(line.text)}</text>`;
    })
    .join('');
}

function actorMarkup(node: DiagramNode, pal: Palette): string {
  const color = pal.tone[node.accent] || pal.tone.blue;
  const cx = node.x + node.width / 2;
  const figureH = Math.min(78, node.height - 40);
  const scale = figureH / 82;
  const fx = cx - 35 * scale;
  const fy = node.y + 4;
  const captionY = fy + figureH + 22;
  const caption = escapeXml(node.title);
  const w = Math.max(60, caption.length * 7 + 20);
  const role = node.subtitle ? `<text x="${cx}" y="${captionY + 14}" text-anchor="middle" font-family="${SANS}" font-size="11" fill="${pal.secondary}">${escapeXml(node.subtitle)}</text>` : '';
  const image = sanitizeIconImage(node.iconImage);
  const figure = image
    ? `<image x="${cx - 38}" y="${fy}" width="76" height="${figureH}" href="${escapeXml(image)}" xlink:href="${escapeXml(image)}" preserveAspectRatio="xMidYMid meet"/>`
    : `<g transform="translate(${fx} ${fy}) scale(${scale})" fill="${pal.canvas}" stroke="${color}" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="35" cy="18" r="12.5"/><path d="M 14 74 C 14 53 22.5 38 35 38 C 47.5 38 56 53 56 74 C 56 77.5 53 79.5 49 79.5 H 21 C 17 79.5 14 77.5 14 74 Z"/></g>`;
  return `${figure}<rect x="${cx - w / 2}" y="${captionY - 16}" width="${w}" height="${node.subtitle ? 36 : 24}" rx="10" fill="${pal.surface}" stroke="${pal.border}"/><text x="${cx}" y="${captionY}" text-anchor="middle" font-family="${SANS}" font-size="15" font-weight="700" fill="${pal.ink}">${caption}</text>${role}`;
}

function nodeMarkup(
  node: DiagramNode,
  pal: Palette,
  selection?: SelectionTarget,
  related?: Set<string>,
  spotlight = false,
  direction: 'LR' | 'TD' = 'LR',
): string {
  const isSelected = selection?.type === 'multi' && selection.ids.includes(node.id);
  const isRelated = Boolean(related?.has(node.id));
  const isDimmed = spotlight && !isSelected && !isRelated;
  const opacityAttr = isDimmed ? ' opacity="0.28"' : '';

  if (node.kind === 'actor') {
    return `<g${opacityAttr}>${actorMarkup(node, pal)}</g>`;
  }
  const cylinder = storeDrawsCylinder(node.kind, node.shape);
  if (cylinder || CENTERED.has(drawnShape(node.kind, node.shape) ?? '')) {
    // The canvas hides a drum's eyebrow and icon, so its text is just the title, subtitle and footer.
    const text = cylinder ? { ...node, eyebrow: '', y: node.y + 10, height: node.height - 10 } : node;
    return `<g${opacityAttr}>${nodeOutline(node, pal, isSelected, direction)}${centeredText(text, pal)}</g>`;
  }

  // A pipe keeps its text clear of the rounded ends and the outlet cap.
  const outlineNode = node;
  if (queueDrawsPipe(node.kind, node.shape)) {
    const rx = pipePlate(node.width, node.height).rx;
    // The studio hides the subtitle inside a pipe, so the export does too.
    node = { ...node, x: node.x + rx, width: node.width - 3 * rx, subtitle: '' };
  }
  // The 112-high cache and scheduler cards drop the subtitle so the footer chip fits, as the studio does.
  if (node.kind === 'cache' || node.kind === 'scheduler') node = { ...node, subtitle: '' };
  const { x, y, width, height } = node;
  const isClient = node.kind === 'client';
  const right = x + width - 16;
  const titleSize = isClient ? 15 : node.kind === 'core' || node.kind === 'gate' || node.kind === 'store' ? 20 : 18;
  const iconSize = isClient ? 28 : 32;
  const topMid = y + 14 + iconSize / 2;
  // The corner holds the eyebrow, or on a client the chip.
  const corner = isClient
    ? node.chip
      ? chipMarkup(node.chip, right, topMid, pal)
      : ''
    : node.eyebrow
      ? `<text x="${right}" y="${topMid + 4}" text-anchor="end" font-family="${SANS}" font-size="11" font-weight="600" fill="${pal.muted}">${escapeXml(node.eyebrow)}</text>`
      : '';
  const titleY = y + 14 + iconSize + 26;
  const card = queueCardText(node);
  const hasFooter = !isClient && (card.footer || card.chip) && height >= titleY - y + (node.subtitle ? 22 : 0) + 38;
  const footerMid = y + height - 22;
  const footer = hasFooter
    ? `<line x1="${x + 16}" y1="${y + height - 40}" x2="${right}" y2="${y + height - 40}" stroke="${pal.subtle}"/>` +
      (card.footer
        ? `<text x="${x + 16}" y="${footerMid + 4}" font-family="${MONO}" font-size="11" fill="${pal.muted}">${escapeXml(card.footer)}</text>`
        : '') +
      (card.chip ? chipMarkup(card.chip, right, footerMid, pal) : '')
    : '';
  const sub = node.subtitle
    ? `<text x="${x + 16}" y="${titleY + 22}" font-family="${SANS}" font-size="12.5" fill="${pal.secondary}">${escapeXml(node.subtitle)}</text>`
    : '';

  return [
    `<g${opacityAttr}>`,
    nodeOutline(outlineNode, pal, isSelected, direction),
    iconMarkup(node, x + 14, y + 14, iconSize, pal),
    corner,
    `<text x="${x + 16}" y="${titleY}" font-family="${SANS}" font-size="${titleSize}" font-weight="700" fill="${pal.ink}">${escapeXml(node.title)}</text>`,
    sub,
    footer,
    `</g>`,
  ].join('');
}

/** The document's colour legend as a small card in the bottom-left corner (F-26). Empty without a legend. */
function legendMarkup(doc: DiagramDocument, height: number, pal: Palette): string {
  const entries = doc.legend ?? [];
  if (!entries.length) return '';
  const rowHeight = 22;
  const boxHeight = 34 + entries.length * rowHeight;
  const y = Math.max(8, height - boxHeight - 16);
  const rows = entries
    .map((entry, i) => {
      const cy = y + 40 + i * rowHeight;
      const text = entry.description ? `${entry.label} — ${entry.description}` : entry.label;
      return `<circle cx="34" cy="${cy - 4}" r="5" fill="${pal.tone[entry.tone]}"/><text x="48" y="${cy}" font-family="${SANS}" font-size="12" fill="${pal.secondary}">${escapeXml(text)}</text>`;
    })
    .join('');
  return `<g><rect x="16" y="${y}" width="280" height="${boxHeight}" rx="12" fill="${pal.surface}" stroke="${pal.border}"/><text x="28" y="${y + 20}" font-family="${SANS}" font-size="11" font-weight="700" fill="${pal.tone.blue}">Legend</text>${rows}</g>`;
}

export function renderDiagramSvg(
  doc: DiagramDocument,
  frame?: { dashOffset: number },
  selection?: SelectionTarget,
  scheme: SvgScheme = 'light',
): string {
  const pal = PALETTES[scheme];
  const width = Math.max(1, doc.stageWidth);
  const height = Math.max(1, doc.stageHeight);
  const routed = routeDiagramEdges(doc);

  const isMulti = selection?.type === 'multi';
  const selectedNodes = new Set(isMulti ? selection.ids : []);
  const multiEdges = new Set(isMulti ? (selection.edgeIds ?? []) : []);
  const excludedEdges = new Set(isMulti ? (selection.excludedEdgeIds ?? []) : []);
  const selectedZones = new Set(isMulti ? (selection.zoneIds ?? []) : []);
  const selectedNotes = new Set(isMulti ? (selection.notesIds ?? []) : []);

  const hasEdges = multiEdges.size > 0;
  const spotlight =
    isMulti &&
    (selectedNodes.size > 0 || hasEdges) &&
    (selectedNodes.size > 1 || hasEdges || excludedEdges.size > 0);
  const related = spotlight ? relatedNodeIds(doc, selection.ids) : new Set<string>();

  const markers = (Object.keys(pal.tone) as StreamTone[])
    .map(
      (tone) =>
        `<marker id="arrow-${tone}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 1.5 L 8.5 5 L 0 8.5 z" fill="${pal.tone[tone]}"/></marker>`,
    )
    .join('');

  const frames = [...(doc.frames ?? [])]
    .sort((a, b) => b.width * b.height - a.width * a.height)
    .map((f) => {
      const color = pal.tone[f.tone];
      // A 1 px outline, a light tint, and the title on a tab that breaks the top-left corner (8.1).
      const tabWidth = Math.min(f.width - 24, Math.round(f.title.length * 7 + 20));
      return `<g><rect x="${f.x}" y="${f.y}" width="${f.width}" height="${f.height}" rx="10" fill="${color}" fill-opacity="0.06" stroke="${color}" stroke-width="1"/><rect x="${f.x + 12}" y="${f.y - 12}" width="${tabWidth}" height="24" rx="8" fill="${pal.surface}" stroke="${color}" stroke-width="1"/><text x="${f.x + 22}" y="${f.y + 4}" font-family="${SANS}" font-size="12" font-weight="700" fill="${color}">${escapeXml(f.title)}</text></g>`;
    })
    .join('');

  const zones = doc.zones
    .map((zone) => {
      const isSel = isMulti && selectedZones.has(zone.id);
      // A column: a wash between two hairlines, with the number in muted grey and the title at 15/600 (8.1).
      const x2 = zone.x + zone.width;
      const edge = isSel ? pal.tone.blue : pal.border;
      const edgeWidth = isSel ? 2 : 1;
      return `<g><rect x="${zone.x}" y="0" width="${zone.width}" height="${height}" fill="${pal.surface}" fill-opacity="0.34"/><path d="M${zone.x} 0V${height}M${x2} 0V${height}" stroke="${edge}" stroke-width="${edgeWidth}" fill="none"/><text x="${zone.x + 16}" y="30" font-family="${SANS}" font-size="15" font-weight="600" fill="${pal.ink}"><tspan font-family="${MONO}" fill="${pal.muted}">${escapeXml(zone.number)}</tspan> ${escapeXml(zone.title)}</text></g>`;
    })
    .join('');

  const notes = doc.notesCards
    .map((card) => {
      const isSel = isMulti && selectedNotes.has(card.id);
      if (card.variant === 'text') {
        return `<text x="${card.x + 8}" y="${card.y + 22}" font-family="${SANS}" font-size="16" font-weight="600" fill="${pal.ink}">${escapeXml(card.title)}</text>`;
      }
      const stroke = isSel ? ` stroke="${pal.tone.blue}" stroke-width="2.5"` : ` stroke="${pal.border}"`;
      const boxHeight = notesHeight(card.items.length);
      const items = (card.items || [])
        .map((item, idx) => {
          const itemText =
            typeof item === 'string'
              ? item
              : item && typeof item === 'object'
                ? (item.title ? `${item.title}: ` : '') + (item.text || '')
                : '';
          return `<text x="${card.x + 18}" y="${card.y + 54 + idx * 24}" font-family="${SANS}" font-size="12" fill="${pal.secondary}">• ${escapeXml(itemText)}</text>`;
        })
        .join('');
      // A sheet with a folded top-right corner (8.1), sans throughout.
      const { x, y } = card;
      const outline = `M${x} ${y}H${x + 386}L${x + 404} ${y + 18}V${y + boxHeight}H${x}Z`;
      const fold = `<path d="M${x + 386} ${y}V${y + 18}H${x + 404}" fill="${pal.border}" fill-opacity="0.35" stroke="${pal.border}"/>`;
      return `<g><path d="${outline}" fill="${pal.surface}"${stroke}/>${fold}<text x="${x + 18}" y="${y + 28}" font-family="${SANS}" font-size="13" font-weight="600" fill="${pal.ink}">${escapeXml(card.title)}</text>${items}</g>`;
    })
    .join('');

  const wires = routed
    .map((edge) => {
      const color = pal.tone[edge.tone] || pal.tone.blue;
      const touches = selectedNodes.has(edge.from) || selectedNodes.has(edge.to);
      const isExplicit = multiEdges.has(edge.id);
      const isExcluded = excludedEdges.has(edge.id);
      const active = isMulti ? (touches || isExplicit) && !isExcluded : true;
      const isSel = isMulti && isExplicit && !isExcluded;
      const wireOpacity = isMulti && spotlight && !active ? ' opacity="0.16"' : '';
      const strokeWidth = isSel ? '3.25' : active && isMulti ? '2.75' : '2.25';
      const glow = isSel
        ? `<path d="${edge.pathD}" fill="none" stroke="${color}" stroke-width="12" stroke-opacity="0.32"/>`
        : '';

      const label =
        edge.label && edge.badgePos
          ? (() => {
              const w = monoWidth(edge.label, 11) + 20;
              const [bx, by] = edge.badgePos;
              return `<rect x="${bx - w / 2}" y="${by - 11}" width="${w}" height="22" rx="11" fill="${pal.surface}" stroke="${pal.subtle}"/><text x="${bx}" y="${by + 4}" text-anchor="middle" font-family="${SANS}" font-size="11" font-weight="600" fill="${pal.ink}">${escapeXml(edge.label)}</text>`;
            })()
          : '';
      const isBoth = edge.flow === 'both';
      if (isBoth) {
        const dash1 =
          frame && edge.animated !== false
            ? ` stroke-dasharray="6 16" stroke-dashoffset="${frame.dashOffset}"`
            : '';
        const dash2 =
          frame && edge.animated !== false
            ? ` stroke-dasharray="6 16" stroke-dashoffset="${-frame.dashOffset}"`
            : '';
        const stream2 =
          frame && edge.animated !== false
            ? `<path d="${edge.pathD}" fill="none" stroke="${color}" stroke-width="${strokeWidth}"${dash2}/>`
            : '';
        return `<g${wireOpacity}>${glow}<path d="${edge.pathD}" fill="none" stroke="${color}" stroke-width="${strokeWidth}"${dash1}/>${stream2}${label}</g>`;
      }
      const dash =
        frame && edge.animated !== false
          ? ` stroke-dasharray="8 10" stroke-dashoffset="${frame.dashOffset}"`
          : edge.sync === 'async'
            ? ' stroke-dasharray="7 6"'
            : '';
      return `<g${wireOpacity}>${glow}<path d="${edge.pathD}" fill="none" stroke="${color}" stroke-width="${strokeWidth}"${dash} marker-end="url(#arrow-${edge.tone})"/>${label}</g>`;
    })
    .join('');

  const nodes = doc.nodes
    .map((node) => nodeMarkup(node, pal, selection, related, spotlight, doc.direction))
    .join('');

  const legend = legendMarkup(doc, height, pal);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-stretch="88%" role="img" aria-labelledby="diagram-title diagram-desc">
  <title id="diagram-title">${escapeXml(doc.title.trim() || 'Untitled diagram')}</title>
  <desc id="diagram-desc">${escapeXml(describeDiagram(doc))}</desc>
  <defs>${markers}</defs>
  <rect width="100%" height="100%" fill="${pal.canvas}"/>
  ${frames}
  ${zones}
  ${notes}
  ${wires}
  ${nodes}
  ${legend}
</svg>`;
}

export interface PngExportEstimate {
  scale: number;
  width: number;
  height: number;
  bytes: number;
  formattedSize: string;
  summary: string;
}

/**
 * Calculates PNG export dimensions and estimated compressed file size for a given scale factor.
 * In typical 2D technical diagrams with solid color fills, vector lines, and text,
 * PNG DEFLATE achieves ~0.20 bytes per pixel.
 */
export function estimatePngExport(
  stageWidth: number,
  stageHeight: number,
  scale: number = 1,
): PngExportEstimate {
  const s = Math.max(1, Number(scale) || 1);
  const width = Math.max(1, Math.round(stageWidth * s));
  const height = Math.max(1, Math.round(stageHeight * s));
  const totalPixels = width * height;
  const bytes = Math.round(totalPixels * 0.2);

  let formattedSize: string;
  if (bytes < 1024 * 1024) {
    const kb = Math.max(1, Math.round(bytes / 1024));
    formattedSize = `~${kb} KB`;
  } else {
    const mb = (bytes / (1024 * 1024)).toFixed(1);
    formattedSize = `~${mb} MB`;
  }

  const summary = `${formattedSize} (${width} × ${height} px)`;
  return {
    scale: s,
    width,
    height,
    bytes,
    formattedSize,
    summary,
  };
}
