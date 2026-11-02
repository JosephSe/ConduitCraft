/** Camera maths: how wheel input maps to zoom, and how the view follows its container being resized. */

export interface WheelInput {
  deltaX: number;
  deltaY: number;
  /** 0 = pixels, 1 = lines, 2 = pages (WheelEvent.deltaMode). */
  deltaMode: number;
  /** Browsers report a trackpad pinch as a wheel event with ctrlKey set. */
  ctrlKey: boolean;
}

/** Zoom change per pixel of wheel travel. A 100px mouse-wheel notch comes to ~1.08x, as the fixed step used to. */
export const WHEEL_ZOOM_PER_PX = 0.00077;
/** Pinch deltas are much smaller (a few px per event), so they need a larger rate to feel the same. */
export const PINCH_ZOOM_PER_PX = 0.01;
/** One event never moves the zoom by more than this, however hard the wheel is flicked. */
const MAX_DELTA_PX = 120;

function toPixels(delta: number, deltaMode: number): number {
  if (deltaMode === 1) return delta * 16;
  if (deltaMode === 2) return delta * 400;
  return delta;
}

/** Mostly-sideways scrolling (a two-finger swipe, or shift+wheel) pans; everything else zooms. */
export function isPanGesture(input: Pick<WheelInput, 'deltaX' | 'deltaY' | 'ctrlKey'>): boolean {
  return !input.ctrlKey && Math.abs(input.deltaX) > Math.abs(input.deltaY);
}

/** Pan distance in pixels for a pan gesture. The content follows the fingers, so it moves opposite the delta. */
export function wheelPan(input: WheelInput): { dx: number; dy: number } {
  return { dx: -toPixels(input.deltaX, input.deltaMode), dy: -toPixels(input.deltaY, input.deltaMode) };
}

/**
 * Multiplier to apply to the current zoom for one wheel event. Proportional to how far the wheel moved, so a
 * trackpad's stream of tiny events zooms smoothly and a big flick is capped, instead of one fixed jump per event.
 * Scrolling up (negative deltaY) zooms in.
 */
export function wheelZoomFactor(input: WheelInput): number {
  const px = Math.max(-MAX_DELTA_PX, Math.min(MAX_DELTA_PX, toPixels(input.deltaY, input.deltaMode)));
  return Math.exp(-px * (input.ctrlKey ? PINCH_ZOOM_PER_PX : WHEEL_ZOOM_PER_PX));
}

/**
 * New pan after the viewport changes size, keeping the same world point at its centre. Without this a resize
 * (window, panel toggle, switching modes) either leaves the content stuck to the top-left or has to refit and
 * throw away the user's zoom and position.
 */
export function panForViewportResize(
  pan: { panX: number; panY: number },
  from: { width: number; height: number },
  to: { width: number; height: number },
): { panX: number; panY: number } {
  return {
    panX: Math.round(pan.panX + (to.width - from.width) / 2),
    panY: Math.round(pan.panY + (to.height - from.height) / 2),
  };
}
