import yaml from 'js-yaml';
import type {
  ComponentStatus,
  DiagramDocument,
  DiagramEdge,
  DiagramFrame,
  DiagramNode,
  DiagramNotesCard,
  DiagramPage,
  DiagramZone,
  EdgeFlowMode,
  EdgeRouteMode,
  ImportIssue,
  KeyValueMetric,
  LevelContent,
  NodeKind,
  NodeShape,
  PortSide,
  SimulationScenario,
  StreamTone,
} from '../types';
import { normalizeNotesItemIcon } from '../types';
import { STENCIL_CATALOG, createBlankDocument, nextUid } from '../templates/presets';
import { normalizeIconName } from '../ui/icons';
import { brandIsDefault, normalizeBrand } from './brand';
import { normalizeLegend, normalizeNodeMeta, normalizeTags } from './meta';
import { pruneDanglingChaos } from './reachability';
import { normalizeBudgetMs, normalizeInsights } from './insights';
import { normalizeWireFields } from './wire';
import { coerceFrames, dropDanglingFrameIds } from './frames';
import { adoptByGeometry, createFrame, frameAround } from './frameOps';
import { MAX_PAGES, normalizePages } from './pages';
import { nodeKeys } from './codeLines';
import { isKnownNodeShape, normalizeNodeShape, sanitizeIconImage } from './nodeStyle';
import { autoLayoutDocument, expandStageToFit, getNodeDimensions } from './layout';

interface RawNodeMeta {
  kind?: string;
  tier?: string;
  accent?: string;
  tone?: string;
  icon?: string;
  shape?: string;
  iconImage?: string;
  title?: string;
  subtitle?: string;
  eyebrow?: string;
  footerLeft?: string;
  chip?: string;
  zone?: string;
  zoneLabel?: string;
  interface?: string;
  interfaceLabel?: string;
  summary?: string;
  metrics?: Array<{ label?: unknown; value?: unknown }> | Record<string, unknown>;
  code?: unknown;
  payload?: unknown;
  position?: [number, number];
  x?: number;
  y?: number;
  status?: string;
  comment?: string;
  locked?: boolean;
  groupId?: string;
  frame?: string;
  owner?: unknown;
  tags?: unknown;
  links?: unknown;
  resilience?: unknown;
  queue?: unknown;
  balancer?: unknown;
  external?: unknown;
  cache?: unknown;
  limiter?: unknown;
  schedule?: unknown;
  source?: unknown;
}

interface RawEdgeOverride {
  id?: string;
  from?: string;
  to?: string;
  sourcePort?: string;
  targetPort?: string;
  tone?: string;
  kind?: string;
  route?: string;
  label?: string;
  animated?: boolean;
  flow?: string;
  waypoint?: [number, number];
  comment?: string;
  protocol?: unknown;
  sync?: unknown;
  latencyMs?: unknown;
  tags?: unknown;
}

/** Wire protocol, call style, latency and tags from a YAML edge entry, validated like a file. */
function wireExtras(raw: RawEdgeOverride | undefined): ReturnType<typeof normalizeWireFields> & { tags?: string[] } {
  const tags = normalizeTags(raw?.tags);
  return { ...normalizeWireFields((raw ?? {}) as Record<string, unknown>), ...(tags.length ? { tags } : {}) };
}

interface RawBlueprintMeta {
  title?: string;
  systemTag?: string;
  statusLabel?: string;
  direction?: string;
  stageWidth?: number;
  stageHeight?: number;
  overviewSummary?: string;
  brand?: { name?: string; accent?: string; logo?: string };
  legend?: unknown;
  insights?: unknown;
  frames?: unknown;
  pages?: unknown;
  pageTitle?: unknown;
  pageId?: unknown;
  zones?: Array<{
    id?: string;
    number?: string | number;
    title?: string;
    subtitle?: string;
    x?: number;
    width?: number;
  }>;
  notesCards?: Array<{
    id?: string;
    title?: string;
    code?: string;
    position?: [number, number];
    x?: number;
    y?: number;
    items?: Array<{ title?: string; text?: string; icon?: string }>;
    variant?: string;
  }>;
  specCard?: {
    id?: string;
    title?: string;
    code?: string;
    position?: [number, number];
    x?: number;
    y?: number;
    items?: Array<{ title?: string; text?: string; icon?: string }>;
  };
  nodes?: Record<string, RawNodeMeta>;
  edges?: RawEdgeOverride[];
  simulations?: Array<{
    id?: string;
    name?: string;
    tone?: string;
    failures?: unknown;
    budgetMs?: unknown;
    steps?: Array<{
      id?: string;
      nodes?: string[];
      tone?: string;
      label?: string;
      trace?: string;
    }>;
  }>;
}

interface ParsedMermaidNode {
  id: string;
  title: string;
  subtitle: string;
  kind: NodeKind;
  shape?: NodeShape;
  tone?: StreamTone;
  link?: string;
  className?: string;
  subgraphTitle?: string;
  /** The innermost subgraph this component was first written in; used by "Subgraphs as: Levels". */
  subgraph?: ParsedSubgraph;
}

interface ParsedMermaidEdge {
  from: string;
  to: string;
  label: string;
  tone: StreamTone;
  route: EdgeRouteMode;
  flow?: EdgeFlowMode;
}

interface ParsedSubgraph {
  id: string;
  title: string;
  nodeIds: string[];
  parent?: ParsedSubgraph;
}

function normalizeNodeKind(raw: string | undefined, fallback: NodeKind = 'service'): NodeKind {
  if (!raw) return fallback;
  const k = raw.trim().toLowerCase();
  if (k === 'actor' || k === 'human' || k === 'user' || k === 'person') return 'actor';
  if (k === 'core' || k === 'platform' || k === 'primary') return 'core';
  if (k === 'queue' || k === 'sqs' || k === 'fifo' || k === 'mq' || k === 'work-queue') return 'queue';
  if (k === 'cache' || k === 'memcached' || k === 'varnish' || k === 'cdn-cache') return 'cache';
  if (k === 'limiter' || k === 'rate-limiter' || k === 'ratelimiter' || k === 'throttle') return 'limiter';
  if (k === 'scheduler' || k === 'cron' || k === 'timer' || k === 'schedule' || k === 'cronjob') return 'scheduler';
  if (k === 'balancer' || k === 'lb' || k === 'load-balancer' || k === 'loadbalancer') return 'balancer';
  if (k === 'bus' || k === 'broker' || k === 'stream') return 'bus';
  if (k === 'gate' || k === 'approval' || k === 'decision' || k === 'policy') return 'gate';
  if (k === 'store' || k === 'database' || k === 'db' || k === 'storage') return 'store';
  if (k === 'client' || k === 'agency' || k === 'consumer' || k === 'external') return 'client';
  if (k === 'service' || k === 'api' || k === 'worker') return 'service';
  return fallback;
}

function normalizeTone(raw: string | undefined, fallback: StreamTone = 'blue'): StreamTone {
  if (!raw) return fallback;
  const t = raw.trim().toLowerCase();
  if (t === 'emerald' || t === 'green' || t === 'approval' || t === 'success') return 'emerald';
  if (t === 'rose' || t === 'red' || t === 'rejection' || t === 'error' || t === 'exception') return 'rose';
  if (t === 'violet' || t === 'purple' || t === 'governance' || t === 'control') return 'violet';
  if (t === 'amber' || t === 'yellow' || t === 'orange' || t === 'async' || t === 'warn') return 'amber';
  if (t === 'blue' || t === 'ingestion' || t === 'primary') return 'blue';
  return fallback;
}

function normalizePortSide(raw: string | undefined): PortSide {
  if (!raw) return 'auto';
  const s = raw.trim().toLowerCase();
  if (s === 'top' || s === 'right' || s === 'bottom' || s === 'left') return s;
  return 'auto';
}

function normalizeRouteMode(raw: string | undefined): EdgeRouteMode {
  if (!raw) return 'auto';
  const r = raw.trim().toLowerCase();
  if (r === 'straight' || r === 'direct' || r === 'line') return 'straight';
  if (r === 'bezier' || r === 'curve' || r === 'scurve' || r === 's-curve') return 'bezier';
  if (r === 'arc' || r === 'bow') return 'arc';
  if (r === 'orthogonal' || r === 'elbow' || r === 'manhattan' || r === 'rounded') {
    return 'orthogonal';
  }
  if (r === 'step' || r === 'sharp' || r === 'polyline' || r === 'mitre') return 'step';
  if (r === 'under' || r === 'under-loop') return 'under';
  if (r === 'over' || r === 'over-loop') return 'over';
  if (r === 'fanout' || r === 'fan-out' || r === 'tree') return 'fanout';
  return 'auto';
}

function splitLabelLines(rawLabel: string): { title: string; subtitle: string } {
  const unquoted = rawLabel.trim().replace(/^"(.*)"$/s, '$1').replace(/^'(.*)'$/s, '$1');
  const lines = unquoted
    .split(/<br\s*\/?>|\\n|\n/i)
    .map((s) => s.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return { title: 'Node', subtitle: 'Component' };
  }
  if (lines.length === 1) {
    return { title: lines[0], subtitle: '' };
  }
  return {
    title: lines[0],
    subtitle: lines.slice(1).join(' · '),
  };
}

const STREAM_TONE_RGB: Record<StreamTone, [number, number, number]> = {
  blue: [59, 130, 246],
  emerald: [16, 185, 129],
  rose: [244, 63, 94],
  violet: [139, 92, 246],
  amber: [245, 158, 11],
};

const COLOR_NAME_MAP: Record<string, StreamTone> = {
  blue: 'blue',
  sky: 'blue',
  cyan: 'blue',
  navy: 'blue',
  teal: 'blue',
  aqua: 'blue',
  dodgerblue: 'blue',
  cornflowerblue: 'blue',
  green: 'emerald',
  emerald: 'emerald',
  lime: 'emerald',
  forestgreen: 'emerald',
  seagreen: 'emerald',
  darkgreen: 'emerald',
  springgreen: 'emerald',
  red: 'rose',
  rose: 'rose',
  pink: 'rose',
  crimson: 'rose',
  salmon: 'rose',
  magenta: 'rose',
  deeppink: 'rose',
  purple: 'violet',
  violet: 'violet',
  indigo: 'violet',
  fuchsia: 'violet',
  plum: 'violet',
  yellow: 'amber',
  amber: 'amber',
  orange: 'amber',
  gold: 'amber',
  coral: 'amber',
};

