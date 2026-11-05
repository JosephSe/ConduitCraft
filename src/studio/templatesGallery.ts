/**
 * Starter Architecture Templates Gallery
 *
 * Provides production-grade starter blueprints with vector SVG thumbnails,
 * category filtering, and 1-click loading for empty state and New canvas workflows.
 */
import type { DiagramDocument } from '../types';
import { parseBlueprintJson } from '../exporter/blueprintJson';
import { renderDiagramSvg } from '../exporter/diagramSvg';
import { renderUiIconMarkup } from '../ui/icons';

// Template bodies are loaded on demand, so their ~80 kB of JSON stays out of the entry bundle. Each one is its
// own lazy chunk that the service worker precaches for offline use.
const loaders = {
  'three-tier-web': () => import('../examples/three-tier-web.blueprint.json?raw'),
  'event-driven-microservices': () => import('../examples/event-driven-microservices.blueprint.json?raw'),
  'cloud-data-pipeline': () => import('../examples/cloud-data-pipeline.blueprint.json?raw'),
  'auth-oauth-oidc': () => import('../examples/auth-oauth-oidc.blueprint.json?raw'),
  'kubernetes-ingress': () => import('../examples/kubernetes-ingress.blueprint.json?raw'),
  'cicd-pipeline': () => import('../examples/cicd-pipeline.blueprint.json?raw'),
  'lumen-relay': () => import('../examples/lumen-relay.blueprint.json?raw'),
} as const;

export type TemplateCategory =
  | 'all'
  | 'cloud'
  | 'microservices'
  | 'data'
  | 'security'
  | 'devops'
  | 'showcase';

export interface TemplateDefinition {
  id: string;
  title: string;
  category: TemplateCategory;
  categoryLabel: string;
  tag: string;
  description: string;
  nodesCount: number;
  edgesCount: number;
  simulationsCount: number;
  /** Resolves with the template's `.blueprint.json` text. */
  loadRaw: () => Promise<string>;
}

export const STARTER_TEMPLATES: TemplateDefinition[] = [
  {
    id: 'three-tier-web',
    title: 'Three-Tier Web Application',
    category: 'cloud',
    categoryLabel: 'Web & Cloud',
    tag: 'Edge CDN · ALB · Redis · Postgres',
    description:
      'Scalable 3-tier web architecture with Cloudflare CDN & WAF, Application Load Balancers, stateless Node.js workers, Redis session cache, and primary-replica PostgreSQL.',
    nodesCount: 8,
    edgesCount: 9,
    simulationsCount: 2,
    loadRaw: async () => (await loaders['three-tier-web']()).default,
  },
  {
    id: 'event-driven-microservices',
    title: 'Event-Driven Microservices',
    category: 'microservices',
    categoryLabel: 'Microservices',
    tag: 'Kafka Spine · Sagas · Event Sourcing',
    description:
      'Asynchronous decoupled microservices coordinated via an Apache Kafka distributed commit log, saga payments, a fulfilment queue with a dead-letter queue, and CQRS materialized views.',
    nodesCount: 10,
    edgesCount: 11,
    simulationsCount: 2,
    loadRaw: async () => (await loaders['event-driven-microservices']()).default,
  },
  {
    id: 'cloud-data-pipeline',
    title: 'Cloud Data Pipeline (ETL / ELT)',
    category: 'data',
    categoryLabel: 'Data & Analytics',
    tag: 'IoT · Kinesis · Spark · Delta Lake',
    description:
      'High-velocity streaming lakehouse ingesting IoT telemetry and clickstreams into Kinesis, processing tumbling windows with Spark, Delta Lake S3, and ClickHouse OLAP.',
    nodesCount: 8,
    edgesCount: 8,
    simulationsCount: 1,
    loadRaw: async () => (await loaders['cloud-data-pipeline']()).default,
  },
  {
    id: 'auth-oauth-oidc',
    title: 'OAuth2 & OIDC Authentication',
    category: 'security',
    categoryLabel: 'Security & Auth',
    tag: 'Zero Trust · PKCE · JWT · JWKS',
    description:
      'Zero-trust authorization code flow with PKCE between a Single-Page App, an OpenID Connect IdP backed by hardware HSM keys, and protected microservice APIs.',
    nodesCount: 6,
    edgesCount: 7,
    simulationsCount: 1,
    loadRaw: async () => (await loaders['auth-oauth-oidc']()).default,
  },
  {
    id: 'kubernetes-ingress',
    title: 'Kubernetes Ingress & Mesh',
    category: 'cloud',
    categoryLabel: 'Cloud & Mesh',
    tag: 'Envoy Gateway · Istio mTLS · CSI',
    description:
      'Production Kubernetes topology with Cloud NLB, Envoy Ingress Gateway, Istio mutual TLS sidecar proxy mesh, CoreDNS discovery, and Ceph persistent CSI storage.',
    nodesCount: 7,
    edgesCount: 7,
    simulationsCount: 1,
    loadRaw: async () => (await loaders['kubernetes-ingress']()).default,
  },
  {
    id: 'cicd-pipeline',
    title: 'CI/CD Deployment Pipeline',
    category: 'devops',
    categoryLabel: 'DevOps & GitOps',
    tag: 'GitHub Actions · Sonar · ArgoCD',
    description:
      'End-to-end continuous delivery pipeline: PR webhook triggers parallel matrix testing, SonarQube SAST scan, signed OCI build with Cosign, and ArgoCD canary rollout.',
    nodesCount: 7,
    edgesCount: 6,
    simulationsCount: 1,
    loadRaw: async () => (await loaders['cicd-pipeline']()).default,
  },
  {
    id: 'lumen-relay',
    title: 'Lumen Relay (Full Showcase)',
    category: 'showcase',
    categoryLabel: 'Showcase',
    tag: 'Harbor City // Night Desk Spec',
    description:
      'Comprehensive reference architecture utilizing all 7 component shapes, custom SVG icons, 9 wire routing modes, swimlane zones, and interactive scenarios.',
    nodesCount: 14,
    edgesCount: 16,
    simulationsCount: 3,
    loadRaw: async () => (await loaders['lumen-relay']()).default,
  },
];

