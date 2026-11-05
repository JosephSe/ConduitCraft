export type NodeKind = 'actor' | 'core' | 'service' | 'bus' | 'gate' | 'store' | 'client' | 'queue' | 'balancer' | 'cache' | 'limiter' | 'scheduler';

export type NodeShape = 'card' | 'rounded' | 'pill' | 'circle' | 'diamond' | 'hexagon' | 'asymmetric' | 'trapezoid' | 'bucket';

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
  | 'globe'
  | 'queue'
  | 'balancer'
  | 'bolt'
  | 'gauge'
  | 'clock'
  | 'stream'
  | 'bucket';

export type BalancerStrategy = 'round-robin' | 'least-connections' | 'weighted' | 'hash';

/** How a load balancer spreads traffic (K2). Absent fields use the defaults in `core/balancers.ts`. */
export interface NodeBalancer {
  /** Default 'round-robin'. Recorded for the reader and shown on the card. */
  strategy?: BalancerStrategy;
}

/** Cache settings (K3). Absent fields use the defaults in `core/components.ts`. */
export interface NodeCache {
  /** Percent of reads answered by the cache, 0 to 100. Default 80. */
  hitRate?: number;
  /** The store behind the cache. Absent means the only store it points at, when there is exactly one. */
  backingId?: string;
}

/** Rate limiter settings (K4): admit `admit` of every `per` packets. Defaults 4 of 5, fail-closed. */
export interface NodeLimiter {
  admit?: number;
  per?: number;
  /** When the limiter is down, traffic goes through unchecked instead of stopping. */
  failOpen?: boolean;
}

/** Scheduler settings (K5). */
export interface NodeSchedule {
  /** Free text, for example "5m" or "0 3 * * *". Max 40 characters. */
  every?: string;
}

export type QueueOrdering = 'standard' | 'fifo' | 'priority';
export type QueueDelivery = 'competing' | 'fanout';

/** How a queue holds and hands out messages (K1). Absent fields use the defaults in `core/queues.ts`. */
export interface NodeQueue {
  /** Default 'standard'. Recorded for the reader and shown on the card. */
  ordering?: QueueOrdering;
  /** Default 'competing': each message goes to one consumer. 'fanout' is a stream (K6). */
  delivery?: QueueDelivery;
  /** Most messages held before overflow. Absent means unbounded. 1 to 9999. */
  maxDepth?: number;
  /** Where overflow goes. Another component on the same level, usually a queue. */
  deadLetterId?: string;
  /** Free text such as "4 days". Shown on the card, not used in the run. Max 40 characters. */
  retention?: string;
  /** Lanes drawn inside a stream's pipe, 1 to 12, default 3. Only drawn, never simulated (K6). */
  partitions?: number;
}

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
  /** `text`: a free text label (the Text tool). Its words are `title`; it has no border, background or items. */
  variant?: 'text';
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

/**
 * A titled box that owns the components inside it (F-09). Unlike a swimlane it is free-form: it has a position
 * and a size on both axes, it can sit inside another frame, and moving it moves what it owns.
 */
export interface DiagramFrame {
  id: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  tone: StreamTone;
  /** The frame this one sits inside. Absent means a top-level frame. */
  parentId?: string;
  locked?: boolean;
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
  /** The frame that owns this component (F-09). Set when the component is dropped inside a frame. */
  frameId?: string;
  status?: ComponentStatus;
  comment?: string;
  /** Free-form labels used to filter and colour (F-26). */
  tags?: string[];
  /** Team or person responsible for the component (F-27). */
  owner?: string;
  /** Where to go from here: repository, runbook, dashboard and so on (F-27). */
  links?: NodeLink[];
  /** How the component copes with failing (F-01). Absent means a single instance with no fallback. */
  resilience?: NodeResilience;
  /** Queue settings (K1). Only read when `kind` is 'queue'; kept when the kind changes so settings are not lost. */
  queue?: NodeQueue;
  /** Load balancer settings (K2). Only read when `kind` is 'balancer'; kept when the kind changes. */
  balancer?: NodeBalancer;
  /** Run by someone else (K7). Written only when true. Works on every kind and shape. */
  external?: boolean;
  /** Cache settings (K3). Only read when `kind` is 'cache'. */
  cache?: NodeCache;
  /** Rate limiter settings (K4). Only read when `kind` is 'limiter'. */
  limiter?: NodeLimiter;
  /** Schedule (K5). Only read when `kind` is 'scheduler'. */
  schedule?: NodeSchedule;
  /** Where the component was imported from (F-06), so a later import or drift check can match it again. */
  source?: NodeSource;
  /** The diagram inside this component, opened as a level (F-03). Absent means the component is a leaf. */
  child?: LevelContent;
}

