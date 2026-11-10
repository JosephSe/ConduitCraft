/** The dock's six favourite components (7.2): which ones, and how a saved list is made safe. No DOM here. */
import { STENCIL_CATALOG } from '../templates/presets';

export const FAVOURITE_COUNT = 6;
/** Service, Data store, Message queue, Load balancer, Gateway (the Control gate), Actor. */
export const DEFAULT_FAVOURITES = ['service', 'store', 'queue', 'balancer', 'gate', 'actor'];

/** Six known stencil ids: the saved ones that still exist, then the defaults to fill any gap. */
export function normaliseFavourites(saved: unknown): string[] {
  const known = new Set(STENCIL_CATALOG.map((s) => s.id));
  const out: string[] = [];
  if (Array.isArray(saved)) for (const id of saved) if (typeof id === 'string' && known.has(id) && out.length < FAVOURITE_COUNT) out.push(id);
  for (const id of DEFAULT_FAVOURITES) if (out.length < FAVOURITE_COUNT && !out.includes(id)) out.push(id);
  return out;
}
