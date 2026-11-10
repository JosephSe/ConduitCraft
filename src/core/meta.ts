/**
 * Tags, ownership, links and the custom legend (F-26, F-27): what they mean and how they are read from a file.
 * Pure and DOM-free. Every link URL goes through `safeLinkUrl`, on input, on import and again on export.
 */
import type { DiagramDocument, DiagramNode, LegendEntry, NodeLink, NodeBalancer, NodeCache, NodeLimiter, NodeSchedule, NodeLinkKind, NodeQueue, NodeResilience, NodeSource, StreamTone } from '../types';
import { normalizeBalancer } from './balancers';
import { normalizeCache, normalizeLimiter, normalizeSchedule } from './components';
import { normalizeQueue } from './queues';
import { normalizeResilience } from './reachability';

export const LINK_KINDS: readonly NodeLinkKind[] = ['repo', 'runbook', 'dashboard', 'docs', 'oncall'];

export const LINK_KIND_NAMES: Record<NodeLinkKind, string> = {
  repo: 'Repository',
  runbook: 'Runbook',
  dashboard: 'Dashboard',
  docs: 'Docs',
  oncall: 'On-call',
};

const TONES: readonly StreamTone[] = ['blue', 'emerald', 'rose', 'violet', 'amber', 'cyan', 'fuchsia'];
const SAFE_PROTOCOLS = new Set(['https:', 'http:', 'mailto:']);

export const MAX_TAGS = 12;
export const MAX_TAG_LENGTH = 32;
export const MAX_LINKS = 8;
export const MAX_LEGEND_LABEL = 40;

/**
 * Returns the normalised URL when it is an http, https or mailto link, otherwise null. `javascript:`, `data:`,
 * `vbscript:`, `file:` and anything unparseable are rejected, including ones disguised with leading whitespace or
 * control characters.
 */
export function safeLinkUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\u0000-\u001f\u007f\s]+/g, '');
  if (!cleaned) return null;
  try {
    const url = new URL(cleaned);
    return SAFE_PROTOCOLS.has(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

/** Trims, drops empties and repeats (ignoring case), and caps the count and length. */
export function normalizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const tag = item.trim().slice(0, MAX_TAG_LENGTH);
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

/** Splits a typed list ("pii, payments") into tags. */
export function parseTagInput(text: string): string[] {
  return normalizeTags(text.split(/[,\n]/));
}

export function normalizeLinks(raw: unknown): NodeLink[] {
  if (!Array.isArray(raw)) return [];
  const out: NodeLink[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const entry = item as Record<string, unknown>;
    const url = safeLinkUrl(entry.url);
    if (!url) continue;
    const label = typeof entry.label === 'string' ? entry.label.trim().slice(0, 80) : '';
    const kind =
      typeof entry.kind === 'string' && (LINK_KINDS as readonly string[]).includes(entry.kind)
        ? (entry.kind as NodeLinkKind)
        : undefined;
    out.push({ label: label || (kind ? LINK_KIND_NAMES[kind] : url), url, ...(kind ? { kind } : {}) });
    if (out.length >= MAX_LINKS) break;
  }
  return out;
}

export function normalizeOwner(raw: unknown): string | undefined {
  return typeof raw === 'string' && raw.trim() ? raw.trim().slice(0, 80) : undefined;
}

/** One entry per tone, with a non-empty label. Anything else is dropped. */
export function normalizeLegend(raw: unknown): LegendEntry[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<StreamTone>();
  const out: LegendEntry[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const entry = item as Record<string, unknown>;
    const tone = entry.tone as StreamTone;
    const label = typeof entry.label === 'string' ? entry.label.trim().slice(0, MAX_LEGEND_LABEL) : '';
    if (!TONES.includes(tone) || !label || seen.has(tone)) continue;
    seen.add(tone);
    const description = typeof entry.description === 'string' ? entry.description.trim().slice(0, 200) : '';
    out.push({ tone, label, ...(description ? { description } : {}) });
  }
  return out;
}

/** The name a colour carries in this document: the legend's label, else the built-in one. */
export function toneName(legend: readonly LegendEntry[] | undefined, tone: StreamTone, fallback: string): string {
  return legend?.find((entry) => entry.tone === tone)?.label || fallback;
}

export const MAX_SOURCE_KIND = 32;
export const MAX_SOURCE_REF = 200;

/** Where a component was imported from. Anything that is not a short kind and a short reference is dropped. */
export function normalizeSource(raw: unknown): NodeSource | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  const { kind, ref } = raw as Record<string, unknown>;
  if (typeof kind !== 'string' || typeof ref !== 'string') return undefined;
  const cleanKind = kind.trim().toLowerCase();
  const cleanRef = ref.trim();
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(cleanKind) || cleanKind.length > MAX_SOURCE_KIND) return undefined;
  if (!cleanRef || cleanRef.length > MAX_SOURCE_REF) return undefined;
  return { kind: cleanKind, ref: cleanRef };
}

