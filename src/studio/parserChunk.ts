/**
 * The Blueprint Markdown and Mermaid parser, with js-yaml, is a lazy chunk: start-up only reads Blueprint JSON, so the
 * entry bundle stays without it. Reading or writing Markdown awaits `loadParser()`; boot preloads it once idle.
 */
type Parser = typeof import('../core/parser');

let pending: Promise<Parser> | undefined;

export function loadParser(): Promise<Parser> {
  pending ??= import('../core/parser').catch((error: unknown) => {
    pending = undefined; // Let a later call retry (e.g. once back online).
    throw error;
  });
  return pending;
}

/** Fetch the chunk when the browser is idle, so the first Markdown action does not wait for it. */
export function preloadParserWhenIdle(): void {
  if (typeof window === 'undefined') return;
  const start = (): void => void loadParser().catch(() => {});
  if ('requestIdleCallback' in window) window.requestIdleCallback(start, { timeout: 4000 });
  else globalThis.setTimeout(start, 1500);
}
