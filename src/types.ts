export type NodeKind = 'actor' | 'core' | 'service' | 'bus' | 'gate' | 'store' | 'client';

export type NodeShape = 'card' | 'rounded' | 'pill' | 'circle' | 'diamond' | 'hexagon' | 'asymmetric';

export type StreamTone = 'blue' | 'emerald' | 'rose' | 'violet' | 'amber';

export type PortSide = 'auto' | 'top' | 'right' | 'bottom' | 'left';

export type EdgeRouteMode =
  | 'auto'
  | 'straight'
  | 'bezier'
  | 'arc'
  | 'orthogonal'
  | 'step'
  | 'under'
  | 'over'
  | 'fanout';

export type NodeIconName =
  | 'actor'
  | 'monitor'
  | 'bridge'
  | 'shield'
  | 'code'
  | 'database'
  | 'agency'
  | 'server'
  | 'lock'
  | 'cloud'
  | 'spark'
  | 'cpu'
  | 'globe';

export interface KeyValueMetric {
  label: string;
  value: string;
}

export type NotesItemIcon =
  | 'check'
  | 'bullet'
  | 'cross'
  | 'x'
  | 'exclamation'
  | 'warning'
  | 'info'
  | 'question'
  | 'star'
  | 'arrow'
  | 'dash'
  | 'none';

export interface NotesItemIconOption {
  value: NotesItemIcon;
  glyph: string;
  label: string;
  tone: string;
}

export const NOTES_ITEM_ICONS: readonly NotesItemIconOption[] = [
  { value: 'check', glyph: '✓', label: '✓ Check', tone: 'emerald' },
  { value: 'bullet', glyph: '•', label: '• Bullet', tone: 'blue' },
  { value: 'cross', glyph: '✕', label: '✕ X / Cross', tone: 'rose' },
  { value: 'exclamation', glyph: '!', label: '! Exclamation', tone: 'amber' },
  { value: 'warning', glyph: '⚠', label: '⚠ Warning', tone: 'amber' },
  { value: 'info', glyph: 'ℹ', label: 'ℹ Info', tone: 'blue' },
  { value: 'question', glyph: '?', label: '? Question', tone: 'violet' },
  { value: 'star', glyph: '★', label: '★ Star', tone: 'amber' },
  { value: 'arrow', glyph: '→', label: '→ Arrow', tone: 'blue' },
  { value: 'dash', glyph: '–', label: '– Dash', tone: 'muted' },
  { value: 'none', glyph: '', label: '∅ None', tone: 'none' },
];

export function normalizeNotesItemIcon(raw?: string): NotesItemIcon {
  if (!raw) return 'check';
  const lower = raw.trim().toLowerCase();
  if (lower === 'x' || lower === 'cross' || lower === 'close') return 'cross';
  if (lower === 'check' || lower === 'tick' || lower === 'checked') return 'check';
  if (lower === 'bullet' || lower === 'dot') return 'bullet';
  if (lower === 'exclamation' || lower === 'alert') return 'exclamation';
  if (lower === 'warning' || lower === 'warn') return 'warning';
  if (lower === 'info' || lower === 'information') return 'info';
  if (lower === 'question' || lower === 'help') return 'question';
  if (lower === 'star' || lower === 'fav') return 'star';
  if (lower === 'arrow' || lower === 'right') return 'arrow';
  if (lower === 'dash' || lower === 'minus' || lower === 'hyphen') return 'dash';
  if (lower === 'none' || lower === 'blank' || lower === 'empty') return 'none';
  return 'check';
}

export function getNotesItemIconMeta(icon?: string): NotesItemIconOption {
  const normalized = normalizeNotesItemIcon(icon);
  return NOTES_ITEM_ICONS.find((opt) => opt.value === normalized) || NOTES_ITEM_ICONS[0];
}

export interface NotesCheckItem {
  title: string;
  text: string;
  icon?: NotesItemIcon;
}

export type NotesItem = NotesCheckItem;

export interface DiagramNotesCard {
  id: string;
  title: string;
  code: string;
  x: number;
  y: number;
  items: NotesCheckItem[];
  locked?: boolean;
  z?: number;
  groupId?: string;
}

export interface DiagramZone {
  id: string;
  number: string;
  title: string;
  subtitle: string;
  x: number;
  width: number;
  locked?: boolean;
  z?: number;
}

export type ComponentStatus = 'planned' | 'live' | 'deprecated' | 'at-risk';

export interface DiagramNode {
  id: string;
  kind: NodeKind;
  accent: StreamTone;
  icon: NodeIconName;
  /** Visual outline. Omitted means the standard card. */
  shape?: NodeShape;
  /** Custom icon as an image data URL. The built-in `icon` is used when this is absent. */
  iconImage?: string;
  title: string;
  subtitle: string;
  eyebrow: string;
  footerLeft: string;
  chip: string;
  zoneLabel: string;
  interfaceLabel: string;
  summary: string;
  metrics: KeyValueMetric[];
  code: string;
  x: number;
  y: number;
  width: number;
  height: number;
  locked?: boolean;
  z?: number;
  groupId?: string;
  status?: ComponentStatus;
  comment?: string;
}

export interface DiagramEdge {
  id: string;
  from: string;
  to: string;
  sourcePort: PortSide;
  targetPort: PortSide;
  tone: StreamTone;
  route: EdgeRouteMode;
  label: string;
  animated: boolean;
  /** Optional manual bend point (world coordinates) the wire is nudged through. */
  waypoint?: [number, number];
  comment?: string;
}

export interface RoutedDiagramEdge extends DiagramEdge {
  pathD: string;
  startPoint: [number, number];
  endPoint: [number, number];
  badgePos?: [number, number];
  badgeWidth?: number;
  /** True when the route is a U-shaped loop (lane separation is applied to loop depth instead). */
  isLoop?: boolean;
  /** Translation applied to separate parallel wires between the same pair of components. */
  laneOffset?: [number, number];
}

export interface SimulationStep {
  id: string;
  nodes: string[];
  tone: StreamTone;
  label: string;
  trace: string;
}

export interface SimulationScenario {
  id: string;
  name: string;
  tone: StreamTone;
  steps: SimulationStep[];
}

/** Header lockup for the studio preview and the exported page. Empty fields use the defaults. */
export interface DiagramBrand {
  name: string;
  /** `#rrggbb`, or empty for the default mark. */
  accent: string;
  /** Image data URL, or empty for the built-in mark. */
  logo: string;
}

export interface DiagramDocument {
  title: string;
  systemTag: string;
  statusLabel: string;
  direction: 'LR' | 'TD';
  stageWidth: number;
  stageHeight: number;
  overviewSummary: string;
  brand: DiagramBrand;
  zones: DiagramZone[];
  notesCards: DiagramNotesCard[];
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  simulations: SimulationScenario[];
}

export type SelectionTarget =
  | { type: 'none' }
  | { type: 'node'; id: string }
  | { type: 'multi'; ids: string[]; zoneIds?: string[]; notesIds?: string[] }
  | { type: 'edge'; id: string }
  | { type: 'zone'; id: string }
  | { type: 'notes'; id: string };

export type ImportIssueLevel = 'error' | 'warning' | 'info';

export interface ImportIssue {
  level: ImportIssueLevel;
  message: string;
  /** 1-based line number inside the imported text when known. */
  line?: number;
  /** Short code for tests and filtering, e.g. `edge-unknown-node`. */
  code: string;
}
