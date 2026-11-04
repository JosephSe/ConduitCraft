/**
 * Excalidraw import (F-25, B7). Rectangles, ellipses and diamonds become components; arrows attached to two shapes
 * become wires; text inside a shape or on an arrow becomes its title or label; frames become swimlanes; free text
 * becomes a note. Unattached arrows, lines, freehand strokes and pictures are skipped and reported. Loaded on demand.
 */
import type { DiagramDocument, DiagramEdge, DiagramNode, DiagramNotesCard, DiagramZone, ImportIssue, NodeKind, NodeShape } from '../types';
import { expandStageToFit } from '../core/layout';
import { STENCIL_CATALOG, createBlankDocument, createNodeFromStencil } from '../templates/presets';
import { colourToTone, issue, placeShapes, slugOf, uniqueId, type Geo } from './common';

export interface ExcalidrawResult {
  doc: DiagramDocument;
  issues: ImportIssue[];
}

interface Binding {
  elementId?: string;
}

interface El {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isDeleted?: boolean;
  strokeColor?: string;
  backgroundColor?: string;
  strokeStyle?: string;
  roundness?: unknown;
  text?: string;
  name?: string | null;
  containerId?: string | null;
  frameId?: string | null;
  startBinding?: Binding | null;
  endBinding?: Binding | null;
  startArrowhead?: string | null;
  endArrowhead?: string | null;
}

const MAX_ELEMENTS = 3000;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const numberOr = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const stringOr = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);

/** Read the elements of a scene, or throw a plain Error saying why the text is not one. */
export function parseElements(text: string): El[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('This file is not valid JSON, so it cannot be an Excalidraw scene.');
  }
  if (!isRecord(data) || typeof data.type !== 'string' || !data.type.startsWith('excalidraw') || !Array.isArray(data.elements)) {
    throw new Error('This is JSON, but not an Excalidraw scene.');
  }
  const out: El[] = [];
  for (const raw of data.elements) {
    if (!isRecord(raw) || typeof raw.id !== 'string' || typeof raw.type !== 'string') continue;
    out.push({
      id: raw.id,
      type: raw.type,
      x: numberOr(raw.x),
      y: numberOr(raw.y),
      width: Math.abs(numberOr(raw.width)),
      height: Math.abs(numberOr(raw.height)),
      isDeleted: raw.isDeleted === true,
      strokeColor: stringOr(raw.strokeColor),
      backgroundColor: stringOr(raw.backgroundColor),
      strokeStyle: stringOr(raw.strokeStyle),
      roundness: raw.roundness,
      text: stringOr(raw.text),
      name: typeof raw.name === 'string' ? raw.name : null,
      containerId: typeof raw.containerId === 'string' ? raw.containerId : null,
      frameId: typeof raw.frameId === 'string' ? raw.frameId : null,
      startBinding: isRecord(raw.startBinding) ? { elementId: stringOr(raw.startBinding.elementId) } : null,
      endBinding: isRecord(raw.endBinding) ? { elementId: stringOr(raw.endBinding.elementId) } : null,
      startArrowhead: typeof raw.startArrowhead === 'string' ? raw.startArrowhead : null,
      endArrowhead: typeof raw.endArrowhead === 'string' ? raw.endArrowhead : null,
    });
  }
  return out;
}

const SHAPE_TYPES = new Set(['rectangle', 'ellipse', 'diamond']);
const FRAME_TYPES = new Set(['frame', 'magicframe']);

function mapShape(el: El): { kind: NodeKind; shape?: NodeShape } {
  if (el.type === 'diamond') return { kind: 'gate', shape: 'diamond' };
  if (el.type === 'ellipse') return { kind: 'service', shape: 'circle' };
  if (el.roundness) return { kind: 'service', shape: 'rounded' };
  return { kind: 'service' };
}

