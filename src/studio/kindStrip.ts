/**
 * Create by wiring (7.4): after a wire is dropped on empty sheet, the new component carries a strip of four cut-outs
 * above it, the kinds most likely to follow its source. ← → or a click changes the kind in place, typing starts naming
 * it, and anything else dismisses the strip. The kind change is part of the creation's undo step.
 */
import { TONE_CSS } from '../shared/tones';
import { createNodeFromStencil, findStencil, likelyNext } from '../templates/presets';
import { renderCutoutMarkup } from '../ui/cutout';
import { announce } from './a11y';
import { renameNodeInline, startTextEdit } from './inlineRename';
import { renderAll } from './render';
import { app } from './state';

let strip: HTMLElement | null = null;
let teardown: (() => void) | null = null;

export function dismissKindStrip(): void {
  teardown?.();
  teardown = null;
  strip?.remove();
  strip = null;
}

/** Make the node a different kind in place: same id, same centre, same wires. */
function retype(nodeId: string, stencilId: string): void {
  const node = app.doc.nodes.find((n) => n.id === nodeId);
  if (!node) return;
  const fresh = createNodeFromStencil(stencilId, 0, 0, app.doc.nodes.length - 1);
  const cx = node.x + node.width / 2;
  const cy = node.y + node.height / 2;
  for (const key of Object.keys(node) as Array<keyof typeof node>) delete node[key];
  Object.assign(node, fresh, { id: nodeId, x: Math.round(cx - fresh.width / 2), y: Math.round(cy - fresh.height / 2) });
  renderAll(true);
}

function place(host: HTMLElement, nodeId: string): void {
  const el = document.querySelector(`.arch-node[data-node="${CSS.escape(nodeId)}"]`);
  if (!el) return;
  const r = el.getBoundingClientRect();
  host.style.left = `${Math.round(r.left + r.width / 2)}px`;
  host.style.top = `${Math.round(Math.max(8, r.top - 8))}px`;
}

/** Show the strip over a node just made from a wire drop. `sourceKind` is the kind the wire came from. */
export function showKindStrip(nodeId: string, sourceKind: string): void {
  dismissKindStrip();
  const choices = likelyNext(sourceKind);
  if (choices.length === 0) return;
  let at = 0;

  const host = document.createElement('div');
  host.className = 'kind-strip';
  host.setAttribute('role', 'radiogroup');
  host.setAttribute('aria-label', 'Kind of the new component');
  const buttons = choices.map((stencil, i) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'kind-strip-item';
    button.tabIndex = -1;
    button.setAttribute('role', 'radio');
    button.setAttribute('aria-label', stencil.paletteTitle);
    button.dataset.stencilId = stencil.id;
    button.dataset.tip = stencil.paletteTitle;
    button.dataset.tipPos = 'top';
    button.style.setProperty('--t', TONE_CSS[stencil.accent][0]);
    button.innerHTML = renderCutoutMarkup(stencil);
    button.addEventListener('pointerdown', (e) => e.stopPropagation());
    button.addEventListener('click', () => choose(i));
    host.appendChild(button);
    return button;
  });

  const paint = () =>
    buttons.forEach((b, i) => {
      b.setAttribute('aria-checked', String(i === at));
      b.classList.toggle('is-on', i === at);
    });
  const choose = (i: number) => {
    at = (i + choices.length) % choices.length;
    const current = app.doc.nodes.find((n) => n.id === nodeId);
    if (current && findStencil(choices[at].id)) retype(nodeId, choices[at].id);
    paint();
    place(host, nodeId);
    announce(`${choices[at].paletteTitle}. Left and right change the kind, or type to name it.`);
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      e.stopPropagation();
      choose(at + (e.key === 'ArrowRight' ? 1 : -1));
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey || e.key === 'Shift') return;
    if (e.key.length === 1 && e.key !== ' ') {
      // Typing starts naming: the first letter opens the name with itself in it.
      e.preventDefault();
      e.stopPropagation();
      dismissKindStrip();
      const textEl = document.querySelector(`.arch-node[data-node="${CSS.escape(nodeId)}"] .node-title`);
      const node = app.doc.nodes.find((n) => n.id === nodeId);
      if (!node) return;
      startTextEdit(textEl, e.key, 'Component name', (value) => {
        const live = app.doc.nodes.find((n) => n.id === nodeId);
        if (live && value) {
          live.title = value;
          renderAll(true);
        }
      });
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      dismissKindStrip();
      renameNodeInline(nodeId);
      return;
    }
    dismissKindStrip();
  };
  const onPointer = (e: Event) => {
    if (!host.contains(e.target as Node)) dismissKindStrip();
  };

  document.body.appendChild(host);
  strip = host;
  paint();
  place(host, nodeId);
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('pointerdown', onPointer, true);
  document.addEventListener('wheel', onPointer, true);
  teardown = () => {
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('pointerdown', onPointer, true);
    document.removeEventListener('wheel', onPointer, true);
  };
  announce(`${choices[0].paletteTitle} added. Left and right change the kind, or type to name it.`);
}
