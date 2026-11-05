/**
 * One shared tooltip for every `[data-tip]` element.
 *
 * Per-element `::after` tooltips were positioned relative to their element, so anything near a viewport or
 * panel edge was clipped. A single fixed-position layer can be measured and clamped to the viewport instead.
 */

export type TipPlacement = 'top' | 'bottom' | 'left' | 'right';

export interface TipRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TipPlacementResult {
  x: number;
  y: number;
  placement: TipPlacement;
}

const OPPOSITE: Record<TipPlacement, TipPlacement> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
const TIP_GAP_PX = 8;
const VIEWPORT_MARGIN_PX = 8;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/**
 * Choose where to put a tooltip of `tip` size next to `anchor`: the preferred side if it fits, otherwise the
 * opposite side, then the remaining ones, and finally the preferred side anyway. The result is always clamped
 * so the tooltip stays fully inside the viewport (as far as its own size allows).
 */
export function placeTooltip(
  anchor: TipRect,
  tip: { width: number; height: number },
  viewport: { width: number; height: number },
  preferred: TipPlacement = 'bottom',
  gap: number = TIP_GAP_PX,
  margin: number = VIEWPORT_MARGIN_PX,
): TipPlacementResult {
  const right = anchor.x + anchor.width;
  const bottom = anchor.y + anchor.height;
  const fits: Record<TipPlacement, boolean> = {
    top: anchor.y - gap - tip.height >= margin,
    bottom: bottom + gap + tip.height <= viewport.height - margin,
    left: anchor.x - gap - tip.width >= margin,
    right: right + gap + tip.width <= viewport.width - margin,
  };
  const order: TipPlacement[] = [preferred, OPPOSITE[preferred]];
  for (const side of ['bottom', 'top', 'right', 'left'] as TipPlacement[]) {
    if (!order.includes(side)) order.push(side);
  }
  const placement = order.find((side) => fits[side]) ?? preferred;

  const centreX = anchor.x + anchor.width / 2;
  const centreY = anchor.y + anchor.height / 2;
  let x: number;
  let y: number;
  if (placement === 'top') {
    x = centreX - tip.width / 2;
    y = anchor.y - gap - tip.height;
  } else if (placement === 'bottom') {
    x = centreX - tip.width / 2;
    y = bottom + gap;
  } else if (placement === 'left') {
    x = anchor.x - gap - tip.width;
    y = centreY - tip.height / 2;
  } else {
    x = right + gap;
    y = centreY - tip.height / 2;
  }

  return {
    x: Math.round(clamp(x, margin, viewport.width - tip.width - margin)),
    y: Math.round(clamp(y, margin, viewport.height - tip.height - margin)),
    placement,
  };
}

/** The side a tooltip prefers: an explicit `data-tip-pos`, or the side of a collapsed rail that faces the canvas. */
export function preferredPlacement(el: Element): TipPlacement {
  const explicit = el.getAttribute('data-tip-pos');
  if (explicit === 'top' || explicit === 'bottom' || explicit === 'left' || explicit === 'right') return explicit;
  // With the palette open the tools run in a row, so a tip to the side would cover the next tool.
  if (el.closest('.rail-tool-btn') && !el.closest('[data-palette-collapsed="true"]')) return 'bottom';
  if (el.closest('.palette-rail-content')) return 'right';
  if (el.closest('.inspector-rail-content')) return 'left';
  return 'bottom';
}

let initialized = false;

export function initTooltips(): void {
  if (initialized || typeof document === 'undefined') return;
  initialized = true;

  const layer = document.createElement('div');
  layer.className = 'tooltip-layer';
  layer.id = 'tooltip-layer';
  document.body.appendChild(layer);

  let current: Element | null = null;

  // Only expose the layer to assistive technology while it is showing something. An idle layer keeps its last
  // text, and an empty `role="tooltip"` is invalid, so it is hidden from the accessibility tree until needed.
  const setExposed = (exposed: boolean): void => {
    layer.dataset.visible = exposed ? 'true' : 'false';
    if (exposed) {
      layer.setAttribute('role', 'tooltip');
      layer.removeAttribute('aria-hidden');
    } else {
      layer.removeAttribute('role');
      layer.setAttribute('aria-hidden', 'true');
    }
  };
  setExposed(false);

  const hide = (): void => {
    current = null;
    setExposed(false);
  };

  const show = (el: Element): void => {
    const text = el.getAttribute('data-tip');
    if (!text) {
      hide();
      return;
    }
    current = el;
    layer.textContent = text;
    // Measure at the origin first so the size doesn't depend on where the previous tooltip was.
    layer.style.transform = 'translate(0px, 0px)';
    const size = layer.getBoundingClientRect();
    const anchor = el.getBoundingClientRect();
    const { x, y, placement } = placeTooltip(
      { x: anchor.x, y: anchor.y, width: anchor.width, height: anchor.height },
      { width: size.width, height: size.height },
      { width: window.innerWidth, height: window.innerHeight },
      preferredPlacement(el),
    );
    layer.style.transform = `translate(${x}px, ${y}px)`;
    layer.dataset.placement = placement;
    setExposed(true);
  };

  const tipTarget = (event: Event): Element | null => {
    const target = event.target;
    return target instanceof Element ? target.closest('[data-tip]') : null;
  };

  document.addEventListener('pointerover', (event) => {
    if ((event as PointerEvent).pointerType === 'touch') return;
    const el = tipTarget(event);
    if (!el) {
      if (current) hide();
      return;
    }
    if (el !== current) show(el);
  });
  document.addEventListener('pointerout', (event) => {
    if (!current) return;
    const next = (event as PointerEvent).relatedTarget;
    if (!(next instanceof Node) || !current.contains(next)) hide();
  });
  document.addEventListener('focusin', (event) => {
    const el = tipTarget(event);
    if (el && el.matches(':focus-visible')) show(el);
  });
  document.addEventListener('focusout', hide);
  document.addEventListener('pointerdown', hide, true);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') hide();
  });
  // A scroll or resize moves the anchor out from under the tooltip.
  document.addEventListener('scroll', hide, true);
  window.addEventListener('resize', hide);
}
