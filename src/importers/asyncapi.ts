/**
 * AsyncAPI import (F-06, B9). Reads AsyncAPI 2 and 3, as YAML or JSON. Each channel becomes a bus component and the
 * described application becomes one component; what the application sends becomes an async wire into the channel
 * and what it receives becomes an async wire out of it. Every component records `source: { kind: 'asyncapi' }`.
 * Loaded on demand.
 */
import yaml from 'js-yaml';
import type { DiagramDocument, DiagramNode, ImportIssue, WireProtocol } from '../types';
import { createBlankDocument } from '../templates/presets';
import { issue, layoutImported, makeEdge, makeNode } from './common';

export interface AsyncApiResult {
  doc: DiagramDocument;
  issues: ImportIssue[];
}

export const ASYNCAPI_SOURCE = 'asyncapi';
const MAX_CHANNELS = 100;

type Obj = Record<string, unknown>;
const isRecord = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** Follow a local `#/a/b` reference. Anything else (a file or URL) is left unresolved. */
function resolve(root: Obj, value: unknown, depth = 0): unknown {
  if (!isRecord(value) || typeof value.$ref !== 'string' || depth > 8) return value;
  const ref = value.$ref;
  if (!ref.startsWith('#/')) return undefined;
  let cur: unknown = root;
  for (const part of ref.slice(2).split('/')) {
    if (!isRecord(cur)) return undefined;
    cur = cur[part.replace(/~1/g, '/').replace(/~0/g, '~')];
  }
  return resolve(root, cur, depth + 1);
}

const refTail = (value: unknown): string => {
  if (!isRecord(value) || typeof value.$ref !== 'string') return '';
  return value.$ref.split('/').pop() ?? '';
};

function messageNames(root: Obj, message: unknown): string[] {
  if (!message) return [];
  const one = (m: unknown): string => {
    const name = refTail(m) || (isRecord(m) ? str(m.name) || str(m.title) || str(m.messageId) : '');
    if (name) return name;
    const resolved = resolve(root, m);
    return isRecord(resolved) ? str(resolved.name) || str(resolved.title) : '';
  };
  if (isRecord(message) && Array.isArray(message.oneOf)) return message.oneOf.map(one).filter(Boolean);
  const name = one(message);
  return name ? [name] : [];
}

function protocolFor(servers: unknown): WireProtocol | undefined {
  if (!isRecord(servers)) return undefined;
  for (const server of Object.values(servers)) {
    const proto = isRecord(server) ? str(server.protocol).toLowerCase() : '';
    if (proto.startsWith('kafka')) return 'kafka';
    if (proto.startsWith('amqp')) return 'amqp';
  }
  return undefined;
}

/** A channel is a queue when its AMQP binding says so, or when it has an SQS binding. */
/** A channel with a Kafka binding is a stream (K6): a queue where every reader gets every message. */
function isStreamChannel(channel: Obj): boolean {
  const bindings = isRecord(channel.bindings) ? channel.bindings : {};
  return isRecord(bindings.kafka);
}

function isQueueChannel(channel: Obj): boolean {
  const bindings = isRecord(channel.bindings) ? channel.bindings : {};
  const amqp = isRecord(bindings.amqp) ? bindings.amqp : {};
  return amqp.is === 'queue' || isRecord(bindings.sqs);
}

interface Flow {
  channel: string;
  /** From the application's side: it sends into the channel, or receives from it. */
  direction: 'send' | 'receive';
  messages: string[];
}

