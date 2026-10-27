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

export interface NotesCheckItem {
  title: string;
  text: string;
}

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
