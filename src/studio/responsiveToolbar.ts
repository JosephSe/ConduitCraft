/**
 * Responsive and Compact Toolbar Manager.
 *
 * Handles:
 * - Collapsible side panels (Palette and Inspector) into compact icon rails
 * - Keyboard shortcuts ([ and ] when unselected, or panel toggle buttons)
 * - Persistence of panel states in localStorage
 */

const STORAGE_PALETTE_KEY = 'conduitcraft:palette-collapsed';
const STORAGE_INSPECTOR_KEY = 'conduitcraft:inspector-collapsed';

export interface ResponsiveToolbarOptions {
  onAddStencil?: (kind: string) => void;
  onAddZone?: () => void;
  onAddNotes?: () => void;
}

export class ResponsiveToolbarManager {
  private workspaceEl: HTMLElement | null = null;
  private options: ResponsiveToolbarOptions;

  constructor(options: ResponsiveToolbarOptions = {}) {
    this.options = options;
  }

  public init(container?: HTMLElement, options?: ResponsiveToolbarOptions): void {
    if (typeof document === 'undefined') return;

    if (options) {
      this.options = { ...this.options, ...options };
    }

    this.workspaceEl = container || (document.getElementById('workspace') as HTMLElement | null);

    this.initPanelToggles();
    this.initRailQuickActions();
    this.restoreSavedState();
  }

  /** Checks if the viewport is below the 66rem (~1056px) breakpoint */
  public isNarrowScreen(): boolean {
    if (typeof window === 'undefined') return false;
    return (
      (typeof window.innerWidth === 'number' && window.innerWidth <= 1056) ||
      Boolean(window.matchMedia && window.matchMedia('(max-width: 66rem)').matches)
    );
  }

