/**
 * Kubernetes import (F-06, B9). Reads multi-document YAML. Deployments, StatefulSets, DaemonSets, Jobs and CronJobs
 * become components; an Ingress becomes a gate; Ingress → Service → workload chains and Service names found in
 * environment variables become wires; claimed volumes become stores; namespaces become swimlanes. Secrets and
 * ConfigMaps are never read. Every component records `source: { kind: 'kubernetes' }`. Loaded on demand.
 */
import yaml from 'js-yaml';
import type { DiagramDocument, DiagramNode, ImportIssue } from '../types';
import { createBlankDocument } from '../templates/presets';
import { issue, kindForImage, layoutByGroup, makeEdge, makeNode } from './common';

export interface KubernetesResult {
  doc: DiagramDocument;
  issues: ImportIssue[];
}

export const KUBERNETES_SOURCE = 'kubernetes';
const MAX_OBJECTS = 1000;
const WORKLOAD_KINDS = new Set(['Deployment', 'StatefulSet', 'DaemonSet', 'ReplicaSet', 'Job', 'CronJob']);

type Obj = Record<string, unknown>;
const isRecord = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
const asList = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

interface Resource {
  kind: string;
  name: string;
  ns: string;
  raw: Obj;
}

function podTemplate(r: Resource): Obj {
  const spec = isRecord(r.raw.spec) ? r.raw.spec : {};
  if (r.kind === 'CronJob') {
    const job = isRecord(spec.jobTemplate) && isRecord(spec.jobTemplate.spec) ? spec.jobTemplate.spec : {};
    return isRecord(job.template) ? job.template : {};
  }
  return isRecord(spec.template) ? spec.template : {};
}

const podSpec = (r: Resource): Obj => {
  const t = podTemplate(r);
  return isRecord(t.spec) ? t.spec : {};
};

function podLabels(r: Resource): Record<string, string> {
  const t = podTemplate(r);
  const meta = isRecord(t.metadata) ? t.metadata : {};
  const labels = isRecord(meta.labels) ? meta.labels : {};
  return Object.fromEntries(Object.entries(labels).map(([k, v]) => [k, str(v)]));
}

const containersOf = (r: Resource): Obj[] => asList(podSpec(r).containers).filter(isRecord);

