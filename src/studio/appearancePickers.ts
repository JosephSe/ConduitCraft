/**
 * Colour, kind and shape pickers on the contextual toolbar (C2). Each opens a small popover of choices below its
 * button; choosing one changes every selected component in one undo step and closes the popover.
 */
import { setAccent, setKind, setShape } from '../core/appearance';
import { NODE_SHAPE_LABELS, NODE_SHAPES } from '../core/nodeStyle';
import { STREAM_TONE_OPTIONS, kindStencils } from '../templates/presets';
import type { DiagramNode, NodeKind, NodeShape, StreamTone } from '../types';
import { app, mutateWithHistory } from './state';
import { renderAll } from './render';

/** The selected components, whether one is selected or several. */
function selectedNodes(): DiagramNode[] {
  const sel = app.selection;
  const ids = sel.type === 'node' ? [sel.id] : sel.type === 'multi' ? sel.ids : [];
  return app.doc.nodes.filter((n) => ids.includes(n.id));
}

let popover: HTMLElement | null = null;
let openFor: HTMLElement | null = null;

export function closeAppearancePopover(): void {
  popover?.remove();
  popover = null;
  openFor?.setAttribute('aria-expanded', 'false');
  openFor = null;
}

function choose(change: (nodes: DiagramNode[]) => boolean): void {
  const nodes = selectedNodes();
  closeAppearancePopover();
  if (nodes.length === 0) return;
  if (mutateWithHistory(() => change(nodes))) renderAll(true);
}

interface Choice {
  label: string;
  swatch?: string;
  current: boolean;
  run: () => void;
}

function choicesFor(which: 'colour' | 'kind' | 'shape', nodes: DiagramNode[]): Choice[] {
  const all = (pick: (n: DiagramNode) => string) => (value: string) => nodes.every((n) => pick(n) === value);
  if (which === 'colour') {
    const same = all((n) => n.accent);
    return STREAM_TONE_OPTIONS.map((o) => ({
      label: o.label,
      swatch: o.cssVar,
      current: same(o.id),
      run: () => choose((ns) => setAccent(ns, o.id as StreamTone)),
    }));
  }
  if (which === 'kind') {
    const same = all((n) => n.kind);
    return kindStencils().map((s) => ({
      label: s.paletteTitle,
      current: same(s.kind),
      run: () => choose((ns) => setKind(ns, s.kind as NodeKind)),
    }));
  }
  const same = all((n) => n.shape ?? 'card');
  return NODE_SHAPES.map((shape) => ({
    label: NODE_SHAPE_LABELS[shape],
    current: same(shape),
    run: () => choose((ns) => setShape(ns, shape as NodeShape)),
  }));
}

export function openAppearancePicker(button: HTMLElement, which: 'colour' | 'kind' | 'shape'): void {
  bindDismiss();
  if (openFor === button) {
    closeAppearancePopover();
    return;
  }
  closeAppearancePopover();
  const nodes = selectedNodes();
  if (nodes.length === 0) return;
  const pop = document.createElement('div');
  pop.className = 'popover appearance-popover';
  pop.setAttribute('role', 'menu');
  pop.setAttribute('aria-label', which === 'colour' ? 'Colour' : which === 'kind' ? 'Kind' : 'Shape');
  for (const c of choicesFor(which, nodes)) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'appearance-choice';
    item.setAttribute('role', 'menuitemradio');
    item.setAttribute('aria-checked', String(c.current));
    if (c.swatch) {
      const dot = document.createElement('span');
      dot.className = 'pill-swatch';
      dot.style.background = c.swatch;
      item.appendChild(dot);
    }
    item.append(document.createTextNode(c.label));
    item.addEventListener('click', c.run);
    pop.appendChild(item);
  }
  document.body.appendChild(pop);
  const r = button.getBoundingClientRect();
  pop.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - pop.offsetWidth - 8))}px`;
  pop.style.top = `${Math.min(r.bottom + 6, window.innerHeight - pop.offsetHeight - 8)}px`;
  button.setAttribute('aria-expanded', 'true');
  popover = pop;
  openFor = button;
  pop.querySelector<HTMLElement>('[aria-checked="true"]')?.focus() ?? pop.querySelector<HTMLElement>('button')?.focus();
}

let bound = false;
function bindDismiss(): void {
  if (bound) return;
  bound = true;
  document.addEventListener('pointerdown', (e) => {
    if (!popover) return;
    const t = e.target as Node;
    if (popover.contains(t) || openFor?.contains(t)) return;
    closeAppearancePopover();
  });
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Escape' && popover) {
        const trigger = openFor;
        closeAppearancePopover();
        trigger?.focus();
        e.stopPropagation();
      }
    },
    true,
  );
}
