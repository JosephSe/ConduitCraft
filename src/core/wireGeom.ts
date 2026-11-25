/**
 * Compute the incoming arrowhead angle in degrees from an SVG path string and target endpoint.
 * Routed edges normally terminate 6 px short of `endPoint` along the approach tangent; when the path
 * ends directly at `endPoint`, falls back to the final control/vertex segment tangent.
 */
export function wireEndAngle(pathD: string, endPoint: [number, number]): number {
  const raw = pathD.match(/-?\d+(?:\.\d+)?/g);
  if (!raw || raw.length < 2) return 0;

  const lx = Number(raw[raw.length - 2]);
  const ly = Number(raw[raw.length - 1]);
  const dx = endPoint[0] - lx;
  const dy = endPoint[1] - ly;
  if (Math.hypot(dx, dy) >= 0.5) {
    return (Math.atan2(dy, dx) * 180) / Math.PI;
  }

  if (raw.length >= 4) {
    const px = Number(raw[raw.length - 4]);
    const py = Number(raw[raw.length - 3]);
    const fdx = lx - px;
    const fdy = ly - py;
    if (Math.hypot(fdx, fdy) >= 1e-6) {
      return (Math.atan2(fdy, fdx) * 180) / Math.PI;
    }
  }

  return 0;
}
