/**
 * draw.io import (F-25, B6). Reads `.drawio` and `.xml` files (plain or compressed pages), maps shapes to
 * components by style, edges to wires, swimlanes and containers to swimlanes, and HTML labels to plain text.
 * Everything that could not be mapped is returned as import issues. Loaded on demand, so none of it is in the
 * entry bundle.
 */
import type {
  DiagramDocument,
  DiagramEdge,
  DiagramNode,
  DiagramNotesCard,
  DiagramZone,
  ImportIssue,
  NodeKind,
  NodeShape,
} from '../types';
import { expandStageToFit } from '../core/layout';
import { MAX_PAGES, normalizePages } from '../core/pages';
import { STENCIL_CATALOG, createBlankDocument, createNodeFromStencil } from '../templates/presets';
import { childrenNamed, decodeEntities, parseXml, type XmlNode } from './xml';
import { colourToTone, issue, placeShapes, slugOf, uniqueId, type Geo } from './common';

export { colourToTone };

export type DrawioPageMode = 'separate' | 'tabs';

export interface DrawioPage {
  name: string;
  /** The page's mxGraphModel, ready to convert. */
  model: XmlNode;
}

export interface DrawioFile {
  pages: DrawioPage[];
  issues: ImportIssue[];
}

export interface DrawioResult {
  /** One document per page ('separate'), or one document with a page tab for each draw.io page ('tabs'). */
  docs: DiagramDocument[];
  issues: ImportIssue[];
}

const MAX_CELLS = 3000;
const MAX_INFLATED_BYTES = 40_000_000;


// ---------------------------------------------------------------------------------------------------------------
// Reading the file

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value.replace(/\s+/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Inflate raw deflate data, giving up past a size cap so a tiny file cannot expand into memory. */
async function inflateRaw(bytes: Uint8Array): Promise<string> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const reader = stream.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_INFLATED_BYTES) {
      await reader.cancel();
      throw new Error('A page in this file expands to more than 40 MB, so it was not read.');
    }
    parts.push(value);
  }
  const all = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    all.set(part, offset);
    offset += part.length;
  }
  return new TextDecoder().decode(all);
}

/** A page's text is either the XML itself (URL-encoded) or base64 of raw-deflated, URL-encoded XML. */
async function pageModelFromText(text: string): Promise<XmlNode> {
  const trimmed = text.trim();
  let xml: string;
  if (trimmed.startsWith('<')) xml = trimmed;
  else if (/^%3C/i.test(trimmed)) xml = decodeURIComponent(trimmed);
  else xml = decodeURIComponent(await inflateRaw(base64ToBytes(trimmed)));
  const node = parseXml(xml);
  if (node.name !== 'mxGraphModel') throw new Error('A page does not hold a draw.io diagram.');
  return node;
}

/** Read the pages of a draw.io file. Pages that cannot be read are reported and left out. */
export async function readDrawio(text: string): Promise<DrawioFile> {
  const issues: ImportIssue[] = [];
  let root: XmlNode;
  try {
    root = parseXml(text);
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : 'This file is not valid XML.');
  }
  const pages: DrawioPage[] = [];
  if (root.name === 'mxGraphModel') {
    pages.push({ name: 'Page 1', model: root });
  } else if (root.name === 'mxfile') {
    const diagrams = childrenNamed(root, 'diagram');
    for (let i = 0; i < diagrams.length; i++) {
      const d = diagrams[i];
      const name = (d.attrs.name || `Page ${i + 1}`).trim() || `Page ${i + 1}`;
      try {
        const inline = childrenNamed(d, 'mxGraphModel')[0];
        pages.push({ name, model: inline ?? (await pageModelFromText(d.text)) });
      } catch (err) {
        issues.push(issue('error', 'drawio-page-unreadable', `Page "${name}" could not be read: ${err instanceof Error ? err.message : 'unknown error'}`));
      }
    }
  } else {
    throw new Error('This is XML, but not a draw.io file.');
  }
  if (pages.length === 0) throw new Error(issues[0]?.message ?? 'This draw.io file has no pages.');
  return { pages, issues };
}

// ---------------------------------------------------------------------------------------------------------------
// Cells

interface Cell {
  id: string;
  value: string;
  styleName: string;
  style: Record<string, string>;
  vertex: boolean;
  edge: boolean;
  parent: string;
  source: string;
  target: string;
  geo: Geo | null;
}

