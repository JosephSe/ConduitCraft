import type {
  DiagramDocument,
  DiagramNode,
  DiagramNotesCard,
  DiagramZone,
  NodeIconName,
  NodeKind,
  NodeShape,
  StreamTone,
} from '../types';
import { getNodeDimensions } from '../core/layout';

/*
 * Adding a new NodeKind: go through every line of this list.
 *  1. `NodeKind` union: src/types.ts
 *  2. `KINDS` set: src/exporter/blueprintJson.ts
 *  3. `getNodeDimensions`: src/core/layout.ts
 *  4. `STENCIL_CATALOG` entry: this file
 *  5. Rail button in index.html (icon, data-tip, aria-label, data-stencil-id) and the responsive toolbar overflow
 *  6. Command palette entry: src/studio/palette.ts
 *  7. Blueprint-file alias parsing: `normalizeNodeKind` in src/core/parser.ts
 *  8. Mermaid writer for the embedded block: the `switch (node.kind)` in src/core/parser.ts
 *  9. Studio rendering: src/studio/keyedStage.ts (plate, data-kind, data-shape)
 * 10. SVG export: src/exporter/diagramSvg.ts
 * 11. HTML export: src/exporter/standaloneHtml.ts
 * 12. Text description: src/core/describe.ts
 * 13. Container-image guess: `kindForImage` in src/importers/common.ts
 * 14. Guide kind table (docs/guide.md) and a help topic (src/core/helpTopics.ts)
 * 15. Tests: showcase, portableExport, nodeStyle, schema, palette, and round-trips (Blueprint file, JSON, share link)
 */

export interface StencilDefinition {
  /** Unique palette id. Equal to `kind` unless two stencils share a kind (for example a stream and a queue). */
  id: string;
  kind: NodeKind;
  /** Outline applied to nodes made from this stencil. */
  shape?: NodeShape;
  /** Extra fields applied after the defaults. */
  preset?: Partial<DiagramNode>;
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
    id: 'actor',
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
    id: 'core',
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
    id: 'service',
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
    id: 'queue',
    kind: 'queue',
    paletteTitle: 'Message Queue',
    paletteSub: 'Buffers work between services',
    defaultTitle: 'Queue',
    defaultSubtitle: 'Work Queue',
    eyebrow: 'QUEUE',
    footerLeft: 'Point to point',
    chip: 'ASYNC',
    icon: 'queue',
    accent: 'amber',
    interfaceLabel: 'AMQP / SQS',
  },
  {
    id: 'balancer',
    kind: 'balancer',
    paletteTitle: 'Load Balancer',
    paletteSub: 'Spreads traffic over instances',
    defaultTitle: 'Load Balancer',
    defaultSubtitle: 'Traffic Distributor',
    eyebrow: 'BALANCER',
    footerLeft: 'L4 / L7',
    chip: 'RR',
    icon: 'balancer',
    accent: 'violet',
    interfaceLabel: 'HTTP / TCP',
  },
  {
    id: 'bus',
    kind: 'bus',
    paletteTitle: 'Event Broker',
    paletteSub: 'Pub/sub event bus',
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
    id: 'gate',
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
    id: 'store',
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
    id: 'client',
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
    statusLabel: 'TRAFFIC DIAGRAM',
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

/** Find a stencil by id first, then by kind. */
export function findStencil(idOrKind: string): StencilDefinition | undefined {
  return STENCIL_CATALOG.find((s) => s.id === idOrKind) ?? STENCIL_CATALOG.find((s) => s.kind === idOrKind);
}

/** One stencil per kind (the first of each), for pickers that choose a kind rather than a look. */
export function kindStencils(): StencilDefinition[] {
  const seen = new Set<NodeKind>();
  return STENCIL_CATALOG.filter((s) => (seen.has(s.kind) ? false : (seen.add(s.kind), true)));
}

export function createNodeFromStencil(
  kindOrStencilId: NodeKind | string,
  x: number,
  y: number,
  existingCount: number,
): DiagramNode {
  const stencil = findStencil(kindOrStencilId) || STENCIL_CATALOG[1];
  const kind = stencil.kind;
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
    ...(stencil.shape ? { shape: stencil.shape } : {}),
    ...(stencil.preset ?? {}),
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

/** A free text label (the Text tool): a note card with no border, background or items. The words are the title. */
export function createTextCard(x: number, y: number): DiagramNotesCard {
  return {
    id: nextUid('text'),
    title: 'Text',
    code: '',
    x: Math.max(24, Math.round(x)),
    y: Math.max(24, Math.round(y)),
    items: [],
    variant: 'text',
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