/** One level's content: a sub-document without the document-level fields (F-03). */
export interface LevelContent {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  zones: DiagramZone[];
  notesCards: DiagramNotesCard[];
  /** Frames on this level (F-09). Absent means none. */
  frames?: DiagramFrame[];
}

/** Failure handling for one component. Only `replicas` and `fallbackId` change what a chaos run reaches. */
export interface NodeResilience {
  /** Running copies. More than one means a failure degrades the component instead of taking it down. */
  replicas?: number;
  /** Another component that takes over this one's incoming traffic while it is down. */
  fallbackId?: string;
  /** Recorded for the reader. Callers upstream of a failure are unaffected either way, so it does not change reach. */
  circuitBreaker?: boolean;
}

/** What a component was imported from: the kind of file and a stable reference inside it. */
export interface NodeSource {
  /** `docker-compose`, `openapi`, `kubernetes`, `asyncapi`, `otlp` and so on. */
  kind: string;
  /** The service name, tag, resource name or similar: what to match on when importing the same thing again. */
  ref: string;
}

export type NodeLinkKind = 'repo' | 'runbook' | 'dashboard' | 'docs' | 'oncall';

/** An http, https or mailto link. The URL is checked by `safeLinkUrl` wherever it enters or leaves the app. */
export interface NodeLink {
  label: string;
  url: string;
  kind?: NodeLinkKind;
}

/** What a colour means in this document (F-26). Replaces the built-in name wherever tones are named. */
export interface LegendEntry {
  tone: StreamTone;
  label: string;
  description?: string;
}

export type EdgeFlowMode = 'forward' | 'both';

export type WireProtocol = 'http' | 'grpc' | 'graphql' | 'kafka' | 'amqp' | 'sql' | 'custom';
export type WireSync = 'sync' | 'async';

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
  /** Telemetry flow direction. 'forward' (one-way with arrow) or 'both' (flows both ways, no arrows). */
  flow?: EdgeFlowMode;
  /** Optional manual bend point (world coordinates) the wire is nudged through. */
  waypoint?: [number, number];
  comment?: string;
  /** What the wire carries, shown as a prefix on its label (F-17). */
  protocol?: WireProtocol;
  /** Async wires draw dashed and are left out of synchronous-cycle checks. Absent means sync. */
  sync?: WireSync;
  /** Typical latency of the call in milliseconds. */
  latencyMs?: number;
  /** Free-form labels used to filter and colour (F-26). */
  tags?: string[];
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
  /** Component ids to treat as failed when this scenario runs, saved as a named chaos scenario (F-01). */
  failures?: string[];
  /** Latency budget in milliseconds for the scenario's path; the Review lens flags a path that runs over (F-02). */
  budgetMs?: number;
}

/** Header lockup for the studio preview and the exported page. Empty fields use the defaults. */
export interface DiagramBrand {
  name: string;
  /** `#rrggbb`, or empty for the default mark. */
  accent: string;
  /** Image data URL, or empty for the built-in mark. */
  logo: string;
}

/**
 * One diagram of several in a file (D10). The document's own content is the first page; the rest live in
 * `DiagramDocument.pages`. A page has its own components, wires, swimlanes, notes, frames and stage size, and wires
 * never cross pages.
 */
export interface DiagramPage extends LevelContent {
  id: string;
  title: string;
  stageWidth?: number;
  stageHeight?: number;
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
  /** Frames (F-09). Absent means none. */
  frames?: DiagramFrame[];
  simulations: SimulationScenario[];
  /** Custom names for the five colours. Absent means the built-in names. */
  legend?: LegendEntry[];
  /** Per-diagram settings for the Review lens (F-02). */
  insights?: { muted: string[] };
  /** The second page onwards (D10). The document's own content is the first page. Absent means a single page. */
  pages?: DiagramPage[];
  /** Name of the first page. Absent means "Page 1". */
  pageTitle?: string;
  /** Id of the first page, once it has moved or been told apart from the others. Absent means "page-1". */
  pageId?: string;
}

export type SelectionTarget =
  | { type: 'none' }
  | { type: 'node'; id: string }
  | {
      type: 'multi';
      ids: string[];
      zoneIds?: string[];
      notesIds?: string[];
      edgeIds?: string[];
      excludedEdgeIds?: string[];
    }
  | { type: 'edge'; id: string }
  | { type: 'zone'; id: string }
  | { type: 'frame'; id: string }
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
