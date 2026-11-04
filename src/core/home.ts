/**
 * Home screen rules (F-08, B4): when it opens at boot, how the Recent grid is searched and labelled, when to warn
 * about storage, and how arrow keys move through a grid. Pure and DOM-free so it is unit tested.
 */

export interface HomeBootFacts {
  /** The URL carries a share link, which is the diagram to show. */
  hasShareLink: boolean;
  /** Diagrams saved in this browser. */
  entryCount: number;
  /** Home already opened once in this tab, so a reload does not cover the canvas again. */
  shownThisSession: boolean;
}

/**
 * Home opens for a returning visitor (one with saved diagrams) who arrives with no diagram in the URL. A visitor
 * with nothing saved gets first run instead, and a reload in the same tab goes straight back to the canvas.
 */
export function shouldOpenHomeAtBoot(f: HomeBootFacts): boolean {
  return !f.hasShareLink && f.entryCount > 0 && !f.shownThisSession;
}

/** Keep the entries whose title contains every word of the query, ignoring case. An empty query keeps all. */
export function filterByTitle<T extends { title: string }>(entries: T[], query: string): T[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return entries;
  return entries.filter((entry) => {
    const title = entry.title.toLowerCase();
    return words.every((word) => title.includes(word));
  });
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "Just now", "2 min ago", "3 h ago", "Yesterday", "4 days ago", then a short date such as "Oct 12". */
export function relativeTime(timestamp: number, now: number = Date.now()): string {
  if (!timestamp) return 'Saved earlier';
  const age = Math.max(0, now - timestamp);
  if (age < MINUTE) return 'Just now';
  if (age < HOUR) return `${Math.floor(age / MINUTE)} min ago`;
  if (age < DAY) return `${Math.floor(age / HOUR)} h ago`;
  const days = Math.floor(age / DAY);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  const date = new Date(timestamp);
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return date.toLocaleDateString(
    'en-US',
    sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' },
  );
}

/** Warn once saved work fills more than this share of the browser's quota. */
export const STORAGE_WARN_RATIO = 0.8;

/** The warning to show above the grid, or null while there is room (or the browser did not say). */
export function storageWarning(usage: number | undefined, quota: number | undefined): string | null {
  if (!usage || !quota || quota <= 0) return null;
  const ratio = usage / quota;
  if (ratio <= STORAGE_WARN_RATIO) return null;
  return `This browser's storage is ${Math.min(100, Math.round(ratio * 100))}% full. Export your diagrams as a .zip so nothing is lost.`;
}

export type GridKey = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown' | 'Home' | 'End';

/** The index to focus after a key press in a grid of `count` cards laid out `columns` per row. Stays put at an edge. */
export function gridTarget(index: number, key: GridKey, count: number, columns: number): number {
  if (count <= 0) return -1;
  const cols = Math.max(1, columns);
  let next = index;
  switch (key) {
    case 'ArrowLeft':
      next = index - 1;
      break;
    case 'ArrowRight':
      next = index + 1;
      break;
    case 'ArrowUp':
      next = index - cols;
      break;
    case 'ArrowDown':
      next = index + cols;
      break;
    case 'Home':
      next = 0;
      break;
    case 'End':
      next = count - 1;
      break;
  }
  return next < 0 || next >= count ? index : next;
}
