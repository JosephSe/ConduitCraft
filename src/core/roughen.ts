/**
 * A small deterministic roughener (C5, shared with Sketch in Y2). The same seed always gives the same marks, so a
 * hand-drawn ellipse never changes between renders, exports or reloads.
 */

/** A seeded generator (mulberry32) over a string; returns numbers in [0, 1). */
export function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i += 1) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * A slightly irregular ellipse around (cx, cy), as one open path that overshoots its own start a little, the way a
 * pen circles something. Radii wobble by up to about 6%, and the start angle and tilt depend on the seed.
 */
export function roughEllipsePath(cx: number, cy: number, rx: number, ry: number, seed: string): string {
  const rand = seededRandom(seed);
  const steps = 14;
  const start = rand() * Math.PI * 2;
  const tilt = (rand() - 0.5) * 0.12;
  const sweep = Math.PI * 2 + 0.35 + rand() * 0.2;
  const points: Array<[number, number]> = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const angle = start + sweep * t;
    const wobble = 1 + (rand() - 0.5) * 0.12 + (t > 0.9 ? 0.05 : 0);
    const x = Math.cos(angle) * rx * wobble;
    const y = Math.sin(angle) * ry * wobble;
    points.push([cx + x * Math.cos(tilt) - y * Math.sin(tilt), cy + x * Math.sin(tilt) + y * Math.cos(tilt)]);
  }
  // A smooth curve through the points (Catmull-Rom as cubic Beziers).
  let d = `M ${r1(points[0][0])} ${r1(points[0][1])}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const c1: [number, number] = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: [number, number] = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C ${r1(c1[0])} ${r1(c1[1])}, ${r1(c2[0])} ${r1(c2[1])}, ${r1(p2[0])} ${r1(p2[1])}`;
  }
  return d;
}
