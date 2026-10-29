/** Standalone SVG picture of a diagram. No studio CSS or external assets. */
import type { DiagramDocument, DiagramNode, StreamTone, SelectionTarget } from '../types';
import { relatedNodeIds, routeDiagramEdges } from '../core/layout';
import { sanitizeIconImage } from '../core/nodeStyle';

const TONE_HEX: Record<StreamTone, string> = {
  blue: '#1d4ed8',
  emerald: '#047857',
  rose: '#be123c',
  violet: '#5b21b6',
  amber: '#b45309',
};

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

function nodeOutline(node: DiagramNode, isSelected = false): string {
  const { x, y, width, height } = node;
  const shape = node.shape || 'card';
  const strokeColor = TONE_HEX[node.accent] || TONE_HEX.blue;
  const strokeWidth = isSelected ? '2.75' : '1.75';
  const common = `fill="#ffffff" stroke="${strokeColor}" stroke-width="${strokeWidth}"`;
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
  const rx =
    shape === 'circle' || shape === 'pill' ? Math.min(width, height) / 2 : shape === 'rounded' ? 28 : 18;
  outline = `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${rx}" ${common}/>`;
  if (isSelected) {
    outline += `<rect x="${x - 4}" y="${y - 4}" width="${width + 8}" height="${height + 8}" rx="${rx + 4}" fill="none" stroke="${strokeColor}" stroke-width="2" stroke-opacity="0.45"/>`;
  }
  return outline;
}

function nodeMarkup(
  node: DiagramNode,
  selection?: SelectionTarget,
  related?: Set<string>,
  spotlight = false,
): string {
  const isSelected = selection?.type === 'multi' && selection.ids.includes(node.id);
  const isRelated = Boolean(related?.has(node.id));
  const isDimmed = spotlight && !isSelected && !isRelated;

  const image = sanitizeIconImage(node.iconImage);
  const icon = image
    ? `<image x="${node.x + 14}" y="${node.y + 14}" width="28" height="28" href="${escapeXml(image)}" xlink:href="${escapeXml(image)}"/>`
    : '';
  const titleX = node.x + (image ? 50 : 16);
  const title = escapeXml(node.title);
  const subtitle = node.subtitle ? escapeXml(node.subtitle) : '';
  const opacityAttr = isDimmed ? ' opacity="0.28"' : '';

  return [
    `<g${opacityAttr}>`,
    nodeOutline(node, isSelected),
    icon,
    `<text x="${titleX}" y="${node.y + 36}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="16" font-weight="700" fill="#0b1324">${title}</text>`,
    subtitle
      ? `<text x="${titleX}" y="${node.y + 58}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="12" fill="#3e4e68">${subtitle}</text>`
      : '',
    `</g>`,
  ].join('');
}

export function renderDiagramSvg(
  doc: DiagramDocument,
  frame?: { dashOffset: number },
  selection?: SelectionTarget,
): string {
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

  const markers = (Object.keys(TONE_HEX) as StreamTone[])
    .map(
      (tone) =>
        `<marker id="arrow-${tone}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 1.5 L 8.5 5 L 0 8.5 z" fill="${TONE_HEX[tone]}"/></marker>`,
    )
    .join('');

  const zones = doc.zones
    .map((zone) => {
      const isSel = isMulti && selectedZones.has(zone.id);
      const stroke = isSel ? ' stroke="#1d4ed8" stroke-width="2.5"' : '';
      const fillOpacity = isSel ? '0.14' : '0.05';
      const numColor = isSel ? '#1d4ed8' : '#596b87';
      return `<g><rect x="${zone.x}" y="0" width="${zone.width}" height="${height}" fill="#1d4ed8" fill-opacity="${fillOpacity}"${stroke}/><text x="${zone.x + 16}" y="32" font-family="ui-sans-serif, system-ui, sans-serif" font-size="13" font-weight="700" fill="${numColor}">${escapeXml(zone.number)} ${escapeXml(zone.title)}</text></g>`;
    })
    .join('');

  const notes = doc.notesCards
    .map((card) => {
      const isSel = isMulti && selectedNotes.has(card.id);
      const stroke = isSel ? ' stroke="#1d4ed8" stroke-width="2.5"' : ' stroke="#b6c5db" stroke-dasharray="5 4"';
      const boxHeight = notesHeight(card.items.length);
      const items = (card.items || [])
        .map((item, idx) => {
          const itemText =
            typeof item === 'string'
              ? item
              : item && typeof item === 'object'
                ? (item.title ? `${item.title}: ` : '') + (item.text || '')
                : '';
          return `<text x="${card.x + 18}" y="${card.y + 54 + idx * 24}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="12" fill="#334155">• ${escapeXml(itemText)}</text>`;
        })
        .join('');
      return `<g><rect x="${card.x}" y="${card.y}" width="404" height="${boxHeight}" rx="16" fill="#ffffff"${stroke}/><text x="${card.x + 18}" y="${card.y + 28}" font-family="ui-monospace, monospace" font-size="12" font-weight="700" fill="#1d4ed8">${escapeXml(card.title)}</text>${items}</g>`;
    })
    .join('');

  const wires = routed
    .map((edge) => {
      const color = TONE_HEX[edge.tone] || TONE_HEX.blue;
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
          ? `<text x="${edge.badgePos[0]}" y="${edge.badgePos[1]}" text-anchor="middle" font-family="ui-sans-serif, system-ui, sans-serif" font-size="12" fill="#0b1324">${escapeXml(edge.label)}</text>`
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
          : '';
      return `<g${wireOpacity}>${glow}<path d="${edge.pathD}" fill="none" stroke="${color}" stroke-width="${strokeWidth}"${dash} marker-end="url(#arrow-${edge.tone})"/>${label}</g>`;
    })
    .join('');

  const nodes = doc.nodes
    .map((node) => nodeMarkup(node, selection, related, spotlight))
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>${markers}</defs>
  <rect width="100%" height="100%" fill="#f8fafc"/>
  ${zones}
  ${notes}
  ${wires}
  ${nodes}
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