function matches(selector: Record<string, string>, labels: Record<string, string>): boolean {
  const entries = Object.entries(selector);
  return entries.length > 0 && entries.every(([k, v]) => labels[k] === v);
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Convert the text of one or more Kubernetes manifests. Throws a plain Error when none is found. */
export function convertKubernetes(text: string, title: string): KubernetesResult {
  const issues: ImportIssue[] = [];
  let docs: unknown[];
  try {
    docs = yaml.loadAll(text);
  } catch (err) {
    const reason = err instanceof Error ? err.message.split('\n')[0] : 'unknown error';
    throw new Error(`This file is not valid YAML: ${reason}`);
  }

  const resources: Resource[] = [];
  const add = (raw: unknown): void => {
    if (!isRecord(raw)) return;
    if (raw.kind === 'List' && Array.isArray(raw.items)) {
      raw.items.forEach(add);
      return;
    }
    const meta = isRecord(raw.metadata) ? raw.metadata : {};
    const kind = str(raw.kind);
    const name = str(meta.name);
    if (!kind || !name || !str(raw.apiVersion)) return;
    resources.push({ kind, name, ns: str(meta.namespace) || 'default', raw });
  };
  docs.forEach(add);
  if (resources.length === 0) {
    throw new Error('No Kubernetes objects were found. Each needs an apiVersion, a kind and a metadata name.');
  }
  let list = resources;
  if (list.length > MAX_OBJECTS) {
    issues.push(issue('warning', 'kubernetes-too-many', `This file has ${list.length} objects; only the first ${MAX_OBJECTS} were read.`));
    list = list.slice(0, MAX_OBJECTS);
  }

  const doc = createBlankDocument();
  doc.title = title;
  const used = new Set<string>();
  const edgeIds = new Set<string>();
  const nodeOf = new Map<Resource, DiagramNode>();
  const namespaces = new Map<string, DiagramNode[]>();
  const place = (ns: string, node: DiagramNode): void => {
    namespaces.set(ns, [...(namespaces.get(ns) ?? []), node]);
    doc.nodes.push(node);
  };

  // Workloads.
  const workloads = list.filter((r) => WORKLOAD_KINDS.has(r.kind));
  for (const r of workloads) {
    const containers = containersOf(r);
    const images = containers.map((c) => str(c.image)).filter(Boolean);
    const node = makeNode(images[0] ? kindForImage(images[0]) : 'service', r.name, used, { kind: KUBERNETES_SOURCE, ref: `${r.kind}/${r.ns}/${r.name}` });
    node.subtitle = `${r.kind} · ${r.ns}`.slice(0, 60);
    node.summary = `${r.kind} ${r.name} in namespace ${r.ns}.`;
    const spec = isRecord(r.raw.spec) ? r.raw.spec : {};
    const replicas = typeof spec.replicas === 'number' ? spec.replicas : 0;
    const ports = containers.flatMap((c) => asList(c.ports).filter(isRecord).map((p) => str(p.containerPort))).filter(Boolean);
    node.metrics = [
      { label: 'Kind', value: r.kind },
      { label: 'Namespace', value: r.ns },
      ...images.slice(0, 3).map((image) => ({ label: 'Image', value: image })),
      ...(ports.length ? [{ label: 'Ports', value: ports.slice(0, 8).join(', ') }] : []),
      ...(replicas ? [{ label: 'Replicas', value: String(replicas) }] : []),
    ];
    if (replicas > 1) node.resilience = { replicas: Math.min(replicas, 99) };
    nodeOf.set(r, node);
    place(r.ns, node);
  }

  const services = list.filter((r) => r.kind === 'Service');
  const serviceTargets = (svc: Resource): Resource[] => {
    const spec = isRecord(svc.raw.spec) ? svc.raw.spec : {};
    const selector = isRecord(spec.selector) ? Object.fromEntries(Object.entries(spec.selector).map(([k, v]) => [k, str(v)])) : {};
    return workloads.filter((w) => w.ns === svc.ns && matches(selector, podLabels(w)));
  };
  const serviceByName = new Map(services.map((s) => [`${s.ns}/${s.name}`, s]));

  // Ingress → Service → workload.
  const wired = new Set<string>();
  const wire = (from: DiagramNode, to: DiagramNode, extra: Parameters<typeof makeEdge>[3] = {}): boolean => {
    const key = `${from.id}>${to.id}`;
    if (from === to || wired.has(key)) return false;
    wired.add(key);
    doc.edges.push(makeEdge(from, to, edgeIds, extra));
    return true;
  };
  let unresolvedBackends = 0;
  for (const r of list.filter((x) => x.kind === 'Ingress')) {
    const gate = makeNode('gate', r.name, used, { kind: KUBERNETES_SOURCE, ref: `Ingress/${r.ns}/${r.name}` });
    const spec = isRecord(r.raw.spec) ? r.raw.spec : {};
    gate.subtitle = `Ingress · ${r.ns}`.slice(0, 60);
    gate.summary = `Ingress ${r.name} in namespace ${r.ns}.`;
    const hosts: string[] = [];
    const backends: Array<{ service: string; port: string; label: string }> = [];
    const readBackend = (b: unknown, label: string): void => {
      if (!isRecord(b)) return;
      const svc = isRecord(b.service) ? b.service : null;
      const service = svc ? str(svc.name) : str(b.serviceName);
      const portObj = svc && isRecord(svc.port) ? svc.port : null;
      const port = portObj ? str(portObj.number) || str(portObj.name) : str(b.servicePort);
      if (service) backends.push({ service, port, label });
    };
    readBackend(spec.defaultBackend ?? spec.backend, '');
    for (const rule of asList(spec.rules).filter(isRecord)) {
      const host = str(rule.host);
      if (host) hosts.push(host);
      const http = isRecord(rule.http) ? rule.http : {};
      for (const path of asList(http.paths).filter(isRecord)) readBackend(path.backend, `${host}${str(path.path)}`);
    }
    gate.metrics = [
      { label: 'Namespace', value: r.ns },
      ...hosts.slice(0, 6).map((h) => ({ label: 'Host', value: h })),
    ];
    nodeOf.set(r, gate);
    place(r.ns, gate);
    for (const b of backends) {
      const svc = serviceByName.get(`${r.ns}/${b.service}`);
      const targets = svc ? serviceTargets(svc) : [];
      if (targets.length === 0) {
        unresolvedBackends += 1;
        continue;
      }
      for (const target of targets) {
        wire(gate, nodeOf.get(target)!, { label: (b.label || `${b.service}${b.port ? `:${b.port}` : ''}`).slice(0, 60), protocol: 'http' });
      }
    }
  }
  if (unresolvedBackends > 0) {
    issues.push(issue('warning', 'kubernetes-backend-unresolved', `${unresolvedBackends} Ingress backend${unresolvedBackends === 1 ? ' names' : 's name'} a Service with no matching workload in this file and ${unresolvedBackends === 1 ? 'was' : 'were'} skipped.`));
  }

  // Workload → workload, where a container's environment names another workload's Service. The values are only
  // searched, never stored.
  const serviceNodes = services.map((svc) => ({ svc, targets: serviceTargets(svc).map((t) => nodeOf.get(t)!) })).filter((s) => s.targets.length > 0);
  for (const r of workloads) {
    const from = nodeOf.get(r)!;
    const values = containersOf(r).flatMap((c) => asList(c.env).filter(isRecord).map((e) => str(e.value)).filter(Boolean));
    if (values.length === 0) continue;
    for (const { svc, targets } of serviceNodes) {
      if (svc.name.length < 2 || svc.ns !== r.ns && !values.some((v) => v.includes(`${svc.name}.${svc.ns}`))) continue;
      const host = new RegExp(`(^|[/@=,\\s])${escapeRe(svc.name)}(\\.${escapeRe(svc.ns)}(\\.svc(\\.cluster\\.local)?)?)?(:\\d+)?([/?\\s,]|$)`);
      if (!values.some((v) => host.test(v))) continue;
      for (const target of targets) wire(from, target, { label: svc.name.slice(0, 40), tone: 'violet' });
    }
  }

  // Claimed volumes become stores.
  const pvcNodes = new Map<string, DiagramNode>();
  for (const r of workloads) {
    const claims = asList(podSpec(r).volumes)
      .filter(isRecord)
      .map((v) => (isRecord(v.persistentVolumeClaim) ? str(v.persistentVolumeClaim.claimName) : ''))
      .filter(Boolean);
    const spec = isRecord(r.raw.spec) ? r.raw.spec : {};
    for (const tpl of asList(spec.volumeClaimTemplates).filter(isRecord)) {
      const meta = isRecord(tpl.metadata) ? tpl.metadata : {};
      if (str(meta.name)) claims.push(str(meta.name));
    }
    for (const claim of new Set(claims)) {
      const key = `${r.ns}/${claim}`;
      let pvc = pvcNodes.get(key);
      if (!pvc) {
        pvc = makeNode('store', claim, used, { kind: KUBERNETES_SOURCE, ref: `PersistentVolumeClaim/${r.ns}/${claim}` });
        pvc.subtitle = `Volume · ${r.ns}`.slice(0, 60);
        pvc.summary = `Persistent volume claim ${claim}.`;
        pvcNodes.set(key, pvc);
        place(r.ns, pvc);
      }
      wire(nodeOf.get(r)!, pvc, { tone: 'emerald', animated: false });
    }
  }

  // What was left out, by kind.
  const left = new Map<string, number>();
  for (const r of list) {
    if (WORKLOAD_KINDS.has(r.kind) || r.kind === 'Service' || r.kind === 'Ingress') continue;
    left.set(r.kind, (left.get(r.kind) ?? 0) + 1);
  }
  if (left.size > 0) {
    const names = [...left].map(([k, n]) => `${k}${n > 1 ? ` ×${n}` : ''}`).join(', ');
    issues.push(issue('info', 'kubernetes-other-kinds', `Not drawn: ${names}. Secrets and ConfigMaps are never read.`));
  }
  const loose = services.filter((s) => !serviceNodes.some((n) => n.svc === s)).length;
  if (loose > 0) issues.push(issue('info', 'kubernetes-service-unmatched', `${loose} Service${loose === 1 ? '' : 's'} selected no workload in this file.`));

  if (doc.nodes.length === 0) {
    throw new Error('This file has no workloads (Deployment, StatefulSet, DaemonSet, Job or CronJob) or Ingress to draw.');
  }

  // Layout: each namespace in its own column; a swimlane per namespace when there is more than one.
  const extents = layoutByGroup(doc, namespaces);
  if (extents.length > 1) {
    extents.forEach((e, index) => {
      doc.zones.push({
        id: `zone-${index + 1}-${e.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24)}`,
        number: String(index + 1).padStart(2, '0'),
        title: e.name.slice(0, 40).toUpperCase(),
        subtitle: 'Namespace',
        x: Math.max(24, e.x),
        width: Math.max(160, e.width),
      });
    });
  }
  return { doc, issues };
}
