import type { DiagramEdge, SelectionTarget } from '../types';

export interface SelectionChange {
  previous: SelectionTarget;
  selection: SelectionTarget;
}

export function normalizeSelection(selection: SelectionTarget): SelectionTarget {
  if (selection.type === 'multi') {
    return {
      type: 'multi',
      ids: [...selection.ids],
      ...(selection.zoneIds?.length ? { zoneIds: [...selection.zoneIds] } : {}),
      ...(selection.notesIds?.length ? { notesIds: [...selection.notesIds] } : {}),
      ...(selection.edgeIds?.length ? { edgeIds: [...selection.edgeIds] } : {}),
      ...(selection.excludedEdgeIds?.length ? { excludedEdgeIds: [...selection.excludedEdgeIds] } : {}),
    };
  }
  if (selection.type === 'none') return { type: 'none' };
  return { type: selection.type, id: selection.id };
}

/** One selected object stays a single target. Several become a multi-select. */
export function selectionOfStage(parts: {
  nodes: readonly string[];
  zones: readonly string[];
  notes: readonly string[];
  edges?: readonly string[];
  excludedEdges?: readonly string[];
}): SelectionTarget {
  const nodes = [...parts.nodes];
  const zones = [...parts.zones];
  const notes = [...parts.notes];
  const edges = [...(parts.edges ?? [])];
  const excludedEdges = [...(parts.excludedEdges ?? [])];
  const count = nodes.length + zones.length + notes.length + edges.length;
  if (count === 0 && excludedEdges.length === 0) return { type: 'none' };
  if (count === 1 && excludedEdges.length === 0) {
    if (nodes.length === 1) return { type: 'node', id: nodes[0] };
    if (zones.length === 1) return { type: 'zone', id: zones[0] };
    if (notes.length === 1) return { type: 'notes', id: notes[0] };
    return { type: 'edge', id: edges[0] };
  }
  return {
    type: 'multi',
    ids: nodes,
    ...(zones.length > 0 ? { zoneIds: zones } : {}),
    ...(notes.length > 0 ? { notesIds: notes } : {}),
    ...(edges.length > 0 ? { edgeIds: edges } : {}),
    ...(excludedEdges.length > 0 ? { excludedEdgeIds: excludedEdges } : {}),
  };
}

/** Stable identity for a selection. Multi-select order is part of the key. */
export function selectionKey(selection: SelectionTarget): string {
  if (selection.type === 'none') return 'none';
  if (selection.type === 'multi') {
    const nodes = selection.ids.join('\u0000');
    const zones = selection.zoneIds?.join('\u0000') ?? '';
    const notes = selection.notesIds?.join('\u0000') ?? '';
    const edges = selection.edgeIds?.join('\u0000') ?? '';
    const excluded = selection.excludedEdgeIds?.join('\u0000') ?? '';
    if (!zones && !notes && !edges && !excluded) return `multi:${nodes}`;
    if (!edges && !excluded) return `multi:${nodes}|${zones}|${notes}`;
    return `multi:${nodes}|${zones}|${notes}|${edges}|${excluded}`;
  }
  return `${selection.type}:${selection.id}`;
}

export function resolveSelectionUpdate(
  current: SelectionTarget,
  next: SelectionTarget,
): { changed: boolean; selection: SelectionTarget } {
  const selection = normalizeSelection(next);
  if (selectionKey(current) === selectionKey(selection)) {
    return { changed: false, selection: current };
  }
  return { changed: true, selection };
}

/** Check if an edge is currently highlighted or active within the given selection. */
export function isEdgeActiveInSelection(
  current: SelectionTarget,
  edgeId: string,
  docEdges: readonly DiagramEdge[],
): boolean {
  if (current.type === 'none') return false;
  if (current.type === 'edge') return current.id === edgeId;
  if (current.type === 'node') {
    const edge = docEdges.find((e) => e.id === edgeId);
    if (!edge) return false;
    return edge.from === current.id || edge.to === current.id;
  }
  if (current.type === 'multi') {
    if (current.excludedEdgeIds?.includes(edgeId)) return false;
    if (current.edgeIds?.includes(edgeId)) return true;
    const edge = docEdges.find((e) => e.id === edgeId);
    if (!edge) return false;
    return current.ids.includes(edge.from) || current.ids.includes(edge.to);
  }
  return false;
}

