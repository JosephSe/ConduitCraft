/**
 * Where things are in the Blueprint file text (F-05, D2b): the line range of each component, wire, swimlane, note and
 * frame, so the code pane can highlight what is selected on the canvas and select what the cursor is in. Reads only
 * the top level of the file (not `pages:` or a component's `children:`), which is where the first page lives.
 * Pure and DOM-free.
 */
import type { SelectionTarget } from '../types';

/** 1-based, inclusive. */
export interface LineRange {
  start: number;
  end: number;
}

export type BlockKind = 'node' | 'edge' | 'zone' | 'notes' | 'frame';

export interface BlockIndex {
  /** Components by their key in the `nodes:` map (the sanitised id, not necessarily the document id). */
  nodes: Map<string, LineRange>;
  edges: Map<string, LineRange>;
  zones: Map<string, LineRange>;
  notes: Map<string, LineRange>;
  frames: Map<string, LineRange>;
}

const LIST_SECTIONS: Record<string, keyof Omit<BlockIndex, 'nodes'>> = {
  edges: 'edges',
  zones: 'zones',
  notesCards: 'notes',
  frames: 'frames',
};

const unquote = (value: string) => value.trim().replace(/^(['"])(.*)\1$/, '$2');

/** Find every block of the top level of a Blueprint file. */
export function indexBlocks(text: string): BlockIndex {
  const index: BlockIndex = { nodes: new Map(), edges: new Map(), zones: new Map(), notes: new Map(), frames: new Map() };
  const lines = text.split('\n');
  // The file's own YAML ends at the closing `---` of the front matter.
  let end = lines.length;
  let seenOpen = false;
  for (let i = 0; i < lines.length; i += 1) {
    if (/^---\s*$/.test(lines[i])) {
      if (seenOpen) {
        end = i;
        break;
      }
      seenOpen = true;
    }
  }
  let section: string | null = null;
  let open: { map: Map<string, LineRange>; key: string; start: number } | null = null;
  const close = (lastLine: number) => {
    if (open) open.map.set(open.key, { start: open.start, end: Math.max(open.start, lastLine) });
    open = null;
  };
  for (let i = 0; i < end; i += 1) {
    const line = lines[i];
    const n = i + 1;
    const top = /^([A-Za-z][\w]*):/.exec(line);
    if (top) {
      close(n - 1);
      section = top[1];
      continue;
    }
    if (section === 'nodes') {
      const entry = /^ {2}(\S[^:]*):\s*$/.exec(line);
      if (entry) {
        close(n - 1);
        open = { map: index.nodes, key: unquote(entry[1]), start: n };
      }
    } else if (section && LIST_SECTIONS[section]) {
      // `  - id: e1` starts an item; its other keys are indented further.
      const item = /^ {0,2}- /.exec(line);
      if (item) {
        close(n - 1);
        const idLine = /^ {0,2}- id:\s*(.+?)\s*$/.exec(line);
        open = idLine ? { map: index[LIST_SECTIONS[section]], key: unquote(idLine[1]), start: n } : null;
      } else if (open && /^ {0,2}\S/.test(line) && !/^ {3,}/.test(line) && !/^\s*$/.test(line)) {
        close(n - 1);
      }
    }
  }
  close(end);
  // Drop trailing blank lines from each range.
  for (const map of [index.nodes, index.edges, index.zones, index.notes, index.frames]) {
    for (const [key, range] of map) {
      let last = range.end;
      while (last > range.start && !lines[last - 1]?.trim()) last -= 1;
      map.set(key, { start: range.start, end: last });
    }
  }
  return index;
}

/** The keys components have in the `nodes:` map, in document order, as the writer makes them (sanitised, made unique). */
export function nodeKeys(ids: readonly string[], sanitize: (id: string) => string): Map<string, string> {
  const used = new Set<string>();
  const keys = new Map<string, string>();
  for (const id of ids) {
    const base = sanitize(id);
    let candidate = base;
    for (let suffix = 2; used.has(candidate); suffix += 1) candidate = `${base}_${suffix}`;
    used.add(candidate);
    keys.set(id, candidate);
  }
  return keys;
}

/** The lines a selection covers: the first range found for it, or null. */
export function rangeOfSelection(
  index: BlockIndex,
  selection: SelectionTarget,
  keyOfNode: (id: string) => string | undefined,
): LineRange | null {
  switch (selection.type) {
    case 'node': {
      const key = keyOfNode(selection.id);
      return key ? (index.nodes.get(key) ?? null) : null;
    }
    case 'edge':
      return index.edges.get(selection.id) ?? null;
    case 'zone':
      return index.zones.get(selection.id) ?? null;
    case 'notes':
      return index.notes.get(selection.id) ?? null;
    case 'frame':
      return index.frames.get(selection.id) ?? null;
    default:
      return null;
  }
}

/** What a line belongs to, as a selection. */
export function selectionAtLine(index: BlockIndex, line: number, nodeIdOfKey: (key: string) => string | undefined): SelectionTarget | null {
  const within = (r: LineRange) => line >= r.start && line <= r.end;
  for (const [key, range] of index.nodes) {
    const id = nodeIdOfKey(key);
    if (id && within(range)) return { type: 'node', id };
  }
  const lists: Array<[Map<string, LineRange>, 'edge' | 'zone' | 'notes' | 'frame']> = [
    [index.edges, 'edge'],
    [index.zones, 'zone'],
    [index.notes, 'notes'],
    [index.frames, 'frame'],
  ];
  for (const [map, type] of lists) {
    for (const [id, range] of map) if (within(range)) return { type, id };
  }
  return null;
}
