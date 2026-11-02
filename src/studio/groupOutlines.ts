/**
 * Dashed outlines that make groups visible. An outline is drawn around each group's members and is shown while
 * a member is hovered or selected, so a calm canvas stays calm.
 */
import { app, onSelectionChange } from './state';
import { nodesLayer, stageWorld } from './dom';

const PAD = 10;
let layer: HTMLElement | null = null;
let hoveredGroup: string | null = null;
let queued = false;

function ensureLayer(): HTMLElement {
  if (!layer) {
    layer = document.createElement('div');
    layer.id = 'group-outlines-layer';
    layer.setAttribute('aria-hidden', 'true');
    stageWorld.insertBefore(layer, nodesLayer);
  }
  return layer;
}

function selectedGroups(): Set<string> {
  const sel = app.selection;
  const nodeIds = sel.type === 'node' ? [sel.id] : sel.type === 'multi' ? sel.ids : [];
  const groups = new Set<string>();
  for (const id of nodeIds) {
    const g = app.doc.nodes.find((n) => n.id === id)?.groupId;
    if (g) groups.add(g);
  }
  return groups;
}

export function paintGroupOutlines(): void {
  const host = ensureLayer();
  const boxes = new Map<string, { l: number; t: number; r: number; b: number }>();
  for (const node of app.doc.nodes) {
    if (!node.groupId) continue;
    const el = nodesLayer.querySelector<HTMLElement>(`.arch-node[data-node-id="${CSS.escape(node.id)}"]`);
    if (!el) continue;
    const x = Number.parseFloat(el.style.getPropertyValue('--nx')) || node.x;
    const y = Number.parseFloat(el.style.getPropertyValue('--ny')) || node.y;
    const w = Number.parseFloat(el.style.getPropertyValue('--nw')) || el.offsetWidth;
    const h = Number.parseFloat(el.style.getPropertyValue('--nh')) || el.offsetHeight;
    const box = boxes.get(node.groupId) ?? { l: Infinity, t: Infinity, r: -Infinity, b: -Infinity };
    box.l = Math.min(box.l, x);
    box.t = Math.min(box.t, y);
    box.r = Math.max(box.r, x + w);
    box.b = Math.max(box.b, y + h);
    boxes.set(node.groupId, box);
  }
  const active = selectedGroups();
  if (hoveredGroup) active.add(hoveredGroup);

  const seen = new Set<string>();
  for (const [groupId, box] of boxes) {
    seen.add(groupId);
    let el = host.querySelector<HTMLElement>(`[data-group-id="${CSS.escape(groupId)}"]`);
    if (!el) {
      el = document.createElement('div');
      el.className = 'group-outline';
      el.dataset.groupId = groupId;
      host.appendChild(el);
    }
    el.style.left = `${box.l - PAD}px`;
    el.style.top = `${box.t - PAD}px`;
    el.style.width = `${box.r - box.l + 2 * PAD}px`;
    el.style.height = `${box.b - box.t + 2 * PAD}px`;
    el.classList.toggle('is-visible', active.has(groupId));
  }
  for (const el of Array.from(host.children) as HTMLElement[]) {
    if (!seen.has(el.dataset.groupId || '')) el.remove();
  }
}

function schedulePaint(): void {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    paintGroupOutlines();
  });
}

export function initGroupOutlines(): void {
  paintGroupOutlines();
  // Nodes are added, removed and moved by changing the DOM; follow along without touching the render path.
  new MutationObserver(schedulePaint).observe(nodesLayer, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['style'],
  });
  onSelectionChange(schedulePaint);
  nodesLayer.addEventListener('pointerover', (e) => {
    const id = (e.target as HTMLElement).closest<HTMLElement>('.arch-node')?.dataset.nodeId;
    const group = id ? app.doc.nodes.find((n) => n.id === id)?.groupId ?? null : null;
    if (group !== hoveredGroup) {
      hoveredGroup = group;
      schedulePaint();
    }
  });
  nodesLayer.addEventListener('pointerleave', () => {
    if (hoveredGroup) {
      hoveredGroup = null;
      schedulePaint();
    }
  });
}
