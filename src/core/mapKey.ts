/**
 * Pure data model and helpers for the V4 always-visible map Key (DK4).
 * Lists wire tones in layout order (left-to-right or top-down) and updates custom legend labels.
 */
import { MAX_LEGEND_LABEL, colourKey, toneName, type ColourBy } from './meta';
import { TONE_META } from '../shared/tones';
import type { DiagramDocument, LegendEntry, StreamTone } from '../types';

export interface MapKeyRow {
  tone: StreamTone;
  label: string;
  description?: string;
  dashed: boolean;
  editable: boolean;
  filterable: boolean;
}

const TONE_ORDER = Object.keys(TONE_META) as StreamTone[];

/**
 * Collect the rows to show in the SW Key for `doc` under `colourBy`.
 * Under `'tone'`, lists tones used by wires in layout order; each row is dashed iff every wire of that tone is async.
 */
export function collectMapKeyRows(
  doc: Pick<DiagramDocument, 'nodes' | 'edges' | 'legend' | 'direction'>,
  colourBy: ColourBy,
): MapKeyRow[] {
  if (colourBy !== 'tone') {
    return colourKey(doc, colourBy).map((entry) => ({
      tone: entry.tone,
      label: entry.label,
      dashed: false,
      editable: false,
      filterable: false,
    }));
  }
  if (doc.edges.length === 0) return [];

  const coords = new Map<string, { x: number; y: number }>();
  for (const node of doc.nodes) {
    coords.set(node.id, { x: node.x, y: node.y });
  }

  const topDown = doc.direction === 'TD';
  const sorted = doc.edges.map((edge, index) => {
    const pos = coords.get(edge.from) ?? coords.get(edge.to);
    const primary = pos ? (topDown ? pos.y : pos.x) : Number.POSITIVE_INFINITY;
    const secondary = pos ? (topDown ? pos.x : pos.y) : Number.POSITIVE_INFINITY;
    return { edge, index, primary, secondary };
  });

  sorted.sort((a, b) => a.primary - b.primary || a.secondary - b.secondary || a.index - b.index);

  const orderedTones: StreamTone[] = [];
  const allAsync = new Map<StreamTone, boolean>();
  for (const { edge } of sorted) {
    const prev = allAsync.get(edge.tone);
    if (prev === undefined) {
      orderedTones.push(edge.tone);
      allAsync.set(edge.tone, edge.sync === 'async');
    } else if (prev && edge.sync !== 'async') {
      allAsync.set(edge.tone, false);
    }
  }

  return orderedTones.map((tone) => {
    const entry = doc.legend?.find((item) => item.tone === tone);
    return {
      tone,
      label: toneName(doc.legend, tone, TONE_META[tone].shortLabel),
      ...(entry?.description ? { description: entry.description } : {}),
      dashed: allAsync.get(tone) === true,
      editable: true,
      filterable: true,
    };
  });
}

/**
 * Update or remove the custom legend label for `tone`, preserving any existing description
 * and sorting entries in canonical `TONE_META` order. Returns `undefined` when no custom labels remain.
 */
export function updateLegendLabel(
  legend: readonly LegendEntry[] | undefined,
  tone: StreamTone,
  rawLabel: string,
): LegendEntry[] | undefined {
  const label = rawLabel.trim().slice(0, MAX_LEGEND_LABEL);
  const existing = legend?.find((entry) => entry.tone === tone);
  const rest = (legend ?? []).filter((entry) => entry.tone !== tone);
  const next: LegendEntry[] = label
    ? [...rest, { tone, label, ...(existing?.description ? { description: existing.description } : {}) }]
    : rest;
  next.sort((a, b) => TONE_ORDER.indexOf(a.tone) - TONE_ORDER.indexOf(b.tone));
  return next.length ? next : undefined;
}