export function colorToStreamTone(colorStr: string): StreamTone {
  if (!colorStr) return 'blue';
  const clean = colorStr.trim().toLowerCase();
  if (COLOR_NAME_MAP[clean]) return COLOR_NAME_MAP[clean];

  let rgb: [number, number, number] | null = null;
  const hexMatch = clean.match(/^#([0-9a-f]{3,8})$/i);
  if (hexMatch) {
    const h = hexMatch[1];
    if (h.length === 3 || h.length === 4) {
      rgb = [
        parseInt(h[0] + h[0], 16),
        parseInt(h[1] + h[1], 16),
        parseInt(h[2] + h[2], 16),
      ];
    } else if (h.length >= 6) {
      rgb = [
        parseInt(h.slice(0, 2), 16),
        parseInt(h.slice(2, 4), 16),
        parseInt(h.slice(4, 6), 16),
      ];
    }
  }

  if (!rgb) {
    const rgbMatch = clean.match(/^rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (rgbMatch) {
      rgb = [parseInt(rgbMatch[1], 10), parseInt(rgbMatch[2], 10), parseInt(rgbMatch[3], 10)];
    }
  }

  if (rgb) {
    let bestTone: StreamTone = 'blue';
    let bestDist = Infinity;
    for (const [tone, [tr, tg, tb]] of Object.entries(STREAM_TONE_RGB) as Array<[StreamTone, [number, number, number]]>) {
      const dist = (rgb[0] - tr) ** 2 + (rgb[1] - tg) ** 2 + (rgb[2] - tb) ** 2;
      if (dist < bestDist) {
        bestDist = dist;
        bestTone = tone;
      }
    }
    return bestTone;
  }

  return 'blue';
}

function parseSingleNodeToken(token: string): {
  id: string;
  label?: string;
  inferredKind?: NodeKind;
  shape?: NodeShape;
  className?: string;
} | null {
  let trimmed = token.trim();
  if (!trimmed) return null;

  let className: string | undefined;
  const classMatch = trimmed.match(/:::([\w-]+)$/);
  if (classMatch) {
    className = classMatch[1];
    trimmed = trimmed.slice(0, classMatch.index).trim();
  }

  const shapePatterns: Array<{ regex: RegExp; kind: NodeKind; shape?: NodeShape }> = [
    // Stadium ([Actor]) or Double Circle (((Actor))) / Circle ((Actor)) -> actor
    { regex: /^([A-Za-z0-9_.-]+)\s*\(\[([\s\S]+)\]\)$/, kind: 'actor', shape: 'pill' },
    { regex: /^([A-Za-z0-9_.-]+)\s*\(\(\(([\s\S]+)\)\)\)$/, kind: 'actor', shape: 'circle' },
    { regex: /^([A-Za-z0-9_.-]+)\s*\(\(([\s\S]+)\)\)$/, kind: 'actor', shape: 'circle' },
    // Subroutine [[Core]] -> core
    { regex: /^([A-Za-z0-9_.-]+)\s*\[\[([\s\S]+)\]\]$/, kind: 'core', shape: 'card' },
    // Database cylinder [(Store)] -> store. The drum is drawn; no outline is stored.
    { regex: /^([A-Za-z0-9_.-]+)\s*\[\(([\s\S]+)\)\]$/, kind: 'store' },
    // Hexagon {{Gate}} or Rhombus {Gate} -> gate
    { regex: /^([A-Za-z0-9_.-]+)\s*\{\{([\s\S]+)\}\}$/, kind: 'gate', shape: 'hexagon' },
    { regex: /^([A-Za-z0-9_.-]+)\s*\{([\s\S]+)\}$/, kind: 'gate', shape: 'diamond' },
    // Trapezoid [/Load Balancer\] -> balancer. Listed before the parallelograms so [/Client/] stays a client.
    { regex: /^([A-Za-z0-9_.-]+)\s*\[\/([\s\S]+)\\\]$/, kind: 'balancer' },
    // Asymmetric >Client] or Parallelogram [/Client/] -> client
    { regex: /^([A-Za-z0-9_.-]+)\s*>([\s\S]+)\]$/, kind: 'client', shape: 'asymmetric' },
    { regex: /^([A-Za-z0-9_.-]+)\s*\[\/([\s\S]+)\/\]$/, kind: 'client', shape: 'card' },
    { regex: /^([A-Za-z0-9_.-]+)\s*\[\\([\s\S]+)\\\]$/, kind: 'client', shape: 'card' },
    // Rounded (Event Broker) -> bus
    { regex: /^([A-Za-z0-9_.-]+)\s*\(([\s\S]+)\)$/, kind: 'bus', shape: 'rounded' },
    // Standard rectangle [Service] -> service
    { regex: /^([A-Za-z0-9_.-]+)\s*\[([\s\S]+)\]$/, kind: 'service', shape: 'card' },
  ];

  for (const { regex, kind, shape } of shapePatterns) {
    const m = trimmed.match(regex);
    if (m) {
      return { id: m[1], label: m[2], inferredKind: kind, shape, className };
    }
  }

  const plainId = trimmed.match(/^([A-Za-z0-9_.-]+)$/);
  if (plainId) {
    return { id: plainId[1], className };
  }

  return null;
}

const EDGE_CONNECTOR_REGEX =
  /(\s*(?:<==>\s*\|[^|\n]*\||<==>|==\s*[^=\n]+?\s*==[=>]|==>\s*\|[^|\n]*\||==>|===\s*\|[^|\n]*\||===|<-[.]->\s*\|[^|\n]*\||<-[.]->|-\.\s*[^.\n]+?\s*(?:\.->|-[.]-)|-\.->\s*\|[^|\n]*\||-\.->|-[.]-\s*\|[^|\n]*\||-[.]-|<-->\s*\|[^|\n]*\||<-->|--\s*[^-\n>]+?\s*--[->]|-->\s*\|[^|\n]*\||-->|---\s*\|[^|\n]*\||---)\s*)/g;

function parseConnectorToken(rawArrow: string): {
  label: string;
  tone: StreamTone;
  route: EdgeRouteMode;
  flow: EdgeFlowMode;
} {
  const s = rawArrow.trim();

  if (s.startsWith('==') || s.startsWith('<==>') || s.startsWith('===')) {
    let label = '';
    const pipeMatch = s.match(/(?:==>|<==>|===)\s*\|([^|]*)\|/);
    const inlineMatch = s.match(/^==\s*([\s\S]+?)\s*==[=>]$/);
    if (pipeMatch) label = pipeMatch[1].trim();
    else if (inlineMatch) label = inlineMatch[1].trim();
    const flow: EdgeFlowMode =
      s.includes('<==>') || s === '===' || s.startsWith('===|') || (inlineMatch ? s.endsWith('===') : false)
        ? 'both'
        : 'forward';
    return { label, tone: 'emerald', route: 'auto', flow };
  }

  if (s.startsWith('-.') || s.startsWith('<-.->') || s.startsWith('-.-')) {
    let label = '';
    const pipeMatch = s.match(/(?:-\.->|<-[.]->|-[.]-)\s*\|([^|]*)\|/);
    const inlineMatch = s.match(/^-\.\s*([\s\S]+?)\s*(?:\.->|-[.]-)$/);
    if (pipeMatch) label = pipeMatch[1].trim();
    else if (inlineMatch) label = inlineMatch[1].trim();
    const flow: EdgeFlowMode =
      s.includes('<-.->') || s === '-.-' || s.startsWith('-.-|') || (inlineMatch ? s.endsWith('-.-') : false)
        ? 'both'
        : 'forward';
    return { label, tone: 'rose', route: 'auto', flow };
  }

  let label = '';
  const pipeMatch = s.match(/(?:-->|<-->|---)\s*\|([^|]*)\|/);
  const inlineMatch = s.match(/^--\s*([\s\S]+?)\s*--[->]$/);
  if (pipeMatch) label = pipeMatch[1].trim();
  else if (inlineMatch) label = inlineMatch[1].trim();
  const flow: EdgeFlowMode =
    s.includes('<-->') || s === '---' || s.startsWith('---|') || (inlineMatch ? s.endsWith('---') : false)
      ? 'both'
      : 'forward';

  return { label, tone: 'blue', route: 'auto', flow };
}

function countNewlines(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 10) n++;
  return n;
}

function yamlErrorLine(err: unknown, blockStartLine1: number): number | undefined {
  const mark = (err as { mark?: { line?: number } }).mark;
  return typeof mark?.line === 'number' ? blockStartLine1 + mark.line : undefined;
}

