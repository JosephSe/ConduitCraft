/**
 * Trace import (F-22, B10). Reads OpenTelemetry OTLP JSON (`resourceSpans`, also as one object per line) and Jaeger
 * JSON exports. Each service becomes a component; a span whose parent belongs to another service becomes a wire with
 * its call count, p50 latency (`latencyMs`) and p95 and error rate (above 5% → rose wire and an at-risk callee).
 * Messaging spans go through a bus component as async wires. `mergeTraceDiagram` updates an open diagram instead of
 * making a new one. Everything runs in the browser. Loaded on demand.
 */
import type { DiagramDocument, DiagramEdge, DiagramNode, ImportIssue, KeyValueMetric, WireProtocol } from '../types';
import { createBlankDocument } from '../templates/presets';
import { expandStageToFit } from '../core/layout';
import { issue, layoutImported, makeEdge, makeNode, uniqueId } from './common';

export const TRACE_SOURCE = 'trace';
export const ERROR_RATE_LIMIT = 0.05;
const MAX_SPANS = 200_000;

type SpanKind = 'internal' | 'server' | 'client' | 'producer' | 'consumer';

export interface Span {
  traceId: string;
  spanId: string;
  parentId: string;
  service: string;
  kind: SpanKind;
  durationMs: number;
  error: boolean;
  attrs: Record<string, string>;
}

export interface ParsedTraces {
  format: 'otlp' | 'jaeger';
  spans: Span[];
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

// ---------------------------------------------------------------------------------------------------------------
// Reading the two formats

const OTLP_KINDS: Record<string, SpanKind> = {
  '1': 'internal',
  '2': 'server',
  '3': 'client',
  '4': 'producer',
  '5': 'consumer',
  SPAN_KIND_INTERNAL: 'internal',
  SPAN_KIND_SERVER: 'server',
  SPAN_KIND_CLIENT: 'client',
  SPAN_KIND_PRODUCER: 'producer',
  SPAN_KIND_CONSUMER: 'consumer',
};

function otlpValue(value: unknown): string {
  if (!isRecord(value)) return '';
  for (const key of ['stringValue', 'intValue', 'doubleValue', 'boolValue']) {
    const v = value[key];
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
  }
  return '';
}

function otlpAttrs(list: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!Array.isArray(list)) return out;
  for (const item of list) {
    if (isRecord(item) && typeof item.key === 'string') out[item.key] = otlpValue(item.value);
  }
  return out;
}

function nanos(value: unknown): bigint {
  try {
    return typeof value === 'string' || typeof value === 'number' ? BigInt(value) : 0n;
  } catch {
    return 0n;
  }
}

function readOtlp(objects: unknown[], issues: ImportIssue[]): Span[] {
  const spans: Span[] = [];
  for (const object of objects) {
    if (!isRecord(object) || !Array.isArray(object.resourceSpans)) continue;
    for (const rs of object.resourceSpans) {
      if (!isRecord(rs)) continue;
      const resource = isRecord(rs.resource) ? otlpAttrs(rs.resource.attributes) : {};
      const service = resource['service.name'] || 'unknown_service';
      const scopes = [...(Array.isArray(rs.scopeSpans) ? rs.scopeSpans : []), ...(Array.isArray(rs.instrumentationLibrarySpans) ? rs.instrumentationLibrarySpans : [])];
      for (const scope of scopes) {
        if (!isRecord(scope) || !Array.isArray(scope.spans)) continue;
        for (const raw of scope.spans) {
          if (!isRecord(raw) || typeof raw.spanId !== 'string') continue;
          if (spans.length >= MAX_SPANS) {
            issues.push(issue('warning', 'trace-too-many', `This file has more than ${MAX_SPANS} spans; the rest were not read.`));
            return spans;
          }
          const status = isRecord(raw.status) ? raw.status.code : 0;
          const duration = nanos(raw.endTimeUnixNano) - nanos(raw.startTimeUnixNano);
          spans.push({
            traceId: typeof raw.traceId === 'string' ? raw.traceId : '',
            spanId: raw.spanId,
            parentId: typeof raw.parentSpanId === 'string' ? raw.parentSpanId : '',
            service,
            kind: OTLP_KINDS[String(raw.kind)] ?? 'internal',
            durationMs: duration > 0n ? Number(duration) / 1e6 : 0,
            error: status === 2 || status === 'STATUS_CODE_ERROR',
            attrs: otlpAttrs(raw.attributes),
          });
        }
      }
    }
  }
  return spans;
}