/** Toggle individual node selection (add if absent, unselect if present). */
export function toggleNodeInSelection(current: SelectionTarget, nodeId: string): SelectionTarget {
  if (current.type === 'none') {
    return { type: 'node', id: nodeId };
  }
  if (current.type === 'node') {
    if (current.id === nodeId) return { type: 'none' };
    return { type: 'multi', ids: [current.id, nodeId] };
  }
  if (current.type === 'edge') {
    return { type: 'multi', ids: [nodeId], edgeIds: [current.id] };
  }
  if (current.type === 'zone') {
    return { type: 'multi', ids: [nodeId], zoneIds: [current.id] };
  }
  if (current.type === 'notes') {
    return { type: 'multi', ids: [nodeId], notesIds: [current.id] };
  }

  // Multi:
  const ids = current.ids.includes(nodeId)
    ? current.ids.filter((id) => id !== nodeId)
    : [...current.ids, nodeId];
  const zones = current.zoneIds ?? [];
  const notes = current.notesIds ?? [];
  const edges = current.edgeIds ?? [];
  const excluded = current.excludedEdgeIds ?? [];

  const count = ids.length + zones.length + notes.length + edges.length;
  if (count === 0 && excluded.length === 0) return { type: 'none' };
  if (count === 1 && excluded.length === 0) {
    if (ids.length === 1) return { type: 'node', id: ids[0] };
    if (edges.length === 1) return { type: 'edge', id: edges[0] };
    if (zones.length === 1) return { type: 'zone', id: zones[0] };
    if (notes.length === 1) return { type: 'notes', id: notes[0] };
  }
  return {
    type: 'multi',
    ids,
    ...(zones.length > 0 ? { zoneIds: [...zones] } : {}),
    ...(notes.length > 0 ? { notesIds: [...notes] } : {}),
    ...(edges.length > 0 ? { edgeIds: [...edges] } : {}),
    ...(excluded.length > 0 ? { excludedEdgeIds: [...excluded] } : {}),
  };
}

/** Toggle individual edge/connector selection (unselect if highlighted/present, select if absent). */
export function toggleEdgeInSelection(
  current: SelectionTarget,
  edgeId: string,
  docEdges: readonly DiagramEdge[],
): SelectionTarget {
  if (current.type === 'none') {
    return { type: 'edge', id: edgeId };
  }
  if (current.type === 'edge') {
    if (current.id === edgeId) return { type: 'none' };
    return { type: 'multi', ids: [], edgeIds: [current.id, edgeId] };
  }
  if (current.type === 'node') {
    const edge = docEdges.find((e) => e.id === edgeId);
    const touches = edge ? edge.from === current.id || edge.to === current.id : false;
    if (touches) {
      // Touching node: it was highlighted, so unselect/exclude it
      return { type: 'multi', ids: [current.id], excludedEdgeIds: [edgeId] };
    }
    // Independent edge: add it explicitly
    return { type: 'multi', ids: [current.id], edgeIds: [edgeId] };
  }
  if (current.type === 'zone') {
    return { type: 'multi', ids: [], zoneIds: [current.id], edgeIds: [edgeId] };
  }
  if (current.type === 'notes') {
    return { type: 'multi', ids: [], notesIds: [current.id], edgeIds: [edgeId] };
  }

  // Multi:
  const edge = docEdges.find((e) => e.id === edgeId);
  const touchesSelectedNode = edge
    ? current.ids.includes(edge.from) || current.ids.includes(edge.to)
    : false;
  const inEdgeIds = current.edgeIds?.includes(edgeId) ?? false;
  const inExcluded = current.excludedEdgeIds?.includes(edgeId) ?? false;

  const isActive = (touchesSelectedNode || inEdgeIds) && !inExcluded;

  let nextEdgeIds = current.edgeIds ? [...current.edgeIds] : [];
  let nextExcluded = current.excludedEdgeIds ? [...current.excludedEdgeIds] : [];

  if (isActive) {
    // Unselect this edge
    if (inEdgeIds) {
      nextEdgeIds = nextEdgeIds.filter((id) => id !== edgeId);
    }
    if (touchesSelectedNode && !inExcluded) {
      nextExcluded.push(edgeId);
    }
  } else {
    // Re-select / include this edge
    if (inExcluded) {
      nextExcluded = nextExcluded.filter((id) => id !== edgeId);
    }
    if (!touchesSelectedNode && !nextEdgeIds.includes(edgeId)) {
      nextEdgeIds.push(edgeId);
    }
  }

  const zones = current.zoneIds ?? [];
  const notes = current.notesIds ?? [];
  const ids = current.ids;
  const count = ids.length + zones.length + notes.length + nextEdgeIds.length;
  if (count === 0 && nextExcluded.length === 0) return { type: 'none' };
  if (count === 1 && nextExcluded.length === 0) {
    if (ids.length === 1) return { type: 'node', id: ids[0] };
    if (nextEdgeIds.length === 1) return { type: 'edge', id: nextEdgeIds[0] };
    if (zones.length === 1) return { type: 'zone', id: zones[0] };
    if (notes.length === 1) return { type: 'notes', id: notes[0] };
  }
  return {
    type: 'multi',
    ids: [...ids],
    ...(zones.length > 0 ? { zoneIds: [...zones] } : {}),
    ...(notes.length > 0 ? { notesIds: [...notes] } : {}),
    ...(nextEdgeIds.length > 0 ? { edgeIds: nextEdgeIds } : {}),
    ...(nextExcluded.length > 0 ? { excludedEdgeIds: nextExcluded } : {}),
  };
}

