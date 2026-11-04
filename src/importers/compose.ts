/**
 * Docker Compose import (F-06, B8). Services become components; `depends_on` and `links` become wires; named
 * volumes become data stores; networks shared by a few services become wires, and by many become tags. Environment
 * values are never copied (they often hold secrets). Every component records `source: { kind: 'docker-compose' }`.
 * Loaded on demand.
 */
import yaml from 'js-yaml';
import type { DiagramDocument, DiagramNode, ImportIssue, NodeKind } from '../types';
import { normalizeTags } from '../core/meta';
import { createBlankDocument } from '../templates/presets';
import { issue, layoutImported, makeEdge, makeNode } from './common';

export interface ComposeResult {
  doc: DiagramDocument;
  issues: ImportIssue[];
}

export const COMPOSE_SOURCE = 'docker-compose';
const MAX_SERVICES = 200;
/** A network shared by more services than this is tagged, not drawn: a full mesh says nothing. */
const MAX_DRAWN_NETWORK = 4;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const STORE_IMAGES = ['postgres', 'mysql', 'mariadb', 'mongo', 'redis', 'valkey', 'memcached', 'elasticsearch', 'opensearch', 'clickhouse', 'cassandra', 'influxdb', 'couchdb', 'cockroach', 'timescale', 'minio', 'neo4j', 'etcd'];
const BUS_IMAGES = ['kafka', 'rabbitmq', 'nats', 'activemq', 'redpanda', 'pulsar', 'mosquitto', 'zookeeper'];
const GATE_IMAGES = ['nginx', 'traefik', 'haproxy', 'envoy', 'caddy', 'kong', 'apisix', 'httpd'];

function kindForImage(image: string): NodeKind {
  const name = image.toLowerCase().split('@')[0].split(':')[0];
  const last = name.split('/').pop() ?? name;
  const has = (list: string[]) => list.some((word) => last.includes(word));
  if (has(STORE_IMAGES)) return 'store';
  if (has(BUS_IMAGES)) return 'bus';
  if (has(GATE_IMAGES)) return 'gate';
  return 'service';
}

/** `depends_on` is a list of names or a map keyed by name; `links` is a list that may say `name:alias`. */
function dependencyNames(value: unknown, stripAlias: boolean): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string').map((v) => (stripAlias ? v.split(':')[0] : v));
  }
  return isRecord(value) ? Object.keys(value) : [];
}

function serviceNetworks(service: Record<string, unknown>): string[] {
  const nets = service.networks;
  if (Array.isArray(nets)) return nets.filter((n): n is string => typeof n === 'string');
  return isRecord(nets) ? Object.keys(nets) : [];
}

/** Port mappings as short strings ("8080:80"); the long syntax is folded into the same shape. */
function portStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((p) => {
    if (typeof p === 'string' || typeof p === 'number') return [String(p)];
    if (isRecord(p) && p.target !== undefined) return [p.published !== undefined ? `${p.published}:${p.target}` : String(p.target)];
    return [];
  });
}

