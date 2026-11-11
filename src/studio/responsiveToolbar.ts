/**
 * Responsive and Compact Toolbar Manager.
 *
 * Handles:
 * - The collapsible inspector (a compact rail, or a drawer on a narrow screen)
 * - Keyboard shortcuts ([ and ] when unselected, or panel toggle buttons)
 * - Persistence of panel states in localStorage
 */

const STORAGE_INSPECTOR_KEY = 'conduitcraft:inspector-collapsed';

export interface ResponsiveToolbarOptions {
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
    // Edge tab: the touch way to open the inspector (the dock's All components opens the list)
    document.getElementById('btn-drawer-inspector')?.addEventListener('click', () => {
      this.toggleInspector(false);
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
      this.toggleInspector(true);
    });
    scrim?.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
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

  /** Update tap-to-dismiss scrim visibility */
  public updateScrim(): void {
    if (typeof document === 'undefined') return;
    const scrim = document.getElementById('drawer-scrim');
    if (!scrim) return;
    const isNarrow = this.isNarrowScreen();
    const anyOpen = !this.isInspectorCollapsed();
    if (isNarrow && anyOpen) {
      scrim.removeAttribute('hidden');
    } else {
      scrim.setAttribute('hidden', '');
    }
  }

  /** Toggle Right Properties Inspector */
  public toggleInspector(force?: boolean, persist = true): boolean {
    const ws = this.getWorkspace();
    if (!ws) return false;

    const current = ws.getAttribute('data-inspector-collapsed') === 'true';
    const next = typeof force === 'boolean' ? force : !current;

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

  public isInspectorCollapsed(): boolean {
    const ws = this.getWorkspace();
    return ws?.getAttribute('data-inspector-collapsed') === 'true';
  }

  private restoreSavedState(): void {
    if (this.isNarrowScreen()) {
      // Below 66rem the inspector is a drawer
      this.toggleInspector(true);
      return;
    }

    if (typeof localStorage === 'undefined') return;
    try {
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
