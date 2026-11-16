/**
 * Loads the Traffic beads (trafficBeads.ts) the first time the workspace turns to the Traffic lens, so the loop stays
 * out of the entry bundle. From then on that module watches the lens itself. Call once at boot.
 */
export function bootTrafficBeads(): void {
  const workspace = document.getElementById('workspace');
  if (!workspace) return;
  let loading = false;
  const load = () => {
    if (loading || workspace.dataset.lens !== 'traffic') return;
    loading = true;
    observer.disconnect();
    void import('./trafficBeads').then((m) => m.initTrafficBeads(workspace));
  };
  const observer = new MutationObserver(load);
  observer.observe(workspace, { attributes: true, attributeFilter: ['data-lens'] });
  load();
}
