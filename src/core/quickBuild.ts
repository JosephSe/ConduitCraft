/**
 * Pure chain grammar and layout for the Composer's quick-build syntax (`REDESIGN_PLAN_V4.md` §7.4).
 * Zero DOM dependencies so it can be unit-tested standalone and reused from the UI or CLI.
 */
import type { DiagramDocument, DiagramNode } from '../types';
import { STENCIL_CATALOG, createNodeFromStencil, createWireEdge, findStencil } from '../templates/presets';
import { expandStageToFit } from './layout';

export const QUICK_BUILD_MAX_NODES = 24;
export const QUICK_BUILD_MAX_WIRES = 40;
export const QUICK_BUILD_CELL_W = 242;
export const QUICK_BUILD_CELL_H = 172;
export const QUICK_BUILD_COL_PITCH = QUICK_BUILD_CELL_W + 90;
export const QUICK_BUILD_ROW_PITCH = QUICK_BUILD_CELL_H + 40;
export const QUICK_BUILD_BELOW_GAP = 90;

export interface BuildPlanNode {
  key: string;
  title: string;
  stencilId: string;
  existingId?: string;
  column: number;
  row: number;
}

export interface BuildPlanWire {
  from: string;
  to: string;
  sync: 'sync' | 'async';
}

export interface BuildPlan {
  nodes: BuildPlanNode[];
  wires: BuildPlanWire[];
  error?: 'too-large';
}

function normalizeName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

function capitalizeFirst(text: string): string {
  const first = Array.from(text)[0];
  if (!first) return text;
  return first.toUpperCase() + text.slice(first.length);
}

function stencilIdOfNode(node: Pick<DiagramNode, 'kind' | 'shape' | 'queue'>): string {
  if (node.kind === 'queue' && node.queue?.delivery === 'fanout') return 'stream';
  if (node.kind === 'store' && node.shape === 'bucket') return 'object-store';
  return findStencil(node.kind)?.id ?? 'service';
}

function inferStencilId(lowerName: string, words: ReadonlyArray<[string, string]>): string {
  const exact = STENCIL_CATALOG.find(
    (s) =>
      s.id.toLowerCase() === lowerName ||
      s.paletteTitle.toLowerCase() === lowerName ||
      s.defaultTitle.toLowerCase() === lowerName,
  );
  if (exact) return exact.id;

  const tokens = new Set(lowerName.split(/[^\p{L}\p{N}]+/u).filter(Boolean));
  if (tokens.size > 0) {
    for (const [word, stencilId] of words) {
      if (tokens.has(word.toLowerCase()) && findStencil(stencilId)) {
        return stencilId;
      }
    }
  }
  return 'service';
}

/**
 * Parse a chain expression (`a > b ~> c, b > d`) into a deterministic build plan without mutating `page`.
 */
export function planBuild(
  input: string,
  page: Pick<DiagramDocument, 'nodes'>,
  words: ReadonlyArray<[string, string]> = [],
): BuildPlan {
  const nodes: BuildPlanNode[] = [];
  const wires: BuildPlanWire[] = [];
  const byKey = new Map<string, BuildPlanNode>();
  const existingByKey = new Map<string, DiagramNode>();
  for (const existing of page.nodes) {
    const key = normalizeName(existing.title).toLowerCase();
    if (key && !existingByKey.has(key)) existingByKey.set(key, existing);
  }
  const seenEdges = new Set<string>();

  const resolveNode = (rawName: string): BuildPlanNode | null => {
    const collapsed = normalizeName(rawName);
    if (!collapsed) return null;
    const key = collapsed.toLowerCase();
    const cached = byKey.get(key);
    if (cached) return cached;

    const existing = existingByKey.get(key);
    const entry: BuildPlanNode = existing
      ? {
          key,
          title: existing.title,
          stencilId: stencilIdOfNode(existing),
          existingId: existing.id,
          column: 0,
          row: 0,
        }
      : {
          key,
          title: collapsed === key ? capitalizeFirst(collapsed) : collapsed,
          stencilId: inferStencilId(key, words),
          column: 0,
          row: 0,
        };
    byKey.set(key, entry);
    nodes.push(entry);
    return entry;
  };

  for (const chain of input.split(',')) {
    let prev: BuildPlanNode | null = null;
    let op: 'sync' | 'async' = 'sync';
    for (const part of chain.split(/(~>|>)/)) {
      if (part === '>') {
        op = 'sync';
        continue;
      }
      if (part === '~>') {
        op = 'async';
        continue;
      }
      const cur = resolveNode(part);
      if (!cur) continue;
      if (prev && prev.key !== cur.key) {
        const edgeKey = `${prev.key}\0${cur.key}`;
        if (!seenEdges.has(edgeKey)) {
          seenEdges.add(edgeKey);
          wires.push({ from: prev.key, to: cur.key, sync: op });
        }
      }
      prev = cur;
      op = 'sync';
    }
  }

  if (nodes.length > QUICK_BUILD_MAX_NODES || wires.length > QUICK_BUILD_MAX_WIRES) {
    return { nodes: [], wires: [], error: 'too-large' };
  }
  if (nodes.length === 0) return { nodes: [], wires: [] };

  // Identify back-edges via 3-color DFS so cyclic graphs still lay out deterministically.
  const outgoing = new Map<string, string[]>();
  for (const node of nodes) outgoing.set(node.key, []);
  for (const wire of wires) outgoing.get(wire.from)?.push(wire.to);

  const color = new Map<string, 0 | 1 | 2>();
  const backEdges = new Set<string>();
  const dfs = (u: string): void => {
    color.set(u, 1);
    for (const v of outgoing.get(u) ?? []) {
      const c = color.get(v) ?? 0;
      if (c === 1) backEdges.add(`${u}\0${v}`);
      else if (c === 0) dfs(v);
    }
    color.set(u, 2);
  };
  for (const node of nodes) {
    if ((color.get(node.key) ?? 0) === 0) dfs(node.key);
  }

  const dagParents = new Map<string, string[]>();
  for (const node of nodes) dagParents.set(node.key, []);
  for (const wire of wires) {
    if (!backEdges.has(`${wire.from}\0${wire.to}`)) {
      dagParents.get(wire.to)?.push(wire.from);
    }
  }

  const depthMemo = new Map<string, number>();
  const depthOf = (key: string): number => {
    const known = depthMemo.get(key);
    if (known !== undefined) return known;
    let best = 0;
    for (const parent of dagParents.get(key) ?? []) {
      best = Math.max(best, depthOf(parent) + 1);
    }
    depthMemo.set(key, best);
    return best;
  };

  const rowCounts = new Map<number, number>();
  for (const node of nodes) {
    node.column = depthOf(node.key);
    if (node.existingId) {
      node.row = 0;
      continue;
    }
    const row = rowCounts.get(node.column) ?? 0;
    node.row = row;
    rowCounts.set(node.column, row + 1);
  }

  return { nodes, wires };
}

