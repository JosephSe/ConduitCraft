/**
 * A written description of a diagram (F-28): the same graph the canvas draws, as sentences. It feeds the text
 * alternative of every export, the "Alt text" box, "Copy as text" and, later, the text outline. Pure and DOM-free,
 * and it never prints an id: people and screen readers hear titles, not `svc-3`.
 */
import type { DiagramDocument, DiagramEdge, DiagramNode, LegendEntry, LevelContent, StreamTone } from '../types';
import { WIRE_PROTOCOL_NAMES } from './wire';
import { contentOfPage, pageCount, pageList } from './pages';

const TONE_COLOURS: Record<StreamTone, string> = {
  blue: 'Blue',
  emerald: 'Green',
  rose: 'Red',
  violet: 'Violet',
  amber: 'Amber',
};

/** Hand-built documents (tests, old files) can lack text fields; a description never throws over one. */
const txt = (value: string | undefined): string => (value ?? '').trim();

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/** "A", "A and B", "A, B and C". */
function list(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** Ends a sentence once, whatever the author typed. */
function sentence(text: string): string {
  const t = text.trim().replace(/\s+/g, ' ');
  if (!t) return '';
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

const nameOf = (node: DiagramNode | undefined): string => txt(node?.title) || 'an untitled component';

/** Which swimlane a component sits in: the one that holds its centre. */
export function zoneOf(content: LevelContent, node: DiagramNode) {
  const centre = node.x + node.width / 2;
  return (content.zones ?? []).find((zone) => centre >= zone.x && centre < zone.x + zone.width);
}

function laneName(zone: LevelContent['zones'][number]): string {
  const title = txt(zone.title) || 'Untitled swimlane';
  const subtitle = txt(zone.subtitle);
  return subtitle ? `${title} (${subtitle})` : title;
}

function swimlaneLines(content: LevelContent): string[] {
  const lines: string[] = [];
  const placed = new Set<string>();
  for (const zone of [...(content.zones ?? [])].sort((a, b) => a.x - b.x)) {
    const members = content.nodes.filter((n) => zoneOf(content, n) === zone);
    members.forEach((n) => placed.add(n.id));
    lines.push(`- ${laneName(zone)}: ${members.length ? list(members.map(nameOf)) : 'no components'}.`);
  }
  const loose = content.nodes.filter((n) => !placed.has(n.id));
  if (loose.length) lines.push((content.zones ?? []).length ? `- Outside any swimlane: ${list(loose.map(nameOf))}.` : `- ${list(loose.map(nameOf))}.`);
  return lines;
}

/** How one wire reads as the end of a clause: "Orders DB over SQL (about 20 ms)". */
function target(edge: DiagramEdge, to: DiagramNode | undefined): string {
  const proto = edge.protocol ? ` over ${WIRE_PROTOCOL_NAMES[edge.protocol]}` : '';
  const label = txt(edge.label) ? ` for “${txt(edge.label)}”` : '';
  const latency = edge.latencyMs !== undefined ? ` (about ${edge.latencyMs} ms)` : '';
  return `${nameOf(to)}${proto}${label}${latency}`;
}

/** One wire read from its source: "calls Orders DB over SQL (about 20 ms)". Used by the text outline too. */
export function describeWire(edge: DiagramEdge, to: DiagramNode | undefined): string {
  const verb = edge.flow === 'both' ? 'exchanges data with' : edge.sync === 'async' ? 'sends messages to' : 'calls';
  return `${verb} ${target(edge, to)}`;
}

function flowLines(content: LevelContent): string[] {
  const byId = new Map(content.nodes.map((n) => [n.id, n]));
  const lines: string[] = [];
  for (const from of content.nodes) {
    const out = (content.edges ?? []).filter((e) => e.from === from.id && byId.has(e.to));
    if (!out.length) continue;
    const calls = out.filter((e) => e.sync !== 'async' && e.flow !== 'both');
    const sends = out.filter((e) => e.sync === 'async' && e.flow !== 'both');
    const swaps = out.filter((e) => e.flow === 'both');
    const clauses: string[] = [];
    if (calls.length) clauses.push(`calls ${list(calls.map((e) => target(e, byId.get(e.to))))}`);
    if (sends.length) clauses.push(`sends messages to ${list(sends.map((e) => target(e, byId.get(e.to))))}`);
    if (swaps.length) clauses.push(`exchanges data with ${list(swaps.map((e) => target(e, byId.get(e.to))))}`);
    lines.push(`- ${nameOf(from)} ${list(clauses)}.`);
  }
  return lines;
}

/** One line per frame: what it holds (components, then frames inside it) and, for a nested frame, what it sits in (D1b). */
function frameLines(content: LevelContent): string[] {
  const frames = content.frames ?? [];
  const byId = new Map(frames.map((f) => [f.id, f]));
  const name = (f: { title: string }) => txt(f.title) || 'Untitled frame';
  return [...frames]
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((f) => {
      const members = content.nodes.filter((n) => n.frameId === f.id).map(nameOf);
      const inner = frames.filter((x) => x.parentId === f.id).map((x) => `frame ${name(x)}`);
      const held = [...members, ...inner];
      const parent = f.parentId ? byId.get(f.parentId) : undefined;
      return `- Frame ${name(f)}${parent ? `, inside ${name(parent)},` : ''} holds ${held.length ? list(held) : 'nothing'}.`;
    });
}

/** One line per component that opens into a level, nested levels included. */
function levelLines(content: LevelContent, trail: string[] = []): string[] {
  const lines: string[] = [];
  for (const node of content.nodes) {
    if (!node.child) continue;
    const path = [...trail, nameOf(node)];
    const inner = node.child.nodes.length;
    const lanes = (node.child.zones ?? []).length;
    lines.push(
      `- ${path.join(' > ')} opens into ${plural(inner, 'component')}${lanes ? ` in ${plural(lanes, 'swimlane')}` : ''}.`,
    );
    lines.push(...levelLines(node.child, path));
  }
  return lines;
}

/** One sentence per queue (K1): where it sits, how big it may grow and where overflow goes. */
function queueLines(content: LevelContent): string[] {
  const byId = new Map(content.nodes.map((n) => [n.id, n]));
  const edges = content.edges ?? [];
  const lines: string[] = [];
  for (const q of content.nodes) {
    if (q.kind !== 'queue') continue;
    const cfg = q.queue;
    const dlq = cfg?.deadLetterId;
    const producers = edges.filter((e) => e.to === q.id && byId.has(e.from)).map((e) => nameOf(byId.get(e.from)));
    const consumers = edges
      .filter((e) => e.from === q.id && e.to !== dlq && byId.has(e.to))
      .map((e) => nameOf(byId.get(e.to)));
    const kind = cfg?.ordering === 'fifo' ? 'a FIFO queue' : cfg?.ordering === 'priority' ? 'a priority queue' : 'a queue';
    const place =
      producers.length && consumers.length
        ? ` between ${list([...new Set(producers)])} and ${list([...new Set(consumers)])}`
        : producers.length
          ? ` fed by ${list([...new Set(producers)])}`
          : consumers.length
            ? ` read by ${list([...new Set(consumers)])}`
            : '';
    const parts = [`${nameOf(q)} is ${kind}${place}.`];
    const dlqNode = dlq ? byId.get(dlq) : undefined;
    if (cfg?.maxDepth) {
      parts.push(
        `It holds up to ${cfg.maxDepth} messages${dlqNode ? ` and sends overflow to ${nameOf(dlqNode)}` : ' and drops the rest'}.`,
      );
    } else if (dlqNode) {
      parts.push(`It sends overflow to ${nameOf(dlqNode)}.`);
    }
    if (cfg?.retention) parts.push(`It keeps messages for ${cfg.retention}.`);
    lines.push(`- ${parts.join(' ')}`);
  }
  return lines;
}

function scenarioLines(doc: DiagramDocument): string[] {
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  return (doc.simulations ?? []).map((scenario) => {
    const steps = (scenario.steps ?? []).map((step) => {
      const label = txt(step.label);
      if (label) return label;
      return list((step.nodes ?? []).map((id) => nameOf(byId.get(id))));
    });
    const name = txt(scenario.name) || 'Untitled scenario';
    return steps.length ? `- ${name}, ${plural(steps.length, 'step')}: ${steps.join('; ')}.` : `- ${name}.`;
  });
}

function legendLines(legend: readonly LegendEntry[]): string[] {
  return legend.map((entry) => {
    const meaning = entry.description?.trim();
    return `- ${TONE_COLOURS[entry.tone]} means ${entry.label}${meaning ? `: ${meaning}` : ''}.`;
  });
}

function countLine(content: LevelContent): string {
  const n = content.nodes.length;
  if (n === 0) return 'It is empty.';
  const lanes = (content.zones ?? []).length ? ` in ${plural((content.zones ?? []).length, 'swimlane')}` : '';
  const wires = (content.edges ?? []).length ? `, joined by ${plural((content.edges ?? []).length, 'wire')}` : '';
  return `It has ${plural(n, 'component')}${lanes}${wires}.`;
}

/** Title, summary and size: short enough for an image's alt text. */
export function describeDiagramBrief(doc: DiagramDocument): string {
  const title = txt(doc.title) || 'Untitled diagram';
  if (pageCount(doc) > 1) {
    const pages = pageList(doc);
    const total = pages.reduce((sum, p) => sum + (contentOfPage(doc, p.index)?.nodes.length ?? 0), 0);
    return [
      `${title}.`,
      sentence(doc.overviewSummary ?? ''),
      `It has ${pages.length} pages: ${list(pages.map((p) => p.title))}.`,
      `Together they hold ${plural(total, 'component')}.`,
    ]
      .filter(Boolean)
      .join(' ');
  }
  return [`${title}.`, sentence(doc.overviewSummary ?? ''), countLine(doc)].filter(Boolean).join(' ');
}

/** The whole outline, as plain text with blank lines between sections. */
export function describeDiagram(doc: DiagramDocument): string {
  const sections: string[] = [describeDiagramBrief(doc)];
  const add = (heading: string, lines: string[]) => {
    if (lines.length) sections.push([heading, ...lines].join('\n'));
  };
  if (pageCount(doc) === 1) {
    add((doc.zones ?? []).length ? 'Swimlanes' : 'Components', swimlaneLines(doc));
    add('Frames', frameLines(doc));
    add('Main flows', flowLines(doc));
    add('Queues', queueLines(doc));
    add('Levels', levelLines(doc));
  } else {
    // Each page is told on its own: a wire never crosses pages, so the sentences never mix them.
    for (const page of pageList(doc)) {
      const content = contentOfPage(doc, page.index);
      if (!content) continue;
      sections.push(`Page ${page.title} holds ${countLine(content).replace(/^It has /, '').replace(/^It is empty\.$/, 'nothing yet.')}`);
      add(`Page ${page.title}: ${(content.zones ?? []).length ? 'Swimlanes' : 'Components'}`, swimlaneLines(content));
      add(`Page ${page.title}: Frames`, frameLines(content));
      add(`Page ${page.title}: Main flows`, flowLines(content));
      add(`Page ${page.title}: Queues`, queueLines(content));
      add(`Page ${page.title}: Levels`, levelLines(content));
    }
  }
  add('Scenarios', scenarioLines(doc));
  if (doc.legend?.length) add('Colours', legendLines(doc.legend));
  return sections.join('\n\n');
}
