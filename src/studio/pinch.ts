/** Two-pointer pinch zoom and pan, in viewport-local pixels. */

export interface PinchSample {
  x: number;
  y: number;
}

export interface PinchBaseline {
  scale: number;
  panX: number;
  panY: number;
  distance: number;
  midX: number;
  midY: number;
}

export function pointerDistance(a: PinchSample, b: PinchSample): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function pointerMidpoint(a: PinchSample, b: PinchSample): PinchSample {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function pinchBaseline(
  scale: number,
  panX: number,
  panY: number,
  a: PinchSample,
  b: PinchSample,
): PinchBaseline {
  const mid = pointerMidpoint(a, b);
  return {
    scale: scale || 1,
    panX,
    panY,
    distance: Math.max(pointerDistance(a, b), 1),
    midX: mid.x,
    midY: mid.y,
  };
}

/** Keep the world point under the original midpoint glued to the moving midpoint. */
export function pinchTransform(
  baseline: PinchBaseline,
  a: PinchSample,
  b: PinchSample,
  minScale: number,
  maxScale: number,
): { scale: number; panX: number; panY: number } {
  const mid = pointerMidpoint(a, b);
  const distance = Math.max(pointerDistance(a, b), 1);
  const raw = baseline.scale * (distance / baseline.distance);
  const scale = Math.min(maxScale, Math.max(minScale, raw));
  const worldX = (baseline.midX - baseline.panX) / baseline.scale;
  const worldY = (baseline.midY - baseline.panY) / baseline.scale;
  return {
    scale,
    panX: mid.x - worldX * scale,
    panY: mid.y - worldY * scale,
  };
}