/** Fields shared by components and wires that the editor and the file format both carry. */
export function normalizeNodeMeta(raw: Record<string, unknown>): {
  owner?: string;
  links?: NodeLink[];
  tags?: string[];
  resilience?: NodeResilience;
  queue?: NodeQueue;
  balancer?: NodeBalancer;
  external?: true;
  cache?: NodeCache;
  limiter?: NodeLimiter;
  schedule?: NodeSchedule;
  source?: NodeSource;
} {
  const owner = normalizeOwner(raw.owner);
  const source = normalizeSource(raw.source);
  const links = normalizeLinks(raw.links);
  const tags = normalizeTags(raw.tags);
  const resilience = normalizeResilience(raw.resilience);
  const queue = normalizeQueue(raw.queue);
  const balancer = normalizeBalancer(raw.balancer);
  const cache = normalizeCache(raw.cache);
  const limiter = normalizeLimiter(raw.limiter);
  const schedule = normalizeSchedule(raw.schedule);
  return {
    ...(owner ? { owner } : {}),
    ...(links.length ? { links } : {}),
    ...(tags.length ? { tags } : {}),
    ...(resilience ? { resilience } : {}),
    ...(queue ? { queue } : {}),
    ...(balancer ? { balancer } : {}),
    ...(raw.external === true ? { external: true as const } : {}),
    ...(cache ? { cache } : {}),
    ...(limiter ? { limiter } : {}),
    ...(schedule ? { schedule } : {}),
    ...(source ? { source } : {}),
  };
}

export type ColourBy = 'tone' | 'status' | 'tag';

export const COLOUR_BY_OPTIONS: readonly ColourBy[] = ['tone', 'status', 'tag'];

const STATUS_TONE: Record<NonNullable<DiagramNode['status']>, StreamTone> = {
  live: 'emerald',
  planned: 'blue',
  'at-risk': 'amber',
  deprecated: 'rose',
};

const STATUS_NAMES: Record<NonNullable<DiagramNode['status']>, string> = {
  live: 'Live',
  planned: 'Planned',
  'at-risk': 'At risk',
  deprecated: 'Deprecated',
};

/** Every tag used on a component or wire, once each, in alphabetical order. */
export function allTags(doc: Pick<DiagramDocument, 'nodes' | 'edges'>): string[] {
  const seen = new Map<string, string>();
  for (const item of [...doc.nodes, ...doc.edges]) {
    for (const tag of item.tags ?? []) if (!seen.has(tag.toLowerCase())) seen.set(tag.toLowerCase(), tag);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

/** The tone a tag is drawn in: tags take the seven tones in alphabetical order, then start over. */
function toneForTag(doc: Pick<DiagramDocument, 'nodes' | 'edges'>, tag: string): StreamTone {
  const index = allTags(doc).findIndex((t) => t.toLowerCase() === tag.toLowerCase());
  return TONES[Math.max(0, index) % TONES.length];
}

/**
 * The tone a component is drawn in under "Colour by". Components with no status (or no tag) keep their own tone,
 * so nothing disappears into a default colour.
 */
export function effectiveTone(doc: Pick<DiagramDocument, 'nodes' | 'edges'>, node: DiagramNode, by: ColourBy): StreamTone {
  if (by === 'status' && node.status) return STATUS_TONE[node.status];
  if (by === 'tag' && node.tags?.length) return toneForTag(doc, node.tags[0]);
  return node.accent;
}

/** What each colour means under the current "Colour by", for the legend card. Empty for "tone". */
export function colourKey(
  doc: Pick<DiagramDocument, 'nodes' | 'edges'>,
  by: ColourBy,
): Array<{ tone: StreamTone; label: string }> {
  if (by === 'status') {
    return (Object.keys(STATUS_TONE) as Array<keyof typeof STATUS_TONE>).map((status) => ({
      tone: STATUS_TONE[status],
      label: STATUS_NAMES[status],
    }));
  }
  if (by === 'tag') return allTags(doc).map((tag) => ({ tone: toneForTag(doc, tag), label: tag }));
  return [];
}

/** True when the item carries the tag (ignoring case). An empty filter matches everything. */
export function matchesTag(item: { tags?: string[] }, filter: string): boolean {
  return !filter || (item.tags ?? []).some((tag) => tag.toLowerCase() === filter.toLowerCase());
}
