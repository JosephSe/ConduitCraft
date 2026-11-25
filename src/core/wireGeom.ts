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

/**
 * Longest straight run (world px) along an SVG path string (V4 MP7).
 * Measures straight `L` segments; falls back to curve chord lengths when no straight segment exists.
 */
export function longestStraightRun(pathD: string): number {
  const tokens = pathD.match(/[MLQC]|-?\d+(?:\.\d+)?/gi);
  if (!tokens || tokens.length < 3) return 0;

  let cx = 0;
  let cy = 0;
  let idx = 0;
  let cmd = '';
  let maxLine = 0;
  let maxChord = 0;

  const num = () => Number(tokens[idx++]);
  while (idx < tokens.length) {
    const t = tokens[idx];
    if (/^[MLQC]$/i.test(t)) {
      cmd = t.toUpperCase();
      idx += 1;
      continue;
    }
    if (cmd === 'M') {
      cx = num();
      cy = num();
      cmd = 'L';
    } else if (cmd === 'L') {
      const x = num();
      const y = num();
      maxLine = Math.max(maxLine, Math.hypot(x - cx, y - cy));
      cx = x;
      cy = y;
    } else if (cmd === 'Q') {
      num();
      num();
      const x = num();
      const y = num();
      maxChord = Math.max(maxChord, Math.hypot(x - cx, y - cy));
      cx = x;
      cy = y;
    } else if (cmd === 'C') {
      num();
      num();
      num();
      num();
      const x = num();
      const y = num();
      maxChord = Math.max(maxChord, Math.hypot(x - cx, y - cy));
      cx = x;
      cy = y;
    } else {
      idx += 1;
    }
  }

  return maxLine > 0 ? maxLine : maxChord;
}
