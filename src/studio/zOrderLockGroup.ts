import type { DiagramDocument, SelectionTarget } from '../types';

/**
 * Brings selected elements to the front (end of array).
 */
export function bringToFront(doc: DiagramDocument, sel: SelectionTarget): boolean {
  if (sel.type === 'node') {
    const idx = doc.nodes.findIndex((n) => n.id === sel.id);
    if (idx === -1 || idx === doc.nodes.length - 1) return false;
    const [node] = doc.nodes.splice(idx, 1);
    doc.nodes.push(node);
    updateZIndices(doc.nodes);
    return true;
  }
  if (sel.type === 'multi') {
    const selectedIds = new Set(sel.ids);
    const unselected = doc.nodes.filter((n) => !selectedIds.has(n.id));
    const selected = doc.nodes.filter((n) => selectedIds.has(n.id));
    if (selected.length === 0) return false;
    doc.nodes = [...unselected, ...selected];
    updateZIndices(doc.nodes);
    return true;
  }
  if (sel.type === 'zone') {
    const idx = doc.zones.findIndex((z) => z.id === sel.id);
    if (idx === -1 || idx === doc.zones.length - 1) return false;
    const [zone] = doc.zones.splice(idx, 1);
    doc.zones.push(zone);
    updateZIndices(doc.zones);
    return true;
  }
  if (sel.type === 'notes') {
    const idx = doc.notesCards.findIndex((c) => c.id === sel.id);
    if (idx === -1 || idx === doc.notesCards.length - 1) return false;
    const [card] = doc.notesCards.splice(idx, 1);
    doc.notesCards.push(card);
    updateZIndices(doc.notesCards);
    return true;
  }
  return false;
}

/**
 * Sends selected elements to the back (start of array).
 */
export function sendToBack(doc: DiagramDocument, sel: SelectionTarget): boolean {
  if (sel.type === 'node') {
    const idx = doc.nodes.findIndex((n) => n.id === sel.id);
    if (idx <= 0) return false;
    const [node] = doc.nodes.splice(idx, 1);
    doc.nodes.unshift(node);
    updateZIndices(doc.nodes);
    return true;
  }
  if (sel.type === 'multi') {
    const selectedIds = new Set(sel.ids);
    const unselected = doc.nodes.filter((n) => !selectedIds.has(n.id));
    const selected = doc.nodes.filter((n) => selectedIds.has(n.id));
    if (selected.length === 0) return false;
    doc.nodes = [...selected, ...unselected];
    updateZIndices(doc.nodes);
    return true;
  }
  if (sel.type === 'zone') {
    const idx = doc.zones.findIndex((z) => z.id === sel.id);
    if (idx <= 0) return false;
    const [zone] = doc.zones.splice(idx, 1);
    doc.zones.unshift(zone);
    updateZIndices(doc.zones);
    return true;
  }
  if (sel.type === 'notes') {
    const idx = doc.notesCards.findIndex((c) => c.id === sel.id);
    if (idx <= 0) return false;
    const [card] = doc.notesCards.splice(idx, 1);
    doc.notesCards.unshift(card);
    updateZIndices(doc.notesCards);
    return true;
  }
  return false;
}

/**
 * Steps selected elements one layer forward.
 */
export function bringForward(doc: DiagramDocument, sel: SelectionTarget): boolean {
  if (sel.type === 'node') {
    const idx = doc.nodes.findIndex((n) => n.id === sel.id);
    if (idx === -1 || idx >= doc.nodes.length - 1) return false;
    const temp = doc.nodes[idx];
    doc.nodes[idx] = doc.nodes[idx + 1];
    doc.nodes[idx + 1] = temp;
    updateZIndices(doc.nodes);
    return true;
  }
  if (sel.type === 'zone') {
    const idx = doc.zones.findIndex((z) => z.id === sel.id);
    if (idx === -1 || idx >= doc.zones.length - 1) return false;
    const temp = doc.zones[idx];
    doc.zones[idx] = doc.zones[idx + 1];
    doc.zones[idx + 1] = temp;
    updateZIndices(doc.zones);
    return true;
  }
  if (sel.type === 'notes') {
    const idx = doc.notesCards.findIndex((c) => c.id === sel.id);
    if (idx === -1 || idx >= doc.notesCards.length - 1) return false;
    const temp = doc.notesCards[idx];
    doc.notesCards[idx] = doc.notesCards[idx + 1];
    doc.notesCards[idx + 1] = temp;
    updateZIndices(doc.notesCards);
    return true;
  }
  return false;
}

/**
 * Steps selected elements one layer backward.
 */
export function sendBackward(doc: DiagramDocument, sel: SelectionTarget): boolean {
  if (sel.type === 'node') {
    const idx = doc.nodes.findIndex((n) => n.id === sel.id);
    if (idx <= 0) return false;
    const temp = doc.nodes[idx];
    doc.nodes[idx] = doc.nodes[idx - 1];
    doc.nodes[idx - 1] = temp;
    updateZIndices(doc.nodes);
    return true;
  }
  if (sel.type === 'zone') {
    const idx = doc.zones.findIndex((z) => z.id === sel.id);
    if (idx <= 0) return false;
    const temp = doc.zones[idx];
    doc.zones[idx] = doc.zones[idx - 1];
    doc.zones[idx - 1] = temp;
    updateZIndices(doc.zones);
    return true;
  }
  if (sel.type === 'notes') {
    const idx = doc.notesCards.findIndex((c) => c.id === sel.id);
    if (idx <= 0) return false;
    const temp = doc.notesCards[idx];
    doc.notesCards[idx] = doc.notesCards[idx - 1];
    doc.notesCards[idx - 1] = temp;
    updateZIndices(doc.notesCards);
    return true;
  }
  return false;
}