function parseStyle(raw: string): { name: string; map: Record<string, string> } {
  const map: Record<string, string> = {};
  let name = '';
  for (const part of raw.split(';')) {
    const token = part.trim();
    if (!token) continue;
    const eq = token.indexOf('=');
    if (eq === -1) {
      if (!name) name = token;
      map[token] = '';
    } else map[token.slice(0, eq)] = token.slice(eq + 1);
  }
  return { name, map };
}

const num = (value: string | undefined): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

function readCells(model: XmlNode): Cell[] {
  const rootEl = childrenNamed(model, 'root')[0];
  if (!rootEl) return [];
  const cells: Cell[] = [];
  for (const el of rootEl.children) {
    let cellEl: XmlNode | undefined;
    let id = '';
    let value = '';
    if (el.name === 'mxCell') {
      cellEl = el;
      id = el.attrs.id ?? '';
      value = el.attrs.value ?? '';
    } else if (el.name === 'object' || el.name === 'UserObject') {
      cellEl = childrenNamed(el, 'mxCell')[0];
      id = el.attrs.id ?? '';
      value = el.attrs.label ?? el.attrs.value ?? '';
    }
    if (!cellEl || !id) continue;
    const geoEl = childrenNamed(cellEl, 'mxGeometry')[0];
    const styleSource = cellEl.attrs.style ?? '';
    const style = parseStyle(styleSource);
    cells.push({
      id,
      value,
      styleName: style.name,
      style: style.map,
      vertex: cellEl.attrs.vertex === '1',
      edge: cellEl.attrs.edge === '1',
      parent: cellEl.attrs.parent ?? '',
      source: cellEl.attrs.source ?? '',
      target: cellEl.attrs.target ?? '',
      geo: geoEl
        ? { x: num(geoEl.attrs.x), y: num(geoEl.attrs.y), width: num(geoEl.attrs.width), height: num(geoEl.attrs.height) }
        : null,
    });
  }
  return cells;
}

/** Labels are plain text or HTML. Line breaks survive; tags and entities do not. */
export function labelToText(value: string): string {
  if (!value) return '';
  let text = value;
  if (/<[a-z!/][^>]*>/i.test(text)) {
    text = text
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/?(div|p|li|h[1-6]|tr)\b[^>]*>/gi, '\n')
      .replace(/<[^>]*>/g, '');
  }
  text = decodeEntities(text).replace(/&nbsp;/g, ' ').replace(/ /g, ' ');
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
}

// ---------------------------------------------------------------------------------------------------------------
// Style to component

interface Mapped {
  kind: NodeKind;
  shape?: NodeShape;
  /** The style had no known meaning, so the component is a plain service. */
  unknown?: string;
}

function mapShape(cell: Cell): Mapped {
  const s = cell.style;
  const shape = (s.shape ?? cell.styleName).toLowerCase();
  const has = (...words: string[]) => words.some((w) => shape.includes(w));
  if (has('cylinder', 'datastore', 'database', 'mxgraph.flowchart.stored_data', 'storage')) return { kind: 'store' };
  if (has('actor', 'umlactor', 'person', 'user')) return { kind: 'actor' };
  if (has('rhombus', 'decision')) return { kind: 'gate', shape: 'diamond' };
  if (has('hexagon')) return { kind: 'service', shape: 'hexagon' };
  if (has('ellipse', 'doubleellipse')) return { kind: 'service', shape: 'circle' };
  if (has('terminator', 'pill')) return { kind: 'service', shape: 'pill' };
  if (has('browser', 'mobile', 'laptop', 'monitor', 'client')) return { kind: 'client' };
  if (has('queue', 'topic', 'bus', 'kafka', 'message')) return { kind: 'bus' };
  if (s.rounded === '1' || cell.styleName === 'rounded') return { kind: 'service', shape: 'rounded' };
  const recognised = ['rect', 'rectangle', 'process', 'text', 'label', 'swimlane', 'mxcompositeshape', ''];
  if (shape.startsWith('mxgraph.') || (s.shape && !recognised.includes(shape))) return { kind: 'service', unknown: s.shape ?? shape };
  return { kind: 'service' };
}

// ---------------------------------------------------------------------------------------------------------------
// Page to document

