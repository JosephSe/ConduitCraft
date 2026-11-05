/**
 * The command line tool's logic (E2): read a diagram file, render it, check it, and summarise how it changed. Pure
 * and free of `fs`, so tests call it directly; `tools/conduitcraft.ts` is the thin part that reads and writes files.
 * It uses exactly the modules the browser uses, so output matches the browser's export.
 */
import { computeDocumentDiff } from '../src/core/diff';
import { computeDrift, driftSummary } from '../src/core/drift';
import { convertForDrift } from '../src/importers/driftSource';
import { mutedRules, runInsightsAllLevels } from '../src/core/insights';
import { importMermaidOrBlueprint } from '../src/core/parser';
import { pageCount, pageList, viewOfPage } from '../src/core/pages';
import { generateStandaloneHtmlWithLevels } from '../src/exporter/standaloneHtml';
import { parseBlueprintJson, serializeBlueprintJson } from '../src/exporter/blueprintJson';
import { renderDiagramSvg } from '../src/exporter/diagramSvg';
import type { DiagramDocument, ImportIssue } from '../src/types';

export type Loaded = { ok: true; doc: DiagramDocument; issues: ImportIssue[] } | { ok: false; error: string };

/** Read a diagram from text: Blueprint JSON when it starts with `{`, otherwise a Blueprint file or Mermaid. */
export function loadDiagram(text: string): Loaded {
  if (text.trimStart().startsWith('{')) {
    const parsed = parseBlueprintJson(text);
    return parsed.ok ? { ok: true, doc: parsed.doc, issues: [] } : { ok: false, error: parsed.error };
  }
  const { doc, issues } = importMermaidOrBlueprint(text);
  const errors = issues.filter((i) => i.level === 'error');
  if (errors.length > 0) {
    return { ok: false, error: errors.map((e) => `${e.line ? `line ${e.line}: ` : ''}${e.message}`).join('; ') };
  }
  if (doc.nodes.length === 0 && doc.zones.length === 0 && doc.notesCards.length === 0) {
    return { ok: false, error: 'no components found' };
  }
  return { ok: true, doc, issues };
}

export interface RenderedPage {
  /** 1-based. */
  number: number;
  title: string;
  svg: string;
}

/** One SVG per page, drawn as the browser's "Vector Picture" does. */
export function renderSvgPages(doc: DiagramDocument, scheme: 'light' | 'dark' = 'light'): RenderedPage[] {
  return pageList(doc).map((page) => {
    const view = viewOfPage(doc, page.index);
    // A picture describes its own page, not the whole file.
    delete view.pages;
    delete view.pageId;
    view.pageTitle = page.title;
    return { number: page.index + 1, title: page.title, svg: renderDiagramSvg(view, undefined, undefined, scheme) };
  });
}

export const renderHtml = (doc: DiagramDocument): string => generateStandaloneHtmlWithLevels(doc);
export const renderJson = (doc: DiagramDocument): string => serializeBlueprintJson(doc);

export interface CheckIssue {
  level: ImportIssue['level'];
  code: string;
  message: string;
  /** "Deployment", "Deployment › Orders", or "Orders": where it is, for the reader. */
  where: string;
}

export interface CheckResult {
  issues: CheckIssue[];
  errors: number;
  warnings: number;
}