function jaegerTags(list: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!Array.isArray(list)) return out;
  for (const tag of list) {
    if (isRecord(tag) && typeof tag.key === 'string' && ['string', 'number', 'boolean'].includes(typeof tag.value)) out[tag.key] = String(tag.value);
  }
  return out;
}

function readJaeger(object: Record<string, unknown>, issues: ImportIssue[]): Span[] {
  const spans: Span[] = [];
  for (const trace of Array.isArray(object.data) ? object.data : []) {
    if (!isRecord(trace) || !Array.isArray(trace.spans)) continue;
    const processes = isRecord(trace.processes) ? trace.processes : {};
    for (const raw of trace.spans) {
      if (!isRecord(raw) || typeof raw.spanID !== 'string') continue;
      if (spans.length >= MAX_SPANS) {
        issues.push(issue('warning', 'trace-too-many', `This file has more than ${MAX_SPANS} spans; the rest were not read.`));
        return spans;
      }
      const process = isRecord(processes[String(raw.processID)]) ? (processes[String(raw.processID)] as Record<string, unknown>) : {};
      const tags = jaegerTags(raw.tags);
      const parent = (Array.isArray(raw.references) ? raw.references : []).find(
        (r): r is Record<string, unknown> => isRecord(r) && r.refType === 'CHILD_OF' && typeof r.spanID === 'string',
      );
      const kind = tags['span.kind'] as SpanKind | undefined;
      spans.push({
        traceId: typeof raw.traceID === 'string' ? raw.traceID : '',
        spanId: raw.spanID,
        parentId: parent ? String(parent.spanID) : '',
        service: typeof process.serviceName === 'string' && process.serviceName ? process.serviceName : 'unknown_service',
        kind: kind && ['server', 'client', 'producer', 'consumer', 'internal'].includes(kind) ? kind : 'internal',
        durationMs: typeof raw.duration === 'number' ? raw.duration / 1000 : 0,
        error: tags.error === 'true' || tags['otel.status_code'] === 'ERROR',
        attrs: tags,
      });
    }
  }
  return spans;
}

/** Read OTLP JSON (one object, or one per line) or a Jaeger export. Throws a plain Error for anything else. */
export function parseTraces(text: string): { parsed: ParsedTraces; issues: ImportIssue[] } {
  const issues: ImportIssue[] = [];
  const trimmed = text.trim();
  let objects: unknown[];
  try {
    objects = [JSON.parse(trimmed)];
  } catch {
    // OTLP file exporters write one JSON object per line.
    try {
      objects = trimmed.split('\n').filter((line) => line.trim()).map((line) => JSON.parse(line));
    } catch {
      throw new Error('This file is not valid JSON, so it cannot be a trace export.');
    }
  }
  const first = objects[0];
  if (isRecord(first) && Array.isArray(first.data) && !('resourceSpans' in first)) {
    const spans = readJaeger(first, issues);
    if (spans.length === 0) throw new Error('This Jaeger export has no spans.');
    return { parsed: { format: 'jaeger', spans }, issues };
  }
  if (objects.some((o) => isRecord(o) && Array.isArray(o.resourceSpans))) {
    const spans = readOtlp(objects, issues);
    if (spans.length === 0) throw new Error('This OpenTelemetry export has no spans.');
    return { parsed: { format: 'otlp', spans }, issues };
  }
  throw new Error('This is JSON, but not an OpenTelemetry (resourceSpans) or Jaeger (data) trace export.');
}

