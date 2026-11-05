/**
 * The drift check (E5): has the file a diagram was imported from moved on since? Every component an importer made
 * records `source: { kind, ref }` (B8), so a newer copy of the file, converted the same way, can be laid beside the
 * diagram: components the file now has and the diagram lacks, components the diagram still shows that the file
 * dropped, and facts that changed (the image, the ports, the number of copies). Pure and DOM-free: the Review lens
 * dialog and `conduitcraft drift` both read it.
 *
 * Only what the importer owns is compared. A title, a note, a position or a tone the user changed is never drift,
 * and accepting a difference never moves or renames anything of theirs.
 */
import { expandStageToFit } from './layout';
import type { DiagramDocument, DiagramEdge, DiagramNode } from '../types';

export type DriftType = 'added' | 'removed' | 'changed';

export interface DriftItem {
  /** Stable for one report: `component:added:db`, `wire:removed:wire-3`. */
  id: string;
  type: DriftType;
  subject: 'component' | 'wire';
  /** The component's title, or "api → db" for a wire. */
  title: string;
  /** One plain sentence: "Image changed from postgres:15 to postgres:16." */
  detail: string;
  /** The component or wire in the diagram this is about (removed and changed). */
  targetId?: string;
  /** The `source.ref` of the component in the file (added and changed), or "ref → ref" for a wire in the file. */
  ref?: string;
}

export interface DriftReport {
  /** The source kind compared: `docker-compose`, `kubernetes` and so on. */
  kind: string;
  /** Components in the diagram that came from this kind of file. */
  tracked: number;
  items: DriftItem[];
}

/** Importer sources a drift check can read. A trace export is a measurement, not a description, so it is left out. */
export const DRIFT_KINDS = ['docker-compose', 'kubernetes', 'openapi', 'asyncapi'] as const;

/** Metric labels an importer fills in and a person rarely types by hand. Everything else on a component is theirs. */
const OWNED_LABELS = new Set(['Image', 'Build', 'Ports', 'Replicas', 'Kind', 'Namespace', 'Host', 'Message']);

const ownsMetric = (kind: string, label: string): boolean => kind === 'openapi' || OWNED_LABELS.has(label);

/** Wires an importer makes get `wire-<n>` ids; a wire drawn by hand does not, so only these count as "in the file". */
const importerWire = (e: DiagramEdge): boolean => /^wire-\d+$/.test(e.id);