/** Exclude all connected edges in the current multi-selection. */
export function excludeAllEdgesInSelection(
  current: SelectionTarget,
  docEdges: readonly DiagramEdge[],
): SelectionTarget {
  if (current.type !== 'multi') return current;
  const touchingEdgeIds = docEdges
    .filter((e) => current.ids.includes(e.from) || current.ids.includes(e.to))
    .map((e) => e.id);
  const nextExcluded = Array.from(new Set([...(current.excludedEdgeIds ?? []), ...touchingEdgeIds]));
  return {
    type: 'multi',
    ids: [...current.ids],
    ...(current.zoneIds?.length ? { zoneIds: [...current.zoneIds] } : {}),
    ...(current.notesIds?.length ? { notesIds: [...current.notesIds] } : {}),
    ...(nextExcluded.length > 0 ? { excludedEdgeIds: nextExcluded } : {}),
  };
}

/** Toggle individual swimlane stage selection (add if absent, unselect if present). */
export function toggleZoneInSelection(current: SelectionTarget, zoneId: string): SelectionTarget {
  if (current.type === 'none') {
    return { type: 'zone', id: zoneId };
  }
  if (current.type === 'zone') {
    if (current.id === zoneId) return { type: 'none' };
    return { type: 'multi', ids: [], zoneIds: [current.id, zoneId] };
  }
  if (current.type === 'node') {
    return { type: 'multi', ids: [current.id], zoneIds: [zoneId] };
  }
  if (current.type === 'edge') {
    return { type: 'multi', ids: [], edgeIds: [current.id], zoneIds: [zoneId] };
  }
  if (current.type === 'notes') {
    return { type: 'multi', ids: [], notesIds: [current.id], zoneIds: [zoneId] };
  }

  // Multi:
  const currentZones = current.zoneIds ? [...current.zoneIds] : [];
  const nextZones = currentZones.includes(zoneId)
    ? currentZones.filter((id) => id !== zoneId)
    : [...currentZones, zoneId];
  const ids = current.ids;
  const notes = current.notesIds ?? [];
  const edges = current.edgeIds ?? [];
  const excluded = current.excludedEdgeIds ?? [];

  const total = ids.length + nextZones.length + notes.length + edges.length;
  if (total === 0 && excluded.length === 0) return { type: 'none' };
  if (total === 1 && excluded.length === 0) {
    if (ids.length === 1) return { type: 'node', id: ids[0] };
    if (nextZones.length === 1) return { type: 'zone', id: nextZones[0] };
    if (notes.length === 1) return { type: 'notes', id: notes[0] };
    if (edges.length === 1) return { type: 'edge', id: edges[0] };
  }
  return {
    type: 'multi',
    ids: [...ids],
    ...(nextZones.length > 0 ? { zoneIds: nextZones } : {}),
    ...(notes.length > 0 ? { notesIds: [...notes] } : {}),
    ...(edges.length > 0 ? { edgeIds: [...edges] } : {}),
    ...(excluded.length > 0 ? { excludedEdgeIds: [...excluded] } : {}),
  };
}

