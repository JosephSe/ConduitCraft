import type { StreamTone } from '../types';

/** Tone labels and CSS variables used by the studio and the standalone export. */
export const TONE_META: Record<
  StreamTone,
  { shortLabel: string; cssVar: string; softVar: string }
> = {
  blue: { shortLabel: 'Primary', cssVar: 'var(--cc-blue)', softVar: 'var(--cc-blue-soft)' },
  emerald: {
    shortLabel: 'Success',
    cssVar: 'var(--cc-emerald)',
    softVar: 'var(--cc-emerald-soft)',
  },
  rose: { shortLabel: 'Exception', cssVar: 'var(--cc-rose)', softVar: 'var(--cc-rose-soft)' },
  violet: { shortLabel: 'Control', cssVar: 'var(--cc-violet)', softVar: 'var(--cc-violet-soft)' },
  amber: { shortLabel: 'Async', cssVar: 'var(--cc-amber)', softVar: 'var(--cc-amber-soft)' },
  cyan: { shortLabel: 'Data', cssVar: 'var(--cc-cyan)', softVar: 'var(--cc-cyan-soft)' },
  fuchsia: { shortLabel: 'Security', cssVar: 'var(--cc-fuchsia)', softVar: 'var(--cc-fuchsia-soft)' },
};

export const TONE_CSS: Record<StreamTone, [string, string]> = {
  blue: [TONE_META.blue.cssVar, TONE_META.blue.softVar],
  emerald: [TONE_META.emerald.cssVar, TONE_META.emerald.softVar],
  rose: [TONE_META.rose.cssVar, TONE_META.rose.softVar],
  violet: [TONE_META.violet.cssVar, TONE_META.violet.softVar],
  amber: [TONE_META.amber.cssVar, TONE_META.amber.softVar],
  cyan: [TONE_META.cyan.cssVar, TONE_META.cyan.softVar],
  fuchsia: [TONE_META.fuchsia.cssVar, TONE_META.fuchsia.softVar],
};