  /** Initialize Panel Toggle Buttons */
  private initPanelToggles(): void {
    // Edge tabs: the touch way to open each drawer
    document.getElementById('btn-drawer-palette')?.addEventListener('click', () => {
      this.togglePalette(false);
    });
    document.getElementById('btn-drawer-inspector')?.addEventListener('click', () => {
      this.toggleInspector(false);
    });

    // Left Palette Collapse/Expand buttons
    const btnCollapsePalette = document.getElementById('btn-collapse-palette');
    btnCollapsePalette?.addEventListener('click', () => {
      this.togglePalette(true);
    });

    const btnRailExpandPalette = document.getElementById('btn-rail-expand-palette');
    btnRailExpandPalette?.addEventListener('click', () => {
      this.togglePalette(false);
    });

    // Right Inspector Collapse/Expand buttons
    const btnCollapseInspector = document.getElementById('btn-collapse-inspector');
    btnCollapseInspector?.addEventListener('click', () => {
      this.toggleInspector(true);
    });

    const btnRailExpandInspector = document.getElementById('btn-rail-expand-inspector');
    btnRailExpandInspector?.addEventListener('click', () => {
      this.toggleInspector(false);
    });

    // Tap-to-dismiss scrim for narrow screens
    const scrim = document.getElementById('drawer-scrim');
    scrim?.addEventListener('click', () => {
      this.togglePalette(true);
      this.toggleInspector(true);
    });
    scrim?.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        this.togglePalette(true);
        this.toggleInspector(true);
      },
      { passive: false }
    );

    // Clicking anywhere on inspector rail expands it
    const inspectorRail = document.getElementById('inspector-rail-content');
    inspectorRail?.addEventListener('click', (e) => {
      const target = e.target as HTMLElement | null;
      if (!target?.closest('button')) {
        this.toggleInspector(false);
      }
    });
  }

  /** Initialize quick-add actions from collapsed palette rail */
  private initRailQuickActions(): void {
    const paletteRail = document.getElementById('palette-rail-content');
    if (!paletteRail) return;

    paletteRail.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement | null)?.closest<HTMLButtonElement>('.rail-stencil-btn');
      if (!btn) return;
      const kind = btn.getAttribute('data-stencil-kind');
      if (!kind) return;

      if (kind === 'zone') {
        const btnAddZone = document.getElementById('btn-add-zone');
        if (btnAddZone) btnAddZone.click();
        else if (this.options.onAddZone) this.options.onAddZone();
      } else if (kind === 'notes') {
        const btnAddNotes = document.getElementById('btn-add-notes');
        if (btnAddNotes) btnAddNotes.click();
        else if (this.options.onAddNotes) this.options.onAddNotes();
      }
      // Any other kind is a component stencil. Its own pointer handler (attachStencilDragAndDrop) already added it,
      // so adding it again here would put two on the canvas.

      if (this.isNarrowScreen() || (typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches)) {
        this.togglePalette(true);
      }
    });
  }

  /** Update tap-to-dismiss scrim visibility */
  public updateScrim(): void {
    if (typeof document === 'undefined') return;
    const scrim = document.getElementById('drawer-scrim');
    if (!scrim) return;
    const isNarrow = this.isNarrowScreen();
    const anyOpen = !this.isPaletteCollapsed() || !this.isInspectorCollapsed();
    if (isNarrow && anyOpen) {
      scrim.removeAttribute('hidden');
    } else {
      scrim.setAttribute('hidden', '');
    }
  }

  /** Toggle Left Component Palette */
  public togglePalette(force?: boolean): boolean {
    const ws = this.getWorkspace();
    if (!ws) return false;

    const current = ws.getAttribute('data-palette-collapsed') === 'true';
    const next = typeof force === 'boolean' ? force : !current;

    // On narrow screens (<= 66rem), opening palette must close inspector
    if (!next && this.isNarrowScreen()) {
      this.toggleInspector(true);
    }

    if (next) {
      ws.setAttribute('data-palette-collapsed', 'true');
      document.getElementById('btn-drawer-palette')?.setAttribute('aria-expanded', 'false');
      this.safeSetStorage(STORAGE_PALETTE_KEY, 'true');
    } else {
      ws.removeAttribute('data-palette-collapsed');
      document.getElementById('btn-drawer-palette')?.setAttribute('aria-expanded', 'true');
      this.safeRemoveStorage(STORAGE_PALETTE_KEY);
    }
    this.updateScrim();
    return next;
  }

  /** Toggle Right Properties Inspector */
  public toggleInspector(force?: boolean, persist = true): boolean {
    const ws = this.getWorkspace();
    if (!ws) return false;

    const current = ws.getAttribute('data-inspector-collapsed') === 'true';
    const next = typeof force === 'boolean' ? force : !current;

    // On narrow screens (<= 66rem), opening inspector must close palette
    if (!next && this.isNarrowScreen()) {
      this.togglePalette(true);
    }

    if (next) {
      ws.setAttribute('data-inspector-collapsed', 'true');
      document.getElementById('btn-drawer-inspector')?.setAttribute('aria-expanded', 'false');
      if (persist) this.safeSetStorage(STORAGE_INSPECTOR_KEY, 'true');
    } else {
      ws.removeAttribute('data-inspector-collapsed');
      document.getElementById('btn-drawer-inspector')?.setAttribute('aria-expanded', 'true');
      if (persist) this.safeRemoveStorage(STORAGE_INSPECTOR_KEY);
    }
    this.updateScrim();
    return next;
  }

  public isPaletteCollapsed(): boolean {
    const ws = this.getWorkspace();
    return ws?.getAttribute('data-palette-collapsed') === 'true';
  }

  public isInspectorCollapsed(): boolean {
    const ws = this.getWorkspace();
    return ws?.getAttribute('data-inspector-collapsed') === 'true';
  }

  private restoreSavedState(): void {
    if (this.isNarrowScreen()) {
      // Below 66rem, boot with both panels collapsed by default on narrow screens
      this.togglePalette(true);
      this.toggleInspector(true);
      return;
    }

    if (typeof localStorage === 'undefined') return;
    try {
      if (localStorage.getItem(STORAGE_PALETTE_KEY) === 'true') {
        this.togglePalette(true);
      }
      if (localStorage.getItem(STORAGE_INSPECTOR_KEY) === 'true') {
        this.toggleInspector(true);
      }
    } catch {
      // Storage unavailable in private browsing mode
    }
  }

  private getWorkspace(): HTMLElement | null {
    if (!this.workspaceEl && typeof document !== 'undefined') {
      this.workspaceEl = document.getElementById('workspace');
    }
    return this.workspaceEl;
  }

  private safeSetStorage(key: string, val: string): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(key, val);
    } catch {
      // Ignore
    }
  }

  private safeRemoveStorage(key: string): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.removeItem(key);
    } catch {
      // Ignore
    }
  }
}

export const responsiveToolbar = new ResponsiveToolbarManager();