/** Toggle individual notes card selection (add if absent, unselect if present). */
export function toggleNotesInSelection(current: SelectionTarget, notesId: string): SelectionTarget {
  if (current.type === 'none') {
    return { type: 'notes', id: notesId };
  }
  if (current.type === 'notes') {
    if (current.id === notesId) return { type: 'none' };
    return { type: 'multi', ids: [], notesIds: [current.id, notesId] };
  }
  if (current.type === 'node') {
    return { type: 'multi', ids: [current.id], notesIds: [notesId] };
  }
  if (current.type === 'edge') {
    return { type: 'multi', ids: [], edgeIds: [current.id], notesIds: [notesId] };
  }
  if (current.type === 'zone') {
    return { type: 'multi', ids: [], zoneIds: [current.id], notesIds: [notesId] };
  }

  // Multi:
  const currentNotes = current.notesIds ? [...current.notesIds] : [];
  const nextNotes = currentNotes.includes(notesId)
    ? currentNotes.filter((id) => id !== notesId)
    : [...currentNotes, notesId];
  const ids = current.ids;
  const zones = current.zoneIds ?? [];
  const edges = current.edgeIds ?? [];
  const excluded = current.excludedEdgeIds ?? [];

  const total = ids.length + zones.length + nextNotes.length + edges.length;
  if (total === 0 && excluded.length === 0) return { type: 'none' };
  if (total === 1 && excluded.length === 0) {
    if (ids.length === 1) return { type: 'node', id: ids[0] };
    if (zones.length === 1) return { type: 'zone', id: zones[0] };
    if (nextNotes.length === 1) return { type: 'notes', id: nextNotes[0] };
    if (edges.length === 1) return { type: 'edge', id: edges[0] };
  }
  return {
    type: 'multi',
    ids: [...ids],
    ...(zones.length > 0 ? { zoneIds: [...zones] } : {}),
    ...(nextNotes.length > 0 ? { notesIds: nextNotes } : {}),
    ...(edges.length > 0 ? { edgeIds: [...edges] } : {}),
    ...(excluded.length > 0 ? { excludedEdgeIds: [...excluded] } : {}),
  };
}

/** Restore/re-include all excluded edges in the current multi-selection. */
export function includeAllEdgesInSelection(current: SelectionTarget): SelectionTarget {
  if (current.type !== 'multi') return current;
  return {
    type: 'multi',
    ids: [...current.ids],
    ...(current.zoneIds?.length ? { zoneIds: [...current.zoneIds] } : {}),
    ...(current.notesIds?.length ? { notesIds: [...current.notesIds] } : {}),
    ...(current.edgeIds?.length ? { edgeIds: [...current.edgeIds] } : {}),
  };
}

/** Get list of all currently active (highlighted/selected) edge IDs in the selection. */
export function getActiveEdgeIdsInSelection(
  current: SelectionTarget,
  docEdges: readonly DiagramEdge[],
): string[] {
  if (current.type === 'edge') return [current.id];
  if (current.type === 'node') {
    return docEdges
      .filter((e) => e.from === current.id || e.to === current.id)
      .map((e) => e.id);
  }
  if (current.type === 'multi') {
    const selectedNodes = new Set(current.ids);
    const explicitEdges = new Set(current.edgeIds ?? []);
    const excludedEdges = new Set(current.excludedEdgeIds ?? []);
    return docEdges
      .filter((e) => {
        const touches = selectedNodes.has(e.from) || selectedNodes.has(e.to);
        const explicit = explicitEdges.has(e.id);
        return (touches || explicit) && !excludedEdges.has(e.id);
      })
      .map((e) => e.id);
  }
  return [];
}
