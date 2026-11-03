/**
 * Lenses replace the old Design and Data View modes (T-02). A lens changes what the canvas emphasises, not what the
 * user may do. `workspaceMode` stays as a derived value until every caller has moved over.
 */
export type Lens = 'design' | 'traffic' | 'review' | 'present';
export type WorkspaceMode = 'design' | 'data';

export const LENSES: readonly Lens[] = ['design', 'traffic', 'review', 'present'];

/** Display names, in the order of the keys 1 to 4. */
export const LENS_LABELS: Record<Lens, string> = {
  design: 'Design',
  traffic: 'Traffic',
  review: 'Review',
  present: 'Present',
};

export function lensForKey(key: string): Lens | null {
  if (!/^[1-9]$/.test(key)) return null;
  return LENSES[Number(key) - 1] ?? null;
}

/** The old two-way mode: only the Design lens edits freely on the canvas; every other lens reads as "data". */
export function workspaceModeOf(lens: Lens): WorkspaceMode {
  return lens === 'design' ? 'design' : 'data';
}

export function lensOfWorkspaceMode(mode: WorkspaceMode): Lens {
  return mode === 'design' ? 'design' : 'traffic';
}
