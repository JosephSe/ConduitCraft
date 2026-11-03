/**
 * Tags, ownership, links and the custom legend (F-26, F-27): what they mean and how they are read from a file.
 * Pure and DOM-free. Every link URL goes through `safeLinkUrl`, on input, on import and again on export.
 */
import type { LegendEntry, NodeLink, NodeLinkKind, StreamTone } from '../types';

export const LINK_KINDS: readonly NodeLinkKind[] = ['repo', 'runbook', 'dashboard', 'docs', 'oncall'];

export const LINK_KIND_NAMES: Record<NodeLinkKind, string> = {
  repo: 'Repository',
  runbook: 'Runbook',
  dashboard: 'Dashboard',
  docs: 'Docs',
  oncall: 'On-call',
};

const TONES: readonly StreamTone[] = ['blue', 'emerald', 'rose', 'violet', 'amber'];
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

/** Fields shared by components and wires that the editor and the file format both carry. */
export function normalizeNodeMeta(raw: Record<string, unknown>): {
  owner?: string;
  links?: NodeLink[];
  tags?: string[];
} {
  const owner = normalizeOwner(raw.owner);
  const links = normalizeLinks(raw.links);
  const tags = normalizeTags(raw.tags);
  return {
    ...(owner ? { owner } : {}),
    ...(links.length ? { links } : {}),
    ...(tags.length ? { tags } : {}),
  };
}