export const TEMPLATE_CATEGORIES: { id: TemplateCategory; label: string }[] = [
  { id: 'all', label: 'All Templates' },
  { id: 'cloud', label: 'Web & Cloud' },
  { id: 'microservices', label: 'Microservices' },
  { id: 'data', label: 'Data & Analytics' },
  { id: 'security', label: 'Security & Auth' },
  { id: 'devops', label: 'DevOps & GitOps' },
  { id: 'showcase', label: 'Showcase' },
];

const rawCache = new Map<string, Promise<string>>();

/** Fetch (once) the JSON text of a template. */
export function loadTemplateRaw(template: TemplateDefinition): Promise<string> {
  let pending = rawCache.get(template.id);
  if (!pending) {
    pending = template.loadRaw();
    rawCache.set(template.id, pending);
  }
  return pending;
}

/** Fill the preview frame of every template card under `root` once its JSON has loaded. */
export function fillTemplatePreviews(root: ParentNode, templates: TemplateDefinition[] = STARTER_TEMPLATES): void {
  for (const template of templates) {
    const frame = root.querySelector<HTMLElement>(`[data-template-id="${template.id}"] .template-preview-frame`);
    if (!frame) continue;
    void loadTemplateRaw(template).then((raw) => {
      if (frame.isConnected) frame.innerHTML = renderTemplatePreviewSvg(raw);
    });
  }
}

/**
 * Returns filtered starter templates by category.
 */
export function getStarterTemplates(category: TemplateCategory = 'all'): TemplateDefinition[] {
  if (category === 'all') return STARTER_TEMPLATES;
  return STARTER_TEMPLATES.filter((t) => t.category === category);
}

/**
 * Returns a template by unique ID.
 */
export function getStarterTemplateById(id: string): TemplateDefinition | undefined {
  return STARTER_TEMPLATES.find((t) => t.id === id);
}

/**
 * Renders an inline vector SVG preview for a blueprint JSON or Document.
 */
export function renderTemplatePreviewSvg(source: string | DiagramDocument): string {
  let doc: DiagramDocument;
  if (typeof source === 'string') {
    const parsed = parseBlueprintJson(source);
    if (!parsed.ok) return '';
    doc = parsed.doc;
  } else {
    doc = source;
  }

  const rawSvg = renderDiagramSvg(doc);
  return rawSvg
    .replace(/<\?xml[^>]*\?>/g, '')
    .replace(/width="\d+"\s+height="\d+"/, 'width="100%" height="100%" preserveAspectRatio="xMidYMid meet"')
    .trim();
}

/**
 * Renders HTML for a single template card in the gallery grid.
 */
export function renderTemplateCardHtml(template: TemplateDefinition, previewSvg = ''): string {
  return `
    <article class="template-card" data-template-id="${template.id}">
      <div class="template-preview-frame" aria-hidden="true">
        ${previewSvg}
      </div>
      <div class="template-card-body">
        <div class="template-card-header">
          <span class="template-category-badge">${template.categoryLabel}</span>
          <span class="template-tag-meta">${template.tag}</span>
        </div>
        <h3 class="template-card-title">${template.title}</h3>
        <p class="template-card-desc">${template.description}</p>
        <div class="template-stats-row">
          <span class="template-stat-chip"><strong>${template.nodesCount}</strong> nodes</span>
          <span class="template-stat-chip"><strong>${template.edgesCount}</strong> wires</span>
          <span class="template-stat-chip"><strong>${template.simulationsCount}</strong> scenario${template.simulationsCount === 1 ? '' : 's'}</span>
        </div>
        <div class="template-card-actions">
          <button type="button" class="btn btn-primary-export btn-use-template" data-template-id="${template.id}">
            Use Template
          </button>
        </div>
      </div>
    </article>
  `;
}

/**
 * Renders HTML for the blank canvas option in the template picker.
 */
export function renderBlankCanvasCardHtml(): string {
  const icon = renderUiIconMarkup('pencil', 24);
  return `
    <article class="template-card template-card-blank" data-template-id="blank">
      <div class="template-preview-frame template-preview-blank" aria-hidden="true">
        <div class="blank-preview-canvas">
          ${icon}
          <span>1680 × 920 Blank Grid</span>
        </div>
      </div>
      <div class="template-card-body">
        <div class="template-card-header">
          <span class="template-category-badge" style="background: var(--wl-surface-elevated); color: var(--wl-ink-secondary);">Starter</span>
          <span class="template-tag-meta">Clean slate</span>
        </div>
        <h3 class="template-card-title">Blank Canvas</h3>
        <p class="template-card-desc">
          Start from scratch with a fresh grid. Add components from the left palette, draw conduits, create swimlanes, and author telemetry flows.
        </p>
        <div class="template-stats-row">
          <span class="template-stat-chip">0 nodes</span>
          <span class="template-stat-chip">0 wires</span>
          <span class="template-stat-chip">Custom flow</span>
        </div>
        <div class="template-card-actions">
          <button type="button" class="btn btn-use-template" data-template-id="blank">
            Create Blank Canvas
          </button>
        </div>
      </div>
    </article>
  `;
}