/** Convert an AsyncAPI document. Throws a plain Error when the text is not one. */
export function convertAsyncApi(source: string, fallbackTitle: string): AsyncApiResult {
  const issues: ImportIssue[] = [];
  let data: unknown;
  try {
    data = yaml.load(source);
  } catch (err) {
    const reason = err instanceof Error ? err.message.split('\n')[0] : 'unknown error';
    throw new Error(`This file is not valid YAML or JSON: ${reason}`);
  }
  if (!isRecord(data) || typeof data.asyncapi !== 'string') {
    throw new Error('This is not an AsyncAPI description (it has no "asyncapi" version line).');
  }
  const major = data.asyncapi.split('.')[0];
  if (major !== '2' && major !== '3') throw new Error(`AsyncAPI ${data.asyncapi} is not supported; versions 2 and 3 can be imported.`);
  if (!isRecord(data.channels) || Object.keys(data.channels).length === 0) throw new Error('This AsyncAPI file has no channels.');

  const info = isRecord(data.info) ? data.info : {};
  const appTitle = str(info.title) || fallbackTitle;
  const flows: Flow[] = [];
  const channelInfo = new Map<string, { address: string; description: string; queue: boolean; stream: boolean }>();

  if (major === '2') {
    for (const [name, raw] of Object.entries(data.channels)) {
      const channel = isRecord(raw) ? raw : {};
      channelInfo.set(name, { address: name, description: str(channel.description), queue: isQueueChannel(channel), stream: isStreamChannel(channel) });
      // In AsyncAPI 2, `subscribe` is what the application sends and `publish` is what it receives.
      const subscribe = isRecord(channel.subscribe) ? channel.subscribe : null;
      const publish = isRecord(channel.publish) ? channel.publish : null;
      if (subscribe) flows.push({ channel: name, direction: 'send', messages: messageNames(data, subscribe.message) });
      if (publish) flows.push({ channel: name, direction: 'receive', messages: messageNames(data, publish.message) });
    }
  } else {
    for (const [name, raw] of Object.entries(data.channels)) {
      const channel = isRecord(resolve(data, raw)) ? (resolve(data, raw) as Obj) : {};
      channelInfo.set(name, { address: str(channel.address) || name, description: str(channel.description), queue: isQueueChannel(channel), stream: isStreamChannel(channel) });
    }
    const operations = isRecord(data.operations) ? data.operations : {};
    for (const raw of Object.values(operations)) {
      const op = isRecord(resolve(data, raw)) ? (resolve(data, raw) as Obj) : null;
      if (!op) continue;
      const channelKey = refTail(op.channel) || '';
      const action = str(op.action);
      if (!channelInfo.has(channelKey) || (action !== 'send' && action !== 'receive')) continue;
      const channel = resolve(data, data.channels && (data.channels as Obj)[channelKey]);
      const messages = isRecord(channel) && isRecord(channel.messages) ? Object.keys(channel.messages) : [];
      flows.push({ channel: channelKey, direction: action, messages });
    }
  }

  const doc = createBlankDocument();
  doc.title = appTitle;
  const used = new Set<string>();
  const edgeIds = new Set<string>();

  const app = makeNode('service', appTitle, used, { kind: ASYNCAPI_SOURCE, ref: `app:${appTitle}` });
  app.subtitle = `AsyncAPI ${data.asyncapi}`.slice(0, 60);
  app.summary = (str(info.description).split('\n')[0] || `The application described by ${appTitle}.`).slice(0, 280);
  doc.nodes.push(app);

  const channelNames = [...channelInfo.keys()];
  let shown = channelNames;
  if (channelNames.length > MAX_CHANNELS) {
    issues.push(issue('warning', 'asyncapi-too-many', `This file has ${channelNames.length} channels; only the first ${MAX_CHANNELS} were drawn.`));
    shown = channelNames.slice(0, MAX_CHANNELS);
  }
  const busFor = new Map<string, DiagramNode>();
  for (const name of shown) {
    const meta = channelInfo.get(name)!;
    const bus = makeNode(meta.stream ? 'stream' : meta.queue ? 'queue' : 'bus', meta.address, used, { kind: ASYNCAPI_SOURCE, ref: `channel:${name}` });
    bus.subtitle = meta.stream ? 'Stream' : meta.queue ? 'Queue' : 'Channel';
    bus.summary = (meta.description || `Channel ${meta.address}.`).slice(0, 280);
    const names = [...new Set(flows.filter((f) => f.channel === name).flatMap((f) => f.messages))];
    bus.metrics = names.slice(0, 12).map((n) => ({ label: 'Message', value: n }));
    busFor.set(name, bus);
    doc.nodes.push(bus);
  }

  const protocol = protocolFor(data.servers);
  let idle = 0;
  for (const name of shown) {
    const bus = busFor.get(name)!;
    const mine = flows.filter((f) => f.channel === name);
    if (mine.length === 0) {
      idle += 1;
      continue;
    }
    for (const direction of ['send', 'receive'] as const) {
      const of = mine.filter((f) => f.direction === direction);
      if (of.length === 0) continue;
      const label = [...new Set(of.flatMap((f) => f.messages))].slice(0, 3).join(', ').slice(0, 80);
      doc.edges.push(
        makeEdge(direction === 'send' ? app : bus, direction === 'send' ? bus : app, edgeIds, {
          label,
          sync: 'async',
          tone: direction === 'send' ? 'amber' : 'emerald',
          ...(protocol ? { protocol } : {}),
        }),
      );
    }
  }
  if (idle > 0) issues.push(issue('info', 'asyncapi-channel-idle', `${idle} channel${idle === 1 ? ' has' : 's have'} no operations, so ${idle === 1 ? 'it is' : 'they are'} drawn without wires.`));
  if (isRecord(data.servers)) issues.push(issue('info', 'asyncapi-servers', 'Servers are not drawn; the first Kafka or AMQP server sets the wire type.'));
  issues.push(issue('info', 'asyncapi-schemas', 'Message payload schemas are not imported; only message names are listed. Channel bindings are read only to tell a queue from a bus.'));

  layoutImported(doc);
  return { doc, issues };
}