function updateZIndices(items: Array<{ z?: number }>): void {
  for (let i = 0; i < items.length; i++) {
    items[i].z = i + 1;
  }
}

/**
 * Checks if the selection is currently locked.
 */
export function isSelectionLocked(doc: DiagramDocument, sel: SelectionTarget): boolean {
  if (sel.type === 'node') {
    const node = doc.nodes.find((n) => n.id === sel.id);
    return Boolean(node?.locked);
  }
  if (sel.type === 'zone') {
    const zone = doc.zones.find((z) => z.id === sel.id);
    return Boolean(zone?.locked);
  }
  if (sel.type === 'notes') {
    const card = doc.notesCards.find((c) => c.id === sel.id);
    return Boolean(card?.locked);
  }
  if (sel.type === 'multi') {
    const selectedNodes = doc.nodes.filter((n) => sel.ids.includes(n.id));
    return selectedNodes.length > 0 && selectedNodes.every((n) => n.locked);
  }
  return false;
}

/**
 * Toggles lock state for the selected target. Returns the new locked state.
 */
export function toggleSelectionLock(doc: DiagramDocument, sel: SelectionTarget): boolean {
  const currentlyLocked = isSelectionLocked(doc, sel);
  const nextLocked = !currentlyLocked;

  if (sel.type === 'node') {
    const node = doc.nodes.find((n) => n.id === sel.id);
    if (node) node.locked = nextLocked;
  } else if (sel.type === 'zone') {
    const zone = doc.zones.find((z) => z.id === sel.id);
    if (zone) zone.locked = nextLocked;
  } else if (sel.type === 'notes') {
    const card = doc.notesCards.find((c) => c.id === sel.id);
    if (card) card.locked = nextLocked;
  } else if (sel.type === 'multi') {
    for (const node of doc.nodes) {
      if (sel.ids.includes(node.id)) node.locked = nextLocked;
    }
    for (const zone of doc.zones) {
      if (sel.zoneIds?.includes(zone.id)) zone.locked = nextLocked;
    }
    for (const card of doc.notesCards) {
      if (sel.notesIds?.includes(card.id)) card.locked = nextLocked;
    }
  }

  return nextLocked;
}

/**
 * Checks if current selection can be grouped (needs 2+ items).
 */
export function canGroupSelection(sel: SelectionTarget): boolean {
  if (sel.type !== 'multi') return false;
  const count = sel.ids.length + (sel.notesIds?.length ?? 0);
  return count >= 2;
}

/**
 * Groups selected components with a unique groupId. Returns the assigned groupId.
 */
export function groupSelection(doc: DiagramDocument, sel: SelectionTarget): string | null {
  if (!canGroupSelection(sel)) return null;

  const groupId = `grp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

  if (sel.type === 'multi') {
    for (const node of doc.nodes) {
      if (sel.ids.includes(node.id)) {
        node.groupId = groupId;
      }
    }
    for (const card of doc.notesCards) {
      if (sel.notesIds?.includes(card.id)) {
        card.groupId = groupId;
      }
    }
  }

  return groupId;
}

/**
 * Ungroups any selected components that belong to a group.
 */
export function ungroupSelection(doc: DiagramDocument, sel: SelectionTarget): boolean {
  let changed = false;

  if (sel.type === 'node') {
    const node = doc.nodes.find((n) => n.id === sel.id);
    if (node?.groupId) {
      const gId = node.groupId;
      for (const n of doc.nodes) {
        if (n.groupId === gId) {
          delete n.groupId;
          changed = true;
        }
      }
      for (const c of doc.notesCards) {
        if (c.groupId === gId) {
          delete c.groupId;
          changed = true;
        }
      }
    }
  } else if (sel.type === 'multi') {
    const groupIdsToClear = new Set<string>();
    for (const node of doc.nodes) {
      if (sel.ids.includes(node.id) && node.groupId) {
        groupIdsToClear.add(node.groupId);
      }
    }
    for (const card of doc.notesCards) {
      if (sel.notesIds?.includes(card.id) && card.groupId) {
        groupIdsToClear.add(card.groupId);
      }
    }

    if (groupIdsToClear.size > 0) {
      for (const node of doc.nodes) {
        if (node.groupId && groupIdsToClear.has(node.groupId)) {
          delete node.groupId;
          changed = true;
        }
      }
      for (const card of doc.notesCards) {
        if (card.groupId && groupIdsToClear.has(card.groupId)) {
          delete card.groupId;
          changed = true;
        }
      }
    }
  }

  return changed;
}

/**
 * Returns all node and notes IDs in the same group as `targetNodeId`.
 */
export function getGroupSiblingIds(doc: DiagramDocument, targetId: string): string[] {
  const targetNode = doc.nodes.find((n) => n.id === targetId);
  const targetCard = doc.notesCards.find((c) => c.id === targetId);
  const groupId = targetNode?.groupId || targetCard?.groupId;
  if (!groupId) return [targetId];

  const ids: string[] = [];
  for (const n of doc.nodes) {
    if (n.groupId === groupId) ids.push(n.id);
  }
  for (const c of doc.notesCards) {
    if (c.groupId === groupId) ids.push(c.id);
  }
  return ids;
}
