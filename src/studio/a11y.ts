/**
 * Accessibility announcements and live-region utilities.
 * Ensures non-visual and assistive-tech users receive prompt feedback for selections, modes, and tools.
 */
import type { DiagramDocument, SelectionTarget } from '../types';

let liveAnnouncerEl: HTMLElement | null = null;
let lastAnnouncedMessage = '';
let clearTimer: number | null = null;

export function getOrCreateLiveAnnouncer(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  if (!liveAnnouncerEl) {
    liveAnnouncerEl = document.getElementById('a11y-live-announcer');
    if (!liveAnnouncerEl) {
      liveAnnouncerEl = document.createElement('div');
      liveAnnouncerEl.id = 'a11y-live-announcer';
      liveAnnouncerEl.className = 'visually-hidden';
      liveAnnouncerEl.setAttribute('role', 'status');
      liveAnnouncerEl.setAttribute('aria-live', 'polite');
      liveAnnouncerEl.setAttribute('aria-atomic', 'true');
      document.body.appendChild(liveAnnouncerEl);
    }
  }
  return liveAnnouncerEl;
}

/** Announce a message to assistive technology via the polite or assertive live region. */
export function announce(message: string, priority: 'polite' | 'assertive' = 'polite'): void {
  const el = getOrCreateLiveAnnouncer();
  if (!el || !message) return;

  if (clearTimer !== null) {
    window.clearTimeout(clearTimer);
    clearTimer = null;
  }

  el.setAttribute('aria-live', priority);

  // If the same message is announced consecutively, momentarily empty text so the screen reader re-announces
  if (message === lastAnnouncedMessage) {
    el.textContent = '';
    window.setTimeout(() => {
      el.textContent = message;
    }, 50);
  } else {
    el.textContent = message;
    lastAnnouncedMessage = message;
  }

  // Clear live region text after 6 seconds
  clearTimer = window.setTimeout(() => {
    if (el) el.textContent = '';
    clearTimer = null;
  }, 6000);
}

/** Describe the current diagram selection in clear, assistive-friendly language. */
export function describeSelection(selection: SelectionTarget, doc: DiagramDocument): string {
  switch (selection.type) {
    case 'none':
      return 'Selection cleared';
    case 'node': {
      const node = doc.nodes.find((n) => n.id === selection.id);
      if (!node) return `Selected component ${selection.id}`;
      const statusDesc = node.status ? `, status ${node.status}` : '';
      return `Selected ${node.title || node.id} (${node.kind || 'component'})${statusDesc}, position ${node.x}, ${node.y}`;
    }
    case 'multi': {
      const count = selection.ids.length;
      const edgeCount = selection.edgeIds?.length ?? 0;
      if (count > 0 && edgeCount === 0) {
        return `Selected ${count} ${count === 1 ? 'component' : 'components'}`;
      }
      if (count === 0 && edgeCount > 0) {
        return `Selected ${edgeCount} ${edgeCount === 1 ? 'wire' : 'wires'}`;
      }
      const parts: string[] = [];
      if (count > 0) parts.push(`${count} ${count === 1 ? 'component' : 'components'}`);
      if (edgeCount > 0) parts.push(`${edgeCount} ${edgeCount === 1 ? 'wire' : 'wires'}`);
      return `Selected ${parts.join(', ')}`;
    }
    case 'edge': {
      const edge = doc.edges.find((e) => e.id === selection.id);
      if (!edge) return `Selected wire ${selection.id}`;
      const sourceNode = doc.nodes.find((n) => n.id === edge.from);
      const targetNode = doc.nodes.find((n) => n.id === edge.to);
      const sourceName = sourceNode?.title || edge.from;
      const targetName = targetNode?.title || edge.to;
      return `Selected wire from ${sourceName} to ${targetName}${edge.label ? ` (${edge.label})` : ''}`;
    }
    case 'zone': {
      const zone = doc.zones.find((z) => z.id === selection.id);
      return `Selected boundary zone ${zone?.title || selection.id}`;
    }
    case 'notes': {
      const note = doc.notesCards.find((n) => n.id === selection.id);
      return `Selected notes card ${note?.title || selection.id}`;
    }
    default:
      return 'Selection changed';
  }
}

/** Announce a selection change to screen readers. */
export function announceSelectionChange(selection: SelectionTarget, doc: DiagramDocument): void {
  const desc = describeSelection(selection, doc);
  announce(desc, 'polite');
}

/** Announce workspace mode switch (Design vs Data View). */
export function announceModeChange(mode: 'design' | 'data'): void {
  const desc = mode === 'data' ? 'Switched to Live Telemetry Data View' : 'Switched to Canvas Design Mode';
  announce(desc, 'polite');
}

/** Announce pointer tool switch (Select vs Connect). */
export function announceToolChange(tool: 'select' | 'connect'): void {
  const desc = tool === 'connect' ? 'Connect wire tool active: click or drag between ports' : 'Select pointer tool active';
  announce(desc, 'polite');
}