/** Turn one page into a diagram. Issues are added to `issues`. */
export function convertPage(model: XmlNode, title: string, issues: ImportIssue[]): DiagramDocument {
  const cells = readCells(model);
  const byId = new Map(cells.map((c) => [c.id, c]));
  const layerIds = new Set(cells.filter((c) => !c.vertex && !c.edge).map((c) => c.id));
  const cap = cells.length > MAX_CELLS;
  if (cap) issues.push(issue('warning', 'drawio-too-many-cells', `This page has ${cells.length} shapes; only the first ${MAX_CELLS} were read.`));
  const live = cap ? cells.slice(0, MAX_CELLS) : cells;

  const vertices = live.filter((c) => c.vertex);
  const edgeCells = live.filter((c) => c.edge);
  const edgeIds = new Set(edgeCells.map((c) => c.id));

  // Where a shape really is: draw.io positions a shape relative to its container.
  const absCache = new Map<string, Geo | null>();
  const absolute = (cell: Cell, depth = 0): Geo | null => {
    if (!cell.geo) return null;
    if (absCache.has(cell.id)) return absCache.get(cell.id) ?? null;
    let geo: Geo = { ...cell.geo };
    const parent = byId.get(cell.parent);
    if (parent?.vertex && depth < 64) {
      const p = absolute(parent, depth + 1);
      if (p) geo = { ...geo, x: geo.x + p.x, y: geo.y + p.y };
    }
    absCache.set(cell.id, geo);
    return geo;
  };

  // Edge labels are separate child shapes of the edge.
  const edgeLabels = new Map<string, string[]>();
  const labelCells = new Set<string>();
  for (const cell of vertices) {
    if (edgeIds.has(cell.parent) || 'edgeLabel' in cell.style || cell.styleName === 'edgeLabel') {
      const text = labelToText(cell.value);
      if (edgeIds.has(cell.parent) && text) edgeLabels.set(cell.parent, [...(edgeLabels.get(cell.parent) ?? []), text]);
      labelCells.add(cell.id);
    }
  }

  const children = new Map<string, Cell[]>();
  for (const cell of vertices) {
    if (labelCells.has(cell.id)) continue;
    children.set(cell.parent, [...(children.get(cell.parent) ?? []), cell]);
  }
  const isContainer = (cell: Cell): boolean => {
    if ('swimlane' in cell.style || cell.style.shape === 'swimlane' || cell.style.container === '1' || 'group' in cell.style) return true;
    return (children.get(cell.id) ?? []).some((child) => !isTextCell(child));
  };
  const isTextCell = (cell: Cell): boolean =>
    cell.styleName === 'text' || cell.style.shape === 'text';

  const doc = createBlankDocument();
  doc.title = title;
  const usedIds = new Set<string>();
  const nodeFor = new Map<string, DiagramNode>();
  const containers: Array<{ cell: Cell; title: string; members: DiagramNode[] }> = [];
  const containerOf = new Map<string, Cell>(); // vertex id -> nearest container ancestor
  const notes: DiagramNotesCard[] = [];
  const unknownShapes = new Set<string>();
  let imageShapes = 0;
  let skippedNoGeometry = 0;
  const origin = new Map<string, Geo>();

  const containerAbove = (cell: Cell): Cell | undefined => {
    let parent = byId.get(cell.parent);
    for (let depth = 0; parent && depth < 64; depth++) {
      if (parent.vertex && isContainer(parent)) return parent;
      parent = byId.get(parent.parent);
    }
    return undefined;
  };

  for (const cell of vertices) {
    if (labelCells.has(cell.id) || layerIds.has(cell.id)) continue;
    const geo = absolute(cell);
    const text = labelToText(cell.value);
    if (!geo || geo.width <= 0 || geo.height <= 0) {
      skippedNoGeometry += 1;
      continue;
    }
    if (isContainer(cell)) {
      containers.push({ cell, title: text.split('\n')[0] || 'Group', members: [] });
      continue;
    }
    if (isTextCell(cell)) {
      if (!text) continue;
      const lines = text.split('\n').filter(Boolean);
      notes.push({
        id: uniqueId(`note-${slugOf(lines[0])}`, usedIds),
        title: lines[0].slice(0, 40).toUpperCase(),
        code: 'DRAWIO',
        x: geo.x,
        y: geo.y,
        items: (lines.length > 1 ? lines.slice(1) : lines).slice(0, 12).map((line) => ({ title: 'Note', text: line, icon: 'bullet' as const })),
      });
      origin.set(`note:${notes[notes.length - 1].id}`, geo);
      continue;
    }
    const mapped = mapShape(cell);
    if (mapped.unknown) unknownShapes.add(mapped.unknown);
    if (cell.style.shape === 'image' || cell.styleName === 'image') imageShapes += 1;
    const node = createNodeFromStencil(mapped.kind, 0, 0, 0);
    const lines = text.split('\n').filter(Boolean);
    const nodeTitle = (lines[0] ?? STENCIL_CATALOG.find((s) => s.kind === mapped.kind)?.defaultTitle ?? 'Component').slice(0, 60);
    node.id = uniqueId(slugOf(nodeTitle), usedIds);
    node.title = nodeTitle;
    if (lines[1]) node.subtitle = lines[1].slice(0, 60);
    node.summary = lines.length > 2 ? lines.slice(2).join(' ').slice(0, 280) : `${nodeTitle} imported from draw.io.`;
    if (mapped.shape) node.shape = mapped.shape;
    const tone = colourToTone(cell.style.fillColor) ?? colourToTone(cell.style.strokeColor);
    if (tone) node.accent = tone;
    node.code = JSON.stringify({ id: node.id, component: nodeTitle, source: 'draw.io' }, null, 2);
    origin.set(node.id, geo);
    nodeFor.set(cell.id, node);
    const above = containerAbove(cell);
    if (above) containerOf.set(cell.id, above);
    doc.nodes.push(node);
  }
  if (skippedNoGeometry > 0) {
    issues.push(issue('warning', 'drawio-no-geometry', `${skippedNoGeometry} shape${skippedNoGeometry === 1 ? ' has' : 's have'} no size or position and ${skippedNoGeometry === 1 ? 'was' : 'were'} skipped.`));
  }
  if (unknownShapes.size > 0) {
    const names = [...unknownShapes].slice(0, 6).join(', ');
    issues.push(issue('info', 'drawio-unknown-shape', `${unknownShapes.size} shape type${unknownShapes.size === 1 ? ' has' : 's have'} no equivalent (${names}${unknownShapes.size > 6 ? ', …' : ''}) and became plain components.`));
  }
  if (imageShapes > 0) issues.push(issue('info', 'drawio-image-shape', `${imageShapes} image shape${imageShapes === 1 ? '' : 's'} became plain components; pictures are not imported.`));

  // Position: keep the draw.io layout, scaled so components of the default size do not collide.
  const { scale, shiftX } = placeShapes(doc, notes, origin, issues, 'drawio');

  // Wires.
  let danglingEdges = 0;
  let containerEdges = 0;
  const edgeIdsUsed = new Set<string>();
  for (const cell of edgeCells) {
    const from = nodeFor.get(cell.source);
    const to = nodeFor.get(cell.target);
    if (!from || !to) {
      const ends = [cell.source, cell.target].map((id) => byId.get(id));
      if (ends.some((end) => end && containers.some((c) => c.cell.id === end.id))) containerEdges += 1;
      else danglingEdges += 1;
      continue;
    }
    const labels = edgeLabels.get(cell.id) ?? [];
    const label = labelToText(cell.value) || labels.join(' / ');
    const startArrow = cell.style.startArrow && cell.style.startArrow !== 'none';
    const endArrow = cell.style.endArrow !== 'none';
    const reversed = startArrow && !endArrow;
    const edge: DiagramEdge = {
      id: uniqueId(`wire-${edgeIdsUsed.size + 1}`, edgeIdsUsed),
      from: reversed ? to.id : from.id,
      to: reversed ? from.id : to.id,
      sourcePort: 'auto',
      targetPort: 'auto',
      tone: colourToTone(cell.style.strokeColor) ?? 'blue',
      route: 'auto',
      label: label.replace(/\n+/g, ' ').slice(0, 80),
      animated: cell.style.dashed !== '1',
    };
    if (startArrow && endArrow) edge.flow = 'both';
    if (cell.style.dashed === '1') edge.sync = 'async';
    doc.edges.push(edge);
  }
  if (danglingEdges > 0) {
    issues.push(issue('warning', 'drawio-edge-unconnected', `${danglingEdges} line${danglingEdges === 1 ? ' is' : 's are'} not attached to a shape at both ends and ${danglingEdges === 1 ? 'was' : 'were'} skipped.`));
  }
  if (containerEdges > 0) {
    issues.push(issue('warning', 'drawio-edge-to-container', `${containerEdges} line${containerEdges === 1 ? ' is' : 's are'} attached to a group or swimlane, which cannot hold a wire, and ${containerEdges === 1 ? 'was' : 'were'} skipped.`));
  }

  // Swimlanes: a column that spans the components inside (or the container's own width when it holds none).
  if (containers.length > 0) {
    let nested = 0;
    containers.forEach((entry, index) => {
      const members = [...nodeFor.entries()]
        .filter(([cellId]) => {
          let c = containerOf.get(cellId);
          for (let depth = 0; c && depth < 64; depth++) {
            if (c.id === entry.cell.id) return true;
            c = containerAbove(c);
          }
          return false;
        })
        .map(([, node]) => node);
      entry.members = members;
      if (containerAbove(entry.cell)) nested += 1;
      const num = String(index + 1).padStart(2, '0');
      let x: number;
      let width: number;
      if (members.length > 0) {
        x = Math.min(...members.map((m) => m.x)) - 32;
        width = Math.max(...members.map((m) => m.x + m.width)) + 32 - x;
      } else {
        const g = absolute(entry.cell)!;
        x = g.x * scale + shiftX;
        width = g.width * scale;
      }
      const zone: DiagramZone = {
        id: uniqueId(`zone-${slugOf(entry.title)}`, usedIds),
        number: num,
        title: entry.title.slice(0, 40).toUpperCase(),
        subtitle: 'From draw.io',
        x: Math.max(24, Math.round(x / 16) * 16),
        width: Math.max(160, Math.round(width / 16) * 16),
      };
      doc.zones.push(zone);
    });
    issues.push(issue('info', 'drawio-containers', `${containers.length} group${containers.length === 1 ? '' : 's'} or swimlane${containers.length === 1 ? '' : 's'} became swimlanes (columns); the shapes inside stay as components.`));
    if (nested > 0) issues.push(issue('info', 'drawio-nested-containers', `${nested} nested group${nested === 1 ? '' : 's'} became separate swimlanes, so the nesting is lost.`));
  }

  doc.notesCards = notes;
  doc.direction = 'LR';
  expandStageToFit(doc);
  return doc;
}

