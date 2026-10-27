import type { StreamTone } from '../types';

/** Tone labels and CSS variables used by the studio and the standalone export. */
export const TONE_META: Record<
  StreamTone,
  { shortLabel: string; cssVar: string; softVar: string }
> = {
  blue: { shortLabel: 'Primary', cssVar: 'var(--wl-blue)', softVar: 'var(--wl-blue-soft)' },
  emerald: {
    shortLabel: 'Success',
    cssVar: 'var(--wl-emerald)',
    softVar: 'var(--wl-emerald-soft)',
  },
  rose: { shortLabel: 'Exception', cssVar: 'var(--wl-rose)', softVar: 'var(--wl-rose-soft)' },
  violet: { shortLabel: 'Control', cssVar: 'var(--wl-violet)', softVar: 'var(--wl-violet-soft)' },
  amber: { shortLabel: 'Async', cssVar: 'var(--wl-amber)', softVar: 'var(--wl-amber-soft)' },
};

export const TONE_CSS: Record<StreamTone, [string, string]> = {
  blue: [TONE_META.blue.cssVar, TONE_META.blue.softVar],
  emerald: [TONE_META.emerald.cssVar, TONE_META.emerald.softVar],
  rose: [TONE_META.rose.cssVar, TONE_META.rose.softVar],
  violet: [TONE_META.violet.cssVar, TONE_META.violet.softVar],
  amber: [TONE_META.amber.cssVar, TONE_META.amber.softVar],
};