const pair = (a: string, b: string): string => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`);

function ownedMetrics(node: DiagramNode, kind: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const m of node.metrics) {
    if (!ownsMetric(kind, m.label)) continue;
    out.set(m.label, [...(out.get(m.label) ?? []), m.value]);
  }
  for (const list of out.values()) list.sort();
  return out;
}

const copies = (n: DiagramNode): number => n.resilience?.replicas ?? 1;
const same = (a: string[] = [], b: string[] = []): boolean => a.length === b.length && a.every((v, i) => v === b[i]);
const shown = (values: string[]): string => values.join(', ');

/** What differs between a component in the diagram and the same component in the file, as short sentences. */
function describeChanges(kind: string, mine: DiagramNode, theirs: DiagramNode): string[] {
  const a = ownedMetrics(mine, kind);
  const b = ownedMetrics(theirs, kind);
  const out: string[] = [];
  for (const label of new Set([...a.keys(), ...b.keys()])) {
    const before = a.get(label);
    const after = b.get(label);
    if (same(before, after)) continue;
    if (before && after) out.push(`${label} changed from ${shown(before)} to ${shown(after)}.`);
    else if (after) out.push(`${label} is now ${shown(after)}.`);
    else out.push(`${label} (${shown(before!)}) is no longer in the file.`);
  }
  if (kind === 'docker-compose' && copies(mine) !== copies(theirs)) {
    out.push(`Running copies changed from ${copies(mine)} to ${copies(theirs)}.`);
  }
  return out;
}

const tracked = (doc: DiagramDocument, kind: string): DiagramNode[] => doc.nodes.filter((n) => n.source?.kind === kind && n.source.ref);

/** Compare the diagram with a freshly converted copy of the file it came from. */
export function computeDrift(doc: DiagramDocument, imported: DiagramDocument, kind: string): DriftReport {
  const mine = tracked(doc, kind);
  // Nothing here came from this kind of file, so there is nothing to have drifted from.
  if (mine.length === 0) return { kind, tracked: 0, items: [] };
  const mineByRef = new Map(mine.map((n) => [n.source!.ref, n]));
  const theirs = tracked(imported, kind);
  const theirsByRef = new Map(theirs.map((n) => [n.source!.ref, n]));
  const items: DriftItem[] = [];

  for (const node of theirs) {
    const ref = node.source!.ref;
    const existing = mineByRef.get(ref);
    if (!existing) {
      items.push({
        id: `component:added:${ref}`,
        type: 'added',
        subject: 'component',
        title: node.title,
        detail: `The file has ${node.title}${node.subtitle ? ` (${node.subtitle})` : ''}; the diagram does not.`,
        ref,
      });
      continue;
    }
    const changes = describeChanges(kind, existing, node);
    if (changes.length > 0) {
      items.push({ id: `component:changed:${ref}`, type: 'changed', subject: 'component', title: existing.title, detail: changes.join(' '), targetId: existing.id, ref });
    }
  }
  for (const node of mine) {
    if (theirsByRef.has(node.source!.ref)) continue;
    items.push({
      id: `component:removed:${node.source!.ref}`,
      type: 'removed',
      subject: 'component',
      title: node.title,
      detail: `${node.title} is no longer in the file.`,
      targetId: node.id,
      ref: node.source!.ref,
    });
  }

  // Wires: judged only between components that are in both, so a removed or added component carries its own wires.
  const refOfId = new Map(mine.map((n) => [n.id, n.source!.ref]));
  const theirRefOfId = new Map(theirs.map((n) => [n.id, n.source!.ref]));
  const inFile = new Set<string>();
  for (const e of imported.edges) {
    const a = theirRefOfId.get(e.from);
    const b = theirRefOfId.get(e.to);
    if (a && b) inFile.add(pair(a, b));
  }
  const inDiagram = new Set<string>();
  for (const e of doc.edges) {
    const a = refOfId.get(e.from);
    const b = refOfId.get(e.to);
    if (a && b) inDiagram.add(pair(a, b));
  }
  const titleOfRef = (ref: string) => mineByRef.get(ref)?.title ?? theirsByRef.get(ref)?.title ?? ref;
  const seen = new Set<string>();
  for (const e of imported.edges) {
    const a = theirRefOfId.get(e.from);
    const b = theirRefOfId.get(e.to);
    if (!a || !b || !mineByRef.has(a) || !mineByRef.has(b)) continue;
    const key = pair(a, b);
    if (inDiagram.has(key) || seen.has(key)) continue;
    seen.add(key);
    items.push({
      id: `wire:added:${a}>${b}`,
      type: 'added',
      subject: 'wire',
      title: `${titleOfRef(a)} → ${titleOfRef(b)}`,
      detail: `The file connects ${titleOfRef(a)} and ${titleOfRef(b)}; the diagram has no wire between them.`,
      ref: `${a} → ${b}`,
    });
  }
  for (const e of doc.edges) {
    const a = refOfId.get(e.from);
    const b = refOfId.get(e.to);
    if (!a || !b || !theirsByRef.has(a) || !theirsByRef.has(b) || !importerWire(e)) continue;
    if (inFile.has(pair(a, b))) continue;
    items.push({
      id: `wire:removed:${e.id}`,
      type: 'removed',
      subject: 'wire',
      title: `${titleOfRef(a)} → ${titleOfRef(b)}`,
      detail: `The file no longer connects ${titleOfRef(a)} and ${titleOfRef(b)}.`,
      targetId: e.id,
    });
  }
  return { kind, tracked: mine.length, items };
}

/** One line for a person or a pull request comment: "2 components added, 1 changed, 1 wire removed". */
export function driftSummary(report: DriftReport): string {
  if (report.items.length === 0) return report.tracked === 0 ? 'nothing in this diagram was imported from this kind of file' : 'no drift';
  const count = (type: DriftType, subject: DriftItem['subject']) => report.items.filter((i) => i.type === type && i.subject === subject).length;
  const part = (n: number, one: string, many: string, verb: string) => (n ? [`${n} ${n === 1 ? one : many} ${verb}`] : []);
  return [
    ...part(count('added', 'component'), 'component', 'components', 'in the file only'),
    ...part(count('removed', 'component'), 'component', 'components', 'gone from the file'),
    ...part(count('changed', 'component'), 'component', 'components', 'changed'),
    ...part(count('added', 'wire'), 'wire', 'wires', 'in the file only'),
    ...part(count('removed', 'wire'), 'wire', 'wires', 'gone from the file'),
  ].join(', ');
}

function uniqueId(base: string, used: Set<string>): string {
  let id = base;
  for (let i = 2; used.has(id); i++) id = `${base}-${i}`;
  used.add(id);
  return id;
}

/**
 * Make the chosen differences true in `doc`, in place (so one `mutateWithHistory` makes it one undo step). A
 * component added from the file lands to the right of what is there, and brings its wires to components that are
 * already in the diagram. A removed component takes its wires with it. A changed one takes the file's values for the
 * facts the importer owns, and its subtitle when that was only the image. Returns how many differences were applied.
 */
export function applyDrift(doc: DiagramDocument, imported: DiagramDocument, kind: string, items: DriftItem[]): number {
  const used = new Set<string>([...doc.nodes.map((n) => n.id), ...doc.edges.map((e) => e.id), ...doc.zones.map((z) => z.id)]);
  const theirsByRef = new Map(tracked(imported, kind).map((n) => [n.source!.ref, n]));
  let applied = 0;

  // Changed.
  for (const item of items.filter((i) => i.type === 'changed' && i.subject === 'component')) {
    const node = doc.nodes.find((n) => n.id === item.targetId);
    const theirs = item.ref ? theirsByRef.get(item.ref) : undefined;
    if (!node || !theirs) continue;
    const oldValues = new Set(node.metrics.filter((m) => ownsMetric(kind, m.label)).flatMap((m) => [m.value, `build: ${m.value}`]));
    node.metrics = [...node.metrics.filter((m) => !ownsMetric(kind, m.label)), ...theirs.metrics.filter((m) => ownsMetric(kind, m.label)).map((m) => ({ ...m }))];
    if (node.subtitle && oldValues.has(node.subtitle.trim())) node.subtitle = theirs.subtitle;
    if (kind === 'docker-compose') {
      if (copies(theirs) > 1) node.resilience = { ...node.resilience, replicas: copies(theirs) };
      else if (node.resilience) {
        delete node.resilience.replicas;
        if (Object.keys(node.resilience).length === 0) delete node.resilience;
      }
    }
    applied += 1;
  }

  // Removed components, with the wires that touch them.
  const gone = new Set(items.filter((i) => i.type === 'removed' && i.subject === 'component' && i.targetId).map((i) => i.targetId!));
  if (gone.size > 0) {
    applied += gone.size;
    doc.nodes = doc.nodes.filter((n) => !gone.has(n.id));
    doc.edges = doc.edges.filter((e) => !gone.has(e.from) && !gone.has(e.to));
    for (const scenario of doc.simulations ?? []) for (const step of scenario.steps) step.nodes = step.nodes.filter((id) => !gone.has(id));
  }

  // Added components.
  const idForRef = new Map(tracked(doc, kind).map((n) => [n.source!.ref, n.id]));
  const idForTheirs = new Map<string, string>();
  for (const [ref, node] of theirsByRef) if (idForRef.has(ref)) idForTheirs.set(node.id, idForRef.get(ref)!);
  const fresh: DiagramNode[] = [];
  for (const item of items.filter((i) => i.type === 'added' && i.subject === 'component')) {
    const theirs = item.ref ? theirsByRef.get(item.ref) : undefined;
    if (!theirs) continue;
    const copy = structuredClone(theirs);
    copy.id = uniqueId(theirs.id, used);
    idForTheirs.set(theirs.id, copy.id);
    fresh.push(copy);
    applied += 1;
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

  // Added wires: the ones picked, and every wire a newly added component has to something that is on the canvas.
  const newIds = new Set(fresh.map((n) => n.id));
  const chosenWires = new Set(items.filter((i) => i.type === 'added' && i.subject === 'wire').map((i) => i.ref));
  const theirRef = new Map(tracked(imported, kind).map((n) => [n.id, n.source!.ref]));
  const wired = new Set(doc.edges.map((e) => pair(e.from, e.to)));
  for (const e of imported.edges) {
    const from = idForTheirs.get(e.from);
    const to = idForTheirs.get(e.to);
    if (!from || !to || from === to) continue;
    const picked = chosenWires.has(`${theirRef.get(e.from)} → ${theirRef.get(e.to)}`) || chosenWires.has(`${theirRef.get(e.to)} → ${theirRef.get(e.from)}`);
    if (!picked && !newIds.has(from) && !newIds.has(to)) continue;
    if (wired.has(pair(from, to))) continue;
    wired.add(pair(from, to));
    doc.edges.push({ ...structuredClone(e), id: uniqueId(e.id, used), from, to });
    if (picked) applied += 1;
  }

  // Removed wires.
  const dropWires = new Set(items.filter((i) => i.type === 'removed' && i.subject === 'wire' && i.targetId).map((i) => i.targetId!));
  if (dropWires.size > 0) {
    const before = doc.edges.length;
    doc.edges = doc.edges.filter((e) => !dropWires.has(e.id));
    applied += before - doc.edges.length;
  }

  expandStageToFit(doc);
  return applied;
}