/**
 * Materialize a `BuildPlan` onto `doc`, placing new nodes below existing components and wiring edges.
 */
export function applyBuild(
  doc: DiagramDocument,
  plan: BuildPlan,
  origin: { x: number; y: number },
): { added: string[]; wired: string[] } {
  if (plan.error || plan.nodes.length === 0) {
    return { added: [], wired: [] };
  }

  const preNodes = doc.nodes.slice();
  const byExistingId = new Map(preNodes.map((n) => [n.id, n]));
  let anchor: DiagramNode | undefined;
  for (const planned of plan.nodes) {
    if (planned.existingId) {
      anchor = byExistingId.get(planned.existingId);
      if (anchor) break;
    }
  }

  const x0 = anchor ? anchor.x : origin.x;
  const y0 =
    preNodes.length > 0
      ? Math.max(...preNodes.map((n) => n.y + n.height)) + QUICK_BUILD_BELOW_GAP
      : origin.y;

  const idByKey = new Map<string, string>();
  const added: string[] = [];

  for (const planned of plan.nodes) {
    if (planned.existingId && byExistingId.has(planned.existingId)) {
      idByKey.set(planned.key, planned.existingId);
      continue;
    }
    const node = createNodeFromStencil(planned.stencilId, 0, 0, doc.nodes.length);
    const stencil = findStencil(planned.stencilId);
    node.title = planned.title;
    if (stencil) {
      node.summary = `${planned.title} (${stencil.defaultSubtitle}) processes data within the architecture flow.`;
    }
    node.code = JSON.stringify(
      {
        id: node.id,
        component: planned.title,
        type: node.kind,
        status: 'ACTIVE',
      },
      null,
      2,
    );
    node.x = Math.round(x0 + planned.column * QUICK_BUILD_COL_PITCH + (QUICK_BUILD_CELL_W - node.width) / 2);
    node.y = Math.round(y0 + planned.row * QUICK_BUILD_ROW_PITCH + (QUICK_BUILD_CELL_H - node.height) / 2);
    doc.nodes.push(node);
    idByKey.set(planned.key, node.id);
    added.push(node.id);
  }

  const nodeById = new Map(doc.nodes.map((n) => [n.id, n]));
  const existingEdges = new Set(doc.edges.map((e) => `${e.from}\0${e.to}`));
  const wired: string[] = [];

  for (const wire of plan.wires) {
    const fromId = idByKey.get(wire.from);
    const toId = idByKey.get(wire.to);
    if (!fromId || !toId || fromId === toId) continue;
    const pairKey = `${fromId}\0${toId}`;
    if (existingEdges.has(pairKey)) continue;
    existingEdges.add(pairKey);

    const target = nodeById.get(toId);
    const edge = createWireEdge(fromId, toId, {
      tone: target?.accent ?? 'blue',
      ...(wire.sync === 'async' ? { sync: 'async' } : {}),
    });
    doc.edges.push(edge);
    wired.push(edge.id);
  }

  if (added.length > 0) expandStageToFit(doc);
  return { added, wired };
}