// ---------------------------------------------------------------------------------------------------------------
// Pages to documents

function titleCase(text: string): string {
  return text.replace(/\b\w/g, (ch) => ch.toUpperCase());
}

/**
 * Convert every page. 'separate' gives one diagram per page. 'tabs' gives one diagram with a page tab for each draw.io
 * page, keeping the names and the order (D10). A file with one page gives one diagram either way.
 */
export function convertDrawio(file: DrawioFile, mode: DrawioPageMode, fileTitle: string): DrawioResult {
  const issues: ImportIssue[] = [...file.issues];
  const many = file.pages.length > 1;
  const pageDocs = file.pages.map((page) => {
    const pageIssues: ImportIssue[] = [];
    const title = many && mode === 'separate' ? `${fileTitle} – ${page.name}` : fileTitle;
    const doc = convertPage(page.model, title, pageIssues);
    for (const item of pageIssues) issues.push(many ? { ...item, message: `${page.name}: ${item.message}` } : item);
    return doc;
  });
  if (!many || mode === 'separate') return { docs: pageDocs, issues };

  const [first, ...rest] = pageDocs;
  const doc = first;
  doc.title = titleCase(fileTitle);
  doc.pageTitle = file.pages[0].name.trim() || undefined;
  if (!doc.pageTitle) delete doc.pageTitle;
  doc.pages = rest.slice(0, MAX_PAGES - 1).map((pageDoc, i) => ({
    id: '',
    title: file.pages[i + 1].name.trim(),
    nodes: pageDoc.nodes,
    edges: pageDoc.edges,
    zones: pageDoc.zones,
    notesCards: pageDoc.notesCards,
    ...(pageDoc.frames?.length ? { frames: pageDoc.frames } : {}),
    stageWidth: pageDoc.stageWidth,
    stageHeight: pageDoc.stageHeight,
  }));
  if (rest.length > MAX_PAGES - 1) {
    issues.push({ level: 'warning', code: 'drawio-too-many-pages', message: `A file holds at most ${MAX_PAGES} pages; the last ${rest.length - (MAX_PAGES - 1)} were not imported.` });
  }
  normalizePages(doc);
  return { docs: [doc], issues };
}