// ---------------------------------------------------------------------------------------------------------------
// Building the diagram

/** Nearest-rank percentile of already sorted values. */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))];
}

interface Flow {
  from: string;
  to: string;
  async: boolean;
  protocol?: WireProtocol;
  durations: number[];
  errors: number;
}

const ms = (value: number): string => (value >= 100 ? `${Math.round(value)} ms` : `${Math.round(value * 10) / 10} ms`);

function protocolOf(span: Span): WireProtocol | undefined {
  if (span.attrs['rpc.system'] === 'grpc') return 'grpc';
  if (span.attrs['http.method'] || span.attrs['http.request.method'] || span.attrs['http.url'] || span.attrs['url.full']) return 'http';
  return undefined;
}

function messagingRole(span: Span): 'producer' | 'consumer' | null {
  const system = span.attrs['messaging.system'];
  if (!system && span.kind !== 'producer' && span.kind !== 'consumer') return null;
  if (!system) return null;
  if (span.kind === 'producer') return 'producer';
  if (span.kind === 'consumer') return 'consumer';
  const op = span.attrs['messaging.operation'] ?? span.attrs['messaging.operation.type'];
  if (op === 'publish' || op === 'send' || op === 'create') return 'producer';
  if (op === 'receive' || op === 'process' || op === 'deliver' || op === 'consume') return 'consumer';
  return null;
}

function busProtocol(system: string): WireProtocol | undefined {
  if (system.startsWith('kafka')) return 'kafka';
  if (system === 'rabbitmq' || system.startsWith('amqp')) return 'amqp';
  return undefined;
}