/** The Review rules on every page and level, leaving out the rules the file mutes. */
export function checkDiagram(doc: DiagramDocument): CheckResult {
  const muted = mutedRules(doc);
  const several = pageCount(doc) > 1;
  const issues: CheckIssue[] = [];
  for (const page of pageList(doc)) {
    for (const issue of runInsightsAllLevels(viewOfPage(doc, page.index))) {
      if (muted.has(issue.code)) continue;
      const trail = [...(several ? [page.title] : []), ...issue.trail].join(' › ');
      issues.push({ level: issue.level, code: issue.code, message: issue.message, where: trail });
    }
  }
  return {
    issues,
    errors: issues.filter((i) => i.level === 'error').length,
    warnings: issues.filter((i) => i.level === 'warning').length,
  };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "2 components added, 1 wire removed" for one diagram; `null` for a side that does not exist (new or deleted). */
export function diffSummary(base: DiagramDocument | null, head: DiagramDocument | null): string {
  if (!base && !head) return 'no diagram';
  if (!base) return `new diagram (${plural(head!.nodes.length + (head!.pages ?? []).reduce((n, p) => n + p.nodes.length, 0), 'component')})`;
  if (!head) return 'diagram removed';
  const parts: string[] = [];
  const basePages = pageList(base);
  const headPages = pageList(head);
  const baseIds = new Set(basePages.map((p) => p.id));
  const headIds = new Set(headPages.map((p) => p.id));
  const counts = { nodeAdd: 0, nodeDel: 0, nodeMod: 0, edgeAdd: 0, edgeDel: 0, edgeMod: 0 };
  for (const page of headPages) {
    const before = basePages.find((p) => p.id === page.id);
    if (!before) continue;
    const diff = computeDocumentDiff(viewOfPage(base, before.index), viewOfPage(head, page.index));
    counts.nodeAdd += diff.addedNodesCount;
    counts.nodeDel += diff.removedNodesCount;
    counts.nodeMod += diff.modifiedNodesCount;
    counts.edgeAdd += diff.addedEdgesCount;
    counts.edgeDel += diff.removedEdgesCount;
    counts.edgeMod += diff.modifiedEdgesCount;
  }
  if (counts.nodeAdd) parts.push(`${plural(counts.nodeAdd, 'component')} added`);
  if (counts.nodeDel) parts.push(`${plural(counts.nodeDel, 'component')} removed`);
  if (counts.nodeMod) parts.push(`${plural(counts.nodeMod, 'component')} changed`);
  if (counts.edgeAdd) parts.push(`${plural(counts.edgeAdd, 'wire')} added`);
  if (counts.edgeDel) parts.push(`${plural(counts.edgeDel, 'wire')} removed`);
  if (counts.edgeMod) parts.push(`${plural(counts.edgeMod, 'wire')} changed`);
  const pagesAdded = headPages.filter((p) => !baseIds.has(p.id)).length;
  const pagesRemoved = basePages.filter((p) => !headIds.has(p.id)).length;
  if (pagesAdded) parts.push(`${plural(pagesAdded, 'page')} added`);
  if (pagesRemoved) parts.push(`${plural(pagesRemoved, 'page')} removed`);
  return parts.length ? parts.join(', ') : 'no changes';
}

/** The pull request comment: one line per diagram that changed. Empty when nothing did. */
export function diffComment(rows: Array<{ file: string; summary: string }>): string {
  const changed = rows.filter((r) => r.summary !== 'no changes');
  if (changed.length === 0) return '';
  return ['### Diagram changes', '', ...changed.map((r) => `- \`${r.file}\`: ${r.summary}`), ''].join('\n');
}

/** Lines a person reads after `check`: grouped by file, errors first. */
export function formatCheck(file: string, result: CheckResult): string[] {
  const order = { error: 0, warning: 1, info: 2 } as const;
  const lines = [...result.issues]
    .sort((a, b) => order[a.level] - order[b.level])
    .map((i) => `${file}: ${i.level}${i.where ? ` in ${i.where}` : ''}: ${i.message} [${i.code}]`);
  lines.push(`${file}: ${plural(result.errors, 'error')}, ${plural(result.warnings, 'warning')}`);
  return lines;
}

export interface DriftCheck {
  drifted: boolean;
  lines: string[];
}

/**
 * Compare a diagram with a newer copy of the file it was imported from (E5). `kind` names the importer
 * (`docker-compose`, `kubernetes`, `openapi`, `asyncapi`); without it the file's own look decides. Every page is
 * checked; the file is "drifted" when anything differs.
 */
export function checkDrift(doc: DiagramDocument, sourceName: string, sourceText: string, kind?: string): DriftCheck {
  const source = convertForDrift(sourceName, sourceText, kind);
  const several = pageCount(doc) > 1;
  const lines: string[] = [];
  let total = 0;
  let tracked = 0;
  for (const page of pageList(doc)) {
    const report = computeDrift(viewOfPage(doc, page.index), source.doc, source.kind);
    tracked += report.tracked;
    total += report.items.length;
    for (const item of report.items) lines.push(`  ${item.type}: ${several ? `${page.title} › ` : ''}${item.title}: ${item.detail}`);
  }
  const summary = total === 0 ? (tracked === 0 ? 'nothing in this diagram was imported from this kind of file' : 'no drift') : `${plural(total, 'difference')} (${source.kind})`;
  if (total === 0) return { drifted: false, lines: [`${sourceName}: ${summary}`] };
  // Counts by kind of change, taken from the first page's wording when there is one page.
  const detail = !several ? driftSummary(computeDrift(viewOfPage(doc, 0), source.doc, source.kind)) : summary;
  return { drifted: true, lines: [`${sourceName}: ${detail}`, ...lines] };
}
