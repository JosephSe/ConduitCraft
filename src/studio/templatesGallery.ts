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
  'flash-sale-ticketing': () => import('../examples/flash-sale-ticketing.blueprint.json?raw'),
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
    id: 'flash-sale-ticketing',
    title: 'Marquee: Flash-Sale Ticketing (Full Showcase)',
    category: 'showcase',
    categoryLabel: 'Showcase',
    tag: 'Stadium On-Sale // 1.8M Fans, 60k Seats',
    description:
      'The flagship example: a made-up ticketing company selling a stadium tour in minutes. Every component kind, shape and wire style, a waiting room, cache, Kafka stream and dead letters, two levels, three pages, frames, a legend, six scenarios and three deliberate Review findings.',
    nodesCount: 27,
    edgesCount: 34,
    simulationsCount: 6,
    loadRaw: async () => (await loaders['flash-sale-ticketing']()).default,
  },
  {
    id: 'three-tier-web',
    title: 'Three-Tier Web Application',
    category: 'cloud',
    categoryLabel: 'Web & Cloud',
    tag: 'CDN · Load Balancer · Redis · Postgres',
    description:
      'Presentation, application and data tiers across two availability zones: CDN and WAF with static files in object storage, a least-connections load balancer, stateless app servers, a read-through Redis cache, and a PostgreSQL primary that fails over to its replica.',
    nodesCount: 9,
    edgesCount: 11,
    simulationsCount: 3,
    loadRaw: async () => (await loaders['three-tier-web']()).default,
  },
  {
    id: 'event-driven-microservices',
    title: 'Event-Driven Microservices',
    category: 'microservices',
    categoryLabel: 'Microservices',
    tag: 'Kafka · Outbox · Saga · CQRS',
    description:
      'Services that talk through a Kafka event log: a transactional outbox, a payment saga that compensates on failure, a FIFO fulfilment queue with a dead-letter queue, an external payment provider behind a circuit breaker, and a CQRS read model.',
    nodesCount: 13,
    edgesCount: 17,
    simulationsCount: 4,
    loadRaw: async () => (await loaders['event-driven-microservices']()).default,
  },
  {
    id: 'cloud-data-pipeline',
    title: 'Cloud Data Pipeline (ETL / ELT)',
    category: 'data',
    categoryLabel: 'Data & Analytics',
    tag: 'Kinesis · Spark · Delta Lake · dbt',
    description:
      'A medallion lakehouse with both paths: streaming telemetry through Kinesis and Spark into bronze and silver buckets with live aggregates, plus a nightly Airflow-scheduled dbt run that builds the gold marts in ClickHouse for BI.',
    nodesCount: 11,
    edgesCount: 12,
    simulationsCount: 3,
    loadRaw: async () => (await loaders['cloud-data-pipeline']()).default,
  },
  {
    id: 'auth-oauth-oidc',
    title: 'OAuth2 & OIDC Authentication',
    category: 'security',
    categoryLabel: 'Security & Auth',
    tag: 'PKCE · JWT · JWKS · Refresh Rotation',
    description:
      'The Authorization Code flow with PKCE step by step: password and MFA at the identity provider, HSM-signed tokens, an API gateway that checks signature and scope against JWKS, and silent refresh with rotating refresh tokens.',
    nodesCount: 9,
    edgesCount: 9,
    simulationsCount: 3,
    loadRaw: async () => (await loaders['auth-oauth-oidc']()).default,
  },
  {
    id: 'kubernetes-ingress',
    title: 'Kubernetes Ingress & Mesh',
    category: 'cloud',
    categoryLabel: 'Web & Cloud',
    tag: 'Envoy Gateway · Istio mTLS · Ceph CSI',
    description:
      'A production cluster from internet to disk: cloud load balancer, Envoy ingress gateway, Istio sidecars with mTLS, CoreDNS discovery, replicated Deployments, a Postgres StatefulSet on Ceph volumes, and a nightly backup CronJob to object storage.',
    nodesCount: 12,
    edgesCount: 16,
    simulationsCount: 3,
    loadRaw: async () => (await loaders['kubernetes-ingress']()).default,
  },
  {
    id: 'cicd-pipeline',
    title: 'CI/CD Deployment Pipeline',
    category: 'devops',
    categoryLabel: 'DevOps & GitOps',
    tag: 'GitHub Actions · Cosign · Argo CD',
    description:
      'Pull request to production canary: parallel tests and security scans, a required quality gate, a signed image with SBOM, a GitOps config repo that Argo CD reconciles, auto-synced staging, and a canary that metrics can roll back.',
    nodesCount: 13,
    edgesCount: 15,
    simulationsCount: 3,
    loadRaw: async () => (await loaders['cicd-pipeline']()).default,
  },
  {
    id: 'lumen-relay',
    title: 'Lumen Relay (Classic Tour)',
    category: 'showcase',
    categoryLabel: 'Showcase',
    tag: 'Harbor City // Night Desk Spec',
    description:
      'A small made-up harbour parcel service: the seven original component kinds, six outlines, every one of the 9 wire routing modes, swimlanes, and three scenarios to play, including a storm hold.',
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
          <button type="button" class="btn solid btn-use-template" data-template-id="${template.id}">
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
