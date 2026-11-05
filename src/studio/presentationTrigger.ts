/**
 * The entry-bundle side of presentation mode. The tour and its bar (`presentation.ts`) are a lazy chunk, loaded the
 * first time `P` or the palette starts one. Its own keys (next, previous, Home, End, Esc) are bound by that chunk
 * while it is loaded, so nothing here runs on every key press.
 */
import type { DiagramDocument } from '../types';

let loaded: Promise<typeof import('./presentation')> | null = null;

export function togglePresentation(doc: DiagramDocument): Promise<void> {
  loaded ??= import('./presentation');
  return loaded.then((m) => m.togglePresentation(doc));
}
