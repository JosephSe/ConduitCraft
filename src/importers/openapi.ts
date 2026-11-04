/**
 * OpenAPI 3 import (F-06, B8). One component per tag, with each operation listed as a metric; one gate per server
 * wired to every tag. An API with no tags is one component. Every component records `source: { kind: 'openapi' }`.
 * Loaded on demand.
 */
import yaml from 'js-yaml';
import type { DiagramDocument, DiagramNode, ImportIssue, KeyValueMetric } from '../types';
import { createBlankDocument } from '../templates/presets';
import { issue, layoutImported, makeEdge, makeNode } from './common';

export interface OpenApiResult {
  doc: DiagramDocument;
  issues: ImportIssue[];
}

export const OPENAPI_SOURCE = 'openapi';
const METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'] as const;
const MAX_SERVERS = 5;
const MAX_TAGS = 40;
const MAX_METRICS = 30;
const UNTAGGED = 'Untagged';

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** Parse JSON or YAML; both are YAML to `js-yaml`. */
function load(source: string): unknown {
  try {
    return yaml.load(source);
  } catch (err) {
    const reason = err instanceof Error ? err.message.split('\n')[0] : 'unknown error';
    throw new Error(`This file is not valid YAML or JSON: ${reason}`);
  }
}

function hostOf(url: string): string {
  const match = /^[a-z]+:\/\/([^/?#]+)/i.exec(url);
  return match ? match[1] : url;
}

/** Convert an OpenAPI 3 description. Throws a plain Error when the text is not one. */
export function convertOpenApi(source: string, fallbackTitle: string): OpenApiResult {
  const issues: ImportIssue[] = [];
  const data = load(source);
  if (!isRecord(data)) throw new Error('This is not an OpenAPI description.');
  if (typeof data.swagger === 'string') {
    throw new Error('This is a Swagger 2 file. Convert it to OpenAPI 3 first; only OpenAPI 3 can be imported.');
  }
  if (typeof data.openapi !== 'string' || !data.openapi.startsWith('3')) {
    throw new Error('This is not an OpenAPI 3 description (it has no "openapi: 3.x" line).');
  }
  if (!isRecord(data.paths) && !isRecord(data.webhooks)) throw new Error('This OpenAPI file has no paths.');

  const info = isRecord(data.info) ? data.info : {};
  const apiTitle = text(info.title) || fallbackTitle;
  const doc = createBlankDocument();
  doc.title = apiTitle;
  const used = new Set<string>();
  const edgeIds = new Set<string>();

  const tagDescriptions = new Map<string, string>();
  if (Array.isArray(data.tags)) {
    for (const tag of data.tags) if (isRecord(tag) && text(tag.name)) tagDescriptions.set(text(tag.name), text(tag.description));
  }

  // Group operations by their first tag.
  const groups = new Map<string, KeyValueMetric[]>();
  let operationCount = 0;
  let deprecated = 0;
  const paths = isRecord(data.paths) ? data.paths : {};
  const opsOf = (item: unknown): Record<string, unknown>[] =>
    isRecord(item) ? METHODS.map((m) => item[m]).filter(isRecord) : [];
  const anyTagged = Object.values(paths).some((item) =>
    opsOf(item).some((op) => Array.isArray(op.tags) && op.tags.some((t) => typeof t === 'string' && t.trim() !== '')),
  );
  // With no tags at all, every operation belongs to one component named after the API.
  const untaggedName = anyTagged ? UNTAGGED : apiTitle;
  for (const [path, item] of Object.entries(paths)) {
    if (!isRecord(item)) continue;
    for (const method of METHODS) {
      const op = item[method];
      if (!isRecord(op)) continue;
      operationCount += 1;
      const tags = Array.isArray(op.tags) ? op.tags.filter((t): t is string => typeof t === 'string' && t.trim() !== '') : [];
      const group = tags[0]?.trim() || untaggedName;
      const label = `${method.toUpperCase()} ${path}`;
      const note = text(op.summary) || text(op.operationId) || text(op.description).split('\n')[0];
      if (op.deprecated === true) deprecated += 1;
      groups.set(group, [...(groups.get(group) ?? []), { label, value: (op.deprecated === true ? 'Deprecated. ' : '') + note }]);
    }
  }
  if (operationCount === 0) throw new Error('This OpenAPI file has no operations to draw.');

  let groupNames = [...groups.keys()];
  if (groupNames.length > MAX_TAGS) {
    issues.push(issue('warning', 'openapi-too-many-tags', `This API has ${groupNames.length} tags; only the first ${MAX_TAGS} were drawn.`));
    groupNames = groupNames.slice(0, MAX_TAGS);
  }

  const groupNodes: DiagramNode[] = [];
  for (const name of groupNames) {
    const ops = groups.get(name)!;
    const node = makeNode('service', name, used, { kind: OPENAPI_SOURCE, ref: !anyTagged ? `api:${apiTitle}` : `tag:${name}` });
    node.subtitle = `${ops.length} operation${ops.length === 1 ? '' : 's'}`;
    node.summary = (tagDescriptions.get(name) || (!anyTagged ? text(info.description) : '') || `Operations tagged ${name}.`).slice(0, 280);
    const shown = ops.slice(0, MAX_METRICS);
    node.metrics = shown.map((m) => ({ label: m.label.slice(0, 80), value: m.value.slice(0, 120) }));
    if (ops.length > shown.length) node.metrics.push({ label: `+${ops.length - shown.length} more`, value: 'Not listed' });
    groupNodes.push(node);
    doc.nodes.push(node);
  }

  // Each server is an entry point wired to every group.
  const servers = Array.isArray(data.servers) ? data.servers.filter(isRecord).filter((s) => text(s.url)) : [];
  if (servers.length > MAX_SERVERS) {
    issues.push(issue('info', 'openapi-too-many-servers', `${servers.length} servers are listed; only the first ${MAX_SERVERS} were drawn.`));
  }
  for (const server of servers.slice(0, MAX_SERVERS)) {
    const url = text(server.url);
    const entry = makeNode('gate', text(server.description) || hostOf(url), used, { kind: OPENAPI_SOURCE, ref: `server:${url}` });
    entry.subtitle = url.slice(0, 60);
    entry.summary = `Server ${url}.`;
    doc.nodes.push(entry);
    for (const node of groupNodes) doc.edges.push(makeEdge(entry, node, edgeIds, { protocol: 'http' }));
  }

  if (deprecated > 0) issues.push(issue('info', 'openapi-deprecated', `${deprecated} deprecated operation${deprecated === 1 ? ' is' : 's are'} marked as such in the lists.`));
  if (isRecord(data.webhooks) || JSON.stringify(paths).includes('"callbacks"')) {
    issues.push(issue('info', 'openapi-callbacks', 'Webhooks and callbacks are not drawn.'));
  }
  issues.push(issue('info', 'openapi-schemas', 'Request and response schemas are not imported; only operations are listed.'));

  layoutImported(doc);
  return { doc, issues };
}
