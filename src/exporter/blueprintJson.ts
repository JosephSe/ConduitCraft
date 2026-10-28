/** Single-file JSON snapshot of a studio document. */
import type {
  DiagramDocument,
  DiagramEdge,
  DiagramNode,
  DiagramNotesCard,
  DiagramZone,
  EdgeRouteMode,
  KeyValueMetric,
  NodeKind,
  PortSide,
  StreamTone,
} from '../types';
import { normalizeNotesItemIcon } from '../types';
import { normalizeBrand } from '../core/brand';
import { expandStageToFit, getNodeDimensions, tightenLegacyStoreCylinder } from '../core/layout';
import { normalizeNodeShape, sanitizeIconImage } from '../core/nodeStyle';
import { normalizeIconName } from '../ui/icons';
import { createBlankDocument } from '../templates/presets';

export const BLUEPRINT_JSON_KIND = 'conduitcraft.blueprint';

const KINDS = new Set<NodeKind>(['actor', 'core', 'service', 'bus', 'gate', 'store', 'client']);
const TONES = new Set<StreamTone>(['blue', 'emerald', 'rose', 'violet', 'amber']);
const PORTS = new Set<PortSide>(['auto', 'top', 'right', 'bottom', 'left']);
const ROUTES = new Set<EdgeRouteMode>([
  'auto',
  'straight',
  'bezier',
  'arc',
  'orthogonal',
  'step',
  'under',
  'over',
  'fanout',
]);

export type BlueprintJsonResult = { ok: true; doc: DiagramDocument } | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function coerceNode(raw: unknown): DiagramNode | null {
  if (!isRecord(raw) || typeof raw.id !== 'string' || raw.id.trim() === '') return null;
  const kind: NodeKind = typeof raw.kind === 'string' && KINDS.has(raw.kind as NodeKind) ? (raw.kind as NodeKind) : 'service';
  const dims = getNodeDimensions(kind);
  const accent: StreamTone =
    typeof raw.accent === 'string' && TONES.has(raw.accent as StreamTone) ? (raw.accent as StreamTone) : 'blue';
  const shape = normalizeNodeShape(raw.shape);
  const iconImage = sanitizeIconImage(raw.iconImage);
  const metrics: KeyValueMetric[] = Array.isArray(raw.metrics)
    ? raw.metrics.flatMap((item) => {
        if (!isRecord(item)) return [];
        return [{ label: str(item.label), value: str(item.value) }];
      })
    : [];
  const node: DiagramNode = {
    id: raw.id,
    kind,
    accent,
    icon: normalizeIconName(typeof raw.icon === 'string' ? raw.icon : undefined, 'cpu'),
    ...(shape === 'card' ? {} : { shape }),
    ...(iconImage ? { iconImage } : {}),
    title: str(raw.title, raw.id),
    subtitle: str(raw.subtitle),
    eyebrow: str(raw.eyebrow),
    footerLeft: str(raw.footerLeft),
    chip: str(raw.chip),
    zoneLabel: str(raw.zoneLabel),
    interfaceLabel: str(raw.interfaceLabel),
    summary: str(raw.summary),
    metrics,
    code: str(raw.code),
    x: num(raw.x),
    y: num(raw.y),
    width: num(raw.width, dims.width) || dims.width,
    height: num(raw.height, dims.height) || dims.height,
    ...(typeof raw.status === 'string' && ['planned', 'live', 'deprecated', 'at-risk'].includes(raw.status)
      ? { status: raw.status as DiagramNode['status'] }
      : {}),
    ...(typeof raw.comment === 'string' && raw.comment.trim() ? { comment: raw.comment.trim() } : {}),
    ...(typeof raw.locked === 'boolean' ? { locked: raw.locked } : {}),
    ...(typeof raw.groupId === 'string' && raw.groupId.trim() ? { groupId: raw.groupId.trim() } : {}),
  };
  tightenLegacyStoreCylinder(node);
  return node;
}