/** Turn spans into a diagram: one component per service, one bus per messaging destination, wires with statistics. */
export function buildTraceDiagram(parsed: ParsedTraces, title: string, baseIssues: ImportIssue[] = []): { doc: DiagramDocument; issues: ImportIssue[] } {
  const issues = [...baseIssues];
  const { spans } = parsed;
  const byId = new Map<string, Span>();
  for (const span of spans) byId.set(`${span.traceId}/${span.spanId}`, span);

  const services = new Map<string, { spans: number; errors: number; traces: Set<string> }>();
  const flows = new Map<string, Flow>();
  const buses = new Map<string, { system: string; destination: string }>();
  let orphans = 0;
  let dbSpans = 0;

  const flow = (from: string, to: string, extra: Partial<Flow>, span: Span, duration: number): void => {
    const key = `${from}\u0000${to}`;
    const f = flows.get(key) ?? { from, to, async: false, durations: [], errors: 0, ...extra };
    f.durations.push(duration);
    if (span.error) f.errors += 1;
    if (!f.protocol && extra.protocol) f.protocol = extra.protocol;
    flows.set(key, f);
  };

  for (const span of spans) {
    const s = services.get(span.service) ?? { spans: 0, errors: 0, traces: new Set<string>() };
    s.spans += 1;
    if (span.error) s.errors += 1;
    s.traces.add(span.traceId);
    services.set(span.service, s);
    if (span.attrs['db.system']) dbSpans += 1;

    const role = messagingRole(span);
    if (role) {
      const system = span.attrs['messaging.system'];
      const destination = span.attrs['messaging.destination.name'] || span.attrs['messaging.destination'] || system;
      const busKey = `${system}:${destination}`;
      buses.set(busKey, { system, destination });
      const protocol = busProtocol(system);
      if (role === 'producer') flow(span.service, `bus:${busKey}`, { async: true, protocol }, span, span.durationMs);
      else flow(`bus:${busKey}`, span.service, { async: true, protocol }, span, span.durationMs);
      continue;
    }
    if (!span.parentId) continue;
    const parent = byId.get(`${span.traceId}/${span.parentId}`);
    if (!parent) {
      orphans += 1;
      continue;
    }
    if (parent.service === span.service || messagingRole(parent)) continue;
    // The caller's own client span is the latency the caller saw; otherwise the callee's span is the best there is.
    const duration = parent.kind === 'client' ? parent.durationMs : span.durationMs;
    flow(parent.service, span.service, { protocol: protocolOf(span) ?? protocolOf(parent) }, span, duration);
  }

  if (orphans > 0) issues.push(issue('warning', 'trace-orphan-span', `${orphans} span${orphans === 1 ? ' points' : 's point'} at a parent that is not in the file, so ${orphans === 1 ? 'its' : 'their'} caller is unknown and no wire was made.`));
  if (dbSpans > 0) issues.push(issue('info', 'trace-database-spans', `${dbSpans} database span${dbSpans === 1 ? ' was' : 's were'} not drawn; only calls between services are.`));
  if (services.size === 0) throw new Error('No spans were found in this file.');

  const doc = createBlankDocument();
  doc.title = title;
  const used = new Set<string>();
  const edgeIds = new Set<string>();
  const nodeFor = new Map<string, DiagramNode>();
  const inFlows = new Map<string, Flow[]>();
  for (const f of flows.values()) inFlows.set(f.to, [...(inFlows.get(f.to) ?? []), f]);

  for (const [name, stats] of [...services].sort((a, b) => a[0].localeCompare(b[0]))) {
    const node = makeNode('service', name, used, { kind: TRACE_SOURCE, ref: name });
    node.subtitle = `${stats.spans} span${stats.spans === 1 ? '' : 's'}`;
    node.summary = `Service ${name}, seen in ${stats.traces.size} trace${stats.traces.size === 1 ? '' : 's'}.`;
    node.metrics = traceMetrics(stats.spans, stats.errors, stats.traces.size);
    const incoming = inFlows.get(name) ?? [];
    if (incoming.some((f) => f.errors / f.durations.length > ERROR_RATE_LIMIT)) node.status = 'at-risk';
    nodeFor.set(name, node);
    doc.nodes.push(node);
  }
  for (const [key, bus] of [...buses].sort((a, b) => a[0].localeCompare(b[0]))) {
    const node = makeNode('bus', bus.destination, used, { kind: TRACE_SOURCE, ref: `messaging:${key}` });
    node.subtitle = bus.system.slice(0, 60);
    node.summary = `${bus.system} destination ${bus.destination}.`;
    nodeFor.set(`bus:${key}`, node);
    doc.nodes.push(node);
  }

  for (const f of flows.values()) {
    const from = nodeFor.get(f.from);
    const to = nodeFor.get(f.to);
    if (!from || !to) continue;
    const sorted = [...f.durations].sort((a, b) => a - b);
    const count = sorted.length;
    const p50 = percentile(sorted, 0.5);
    const p95 = percentile(sorted, 0.95);
    const rate = f.errors / count;
    const comment = `${count} call${count === 1 ? '' : 's'} · p50 ${ms(p50)} · p95 ${ms(p95)} · ${f.errors} error${f.errors === 1 ? '' : 's'} (${Math.round(rate * 1000) / 10}%)`;
    const edge: DiagramEdge = makeEdge(from, to, edgeIds, {
      label: `${count} call${count === 1 ? '' : 's'}`,
      comment,
      latencyMs: Math.max(0, Math.round(p50)),
      tone: rate > ERROR_RATE_LIMIT ? 'rose' : 'blue',
      ...(f.async ? { sync: 'async' as const, animated: true } : {}),
      ...(f.protocol ? { protocol: f.protocol } : {}),
    });
    doc.edges.push(edge);
  }
  layoutImported(doc);
  return { doc, issues };
}

function traceMetrics(spans: number, errors: number, traces: number): KeyValueMetric[] {
  return [
    { label: 'Spans', value: String(spans) },
    { label: 'Traces', value: String(traces) },
    { label: 'Error rate', value: `${Math.round((errors / Math.max(1, spans)) * 1000) / 10}%` },
  ];
}