function extractSections(rawInput: string): {
  meta: RawBlueprintMeta;
  mermaidSource: string;
  mermaidLineBase: number;
  warnings: string[];
  issues: ImportIssue[];
} {
  const warnings: string[] = [];
  const issues: ImportIssue[] = [];
  const pushIssue = (issue: ImportIssue) => {
    issues.push(issue);
    if (issue.level !== 'info') {
      warnings.push(issue.line ? `Line ${issue.line}: ${issue.message}` : issue.message);
    }
  };

  const normalized = rawInput.replace(/\r\n/g, '\n');
  const leadLines = countNewlines(normalized.match(/^\s*/)?.[0] ?? '');
  let text = normalized.trim();
  let bodyLineBase = leadLines; // 0-based line index of `text[0]` within the original input
  // A chat reply often wraps the whole file in a ```markdown fence, with a sentence before it. When that fence holds
  // front matter, read the file inside it.
  if (!text.startsWith('---')) {
    const fenced = /(^|\n)(`{3,}|~{3,})[ \t]*(?:markdown|md)[ \t]*\n(---\n[\s\S]*?\n---[ \t]*(?:\n[\s\S]*?)?)\n\2[ \t]*(?:\n|$)/i.exec(text);
    if (fenced) {
      bodyLineBase += countNewlines(text.slice(0, fenced.index + fenced[1].length)) + 1;
      text = fenced[3].trim();
    }
  }
  const mergedMeta: RawBlueprintMeta = {};

  const mergeMetaObject = (parsed: unknown, sourceLabel: string) => {
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
    const obj = parsed as RawBlueprintMeta;
    Object.assign(mergedMeta, {
      ...obj,
      nodes: { ...(mergedMeta.nodes || {}), ...(obj.nodes || {}) },
    });
    void sourceLabel;
  };

  if (text.startsWith('---')) {
    const endIdx = text.indexOf('\n---', 3);
    if (endIdx !== -1) {
      const yamlRaw = text.slice(3, endIdx);
      const yamlBlock = yamlRaw.trim();
      // Frontmatter content begins on the line after the opening `---`
      const yamlStartLine1 =
        bodyLineBase + 2 + countNewlines(yamlRaw.match(/^\s*/)?.[0] ?? '') - (yamlRaw.startsWith('\n') ? 1 : 0);
      const remainder = text.slice(endIdx + 4);
      bodyLineBase +=
        countNewlines(text.slice(0, endIdx + 4)) + countNewlines(remainder.match(/^\s*/)?.[0] ?? '');
      text = remainder.trim();
      try {
        mergeMetaObject(yaml.load(yamlBlock), 'frontmatter');
      } catch (err) {
        pushIssue({
          level: 'error',
          code: 'yaml-frontmatter',
          line: yamlErrorLine(err, yamlStartLine1),
          message: `YAML frontmatter could not be parsed: ${((err as Error).message || '').split('\n')[0]}`,
        });
      }
    }
  }

  const codeBlockRegex = /```(yaml|yml|json|mermaid|mmd)\s*\n([\s\S]*?)```/gi;
  const mermaidBlocks: string[] = [];
  let mermaidLineBase = bodyLineBase + 1;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    const lang = match[1].toLowerCase();
    const content = match[2].trim();
    const contentStartLine1 = bodyLineBase + countNewlines(text.slice(0, match.index)) + 2;
    if (lang === 'mermaid' || lang === 'mmd') {
      if (mermaidBlocks.length === 0) mermaidLineBase = contentStartLine1;
      mermaidBlocks.push(content);
    } else if (lang === 'json') {
      try {
        mergeMetaObject(JSON.parse(content), 'json block');
      } catch (err) {
        pushIssue({
          level: 'error',
          code: 'json-block',
          line: contentStartLine1,
          message: `JSON block could not be parsed: ${(err as Error).message}`,
        });
      }
    } else {
      try {
        mergeMetaObject(yaml.load(content), 'yaml block');
      } catch (err) {
        pushIssue({
          level: 'error',
          code: 'yaml-block',
          line: yamlErrorLine(err, contentStartLine1),
          message: `YAML block could not be parsed: ${((err as Error).message || '').split('\n')[0]}`,
        });
      }
    }
  }

  let mermaidSource = '';
  if (mermaidBlocks.length > 0) {
    mermaidSource = mermaidBlocks.join('\n');
  } else {
    const stripped = text.replace(codeBlockRegex, '').trim();
    if (
      /^(flowchart|graph)\b/im.test(stripped) ||
      /-->|==>|-\.->/.test(stripped) ||
      /\[[\s\S]+?\]/.test(stripped)
    ) {
      mermaidSource = stripped;
    }
  }

  return { meta: mergedMeta, mermaidSource, mermaidLineBase, warnings, issues };
}

function parseMermaidFlowchart(
  source: string,
  lineBase = 1,
  issues: ImportIssue[] = [],
): {
  direction: 'LR' | 'TD';
  nodes: Map<string, ParsedMermaidNode>;
  edges: ParsedMermaidEdge[];
  subgraphs: ParsedSubgraph[];
} {
  let direction: 'LR' | 'TD' = 'LR';
  const nodes = new Map<string, ParsedMermaidNode>();
  const edges: ParsedMermaidEdge[] = [];
  const subgraphs: ParsedSubgraph[] = [];
  const subgraphStack: ParsedSubgraph[] = [];
  const classDefs = new Map<string, { tone: StreamTone }>();
  let defaultLinkTone: StreamTone | undefined;
  let currentLine = lineBase;

  function parseStylesToTone(stylesStr: string): StreamTone | null {
    const parts = stylesStr.split(/[,;]/);
    for (const part of parts) {
      const colonIdx = part.indexOf(':');
      if (colonIdx === -1) continue;
      const prop = part.slice(0, colonIdx).trim().toLowerCase();
      const val = part.slice(colonIdx + 1).trim();
      if (prop === 'fill' || prop === 'stroke' || prop === 'color') {
        return colorToStreamTone(val);
      }
    }
    return null;
  }

  const ensureNode = (
    id: string,
    label?: string,
    inferredKind?: NodeKind,
    shape?: NodeShape,
    className?: string,
    claim = false,
  ) => {
    const existing = nodes.get(id);
    const activeSubgraph = subgraphStack[subgraphStack.length - 1];
    if (activeSubgraph && !activeSubgraph.nodeIds.includes(id)) {
      activeSubgraph.nodeIds.push(id);
    }

    const assignedTone = className && classDefs.has(className) ? classDefs.get(className)!.tone : undefined;

    if (!existing) {
      const parsedLines = label ? splitLabelLines(label) : { title: id, subtitle: '' };
      nodes.set(id, {
        id,
        title: parsedLines.title,
        subtitle: parsedLines.subtitle,
        kind: inferredKind || 'service',
        shape,
        tone: assignedTone,
        className,
        subgraphTitle: activeSubgraph?.title,
        subgraph: activeSubgraph,
      });
    } else {
      if (label && existing.title === existing.id) {
        const parsedLines = splitLabelLines(label);
        existing.title = parsedLines.title;
        existing.subtitle = parsedLines.subtitle;
      } else if (label) {
        const next = splitLabelLines(label);
        if (next.title !== existing.title) {
          issues.push({
            level: 'warning',
            code: 'duplicate-node',
            line: currentLine,
            message: `Node "${id}" is defined more than once with different labels ("${existing.title}" vs "${next.title}"); the first label is kept.`,
          });
        }
      }
      if (inferredKind && existing.kind === 'service') {
        existing.kind = inferredKind;
      }
      if (shape && !existing.shape) {
        existing.shape = shape;
      }
      if (assignedTone && !existing.tone) {
        existing.tone = assignedTone;
      }
      if (className && !existing.className) {
        existing.className = className;
      }
      if (!existing.subgraphTitle && activeSubgraph) {
        existing.subgraphTitle = activeSubgraph.title;
      }
      if (claim && activeSubgraph && !existing.subgraph) existing.subgraph = activeSubgraph;
    }
  };

  const lines = source.split('\n');
  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    currentLine = lineBase + lineIdx;
    const rawLine = lines[lineIdx];
    const line = rawLine.trim();
    if (!line || line.startsWith('%%')) continue;

    const dirMatch = line.match(/^(?:flowchart|graph)\s+(LR|RL|TD|TB|BT)\b/i);
    if (dirMatch) {
      const d = dirMatch[1].toUpperCase();
      direction = d === 'TD' || d === 'TB' || d === 'BT' ? 'TD' : 'LR';
      continue;
    }

    const classDefMatch = line.match(/^classDef\s+([A-Za-z0-9_.-]+)\s+([^;]+)/i);
    if (classDefMatch) {
      const name = classDefMatch[1];
      const stylesStr = classDefMatch[2];
      const tone = parseStylesToTone(stylesStr);
      if (tone) {
        classDefs.set(name, { tone });
        issues.push({
          level: 'info',
          code: 'mermaid-classdef',
          line: currentLine,
          message: `Mapped classDef "${name}" style to "${tone}" stream tone.`,
        });
      }
      continue;
    }

    const classMatch = line.match(/^class\s+([^;]+?)\s+([A-Za-z0-9_.-]+)\s*;?$/i);
    if (classMatch) {
      const rawIds = classMatch[1].split(',').map((s) => s.trim()).filter(Boolean);
      const className = classMatch[2].trim();
      const def = classDefs.get(className);
      for (const id of rawIds) {
        ensureNode(id);
        const n = nodes.get(id);
        if (n && def) {
          n.tone = def.tone;
          n.className = className;
        }
      }
      if (def) {
        issues.push({
          level: 'info',
          code: 'mermaid-class',
          line: currentLine,
          message: `Applied class "${className}" (${def.tone} tone) to ${rawIds.join(', ')}.`,
        });
      }
      continue;
    }

    const styleMatch = line.match(/^style\s+([A-Za-z0-9_.-]+)\s+([^;]+)/i);
    if (styleMatch) {
      const id = styleMatch[1];
      const stylesStr = styleMatch[2];
      const tone = parseStylesToTone(stylesStr);
      if (tone) {
        ensureNode(id);
        const n = nodes.get(id);
        if (n) n.tone = tone;
        issues.push({
          level: 'info',
          code: 'mermaid-style',
          line: currentLine,
          message: `Mapped style for node "${id}" to "${tone}" stream tone.`,
        });
      }
      continue;
    }

    const linkStyleMatch = line.match(/^linkStyle\s+(\d+|default)\s+([^;]+)/i);
    if (linkStyleMatch) {
      const target = linkStyleMatch[1].toLowerCase();
      const stylesStr = linkStyleMatch[2];
      const tone = parseStylesToTone(stylesStr);
      if (tone) {
        if (target === 'default') {
          defaultLinkTone = tone;
          for (const edge of edges) {
            edge.tone = tone;
          }
        } else {
          const idx = parseInt(target, 10);
          if (edges[idx]) {
            edges[idx].tone = tone;
          }
        }
        issues.push({
          level: 'info',
          code: 'mermaid-linkstyle',
          line: currentLine,
          message: `Mapped linkStyle ${target} to "${tone}" wire tone.`,
        });
      }
      continue;
    }

    const clickMatch =
      line.match(/^click\s+([A-Za-z0-9_.-]+)\s+(?:href\s+)?"([^"]+)"/i) ||
      line.match(/^click\s+([A-Za-z0-9_.-]+)\s+call\s+([A-Za-z0-9_.-]+)/i);
    if (clickMatch) {
      const id = clickMatch[1];
      const dest = clickMatch[2];
      ensureNode(id);
      const n = nodes.get(id);
      if (n) {
        n.link = dest;
      }
      issues.push({
        level: 'info',
        code: 'mermaid-click',
        line: currentLine,
        message: `Captured click target "${dest}" for node "${id}".`,
      });
      continue;
    }

    const subDirMatch = line.match(/^direction\s+(LR|RL|TD|TB|BT)\b/i);
    if (subDirMatch) {
      const d = subDirMatch[1].toUpperCase();
      direction = d === 'TD' || d === 'TB' || d === 'BT' ? 'TD' : 'LR';
      continue;
    }

    const subMatch = line.match(/^subgraph\s+([^\s[]+)(?:\s*\[([\s\S]+)\])?$/i);
    if (subMatch) {
      const rawId = subMatch[1].trim();
      const rawTitle = (subMatch[2] || rawId).replace(/^"(.*)"$/, '$1').trim();
      const sg: ParsedSubgraph = { id: rawId, title: rawTitle, nodeIds: [], parent: subgraphStack[subgraphStack.length - 1] };
      subgraphs.push(sg);
      subgraphStack.push(sg);
      continue;
    }

    const quotedSubMatch = line.match(/^subgraph\s+"([^"]+)"$/i);
    if (quotedSubMatch) {
      const title = quotedSubMatch[1].trim();
      const sg: ParsedSubgraph = {
        id: title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        title,
        nodeIds: [],
        parent: subgraphStack[subgraphStack.length - 1],
      };
      subgraphs.push(sg);
      subgraphStack.push(sg);
      continue;
    }

    if (/^end\b/i.test(line)) {
      subgraphStack.pop();
      continue;
    }

    const parts = line.split(EDGE_CONNECTOR_REGEX);
    if (parts.length >= 3) {
      for (let i = 0; i < parts.length - 2; i += 2) {
        const leftGroup = parts[i];
        const connectorRaw = parts[i + 1];
        const rightGroup = parts[i + 2];

        const connector = parseConnectorToken(connectorRaw);
        const leftRaw = leftGroup.split('&');
        const rightRaw = rightGroup.split('&');
        const leftTokens = leftRaw
          .map((s) => parseSingleNodeToken(s))
          .filter((x): x is NonNullable<typeof x> => x !== null);
        const rightTokens = rightRaw
          .map((s) => parseSingleNodeToken(s))
          .filter((x): x is NonNullable<typeof x> => x !== null);

        if (leftTokens.length < leftRaw.length || rightTokens.length < rightRaw.length) {
          issues.push({
            level: 'warning',
            code: 'unparsed-node-token',
            line: currentLine,
            message: `Could not read one or more node references in "${line}".`,
          });
        }

        for (const lt of leftTokens) ensureNode(lt.id, lt.label, lt.inferredKind, lt.shape, lt.className);
        for (const rt of rightTokens) ensureNode(rt.id, rt.label, rt.inferredKind, rt.shape, rt.className);

        for (const lt of leftTokens) {
          for (const rt of rightTokens) {
            if (lt.id === rt.id) {
              issues.push({
                level: 'warning',
                code: 'self-loop',
                line: currentLine,
                message: `Node "${lt.id}" connects to itself; self-loops are skipped.`,
              });
              continue;
            }
            const wireTone = connector.tone !== 'blue' ? connector.tone : (defaultLinkTone || 'blue');
            edges.push({
              from: lt.id,
              to: rt.id,
              label: connector.label,
              tone: wireTone,
              route: connector.route,
              flow: connector.flow,
            });
          }
        }
      }
      continue;
    }

    const solo = parseSingleNodeToken(line);
    if (solo) {
      ensureNode(solo.id, solo.label, solo.inferredKind, solo.shape, solo.className, true);
    } else {
      issues.push({
        level: 'warning',
        code: 'unrecognized-line',
        line: currentLine,
        message: `Unrecognized Mermaid syntax was ignored: "${line.length > 60 ? `${line.slice(0, 57)}…` : line}".`,
      });
    }
  }

  return { direction, nodes, edges, subgraphs };
}

function normalizeMetrics(
  rawMetrics: RawNodeMeta['metrics'],
  fallback: KeyValueMetric[],
): KeyValueMetric[] {
  if (!rawMetrics) return fallback;
  if (Array.isArray(rawMetrics)) {
    const items = rawMetrics
      .filter((m) => m && m.label !== undefined)
      .map((m) => ({
        label: String(m.label),
        value: String(m.value ?? '—'),
      }));
    return items.length > 0 ? items : fallback;
  }
  const entries = Object.entries(rawMetrics).map(([k, v]) => ({
    label: k,
    value: String(v ?? '—'),
  }));
  return entries.length > 0 ? entries : fallback;
}

function normalizeCodeBlock(raw: unknown, fallbackObj: Record<string, unknown>): string {
  if (typeof raw === 'string' && raw.trim()) {
    return raw.trim();
  }
  if (raw && typeof raw === 'object') {
    return JSON.stringify(raw, null, 2);
  }
  return JSON.stringify(fallbackObj, null, 2);
}

/** Nested levels deeper than this are dropped, so a hostile file cannot recurse without end (F-03). */
const MAX_CHILD_DEPTH = 8;
let childDepth = 0;

/** A `children:` or `pages:` entry is a smaller blueprint (nodes, edges, zones, notes) that imports like one. */
function importSubBlueprint(raw: unknown, label: string, issues: ImportIssue[]): DiagramDocument | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (childDepth >= MAX_CHILD_DEPTH) {
    issues.push({ level: 'warning', code: 'level-too-deep', message: `${label} nests levels too deep; its inner level was dropped.` });
    return null;
  }
  childDepth += 1;
  try {
    const result = importMermaidOrBlueprint(`---\n${yaml.dump(raw)}---\n`);
    for (const issue of result.issues) {
      if (issue.level !== 'info') issues.push({ ...issue, line: undefined, message: `Inside ${label}: ${issue.message}` });
    }
    return result.doc;
  } finally {
    childDepth -= 1;
  }
}

function importChildLevel(raw: unknown, ownerId: string, issues: ImportIssue[]): LevelContent | null {
  const sub = importSubBlueprint(raw, `"${ownerId}"`, issues);
  if (!sub) return null;
  const { nodes, edges, zones, notesCards, frames } = sub;
  return { nodes, edges, zones, notesCards, ...(frames?.length ? { frames } : {}) };
}

/** The `pages:` list: one smaller blueprint per page after the first (D10). */
function importPages(raw: unknown[], doc: DiagramDocument, issues: ImportIssue[]): void {
  const pages: DiagramPage[] = [];
  raw.slice(0, MAX_PAGES - 1).forEach((entry, i) => {
    const sub = importSubBlueprint(entry, `page ${i + 2}`, issues);
    if (!sub) return;
    const r = entry as Record<string, unknown>;
    pages.push({
      id: typeof r.id === 'string' ? r.id : '',
      title: typeof r.title === 'string' ? r.title : '',
      nodes: sub.nodes,
      edges: sub.edges,
      zones: sub.zones,
      notesCards: sub.notesCards,
      ...(sub.frames?.length ? { frames: sub.frames } : {}),
      stageWidth: sub.stageWidth,
      stageHeight: sub.stageHeight,
    });
  });
  if (pages.length) doc.pages = pages;
}

const FRAME_TONES: StreamTone[] = ['blue', 'emerald', 'violet', 'amber', 'rose'];

/**
 * "Subgraphs as: Frames" (D1b): each subgraph becomes a frame around its components, and a subgraph inside another
 * becomes a frame inside that frame. A frame is sized from what it holds (a parent is always larger than the frames
 * in it). Returns the frames, outermost first; ownership is then settled from the geometry like any frame.
 */
function framesFromSubgraphs(
  subgraphs: ParsedSubgraph[],
  nodes: DiagramNode[],
): { frames: DiagramFrame[]; ids: Map<ParsedSubgraph, string> } {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const ids = new Map<ParsedSubgraph, string>();
  const used = new Set<string>();
  for (const sg of subgraphs) {
    const base = `frame-${sg.id.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'group'}`;
    let id = base;
    for (let n = 2; used.has(id); n += 1) id = `${base}-${n}`;
    used.add(id);
    ids.set(sg, id);
  }
  const rects = new Map<ParsedSubgraph, ReturnType<typeof frameAround> | null>();
  const rectOf = (sg: ParsedSubgraph): ReturnType<typeof frameAround> | null => {
    if (rects.has(sg)) return rects.get(sg) ?? null;
    rects.set(sg, null);
    const own = sg.nodeIds.map((nid) => byId.get(nid)).filter((n): n is DiagramNode => Boolean(n));
    const inner = subgraphs.filter((child) => child.parent === sg).map(rectOf).filter((r): r is NonNullable<typeof r> => Boolean(r));
    const boxes = [...own, ...inner];
    const rect = boxes.length ? frameAround(boxes) : null;
    rects.set(sg, rect);
    return rect;
  };
  const out: DiagramFrame[] = [];
  subgraphs.forEach((sg, index) => {
    const rect = rectOf(sg);
    if (!rect) return;
    const frame = createFrame(ids.get(sg)!, rect, FRAME_TONES[index % FRAME_TONES.length], sg.title || sg.id);
    // A parent that was dropped for being empty leaves the frame at the top level.
    if (sg.parent && rectOf(sg.parent)) frame.parentId = ids.get(sg.parent);
    out.push(frame);
  });
  return { frames: out, ids };
}

/** What "Subgraphs as: Levels" decided before components are built (D6). */
interface SubgraphLevelPlan {
  /** Subgraph (cut off at the level cap) to the id of the component that opens it. */
  componentIds: Map<ParsedSubgraph, string>;
  /** Component id (or subgraph component id) to the subgraphs, outermost first, that hold it. */
  chains: Map<string, ParsedSubgraph[]>;
  titles: Map<ParsedSubgraph, string>;
}

/** A bare `A --> group` mention makes a placeholder component; the group's own component replaces it. */
function isBareReference(n: ParsedMermaidNode): boolean {
  return n.title === n.id && !n.subtitle && !n.shape && !n.className;
}

/**
 * Work out which subgraphs become components and where every component lives. Adds a component to
 * `parsed.nodes` for each non-empty subgraph, so the usual node builder makes it. Returns null when
 * the source has no subgraphs worth turning into levels.
 */
function planSubgraphLevels(parsed: ReturnType<typeof parseMermaidFlowchart>, issues: ImportIssue[]): SubgraphLevelPlan | null {
  if (parsed.subgraphs.length === 0) return null;

  const depthOf = (sg: ParsedSubgraph): number => {
    let d = 1;
    for (let p = sg.parent; p; p = p.parent) d += 1;
    return d;
  };
  let capped = false;
  const effective = (sg: ParsedSubgraph | undefined): ParsedSubgraph | undefined => {
    let cur = sg;
    while (cur && depthOf(cur) > MAX_CHILD_DEPTH) {
      capped = true;
      cur = cur.parent;
    }
    return cur;
  };

  const included = new Set<ParsedSubgraph>();
  const include = (sg: ParsedSubgraph | undefined) => {
    for (let cur = effective(sg); cur; cur = cur.parent) included.add(cur);
  };
  for (const n of parsed.nodes.values()) include(n.subgraph);
  if (capped) {
    issues.push({
      level: 'info',
      code: 'level-cap',
      message: `Subgraphs nested more than ${MAX_CHILD_DEPTH} deep were merged into their level ${MAX_CHILD_DEPTH} parent.`,
    });
  }
  if (included.size === 0) return null;

  const chainOf = (sg: ParsedSubgraph | undefined): ParsedSubgraph[] => {
    const chain: ParsedSubgraph[] = [];
    for (let cur = effective(sg); cur; cur = cur.parent) chain.unshift(cur);
    return chain;
  };

  const componentIds = new Map<ParsedSubgraph, string>();
  const taken = new Set<string>();
  for (const sg of parsed.subgraphs) {
    if (!included.has(sg)) continue;
    const bare = parsed.nodes.get(sg.id);
    if (bare && isBareReference(bare) && !taken.has(sg.id)) parsed.nodes.delete(sg.id);
    let id = sg.id;
    while (parsed.nodes.has(id) || taken.has(id)) id = `${id}_group`;
    taken.add(id);
    componentIds.set(sg, id);
  }

  const chains = new Map<string, ParsedSubgraph[]>();
  const titles = new Map<ParsedSubgraph, string>();
  for (const n of parsed.nodes.values()) chains.set(n.id, chainOf(n.subgraph));
  for (const [sg, id] of componentIds) {
    chains.set(id, chainOf(sg).slice(0, -1));
    titles.set(sg, sg.title);
  }

  for (const [sg, id] of componentIds) {
    const below = [...parsed.nodes.values()].filter((n) => chainOf(n.subgraph).includes(sg)).length;
    parsed.nodes.set(id, {
      id,
      title: sg.title || id,
      subtitle: `${below} ${below === 1 ? 'component' : 'components'}`,
      kind: 'core',
    });
  }
  return { componentIds, chains, titles };
}

/** Move components into the levels of the subgraphs that held them, and re-point wires that cross a boundary. */
function applySubgraphLevels(
  doc: DiagramDocument,
  plan: SubgraphLevelPlan,
  explicitPositions: Set<string>,
  issues: ImportIssue[],
): void {
  const contents = new Map<ParsedSubgraph | undefined, LevelContent>();
  const levelFor = (sg: ParsedSubgraph | undefined): LevelContent => {
    let content = contents.get(sg);
    if (!content) {
      content = { nodes: [], edges: [], zones: [], notesCards: [] };
      contents.set(sg, content);
    }
    return content;
  };
  const idToComponent = new Map<ParsedSubgraph, string>(plan.componentIds);
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));

  for (const n of doc.nodes) {
    const chain = plan.chains.get(n.id) ?? [];
    levelFor(chain[chain.length - 1]).nodes.push(n);
  }

  for (const edge of doc.edges) {
    const a = plan.chains.get(edge.from) ?? [];
    const b = plan.chains.get(edge.to) ?? [];
    let k = 0;
    while (k < a.length && k < b.length && a[k] === b[k]) k += 1;
    const lift = (id: string, chain: ParsedSubgraph[]) => (chain.length === k ? id : idToComponent.get(chain[k])!);
    const from = lift(edge.from, a);
    const to = lift(edge.to, b);
    if (from === to) {
      issues.push({
        level: 'warning',
        code: 'self-loop',
        message: `Edge "${edge.from} → ${edge.to}" ends up inside one group; the wire was skipped.`,
      });
      continue;
    }
    levelFor(a[k - 1]).edges.push({ ...edge, from, to });
  }

  for (const [sg, id] of plan.componentIds) {
    const owner = byId.get(id);
    if (owner) owner.child = levelFor(sg);
  }

  for (const [sg, content] of contents) {
    if (!sg) continue;
    const scratch = createBlankDocument();
    scratch.direction = doc.direction;
    scratch.nodes = content.nodes;
    scratch.edges = content.edges;
    const saved = new Map<string, [number, number]>();
    for (const n of content.nodes) if (explicitPositions.has(n.id)) saved.set(n.id, [n.x, n.y]);
    if (saved.size < content.nodes.length) {
      autoLayoutDocument(scratch);
      for (const n of content.nodes) {
        const at = saved.get(n.id);
        if (at) [n.x, n.y] = at;
      }
    }
  }

  const root = levelFor(undefined);
  doc.nodes = root.nodes;
  doc.edges = root.edges;
}

/** How `subgraph` blocks import: as swimlanes on one canvas (the default) or as levels you drill into (D6). */
export interface ImportOptions {
  subgraphs?: 'swimlanes' | 'levels' | 'frames';
}

export function importMermaidOrBlueprint(rawInput: string, options: ImportOptions = {}): {
  doc: DiagramDocument;
  warnings: string[];
  issues: ImportIssue[];
} {
  const extracted = extractSections(rawInput);
  const { meta, mermaidSource } = extracted;
  const issues: ImportIssue[] = [...extracted.issues];
  const parsedMermaid = parseMermaidFlowchart(mermaidSource, extracted.mermaidLineBase, issues);
  const levelPlan =
    options.subgraphs === 'levels' && !(Array.isArray(meta.zones) && meta.zones.length > 0)
      ? planSubgraphLevels(parsedMermaid, issues)
      : null;

  const doc = createBlankDocument();
  doc.direction =
    meta.direction?.toUpperCase() === 'TD' || meta.direction?.toUpperCase() === 'TB'
      ? 'TD'
      : meta.direction?.toUpperCase() === 'LR'
        ? 'LR'
        : parsedMermaid.direction;

  if (meta.title?.trim()) doc.title = meta.title.trim();
  else doc.title = 'Imported Architecture';

  if (meta.systemTag?.trim()) doc.systemTag = meta.systemTag.trim();
  if (meta.statusLabel?.trim()) doc.statusLabel = meta.statusLabel.trim();
  if (meta.overviewSummary?.trim()) doc.overviewSummary = meta.overviewSummary.trim();
  if (meta.brand) {
    const rawLogo = meta.brand.logo;
    doc.brand = normalizeBrand(meta.brand);
    if (typeof rawLogo === 'string' && rawLogo.trim() && !doc.brand.logo) {
      issues.push({
        level: 'warning',
        code: 'brand-logo',
        message: 'The brand logo is not a supported image data URL and was dropped.',
      });
    }
  }

  const legend = normalizeLegend(meta.legend);
  if (legend.length) doc.legend = legend;
  const insights = normalizeInsights(meta.insights);
  if (insights) doc.insights = insights;

  // Merge node IDs from Mermaid + YAML metadata
  const allNodeIds = new Set<string>([...parsedMermaid.nodes.keys()]);
  if (meta.nodes) {
    for (const key of Object.keys(meta.nodes)) {
      allNodeIds.add(key);
    }
  }

  const explicitPositions = new Set<string>();
  const nodes: DiagramNode[] = [];

  for (const id of allNodeIds) {
    const mNode = parsedMermaid.nodes.get(id);
    const metaNode = meta.nodes?.[id] || {};

    // Flag unrecognised enum-like values that would otherwise silently fall back
    const flagUnknown = (field: string, raw: unknown, known: boolean) => {
      if (raw !== undefined && raw !== null && raw !== '' && !known) {
        issues.push({
          level: 'warning',
          code: 'unknown-value',
          message: `Component "${id}" has an unknown ${field} "${String(raw)}"; a default was used.`,
        });
      }
    };
    const rawKind = metaNode.kind || metaNode.tier;
    flagUnknown(
      'kind',
      rawKind,
      typeof rawKind === 'string' &&
        normalizeNodeKind(rawKind, 'actor') === normalizeNodeKind(rawKind, 'core'),
    );
    const rawAccent = metaNode.accent || metaNode.tone;
    flagUnknown(
      'accent color',
      rawAccent,
      typeof rawAccent === 'string' && normalizeTone(rawAccent, 'blue') === normalizeTone(rawAccent, 'rose'),
    );
    flagUnknown(
      'icon',
      metaNode.icon,
      typeof metaNode.icon === 'string' &&
        normalizeIconName(metaNode.icon, 'actor') === normalizeIconName(metaNode.icon, 'cloud'),
    );
    flagUnknown('shape', metaNode.shape, isKnownNodeShape(metaNode.shape));

    const kind = normalizeNodeKind(metaNode.kind || metaNode.tier, mNode?.kind || 'service');
    const stencil = STENCIL_CATALOG.find((s) => s.kind === kind) || STENCIL_CATALOG[2];
    const dims = getNodeDimensions(kind);

    const accent = normalizeTone(metaNode.accent || metaNode.tone, mNode?.tone || stencil.accent);
    const icon = normalizeIconName(metaNode.icon, stencil.icon);
    const shape = normalizeNodeShape(metaNode.shape || mNode?.shape);
    const iconImage = sanitizeIconImage(metaNode.iconImage);
    if (typeof metaNode.iconImage === 'string' && metaNode.iconImage.trim() && !iconImage) {
      issues.push({
        level: 'warning',
        code: 'unknown-value',
        message: `Component "${id}" has an icon image that is not a supported image data URL; the built-in icon was used.`,
      });
    }
    const title = (metaNode.title || mNode?.title || id).trim();
    const subtitle =
      metaNode.subtitle !== undefined
        ? String(metaNode.subtitle).trim()
        : mNode?.subtitle !== undefined && mNode.subtitle !== ''
          ? mNode.subtitle
          : stencil.defaultSubtitle;

    const eyebrow = (metaNode.eyebrow || stencil.eyebrow).trim();
    const footerLeft = (metaNode.footerLeft || stencil.footerLeft).trim();
    const chip = (metaNode.chip || stencil.chip).trim();
    const zoneLabel = (
      metaNode.zoneLabel ||
      metaNode.zone ||
      mNode?.subgraphTitle ||
      'ARCHITECTURE STAGE'
    ).trim();
    const interfaceLabel = (
      metaNode.interfaceLabel ||
      metaNode.interface ||
      stencil.interfaceLabel
    ).trim();
    const summary = (
      metaNode.summary ||
      `${title}${subtitle ? ` (${subtitle})` : ''} processes data streams within ${zoneLabel}.${mNode?.link ? ` External link: ${mNode.link}` : ''}`
    ).trim();

    const defaultMetrics: KeyValueMetric[] = [
      { label: 'Component Type', value: stencil.paletteTitle },
      { label: 'Interface', value: interfaceLabel },
    ];
    const metrics = normalizeMetrics(metaNode.metrics, defaultMetrics);

    const code = normalizeCodeBlock(metaNode.code ?? metaNode.payload, {
      id,
      component: title,
      type: kind,
      interface: interfaceLabel,
      status: 'ACTIVE',
    });

    let x = 0;
    let y = 0;
    if (Array.isArray(metaNode.position) && metaNode.position.length >= 2) {
      x = Number(metaNode.position[0]) || 0;
      y = Number(metaNode.position[1]) || 0;
      explicitPositions.add(id);
    } else if (typeof metaNode.x === 'number' && typeof metaNode.y === 'number') {
      x = metaNode.x;
      y = metaNode.y;
      explicitPositions.add(id);
    }

    const child = importChildLevel((metaNode as Record<string, unknown>).children, id, issues);

    nodes.push({
      id,
      kind,
      accent,
      icon,
      ...(shape === 'card' ? {} : { shape }),
      ...(child ? { child } : {}),
      ...(iconImage ? { iconImage } : {}),
      ...(metaNode.status ? { status: metaNode.status as ComponentStatus } : {}),
      ...(metaNode.comment ? { comment: String(metaNode.comment) } : {}),
      ...(metaNode.locked !== undefined ? { locked: Boolean(metaNode.locked) } : {}),
      ...(metaNode.groupId ? { groupId: String(metaNode.groupId) } : {}),
      ...(typeof metaNode.frame === 'string' && metaNode.frame.trim() ? { frameId: metaNode.frame.trim() } : {}),
      ...normalizeNodeMeta(metaNode as Record<string, unknown>),
      title,
      subtitle,
      eyebrow,
      footerLeft,
      chip,
      zoneLabel,
      interfaceLabel,
      summary,
      metrics,
      code,
      x,
      y,
      width: dims.width,
      height: dims.height,
    });
  }

  doc.nodes = nodes;

  // Build edges from Mermaid + YAML overrides/additions
  const edges: DiagramEdge[] = [];
  const usedOverrides = new Set<number>();
  const rawOverrides = meta.edges || [];

  parsedMermaid.edges.forEach((me, idx) => {
    const overrideIdx = rawOverrides.findIndex(
      (ov, oIdx) => !usedOverrides.has(oIdx) && ov.from === me.from && ov.to === me.to,
    );
    const ov = overrideIdx >= 0 ? rawOverrides[overrideIdx] : undefined;
    if (overrideIdx >= 0) usedOverrides.add(overrideIdx);

    edges.push({
      id: ov?.id || `edge-${idx + 1}-${me.from}-${me.to}`,
      from: me.from,
      to: me.to,
      sourcePort: normalizePortSide(ov?.sourcePort),
      targetPort: normalizePortSide(ov?.targetPort),
      tone: normalizeTone(ov?.tone || ov?.kind, me.tone),
      route: normalizeRouteMode(ov?.route ?? me.route),
      label: ov?.label !== undefined ? String(ov.label) : me.label,
      animated: ov?.animated !== false,
      flow: ov?.flow === 'both' || me.flow === 'both' ? 'both' : 'forward',
      ...(ov?.comment ? { comment: String(ov.comment) } : {}),
      ...wireExtras(ov),
      ...waypointField(ov?.waypoint),
    });
  });

  // Append any additional edges declared solely in YAML metadata
  rawOverrides.forEach((ov, oIdx) => {
    if (usedOverrides.has(oIdx)) return;
    if (!ov.from || !ov.to) {
      issues.push({
        level: 'warning',
        code: 'edge-incomplete',
        message: `Edge #${oIdx + 1} in the YAML metadata needs both "from" and "to"; it was skipped.`,
      });
      return;
    }
    edges.push({
      id: ov.id || nextUid('edge'),
      from: ov.from,
      to: ov.to,
      sourcePort: normalizePortSide(ov.sourcePort),
      targetPort: normalizePortSide(ov.targetPort),
      tone: normalizeTone(ov.tone || ov.kind, 'blue'),
      route: normalizeRouteMode(ov.route),
      label: ov.label ? String(ov.label) : '',
      animated: ov.animated !== false,
      flow: ov.flow === 'both' ? 'both' : 'forward',
      ...(ov.comment ? { comment: String(ov.comment) } : {}),
      ...wireExtras(ov),
      ...waypointField(ov.waypoint),
    });
  });

  // Validate edges: drop wires that reference missing components and flag duplicate ids
  const knownNodeIds = new Set(doc.nodes.map((n) => n.id));
  const seenEdgeIds = new Set<string>();
  const validEdges: DiagramEdge[] = [];
  for (const edge of edges) {
    const missing = [edge.from, edge.to].filter((nid) => !knownNodeIds.has(nid));
    if (missing.length > 0) {
      issues.push({
        level: 'warning',
        code: 'edge-unknown-node',
        message: `Edge "${edge.from} → ${edge.to}" references unknown component${missing.length > 1 ? 's' : ''} ${missing.map((m) => `"${m}"`).join(', ')}; the wire was skipped.`,
      });
      continue;
    }
    if (edge.from === edge.to) {
      issues.push({
        level: 'warning',
        code: 'self-loop',
        message: `Edge "${edge.id}" connects "${edge.from}" to itself; the wire was skipped.`,
      });
      continue;
    }
    if (seenEdgeIds.has(edge.id)) {
      const fresh = nextUid('edge');
      issues.push({
        level: 'warning',
        code: 'edge-duplicate-id',
        message: `Edge id "${edge.id}" is used more than once; the duplicate was renamed to "${fresh}".`,
      });
      edge.id = fresh;
    }
    seenEdgeIds.add(edge.id);
    validEdges.push(edge);
  }

  doc.edges = validEdges;

  // Flag components that are not connected to anything
  const connectedIds = new Set<string>();
  for (const edge of validEdges) {
    connectedIds.add(edge.from);
    connectedIds.add(edge.to);
  }
  if (doc.nodes.length > 1) {
    for (const n of doc.nodes) {
      if (!connectedIds.has(n.id)) {
        issues.push({
          level: 'info',
          code: 'node-isolated',
          message: `Component "${n.title}" (${n.id}) has no connections.`,
        });
      }
    }
  }

  if (levelPlan) applySubgraphLevels(doc, levelPlan, explicitPositions, issues);

  // Layout nodes that do not have explicit [x, y] coordinates
  if (doc.nodes.length > 0) {
    if (explicitPositions.size === 0) {
      autoLayoutDocument(doc);
    } else if (explicitPositions.size < doc.nodes.length) {
      const saved = new Map<string, [number, number]>();
      for (const n of doc.nodes) {
        if (explicitPositions.has(n.id)) saved.set(n.id, [n.x, n.y]);
      }
      autoLayoutDocument(doc);
      for (const n of doc.nodes) {
        const coords = saved.get(n.id);
        if (coords) {
          n.x = coords[0];
          n.y = coords[1];
        }
      }
    }
  }

  // Zones (from YAML or synthesized from Mermaid subgraphs)
  const zones: DiagramZone[] = [];
  if (Array.isArray(meta.zones) && meta.zones.length > 0) {
    meta.zones.forEach((z, idx) => {
      zones.push({
        id: z.id || `zone-${idx + 1}`,
        number: String(z.number ?? String(idx + 1).padStart(2, '0')),
        title: z.title || `STAGE ${idx + 1}`,
        subtitle: z.subtitle || '',
        x: typeof z.x === 'number' ? z.x : 48 + idx * 360,
        width: typeof z.width === 'number' ? z.width : 320,
      });
    });
  } else if (options.subgraphs === 'frames' && !levelPlan && parsedMermaid.subgraphs.length > 0 && !(Array.isArray(meta.frames) && meta.frames.length > 0)) {
    // Frames instead of swimlanes: no zones are made for the subgraphs.
  } else if (!levelPlan && parsedMermaid.subgraphs.length > 0) {
    const nodeMap = new Map(doc.nodes.map((n) => [n.id, n]));
    parsedMermaid.subgraphs.forEach((sg, idx) => {
      const members = sg.nodeIds
        .map((nid) => nodeMap.get(nid))
        .filter((n): n is DiagramNode => Boolean(n));
      if (members.length === 0) return;
      const minX = Math.min(...members.map((m) => m.x));
      const maxR = Math.max(...members.map((m) => m.x + m.width));
      zones.push({
        id: sg.id || `zone-${idx + 1}`,
        number: String(idx + 1).padStart(2, '0'),
        title: sg.title.toUpperCase(),
        subtitle: `${members.length} ${members.length === 1 ? 'Component' : 'Components'}`,
        x: Math.max(16, minX - 18),
        width: Math.max(180, maxR - minX + 36),
      });
    });
  }
  doc.zones = zones;

  // Frames (F-09), or the file's subgraphs as frames (D1b)
  const frames = coerceFrames(meta.frames);
  if (frames.length > 0) doc.frames = frames;
  else if (options.subgraphs === 'frames' && !levelPlan && parsedMermaid.subgraphs.length > 0) {
    const { frames: made, ids } = framesFromSubgraphs(parsedMermaid.subgraphs, doc.nodes);
    if (made.length > 0) {
      doc.frames = made;
      adoptByGeometry(doc);
      const byId = new Map(doc.nodes.map((n) => [n.id, n]));
      const stray = parsedMermaid.subgraphs.some((sg) => sg.nodeIds.some((nid) => byId.has(nid) && byId.get(nid)!.frameId !== ids.get(sg)));
      if (stray) {
        issues.push({ level: 'info', code: 'frames-overlap', message: 'Some groups overlap after layout, so a component may sit inside the frame of a neighbouring group. Drag it to put it right.' });
      }
    }
  }
  dropDanglingFrameIds(doc.nodes, doc.frames ?? []);

  // Notes cards
  const notesCards: DiagramNotesCard[] = [];
  const rawNotesList = Array.isArray(meta.notesCards)
    ? meta.notesCards
    : meta.specCard
      ? [meta.specCard]
      : [];

  rawNotesList.forEach((rc, idx) => {
    const isText = (rc as { variant?: string }).variant === 'text';
    if (!isText && (!rc.items || rc.items.length === 0)) return;
    const x = Array.isArray(rc.position) ? Number(rc.position[0]) || 48 : (rc.x ?? 48);
    const y = Array.isArray(rc.position) ? Number(rc.position[1]) || 600 : (rc.y ?? 600);
    notesCards.push({
      id: rc.id || `notes-${idx + 1}`,
      title: rc.title || (isText ? 'Text' : 'ARCHITECTURE NOTES'),
      code: rc.code || (isText ? '' : `SPEC-0${idx + 1}`),
      x,
      y,
      items: (rc.items ?? []).map((item, itemIdx) => ({
        title: item.title || `Note ${itemIdx + 1}`,
        text: item.text || '',
        ...(item.icon ? { icon: normalizeNotesItemIcon(item.icon) } : {}),
      })),
      ...(isText ? { variant: 'text' as const } : {}),
    });
  });
  doc.notesCards = notesCards;

  // Pages (D10): the second page onwards. The first page is this document's own content.
  if (typeof meta.pageTitle === 'string' && meta.pageTitle.trim()) doc.pageTitle = meta.pageTitle.trim();
  if (typeof meta.pageId === 'string' && meta.pageId.trim()) doc.pageId = meta.pageId.trim();
  if (Array.isArray(meta.pages) && meta.pages.length > 0) importPages(meta.pages, doc, issues);
  normalizePages(doc);

  // Simulations
  if (Array.isArray(meta.simulations) && meta.simulations.length > 0) {
    // A scenario belongs to the whole file, so a step may name a component on any page.
    const validIds = new Set([...doc.nodes, ...(doc.pages ?? []).flatMap((p) => p.nodes)].map((n) => n.id));
    const sims: SimulationScenario[] = [];
    meta.simulations.forEach((sim, idx) => {
      const steps = (sim.steps || [])
        .map((st, sIdx) => {
          const missing = (st.nodes || []).filter((nid) => !validIds.has(nid));
          if (missing.length > 0) {
            issues.push({
              level: 'warning',
              code: 'sim-unknown-node',
              message: `Simulation "${sim.name || sim.id || idx + 1}" step ${sIdx + 1} references unknown component${missing.length > 1 ? 's' : ''} ${missing.map((m) => `"${m}"`).join(', ')}.`,
            });
          }
          return {
            id: st.id || `step-${sIdx + 1}`,
            nodes: (st.nodes || []).filter((nid) => validIds.has(nid)),
            tone: normalizeTone(st.tone, normalizeTone(sim.tone, 'emerald')),
            label: st.label || `STEP ${sIdx + 1}`,
            trace: st.trace || 'Processed telemetry step.',
          };
        })
        .filter((st) => st.nodes.length > 0);

      if (steps.length === 0) {
        issues.push({
          level: 'warning',
          code: 'sim-empty',
          message: `Simulation "${sim.name || sim.id || idx + 1}" has no steps that reference existing components and was skipped.`,
        });
      }

      if (steps.length > 0) {
        sims.push({
          id: sim.id || `sim-${idx + 1}`,
          name: sim.name || `Scenario ${idx + 1}`,
          tone: normalizeTone(sim.tone, 'emerald'),
          steps,
          ...(Array.isArray(sim.failures) && sim.failures.length
            ? { failures: sim.failures.filter((f): f is string => typeof f === 'string') }
            : {}),
          ...(normalizeBudgetMs(sim.budgetMs) !== undefined ? { budgetMs: normalizeBudgetMs(sim.budgetMs) } : {}),
        });
      }
    });
    doc.simulations = sims;
  }
  pruneDanglingChaos(doc);

  if (typeof meta.stageWidth === 'number' && meta.stageWidth >= 800) {
    doc.stageWidth = meta.stageWidth;
  }
  if (typeof meta.stageHeight === 'number' && meta.stageHeight >= 520) {
    doc.stageHeight = meta.stageHeight;
  }
  expandStageToFit(doc);
  for (const page of doc.pages ?? []) {
    const fit = { ...doc, ...page } as DiagramDocument;
    expandStageToFit(fit);
    page.stageWidth = fit.stageWidth;
    page.stageHeight = fit.stageHeight;
  }

  if (doc.nodes.length === 0 && !issues.some((i) => i.level === 'error')) {
    issues.push({
      level: 'info',
      code: 'no-nodes',
      message: 'No components were found. Provide a Mermaid flowchart or a YAML "nodes:" map.',
    });
  }

  const warnings = issues
    .filter((i) => i.level !== 'info')
    .map((i) => (i.line ? `Line ${i.line}: ${i.message}` : i.message));
  return { doc, warnings, issues };
}

