/**
 * Responsive and Compact Toolbar Manager.
 *
 * Handles:
 * - File menu dropdown (New, Import, Open code, Matrix, Export)
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
  onOpenExport?: () => void;
}

export class ResponsiveToolbarManager {
  private workspaceEl: HTMLElement | null = null;
  private btnFileMenu: HTMLButtonElement | null = null;
  private fileMenuPopup: HTMLElement | null = null;
  private btnHeaderOverflow: HTMLButtonElement | null = null;
  private headerOverflowPopup: HTMLElement | null = null;
  private btnTogglePalette: HTMLButtonElement | null = null;
  private btnToggleInspector: HTMLButtonElement | null = null;
  private isMenuOpen = false;
  private isOverflowOpen = false;
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
    this.btnFileMenu = document.getElementById('btn-file-menu') as HTMLButtonElement | null;
    this.fileMenuPopup = document.getElementById('file-menu-popup') as HTMLElement | null;
    this.btnHeaderOverflow = document.getElementById('btn-header-overflow') as HTMLButtonElement | null;
    this.headerOverflowPopup = document.getElementById('header-overflow-popup') as HTMLElement | null;
    this.btnTogglePalette = document.getElementById('btn-toggle-palette') as HTMLButtonElement | null;
    this.btnToggleInspector = document.getElementById('btn-toggle-inspector') as HTMLButtonElement | null;

    this.initFileMenu();
    this.initHeaderOverflow();
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

  /** Initialize Header Overflow menu for narrow/mobile screens */
  private initHeaderOverflow(): void {
    if (!this.btnHeaderOverflow || !this.headerOverflowPopup) return;

    this.btnHeaderOverflow.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleHeaderOverflow();
    });

    // Close when clicking any menu item inside overflow popup
    this.headerOverflowPopup.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement | null)?.closest<HTMLButtonElement>('.menu-item');
      if (!target) return;
      this.closeHeaderOverflow();

      const id = target.id;
      if (id === 'btn-overflow-search') {
        document.getElementById('btn-open-palette')?.click();
      } else if (id === 'btn-overflow-present') {
        document.getElementById('btn-enter-presentation')?.click();
      } else if (id === 'btn-overflow-fit') {
        document.getElementById('btn-fit-viewport')?.click();
      } else if (id === 'btn-overflow-layout') {
        document.getElementById('btn-auto-layout')?.click();
      } else if (id === 'btn-overflow-snap') {
        document.getElementById('btn-toggle-snap')?.click();
      } else if (id === 'btn-overflow-shortcuts') {
        document.getElementById('btn-open-shortcuts')?.click();
      } else if (id === 'btn-overflow-settings') {
        document.getElementById('btn-open-settings')?.click();
      } else if (id === 'btn-overflow-clear') {
        document.getElementById('btn-clear-canvas')?.click();
      }
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (this.isOverflowOpen) {
        const target = e.target as HTMLElement | null;
        if (!target?.closest('#header-overflow-wrapper')) {
          this.closeHeaderOverflow();
        }
      }
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOverflowOpen) {
        this.closeHeaderOverflow();
        this.btnHeaderOverflow?.focus();
      }
    });
  }

  public toggleHeaderOverflow(force?: boolean): boolean {
    const next = typeof force === 'boolean' ? force : !this.isOverflowOpen;
    this.isOverflowOpen = next;
    if (this.headerOverflowPopup) {
      if (next) {
        this.headerOverflowPopup.removeAttribute('hidden');
        this.btnHeaderOverflow?.setAttribute('aria-expanded', 'true');
        const firstItem = this.headerOverflowPopup.querySelector<HTMLButtonElement>('.menu-item');
        firstItem?.focus();
      } else {
        this.headerOverflowPopup.setAttribute('hidden', '');
        this.btnHeaderOverflow?.setAttribute('aria-expanded', 'false');
      }
    }
    return this.isOverflowOpen;
  }

  public closeHeaderOverflow(): void {
    if (this.isOverflowOpen) {
      this.toggleHeaderOverflow(false);
    }
  }

  public isHeaderOverflowOpen(): boolean {
    return this.isOverflowOpen;
  }

  /** Initialize File Menu dropdown toggle and outside-click dismiss. */
  private initFileMenu(): void {
    if (!this.btnFileMenu || !this.fileMenuPopup) return;

    this.btnFileMenu.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleFileMenu();
    });

    // Close when clicking any menu item inside popup
    this.fileMenuPopup.addEventListener('click', (e) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('.menu-item')) {
        this.closeFileMenu();
      }
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (this.isMenuOpen) {
        const target = e.target as HTMLElement | null;
        if (!target?.closest('#file-menu-wrapper')) {
          this.closeFileMenu();
        }
      }
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isMenuOpen) {
        this.closeFileMenu();
        this.btnFileMenu?.focus();
      }
    });

    // Export trigger button inside file menu
    const btnFileExport = document.getElementById('btn-file-export');
    if (btnFileExport) {
      btnFileExport.addEventListener('click', () => {
        const primaryExport = document.getElementById('btn-open-export');
        if (primaryExport) {
          primaryExport.click();
        } else if (this.options.onOpenExport) {
          this.options.onOpenExport();
        }
      });
    }
  }

  public toggleFileMenu(force?: boolean): boolean {
    const next = typeof force === 'boolean' ? force : !this.isMenuOpen;
    this.isMenuOpen = next;
    if (this.fileMenuPopup) {
      if (next) {
        this.fileMenuPopup.removeAttribute('hidden');
        this.btnFileMenu?.setAttribute('aria-expanded', 'true');
        // Auto-focus first menu item
        const firstItem = this.fileMenuPopup.querySelector<HTMLButtonElement>('.menu-item');
        firstItem?.focus();
      } else {
        this.fileMenuPopup.setAttribute('hidden', '');
        this.btnFileMenu?.setAttribute('aria-expanded', 'false');
      }
    }
    return this.isMenuOpen;
  }

  public closeFileMenu(): void {
    if (this.isMenuOpen) {
      this.toggleFileMenu(false);
    }
  }

  public isFileMenuOpen(): boolean {
    return this.isMenuOpen;
  }

  /** Initialize Panel Toggle Buttons */
  private initPanelToggles(): void {
    this.btnTogglePalette?.addEventListener('click', () => {
      this.togglePalette();
    });

    this.btnToggleInspector?.addEventListener('click', () => {
      this.toggleInspector();
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
      } else {
        if (this.options.onAddStencil) {
          this.options.onAddStencil(kind);
        } else {
          // Trigger stencil card pointer events or click
          const card = document.querySelector<HTMLButtonElement>(`.stencil-card[data-kind="${kind}"]`);
          if (card) {
            card.dispatchEvent(new PointerEvent('pointerdown', { button: 0, bubbles: true }));
            card.dispatchEvent(new PointerEvent('pointerup', { button: 0, bubbles: true }));
          }
        }
      }

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
      this.btnTogglePalette?.setAttribute('aria-expanded', 'false');
      this.safeSetStorage(STORAGE_PALETTE_KEY, 'true');
    } else {
      ws.removeAttribute('data-palette-collapsed');
      this.btnTogglePalette?.setAttribute('aria-expanded', 'true');
      this.safeRemoveStorage(STORAGE_PALETTE_KEY);
    }
    this.updateScrim();
    return next;
  }

  /** Toggle Right Properties Inspector */
  public toggleInspector(force?: boolean): boolean {
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
      this.btnToggleInspector?.setAttribute('aria-expanded', 'false');
      this.safeSetStorage(STORAGE_INSPECTOR_KEY, 'true');
    } else {
      ws.removeAttribute('data-inspector-collapsed');
      this.btnToggleInspector?.setAttribute('aria-expanded', 'true');
      this.safeRemoveStorage(STORAGE_INSPECTOR_KEY);
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