/** Convert a trace export into a new diagram. Throws a plain Error when the text is not one. */
export function convertTraces(text: string, title: string): { doc: DiagramDocument; issues: ImportIssue[] } {
  const { parsed, issues } = parseTraces(text);
  return buildTraceDiagram(parsed, title, issues);
}

// ---------------------------------------------------------------------------------------------------------------
// Updating an open diagram

export interface TraceMerge {
  doc: DiagramDocument;
  updatedNodes: number;
  addedNodes: number;
  updatedEdges: number;
  addedEdges: number;
}

const lower = (s: string): string => s.trim().toLowerCase();

/**
 * Fold an imported trace diagram into an existing one without moving or renaming anything of the user's. A
 * component matches on its `source.ref` (kind `trace`), then on its title; a wire matches on its two ends. Matches
 * get new numbers (and `at-risk` when the trace says so); the rest are added to the right of what is there.
 */
export function mergeTraceDiagram(existing: DiagramDocument, imported: DiagramDocument): TraceMerge {
  const doc = structuredClone(existing);
  const used = new Set<string>([...doc.nodes.map((n) => n.id), ...doc.edges.map((e) => e.id)]);
  const idFor = new Map<string, string>();
  let updatedNodes = 0;
  const fresh: DiagramNode[] = [];

  for (const node of imported.nodes) {
    const ref = node.source?.ref;
    const match =
      (ref ? doc.nodes.find((n) => n.source?.kind === TRACE_SOURCE && n.source.ref === ref) : undefined) ??
      doc.nodes.find((n) => lower(n.title) === lower(node.title));
    if (match) {
      idFor.set(node.id, match.id);
      if (!match.source && node.source) match.source = node.source;
      if (node.status === 'at-risk') match.status = 'at-risk';
      const metrics = new Map(match.metrics.map((m) => [m.label, m]));
      for (const m of node.metrics) metrics.set(m.label, m);
      match.metrics = [...metrics.values()];
      updatedNodes += 1;
    } else {
      const copy = structuredClone(node);
      copy.id = uniqueId(node.id, used);
      idFor.set(node.id, copy.id);
      fresh.push(copy);
    }
  }
  if (fresh.length > 0) {
    const right = doc.nodes.length ? Math.max(...doc.nodes.map((n) => n.x + n.width)) + 96 : 96;
    const top = doc.nodes.length ? Math.min(...doc.nodes.map((n) => n.y)) : 128;
    const shiftX = right - Math.min(...fresh.map((n) => n.x));
    const shiftY = top - Math.min(...fresh.map((n) => n.y));
    for (const n of fresh) {
      n.x = Math.round((n.x + shiftX) / 16) * 16;
      n.y = Math.round((n.y + shiftY) / 16) * 16;
      doc.nodes.push(n);
    }
  }

  let updatedEdges = 0;
  let addedEdges = 0;
  for (const edge of imported.edges) {
    const from = idFor.get(edge.from);
    const to = idFor.get(edge.to);
    if (!from || !to) continue;
    const match = doc.edges.find((e) => e.from === from && e.to === to);
    if (match) {
      match.latencyMs = edge.latencyMs;
      match.comment = edge.comment;
      if (!match.label.trim()) match.label = edge.label;
      if (edge.tone === 'rose') match.tone = 'rose';
      if (edge.sync && !match.sync) match.sync = edge.sync;
      if (edge.protocol && !match.protocol) match.protocol = edge.protocol;
      updatedEdges += 1;
    } else {
      doc.edges.push({ ...structuredClone(edge), id: uniqueId(edge.id, used), from, to });
      addedEdges += 1;
    }
  }
  expandStageToFit(doc);
  return { doc, updatedNodes, addedNodes: fresh.length, updatedEdges, addedEdges };
}
