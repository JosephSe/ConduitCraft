import type {
  DiagramDocument,
  DiagramNode,
  DiagramNotesCard,
  DiagramZone,
  NodeIconName,
  NodeKind,
  StreamTone,
} from '../types';
import { getNodeDimensions } from '../core/layout';

export interface StencilDefinition {
  kind: NodeKind;
  paletteTitle: string;
  paletteSub: string;
  defaultTitle: string;
  defaultSubtitle: string;
  eyebrow: string;
  footerLeft: string;
  chip: string;
  icon: NodeIconName;
  accent: StreamTone;
  interfaceLabel: string;
}

export const STENCIL_CATALOG: StencilDefinition[] = [
  {
    kind: 'actor',
    paletteTitle: 'Actor',
    paletteSub: 'Human outline role',
    defaultTitle: 'Actor',
    defaultSubtitle: 'Human Role',
    eyebrow: 'ACTOR',
    footerLeft: 'Interactive Session',
    chip: 'ROLE',
    icon: 'actor',
    accent: 'blue',
    interfaceLabel: 'Web / SSO Session',
  },
  {
    kind: 'core',
    paletteTitle: 'Core System',
    paletteSub: 'Primary platform card',
    defaultTitle: 'Core System',
    defaultSubtitle: 'Primary Application',
    eyebrow: 'PLATFORM',
    footerLeft: 'Core Runtime',
    chip: 'TIER 1',
    icon: 'monitor',
    accent: 'blue',
    interfaceLabel: 'HTTPS / Internal RPC',
  },
  {
    kind: 'service',
    paletteTitle: 'Service / API',
    paletteSub: 'Microservice or endpoint',
    defaultTitle: 'Service API',
    defaultSubtitle: 'Request Processor',
    eyebrow: 'SERVICE',
    footerLeft: 'REST / gRPC',
    chip: 'API',
    icon: 'code',
    accent: 'blue',
    interfaceLabel: 'REST / gRPC mTLS',
  },
  {
    kind: 'bus',
    paletteTitle: 'Event Broker',
    paletteSub: 'Queue or message bus',
    defaultTitle: 'Event Broker',
    defaultSubtitle: 'Async Stream Router',
    eyebrow: 'CONNECTOR',
    footerLeft: 'Pub/Sub Stream',
    chip: 'ASYNC',
    icon: 'bridge',
    accent: 'amber',
    interfaceLabel: 'Event Stream / Queue',
  },
  {
    kind: 'gate',
    paletteTitle: 'Control Gate',
    paletteSub: 'Decision or policy gate',
    defaultTitle: 'Control Gate',
    defaultSubtitle: 'Policy & Routing Engine',
    eyebrow: 'GATEWAY',
    footerLeft: 'Policy Check',
    chip: 'GATE',
    icon: 'shield',
    accent: 'violet',
    interfaceLabel: 'Signed Policy Gate',
  },
  {
    kind: 'store',
    paletteTitle: 'Data Store',
    paletteSub: 'Database, cache, or ledger',
    defaultTitle: 'Data Store',
    defaultSubtitle: 'Persistent Storage',
    eyebrow: 'STORAGE',
    footerLeft: 'Read / Write API',
    chip: 'STORE',
    icon: 'database',
    accent: 'emerald',
    interfaceLabel: 'Transactional Storage',
  },
  {
    kind: 'client',
    paletteTitle: 'External Client',
    paletteSub: 'Compact consumer node',
    defaultTitle: 'External Client',
    defaultSubtitle: 'Downstream Consumer',
    eyebrow: 'CONSUMER',
    footerLeft: 'API Client',
    chip: 'SYNC',
    icon: 'agency',
    accent: 'emerald',
    interfaceLabel: 'Consumer API',
  },
];

export const STREAM_TONE_OPTIONS: Array<{
  id: StreamTone;
  label: string;
  cssVar: string;
}> = [
  { id: 'blue', label: 'Primary (Blue)', cssVar: 'var(--wl-blue)' },
  { id: 'emerald', label: 'Success / Output (Emerald)', cssVar: 'var(--wl-emerald)' },
  { id: 'rose', label: 'Exception / Return (Rose)', cssVar: 'var(--wl-rose)' },
  { id: 'violet', label: 'Control / Policy (Violet)', cssVar: 'var(--wl-violet)' },
  { id: 'amber', label: 'Async / Event (Amber)', cssVar: 'var(--wl-amber)' },
];

export function createBlankDocument(): DiagramDocument {
  return {
    title: 'Untitled Architecture',
    systemTag: 'ARCHITECTURE STUDIO // V1.0',
    statusLabel: 'LIVE TELEMETRY',
    direction: 'LR',
    stageWidth: 1680,
    stageHeight: 920,
    overviewSummary:
      'Interactive architecture and animated data-flow diagram. Add components from the palette, connect ports to create live animated streams, or import a Mermaid (.mmd) or Blueprint (.md) file.',
    brand: { name: '', accent: '', logo: '' },
    zones: [],
    notesCards: [],
    nodes: [],
    edges: [],
    simulations: [],
  };
}

let uidCounter = 1;
export function nextUid(prefix: string): string {
  uidCounter += 1;
  return `${prefix}-${Date.now().toString(36).slice(-4)}-${uidCounter}`;
}

export function createNodeFromStencil(
  kind: NodeKind,
  x: number,
  y: number,
  existingCount: number,
): DiagramNode {
  const stencil = STENCIL_CATALOG.find((s) => s.kind === kind) || STENCIL_CATALOG[1];
  const dims = getNodeDimensions(kind);
  const indexSuffix = existingCount + 1;
  const id = `${kind}-${indexSuffix}-${Math.random().toString(36).slice(2, 5)}`;
  const title = `${stencil.defaultTitle} ${indexSuffix}`;

  return {
    id,
    kind,
    accent: stencil.accent,
    icon: stencil.icon,
    title,
    subtitle: stencil.defaultSubtitle,
    eyebrow: stencil.eyebrow,
    footerLeft: stencil.footerLeft,
    chip: stencil.chip,
    zoneLabel: 'ARCHITECTURE STAGE',
    interfaceLabel: stencil.interfaceLabel,
    summary: `${title} (${stencil.defaultSubtitle}) processes data within the architecture flow.`,
    metrics: [
      { label: 'Component Type', value: stencil.paletteTitle },
      { label: 'Interface', value: stencil.interfaceLabel },
    ],
    code: JSON.stringify(
      {
        id,
        component: title,
        type: kind,
        status: 'ACTIVE',
      },
      null,
      2,
    ),
    x: Math.round(x / 16) * 16,
    y: Math.round(y / 16) * 16,
    width: dims.width,
    height: dims.height,
  };
}

export function createSwimlaneZone(index: number, x: number): DiagramZone {
  const num = String(index + 1).padStart(2, '0');
  return {
    id: nextUid('zone'),
    number: num,
    title: `STAGE ${num}`,
    subtitle: 'Phase Group',
    x: Math.max(24, Math.round(x / 16) * 16),
    width: 320,
  };
}

export function createNotesCard(x: number, y: number): DiagramNotesCard {
  return {
    id: nextUid('notes'),
    title: 'ARCHITECTURE NOTES',
    code: 'SPEC-01',
    x: Math.max(24, Math.round(x / 16) * 16),
    y: Math.max(24, Math.round(y / 16) * 16),
    items: [
      { title: 'Rule 01', text: 'Document key architectural constraints or SLAs here.', icon: 'check' },
      { title: 'Rule 02', text: 'Select this card in Design Mode to customize items.', icon: 'bullet' },
    ],
  };
}