const lines = (text: string | undefined): string[] =>
  (text ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

/** Convert an Excalidraw scene (the text of a `.excalidraw` file) into a diagram. Throws a plain Error if it is not one. */
export function convertExcalidraw(text: string, title: string): ExcalidrawResult {
  const issues: ImportIssue[] = [];
  let elements = parseElements(text).filter((el) => !el.isDeleted);
  if (elements.length > MAX_ELEMENTS) {
    issues.push(issue('warning', 'excalidraw-too-many', `This scene has ${elements.length} elements; only the first ${MAX_ELEMENTS} were read.`));
    elements = elements.slice(0, MAX_ELEMENTS);
  }
  const byId = new Map(elements.map((el) => [el.id, el]));

  // Text inside a shape or on an arrow belongs to it; other text is a note.
  const boundText = new Map<string, string[]>();
  const freeText: El[] = [];
  for (const el of elements) {
    if (el.type !== 'text') continue;
    if (el.containerId && byId.has(el.containerId)) {
      boundText.set(el.containerId, [...(boundText.get(el.containerId) ?? []), ...lines(el.text)]);
    } else if (lines(el.text).length > 0) freeText.push(el);
  }

  const doc = createBlankDocument();
  doc.title = title;
  const usedIds = new Set<string>();
  const nodeFor = new Map<string, DiagramNode>();
  const origin = new Map<string, Geo>();
  const frames = elements.filter((el) => FRAME_TYPES.has(el.type));

  for (const el of elements) {
    if (!SHAPE_TYPES.has(el.type)) continue;
    if (el.width <= 0 || el.height <= 0) continue;
    const mapped = mapShape(el);
    const node = createNodeFromStencil(mapped.kind, 0, 0, 0);
    const text = boundText.get(el.id) ?? [];
    const nodeTitle = (text[0] ?? STENCIL_CATALOG.find((s) => s.kind === mapped.kind)?.defaultTitle ?? 'Component').slice(0, 60);
    node.id = uniqueId(slugOf(nodeTitle), usedIds);
    node.title = nodeTitle;
    if (text[1]) node.subtitle = text[1].slice(0, 60);
    node.summary = text.length > 2 ? text.slice(2).join(' ').slice(0, 280) : `${nodeTitle} imported from Excalidraw.`;
    if (mapped.shape) node.shape = mapped.shape;
    const background = el.backgroundColor && el.backgroundColor !== 'transparent' ? el.backgroundColor : undefined;
    const tone = colourToTone(background) ?? colourToTone(el.strokeColor);
    if (tone) node.accent = tone;
    node.code = JSON.stringify({ id: node.id, component: nodeTitle, source: 'excalidraw' }, null, 2);
    origin.set(node.id, { x: el.x, y: el.y, width: el.width, height: el.height });
    nodeFor.set(el.id, node);
    doc.nodes.push(node);
  }

  // Free text becomes notes.
  const notes: DiagramNotesCard[] = [];
  for (const el of freeText) {
    const rows = lines(el.text);
    const note: DiagramNotesCard = {
      id: uniqueId(`note-${slugOf(rows[0])}`, usedIds),
      title: rows[0].slice(0, 40).toUpperCase(),
      code: 'EXCALIDRAW',
      x: el.x,
      y: el.y,
      items: (rows.length > 1 ? rows.slice(1) : rows).slice(0, 12).map((row) => ({ title: 'Note', text: row, icon: 'bullet' as const })),
    };
    origin.set(`note:${note.id}`, { x: el.x, y: el.y, width: el.width, height: el.height });
    notes.push(note);
  }

  const { scale, shiftX } = placeShapes(doc, notes, origin, issues, 'excalidraw');

  // Wires.
  const edgeIds = new Set<string>();
  let unattached = 0;
  let lineCount = 0;
  const skippedByType = new Map<string, number>();
  for (const el of elements) {
    if (el.type === 'line') {
      lineCount += 1;
      continue;
    }
    if (['freedraw', 'image', 'embeddable', 'iframe'].includes(el.type)) {
      skippedByType.set(el.type, (skippedByType.get(el.type) ?? 0) + 1);
      continue;
    }
    if (el.type !== 'arrow') continue;
    const from = nodeFor.get(el.startBinding?.elementId ?? '');
    const to = nodeFor.get(el.endBinding?.elementId ?? '');
    if (!from || !to) {
      unattached += 1;
      continue;
    }
    const startHead = Boolean(el.startArrowhead);
    const endHead = Boolean(el.endArrowhead);
    const reversed = startHead && !endHead;
    const label = (boundText.get(el.id) ?? []).join(' ').slice(0, 80);
    const edge: DiagramEdge = {
      id: uniqueId(`wire-${edgeIds.size + 1}`, edgeIds),
      from: reversed ? to.id : from.id,
      to: reversed ? from.id : to.id,
      sourcePort: 'auto',
      targetPort: 'auto',
      tone: colourToTone(el.strokeColor) ?? 'blue',
      route: 'auto',
      label,
      animated: el.strokeStyle !== 'dashed' && el.strokeStyle !== 'dotted',
    };
    if (startHead && endHead) edge.flow = 'both';
    if (el.strokeStyle === 'dashed' || el.strokeStyle === 'dotted') edge.sync = 'async';
    doc.edges.push(edge);
  }
  if (unattached > 0) issues.push(issue('warning', 'excalidraw-arrow-unattached', `${unattached} arrow${unattached === 1 ? ' is' : 's are'} not attached to a shape at both ends and ${unattached === 1 ? 'was' : 'were'} skipped.`));
  if (lineCount > 0) issues.push(issue('warning', 'excalidraw-line', `${lineCount} plain line${lineCount === 1 ? '' : 's'} (no arrow) ${lineCount === 1 ? 'was' : 'were'} skipped.`));
  for (const [type, count] of skippedByType) {
    const what = type === 'freedraw' ? 'freehand stroke' : type === 'image' ? 'picture' : 'embedded item';
    issues.push(issue('warning', `excalidraw-${type}`, `${count} ${what}${count === 1 ? '' : 's'} ${count === 1 ? 'was' : 'were'} skipped.`));
  }

  // Frames become swimlanes: a column spanning the shapes inside, or the frame's own width when it holds none.
  frames.forEach((frame, index) => {
    const members = elements.filter((el) => el.frameId === frame.id).map((el) => nodeFor.get(el.id)).filter((n): n is DiagramNode => Boolean(n));
    let x: number;
    let width: number;
    if (members.length > 0) {
      x = Math.min(...members.map((m) => m.x)) - 32;
      width = Math.max(...members.map((m) => m.x + m.width)) + 32 - x;
    } else {
      x = frame.x * scale + shiftX;
      width = frame.width * scale;
    }
    const name = (frame.name ?? '').trim() || `Frame ${index + 1}`;
    const zone: DiagramZone = {
      id: uniqueId(`zone-${slugOf(name)}`, usedIds),
      number: String(index + 1).padStart(2, '0'),
      title: name.slice(0, 40).toUpperCase(),
      subtitle: 'From Excalidraw',
      x: Math.max(24, Math.round(x / 16) * 16),
      width: Math.max(160, Math.round(width / 16) * 16),
    };
    doc.zones.push(zone);
  });
  if (frames.length > 0) issues.push(issue('info', 'excalidraw-frames', `${frames.length} frame${frames.length === 1 ? '' : 's'} became swimlanes (columns); the shapes inside stay as components.`));

  doc.notesCards = notes;
  doc.direction = 'LR';
  expandStageToFit(doc);
  return { doc, issues };
}
