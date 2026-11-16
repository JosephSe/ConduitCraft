/**
 * What the tray's search matches (7.3): each component's name, and a word list built from the image names the importers
 * recognise plus a few common names. Typing `kafka` leaves the Stream row with "named Kafka" under it; placing it names
 * the new component "Kafka". No DOM here.
 */
import { IMAGE_WORDS, stencilForImage } from '../importers/common';

/** Words people type for what they run that the image lists do not cover. Each maps to a stencil id. */
const COMMON_WORDS: Record<string, string> = {
  s3: 'object-store',
  gcs: 'object-store',
  blob: 'object-store',
  lambda: 'service',
  cron: 'scheduler',
  sqs: 'queue',
  sns: 'bus',
  dynamodb: 'store',
  cdn: 'cache',
  cloudfront: 'cache',
  browser: 'client',
  mobile: 'client',
  customer: 'actor',
  user: 'actor',
  alb: 'balancer',
  elb: 'balancer',
  waf: 'gate',
  firewall: 'gate',
  throttle: 'limiter',
};

/** [word, stencil id] pairs. */
export const WORDS: Array<[string, string]> = [
  ...IMAGE_WORDS.map((word): [string, string] => [word, stencilForImage(word)]),
  ...Object.entries(COMMON_WORDS),
];

export interface TrayEntry {
  id: string;
  title: string;
}

export interface TrayMatch {
  id: string;
  /** Set when the match came from a word like `kafka`, not from the component's own name. */
  named?: string;
}

/** `kafka` becomes `Kafka`; `s3` becomes `S3`. */
export function displayName(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** The entries that match, in their own order. An empty query matches everything. */
export function searchTray(query: string, entries: TrayEntry[]): TrayMatch[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries.map((entry) => ({ id: entry.id }));
  const out: TrayMatch[] = [];
  for (const entry of entries) {
    const text = `${entry.title} ${entry.id}`.toLowerCase();
    if (text.includes(q)) {
      out.push({ id: entry.id });
      continue;
    }
    const words = WORDS.filter(([word, id]) => id === entry.id && word.startsWith(q));
    if (words.length === 0) continue;
    const exact = words.find(([word]) => word === q);
    out.push({ id: entry.id, named: displayName((exact ?? words[0])[0]) });
  }
  return out;
}