function coerceEdge(raw: unknown, index: number): DiagramEdge | null {
  if (!isRecord(raw) || typeof raw.from !== 'string' || typeof raw.to !== 'string') return null;
  const waypoint =
    Array.isArray(raw.waypoint) && raw.waypoint.length >= 2 && raw.waypoint.every((n) => typeof n === 'number')
      ? ([raw.waypoint[0], raw.waypoint[1]] as [number, number])
      : undefined;
  return {
    id: str(raw.id, `edge-${index + 1}`),
    from: raw.from,
    to: raw.to,
    sourcePort: typeof raw.sourcePort === 'string' && PORTS.has(raw.sourcePort as PortSide) ? (raw.sourcePort as PortSide) : 'auto',
    targetPort: typeof raw.targetPort === 'string' && PORTS.has(raw.targetPort as PortSide) ? (raw.targetPort as PortSide) : 'auto',
    tone: typeof raw.tone === 'string' && TONES.has(raw.tone as StreamTone) ? (raw.tone as StreamTone) : 'blue',
    route: typeof raw.route === 'string' && ROUTES.has(raw.route as EdgeRouteMode) ? (raw.route as EdgeRouteMode) : 'auto',
    label: str(raw.label),
    animated: raw.animated !== false,
    flow: raw.flow === 'both' ? 'both' : 'forward',
    ...(typeof raw.comment === 'string' && raw.comment.trim() ? { comment: raw.comment.trim() } : {}),
    ...(waypoint ? { waypoint } : {}),
  };
}

function coerceZone(raw: unknown, index: number): DiagramZone | null {
  if (!isRecord(raw)) return null;
  return {
    id: str(raw.id, `zone-${index + 1}`),
    number: str(raw.number, String(index + 1).padStart(2, '0')),
    title: str(raw.title, 'Stage'),
    subtitle: str(raw.subtitle),
    x: num(raw.x),
    width: num(raw.width, 320) || 320,
  };
}

function coerceNotes(raw: unknown, index: number): DiagramNotesCard | null {
  if (!isRecord(raw)) return null;
  const items = Array.isArray(raw.items)
    ? raw.items.flatMap((item) => {
        if (!isRecord(item)) return [];
        return [{
          title: str(item.title),
          text: str(item.text),
          ...(typeof item.icon === 'string' ? { icon: normalizeNotesItemIcon(item.icon) } : {}),
        }];
      })
    : [];
  return {
    id: str(raw.id, `notes-${index + 1}`),
    title: str(raw.title, 'Notes'),
    code: str(raw.code),
    x: num(raw.x),
    y: num(raw.y),
    items,
  };
}

export function serializeBlueprintJson(doc: DiagramDocument): string {
  return JSON.stringify({ kind: BLUEPRINT_JSON_KIND, version: 1, document: doc }, null, 2);
}

export function parseBlueprintJson(text: string): BlueprintJsonResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Blueprint JSON is not valid JSON.' };
  }
  const source = isRecord(data) && isRecord(data.document) ? data.document : data;
  if (!isRecord(source) || !Array.isArray(source.nodes)) {
    return { ok: false, error: 'Blueprint JSON needs a nodes array.' };
  }

  const blank = createBlankDocument();
  const doc: DiagramDocument = {
    ...blank,
    title: str(source.title, blank.title),
    systemTag: str(source.systemTag, blank.systemTag),
    statusLabel: str(source.statusLabel, blank.statusLabel),
    direction: source.direction === 'TD' ? 'TD' : 'LR',
    stageWidth: num(source.stageWidth, blank.stageWidth) || blank.stageWidth,
    stageHeight: num(source.stageHeight, blank.stageHeight) || blank.stageHeight,
    overviewSummary: str(source.overviewSummary, blank.overviewSummary),
    brand: normalizeBrand(source.brand),
    nodes: source.nodes.flatMap((node) => {
      const coerced = coerceNode(node);
      return coerced ? [coerced] : [];
    }),
    edges: Array.isArray(source.edges)
      ? source.edges.flatMap((edge, index) => {
          const coerced = coerceEdge(edge, index);
          return coerced ? [coerced] : [];
        })
      : [],
    zones: Array.isArray(source.zones)
      ? source.zones.flatMap((zone, index) => {
          const coerced = coerceZone(zone, index);
          return coerced ? [coerced] : [];
        })
      : [],
    notesCards: Array.isArray(source.notesCards)
      ? source.notesCards.flatMap((card, index) => {
          const coerced = coerceNotes(card, index);
          return coerced ? [coerced] : [];
        })
      : [],
    simulations: Array.isArray(source.simulations) ? (source.simulations as DiagramDocument['simulations']) : [],
  };
  expandStageToFit(doc);
  return { ok: true, doc };
}
