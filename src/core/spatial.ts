export type Direction = 'left' | 'right' | 'up' | 'down';
export interface Point {
  id: string;
  x: number;
  y: number;
}

/**
 * The candidate nearest to `from` in `dir`, or null when nothing lies that way. A candidate must be strictly
 * ahead; sideways drift counts double so a straight neighbour beats a closer diagonal one.
 */
export function nearestInDirection(from: Point, candidates: Point[], dir: Direction): string | null {
  let best: string | null = null;
  let bestScore = Infinity;
  for (const c of candidates) {
    if (c.id === from.id) continue;
    const dx = c.x - from.x;
    const dy = c.y - from.y;
    const ahead = dir === 'right' ? dx : dir === 'left' ? -dx : dir === 'down' ? dy : -dy;
    if (ahead <= 0) continue;
    const across = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
    const score = ahead + 2 * across;
    if (score < bestScore) {
      bestScore = score;
      best = c.id;
    }
  }
  return best;
}
