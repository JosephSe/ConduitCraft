/** Wire protocol, sync mode and latency (F-17): what they mean on the canvas and how they are read from a file. */
import type { DiagramEdge, WireProtocol, WireSync } from '../types';

export const WIRE_PROTOCOLS: readonly WireProtocol[] = ['http', 'grpc', 'graphql', 'kafka', 'amqp', 'sql', 'custom'];

export const WIRE_PROTOCOL_NAMES: Record<WireProtocol, string> = {
  http: 'HTTP',
  grpc: 'gRPC',
  graphql: 'GraphQL',
  kafka: 'Kafka',
  amqp: 'AMQP',
  sql: 'SQL',
  custom: 'Custom',
};

/** The text on a wire's chip: the protocol as a prefix, then the label ("gRPC · charge card"). */
export function wireLabelText(edge: Pick<DiagramEdge, 'label' | 'protocol'>): string {
  const label = edge.label ?? '';
  if (!edge.protocol) return label;
  const name = WIRE_PROTOCOL_NAMES[edge.protocol];
  return label ? `${name} · ${label}` : name;
}

export function isAsyncWire(edge: Pick<DiagramEdge, 'sync'>): boolean {
  return edge.sync === 'async';
}

/**
 * Reads the F-17 fields from untrusted input. Unknown protocols and bad numbers are dropped, and defaults
 * (synchronous, no latency) are left absent so a plain wire stays plain in the saved file.
 */
export function normalizeWireFields(raw: Record<string, unknown>): Partial<Pick<DiagramEdge, 'protocol' | 'sync' | 'latencyMs'>> {
  const out: Partial<Pick<DiagramEdge, 'protocol' | 'sync' | 'latencyMs'>> = {};
  if (typeof raw.protocol === 'string' && (WIRE_PROTOCOLS as readonly string[]).includes(raw.protocol)) {
    out.protocol = raw.protocol as WireProtocol;
  }
  if (raw.sync === 'async') out.sync = 'async' satisfies WireSync;
  if (typeof raw.latencyMs === 'number' && Number.isFinite(raw.latencyMs) && raw.latencyMs >= 0) {
    out.latencyMs = Math.round(raw.latencyMs);
  }
  return out;
}