/** Convert the text of a Compose file. Throws a plain Error when it is not one. */
export function convertCompose(text: string, title: string): ComposeResult {
  const issues: ImportIssue[] = [];
  let data: unknown;
  try {
    data = yaml.load(text);
  } catch (err) {
    const reason = err instanceof Error ? err.message.split('\n')[0] : 'unknown error';
    throw new Error(`This file is not valid YAML: ${reason}`);
  }
  if (!isRecord(data) || !isRecord(data.services)) {
    throw new Error('This YAML has no "services" section, so it is not a Docker Compose file.');
  }

  const doc = createBlankDocument();
  doc.title = title;
  const used = new Set<string>();
  const edgeIds = new Set<string>();
  const byService = new Map<string, DiagramNode>();
  const names = Object.keys(data.services);
  if (names.length > MAX_SERVICES) {
    issues.push(issue('warning', 'compose-too-many', `This file has ${names.length} services; only the first ${MAX_SERVICES} were read.`));
  }

  const services: Array<[string, Record<string, unknown>]> = [];
  for (const name of names.slice(0, MAX_SERVICES)) {
    const raw = (data.services as Record<string, unknown>)[name];
    if (!isRecord(raw)) {
      issues.push(issue('warning', 'compose-service-empty', `Service "${name}" has no settings, so it was added with defaults.`));
    }
    services.push([name, isRecord(raw) ? raw : {}]);
  }

  for (const [name, service] of services) {
    const image = typeof service.image === 'string' ? service.image : '';
    const build = typeof service.build === 'string' ? service.build : isRecord(service.build) && typeof service.build.context === 'string' ? service.build.context : '';
    const kind = image ? kindForImage(image) : 'service';
    const node = makeNode(kind, name, used, { kind: COMPOSE_SOURCE, ref: name });
    node.subtitle = (image || (build ? `build: ${build}` : 'Service')).slice(0, 60);
    node.summary = `Service ${name}${image ? ` running ${image}` : ''}.`;
    const ports = portStrings(service.ports);
    node.metrics = [
      ...(image ? [{ label: 'Image', value: image }] : build ? [{ label: 'Build', value: build }] : []),
      ...(ports.length ? [{ label: 'Ports', value: ports.slice(0, 8).join(', ') }] : []),
    ];
    const deploy = isRecord(service.deploy) ? service.deploy : {};
    const replicas = typeof deploy.replicas === 'number' ? deploy.replicas : typeof service.scale === 'number' ? service.scale : 0;
    if (replicas > 1) node.resilience = { replicas: Math.min(replicas, 99) };
    byService.set(name, node);
    doc.nodes.push(node);
  }

  // Wires from depends_on and links: the dependent calls what it depends on.
  const wired = new Set<string>();
  const pair = (a: string, b: string) => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`);
  let unknownDeps = 0;
  for (const [name, service] of services) {
    const from = byService.get(name)!;
    const targets = [...dependencyNames(service.depends_on, false), ...dependencyNames(service.links, true)];
    for (const target of new Set(targets)) {
      const to = byService.get(target);
      if (!to) {
        unknownDeps += 1;
        continue;
      }
      if (to === from) continue;
      doc.edges.push(makeEdge(from, to, edgeIds));
      wired.add(pair(name, target));
    }
  }
  if (unknownDeps > 0) issues.push(issue('warning', 'compose-unknown-dependency', `${unknownDeps} dependenc${unknownDeps === 1 ? 'y names' : 'ies name'} a service that is not in this file and ${unknownDeps === 1 ? 'was' : 'were'} skipped.`));

  // Networks: a few services on one network are wired together; many are only tagged.
  const members = new Map<string, string[]>();
  for (const [name, service] of services) {
    for (const net of new Set(serviceNetworks(service))) members.set(net, [...(members.get(net) ?? []), name]);
  }
  const tagged: string[] = [];
  for (const [net, list] of members) {
    if (list.length < 2) continue;
    if (list.length > MAX_DRAWN_NETWORK) {
      tagged.push(`${net} (${list.length} services)`);
      for (const name of list) {
        const node = byService.get(name)!;
        node.tags = normalizeTags([...(node.tags ?? []), `net:${net}`]);
      }
      continue;
    }
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (wired.has(pair(list[i], list[j]))) continue;
        wired.add(pair(list[i], list[j]));
        doc.edges.push(makeEdge(byService.get(list[i])!, byService.get(list[j])!, edgeIds, { label: net, tone: 'violet', animated: false }));
      }
    }
  }
  if (tagged.length > 0) {
    issues.push(issue('info', 'compose-network-tagged', `Network${tagged.length === 1 ? '' : 's'} ${tagged.join(', ')} connect${tagged.length === 1 ? 's' : ''} too many services to draw as wires, so the services carry a "net:" tag instead.`));
  }

  // Named volumes become stores, wired from each service that mounts them.
  const topVolumes = isRecord(data.volumes) ? new Set(Object.keys(data.volumes)) : new Set<string>();
  const volumeNodes = new Map<string, DiagramNode>();
  let bindMounts = 0;
  for (const [name, service] of services) {
    if (!Array.isArray(service.volumes)) continue;
    for (const mount of service.volumes) {
      let source = '';
      let target = '';
      let type = '';
      if (typeof mount === 'string') {
        const parts = mount.split(':');
        source = parts.length > 1 ? parts[0] : '';
        target = parts.length > 1 ? parts[1] : parts[0];
      } else if (isRecord(mount)) {
        source = typeof mount.source === 'string' ? mount.source : '';
        target = typeof mount.target === 'string' ? mount.target : '';
        type = typeof mount.type === 'string' ? mount.type : '';
      }
      if (!source) continue; // an anonymous volume has nothing to draw
      const named = type === 'volume' || (type !== 'bind' && !/^[./~]/.test(source) && !source.includes('/'));
      if (!named || !(topVolumes.has(source) || type === 'volume')) {
        bindMounts += 1;
        continue;
      }
      let volume = volumeNodes.get(source);
      if (!volume) {
        volume = makeNode('store', source, used, { kind: COMPOSE_SOURCE, ref: `volume:${source}` });
        volume.subtitle = 'Volume';
        volume.summary = `Named volume ${source}.`;
        volumeNodes.set(source, volume);
        doc.nodes.push(volume);
      }
      doc.edges.push(makeEdge(byService.get(name)!, volume, edgeIds, { label: target.slice(0, 40), tone: 'emerald', animated: false }));
    }
  }
  if (bindMounts > 0) issues.push(issue('info', 'compose-bind-mount', `${bindMounts} bind mount${bindMounts === 1 ? '' : 's'} (folders on the host) ${bindMounts === 1 ? 'was' : 'were'} not drawn.`));
  const hasEnvironment =
    services.some(([, service]) => service.environment !== undefined || service.env_file !== undefined || service.secrets !== undefined) ||
    data.secrets !== undefined ||
    data.configs !== undefined;
  if (hasEnvironment) issues.push(issue('info', 'compose-environment', 'Environment variables, secrets and configs are not imported.'));

  if (doc.nodes.length === 0) throw new Error('This Compose file has no services.');
  layoutImported(doc);
  return { doc, issues };
}