function waypointField(raw: unknown): { waypoint?: [number, number] } {
  if (Array.isArray(raw) && raw.length >= 2) {
    const x = Number(raw[0]);
    const y = Number(raw[1]);
    if (Number.isFinite(x) && Number.isFinite(y)) return { waypoint: [Math.round(x), Math.round(y)] };
  }
  return {};
}

/** The key a component has in the `nodes:` map of the Blueprint file (the code pane maps lines back to components with it). */
export function blueprintNodeKey(rawId: string): string {
  return sanitizeMermaidId(rawId);
}

function sanitizeMermaidId(rawId: string): string {
  const cleaned = rawId.replace(/[^A-Za-z0-9_.-]/g, '_');
  return /^[A-Za-z_]/.test(cleaned) ? cleaned : `n_${cleaned}`;
}

function escapeMermaidText(text: string): string {
  return text.replace(/"/g, "'").replace(/\|/g, '/').trim();
}

function formatMermaidNodeShape(node: DiagramNode, safeId: string): string {
  // An external component carries the `external` class so GitHub also draws it dashed (K7).
  return `${formatMermaidNodeBase(node, safeId)}${node.external ? ':::external' : ''}`;
}

function formatMermaidNodeBase(node: DiagramNode, safeId: string): string {
  const label = node.subtitle
    ? `"${escapeMermaidText(node.title)}<br/>${escapeMermaidText(node.subtitle)}"`
    : `"${escapeMermaidText(node.title)}"`;

  if (node.shape === 'circle') return `${safeId}((${label}))`;
  if (node.shape === 'diamond') return `${safeId}{${label}}`;
  if (node.shape === 'hexagon') return `${safeId}{{${label}}}`;
  if (node.shape === 'asymmetric') return `${safeId}>${label}]`;
  if (node.shape === 'pill') return `${safeId}([${label}])`;
  if (node.shape === 'rounded') return `${safeId}(${label})`;

  switch (node.kind) {
    case 'actor':
      return `${safeId}([${label}])`;
    case 'core':
      return `${safeId}[[${label}]]`;
    case 'store':
    case 'queue':
      return `${safeId}[(${label})]`;
    case 'gate':
      return `${safeId}{{${label}}}`;
    case 'balancer':
      return `${safeId}[/${label}\\]`;
    case 'client':
      return `${safeId}[/${label}/]`;
    case 'bus':
      return `${safeId}(${label})`;
    case 'service':
    default:
      return `${safeId}[${label}]`;
  }
}

/**
 * Writes the `mermaid` block embedded in the Blueprint file (Q12), so GitHub can
 * render a Blueprint file as a diagram. Mermaid is import only (D8): nothing else
 * may call this to write a standalone Mermaid file.
 */
export function serializeMermaidBlock(doc: DiagramDocument): string {
  const lines: string[] = [`flowchart ${doc.direction}`];
  const idMap = new Map<string, string>();
  const usedIds = new Set<string>();

  for (const n of doc.nodes) {
    let base = sanitizeMermaidId(n.id);
    let candidate = base;
    let suffix = 2;
    while (usedIds.has(candidate)) {
      candidate = `${base}_${suffix++}`;
    }
    usedIds.add(candidate);
    idMap.set(n.id, candidate);
  }

  if (doc.nodes.length === 0) {
    lines.push('  %% Canvas is currently empty. Add components in Design Mode or write Mermaid nodes below.');
    return lines.join('\n');
  }

  // Group nodes into swimlane subgraphs if they sit horizontally inside a zone
  const assignedNodes = new Set<string>();
  const sortedZones = [...doc.zones].sort((a, b) => a.x - b.x);

  for (let zIdx = 0; zIdx < sortedZones.length; zIdx++) {
    const zone = sortedZones[zIdx];
    const members = doc.nodes.filter((n) => {
      if (assignedNodes.has(n.id)) return false;
      const cx = n.x + n.width / 2;
      return cx >= zone.x - 12 && cx <= zone.x + zone.width + 12;
    });
    if (members.length === 0) continue;

    const sgId = sanitizeMermaidId(zone.id || `stage_${zIdx + 1}`);
    lines.push(`  subgraph ${sgId} ["${escapeMermaidText(zone.title)}"]`);
    for (const m of members) {
      assignedNodes.add(m.id);
      lines.push(`    ${formatMermaidNodeShape(m, idMap.get(m.id)!)}`);
    }
    lines.push('  end');
  }

  for (const n of doc.nodes) {
    if (assignedNodes.has(n.id)) continue;
    lines.push(`  ${formatMermaidNodeShape(n, idMap.get(n.id)!)}`);
  }

  if (doc.nodes.some((n) => n.external)) lines.push('  classDef external stroke-dasharray: 5 5');

  if (doc.edges.length > 0) {
    lines.push('');
    for (const e of doc.edges) {
      const src = idMap.get(e.from);
      const dst = idMap.get(e.to);
      if (!src || !dst) continue;

      const labelPart = e.label.trim() ? `|${escapeMermaidText(e.label)}|` : '';
      let arrow = '-->';
      if (e.flow === 'both') {
        if (e.tone === 'emerald') arrow = '===';
        else if (e.tone === 'rose') arrow = '-.-';
        else arrow = '---';
      } else {
        if (e.tone === 'emerald') arrow = '==>';
        else if (e.tone === 'rose') arrow = '-.->';
      }

      lines.push(`  ${src} ${arrow}${labelPart} ${dst}`);
    }
  }

  return lines.join('\n');
}

export function serializeToBlueprintMarkdown(doc: DiagramDocument): string {
  const yamlDump = yaml.dump(buildFrontmatter(doc, true), { lineWidth: 100, noRefs: true }).trim();
  const mermaidBlock = serializeMermaidBlock(doc);

  return `---\n${yamlDump}\n---\n\n\`\`\`mermaid\n${mermaidBlock}\n\`\`\`\n`;
}

/** The YAML metadata for one level. A nested level leaves out the document-level fields (`shell` false). */
function buildFrontmatter(doc: DiagramDocument, shell: boolean, depth = 0): Record<string, unknown> {
  const idMap = nodeKeys(doc.nodes.map((n) => n.id), sanitizeMermaidId);

  const nodesMeta: Record<string, Record<string, unknown>> = {};
  for (const n of doc.nodes) {
    const safeId = idMap.get(n.id)!;
    let parsedPayload: unknown = n.code;
    try {
      parsedPayload = JSON.parse(n.code);
    } catch {
      parsedPayload = n.code;
    }

    nodesMeta[safeId] = {
      kind: n.kind,
      accent: n.accent,
      icon: n.icon,
      ...(n.shape && n.shape !== 'card' ? { shape: n.shape } : {}),
      ...(n.iconImage ? { iconImage: n.iconImage } : {}),
      ...(n.status ? { status: n.status } : {}),
      ...(n.comment ? { comment: n.comment } : {}),
      ...(n.locked !== undefined ? { locked: n.locked } : {}),
      ...(n.groupId ? { groupId: n.groupId } : {}),
      ...(n.frameId ? { frame: n.frameId } : {}),
      ...(n.owner ? { owner: n.owner } : {}),
      ...(n.tags?.length ? { tags: n.tags } : {}),
      ...(n.links?.length ? { links: n.links } : {}),
      ...(n.source ? { source: n.source } : {}),
      ...(n.resilience
        ? {
            resilience: {
              ...n.resilience,
              ...(n.resilience.fallbackId
                ? { fallbackId: idMap.get(n.resilience.fallbackId) || n.resilience.fallbackId }
                : {}),
            },
          }
        : {}),
      ...(n.queue
        ? {
            queue: {
              ...n.queue,
              ...(n.queue.deadLetterId
                ? { deadLetterId: idMap.get(n.queue.deadLetterId) || n.queue.deadLetterId }
                : {}),
            },
          }
        : {}),
      ...(n.balancer ? { balancer: n.balancer } : {}),
      ...(n.external ? { external: true } : {}),
      ...(n.cache
        ? {
            cache: {
              ...n.cache,
              ...(n.cache.backingId ? { backingId: idMap.get(n.cache.backingId) || n.cache.backingId } : {}),
            },
          }
        : {}),
      ...(n.limiter ? { limiter: n.limiter } : {}),
      ...(n.schedule ? { schedule: n.schedule } : {}),
      ...(n.child && depth < MAX_CHILD_DEPTH
        ? {
            children: buildFrontmatter(
              { ...doc, frames: undefined, ...n.child, simulations: [], legend: undefined, insights: undefined },
              false,
              depth + 1,
            ),
          }
        : {}),
      title: n.title,
      subtitle: n.subtitle,
      eyebrow: n.eyebrow,
      footerLeft: n.footerLeft,
      chip: n.chip,
      zoneLabel: n.zoneLabel,
      interfaceLabel: n.interfaceLabel,
      summary: n.summary,
      position: [Math.round(n.x), Math.round(n.y)],
      metrics: n.metrics,
      payload: parsedPayload,
    };
  }

  const frontmatterObj: Record<string, unknown> = shell
    ? {
        title: doc.title,
        systemTag: doc.systemTag,
        statusLabel: doc.statusLabel,
        direction: doc.direction,
        stageWidth: doc.stageWidth,
        stageHeight: doc.stageHeight,
        overviewSummary: doc.overviewSummary,
      }
    : { direction: doc.direction };

  const brand = normalizeBrand(doc.brand);
  if (shell && !brandIsDefault(brand)) {
    frontmatterObj.brand = {
      ...(brand.name ? { name: brand.name } : {}),
      ...(brand.accent ? { accent: brand.accent } : {}),
      ...(brand.logo ? { logo: brand.logo } : {}),
    };
  }

  if (doc.legend?.length) {
    frontmatterObj.legend = doc.legend.map((entry) => ({
      tone: entry.tone,
      label: entry.label,
      ...(entry.description ? { description: entry.description } : {}),
    }));
  }

  if (doc.insights?.muted.length) frontmatterObj.insights = { muted: [...doc.insights.muted] };

  if (doc.zones.length > 0) {
    frontmatterObj.zones = doc.zones.map((z) => ({
      id: z.id,
      number: z.number,
      title: z.title,
      subtitle: z.subtitle,
      x: Math.round(z.x),
      width: Math.round(z.width),
    }));
  }

  if (doc.frames?.length) {
    frontmatterObj.frames = doc.frames.map((f) => ({
      id: f.id,
      title: f.title,
      x: Math.round(f.x),
      y: Math.round(f.y),
      width: Math.round(f.width),
      height: Math.round(f.height),
      tone: f.tone,
      ...(f.parentId ? { parentId: f.parentId } : {}),
      ...(f.locked ? { locked: true } : {}),
    }));
  }

  if (doc.notesCards.length > 0) {
    frontmatterObj.notesCards = doc.notesCards.map((c) => ({
      id: c.id,
      title: c.title,
      code: c.code,
      position: [Math.round(c.x), Math.round(c.y)],
      ...(c.variant === 'text' ? { variant: 'text' } : {}),
      items: c.items.map((it) => ({
        title: it.title,
        text: it.text,
        ...(it.icon ? { icon: it.icon } : {}),
      })),
    }));
  }

  if (Object.keys(nodesMeta).length > 0) {
    frontmatterObj.nodes = nodesMeta;
  }

  if (doc.edges.length > 0) {
    frontmatterObj.edges = doc.edges.map((e) => ({
      id: e.id,
      from: idMap.get(e.from) || e.from,
      to: idMap.get(e.to) || e.to,
      sourcePort: e.sourcePort,
      targetPort: e.targetPort,
      tone: e.tone,
      route: e.route,
      label: e.label,
      animated: e.animated,
      ...(e.flow === 'both' ? { flow: 'both' } : {}),
      ...(e.comment ? { comment: e.comment } : {}),
      ...(e.protocol ? { protocol: e.protocol } : {}),
      ...(e.sync ? { sync: e.sync } : {}),
      ...(e.latencyMs !== undefined ? { latencyMs: e.latencyMs } : {}),
      ...(e.tags?.length ? { tags: e.tags } : {}),
      ...(e.waypoint ? { waypoint: [Math.round(e.waypoint[0]), Math.round(e.waypoint[1])] } : {}),
    }));
  }

  if (shell) {
    if (doc.pageTitle) frontmatterObj.pageTitle = doc.pageTitle;
    if (doc.pageId) frontmatterObj.pageId = doc.pageId;
    if (doc.pages?.length) {
      frontmatterObj.pages = doc.pages.map((page) => ({
        id: page.id,
        title: page.title,
        ...(page.stageWidth ? { stageWidth: page.stageWidth } : {}),
        ...(page.stageHeight ? { stageHeight: page.stageHeight } : {}),
        ...buildFrontmatter(
          { ...doc, pages: undefined, frames: undefined, ...page, simulations: [], legend: undefined, insights: undefined },
          false,
          depth + 1,
        ),
      }));
    }
  }

  if (doc.simulations.length > 0) {
    frontmatterObj.simulations = doc.simulations.map((s) => ({
      id: s.id,
      name: s.name,
      tone: s.tone,
      ...(s.failures?.length ? { failures: s.failures.map((nid) => idMap.get(nid) || nid) } : {}),
      ...(s.budgetMs !== undefined ? { budgetMs: s.budgetMs } : {}),
      steps: s.steps.map((st) => ({
        id: st.id,
        nodes: st.nodes.map((nid) => idMap.get(nid) || nid),
        tone: st.tone,
        label: st.label,
        trace: st.trace,
      })),
    }));
  }

  return frontmatterObj;
}
