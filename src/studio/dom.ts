/** DOM lookups and dialog-close motion used by the studio modules. */
export const SVG_NS = 'http://www.w3.org/2000/svg';

// ---------------------------------------------------------------------------
// Top-Layer Exit Animation Helper (`animate-to-from-top-layer` fallback)
// ---------------------------------------------------------------------------
export let cachedDisplayTransitionSupport: boolean | undefined;
export function canTransitionDisplay(): boolean {
  if (cachedDisplayTransitionSupport !== undefined) return cachedDisplayTransitionSupport;
  if (!window.CSS?.supports?.('transition-behavior', 'allow-discrete') || !document.body) {
    return false;
  }
  const probe = document.createElement('div');
  probe.style.cssText = 'transition: display 1s allow-discrete !important; display: block;';
  document.body.appendChild(probe);
  void getComputedStyle(probe).display;
  probe.style.display = 'none';
  cachedDisplayTransitionSupport = getComputedStyle(probe).display === 'block';
  probe.remove();
  return cachedDisplayTransitionSupport;
}

export function supportsTopLayerExit(): boolean {
  return Boolean(window.CSS?.supports?.('overlay', 'auto')) && canTransitionDisplay();
}

export async function closeDialogSmoothly(dialog: HTMLDialogElement): Promise<void> {
  if (!dialog.open) return;
  if (!supportsTopLayerExit()) {
    dialog.setAttribute('data-closing', '');
    const animations = dialog.getAnimations({ subtree: true });
    if (animations.length > 0) {
      await Promise.race([
        Promise.allSettled(animations.map((a) => a.finished)),
        new Promise((r) => setTimeout(r, 280)),
      ]);
    }
    dialog.removeAttribute('data-closing');
  }
  dialog.close();
}

// ---------------------------------------------------------------------------
// DOM Elements
// ---------------------------------------------------------------------------
export const workspace = document.getElementById('workspace') as HTMLElement;
export const docSystemTagEl = document.getElementById('doc-system-tag') as HTMLElement;
export const docStatusLabelEl = document.getElementById('doc-status-label') as HTMLElement;
export const docTitleHeadingEl = document.getElementById('doc-title-heading') as HTMLElement;
export const docBrandCluster = document.getElementById('doc-brand-cluster') as HTMLElement;
export const docBrandMark = document.getElementById('doc-brand-mark') as HTMLElement;
export const docBrandGlyph = document.getElementById('doc-brand-glyph') as unknown as SVGSVGElement;
export const docBrandLogo = document.getElementById('doc-brand-logo') as HTMLImageElement;
export const docBrandName = document.getElementById('doc-brand-name') as HTMLElement;
export const btnFocusDocTitle = document.getElementById('btn-focus-doc-title') as HTMLButtonElement;

export const designToolbar = document.getElementById('design-toolbar') as HTMLElement;
export const dataToolbar = document.getElementById('data-toolbar') as HTMLElement;
export const btnUndo = document.getElementById('btn-undo') as HTMLButtonElement;
export const btnRedo = document.getElementById('btn-redo') as HTMLButtonElement;
export const btnAutoLayout = document.getElementById('btn-auto-layout') as HTMLButtonElement;
export const simButtonsSlot = document.getElementById('sim-buttons-slot') as HTMLElement;
export const btnToggleMotion = document.getElementById('btn-toggle-motion') as HTMLButtonElement;

export const fileUploadInput = document.getElementById('file-upload') as HTMLInputElement;
export const btnNewCanvas = document.getElementById('btn-new-canvas') as HTMLButtonElement;
export const btnImportFile = document.getElementById('btn-import-file') as HTMLButtonElement;
export const btnOpenCode = document.getElementById('btn-open-code') as HTMLButtonElement;
export const btnOpenMatrix = document.getElementById('btn-open-matrix') as HTMLButtonElement;
export const btnOpenExport = document.getElementById('btn-open-export') as HTMLButtonElement;
export const btnOpenSettings = document.getElementById('btn-open-settings') as HTMLButtonElement;

export const canvasStatsPill = document.getElementById('canvas-stats-pill') as HTMLElement;
export const stencilGrid = document.getElementById('stencil-grid') as HTMLElement;
export const btnAddZone = document.getElementById('btn-add-zone') as HTMLButtonElement;
export const btnAddNotes = document.getElementById('btn-add-notes') as HTMLButtonElement;
export const btnPaletteImport = document.getElementById('btn-palette-import') as HTMLButtonElement;
export const btnPaletteCode = document.getElementById('btn-palette-code') as HTMLButtonElement;

export const windowDropVeil = document.getElementById('window-drop-veil') as HTMLElement;
export const emptyStageOverlay = document.getElementById('empty-stage-overlay') as HTMLElement;
export const btnQuickStarter = document.getElementById('btn-quick-starter') as HTMLButtonElement;
export const btnEmptyShowcase = document.getElementById('btn-empty-showcase') as HTMLButtonElement;
export const btnEmptyTemplates = document.getElementById('btn-empty-templates') as HTMLButtonElement | null;
export const emptyStageShelfSlot = document.getElementById('empty-stage-shelf-slot') as HTMLElement | null;
export const btnEmptyImport = document.getElementById('btn-empty-import') as HTMLButtonElement;
export const btnEmptyCode = document.getElementById('btn-empty-code') as HTMLButtonElement;
export const btnRestoreSession = document.getElementById('btn-restore-session') as HTMLButtonElement | null;
export const templateGalleryDialog = document.getElementById('template-gallery-dialog') as HTMLDialogElement | null;
export const templateCategoryFilters = document.getElementById('template-category-filters') as HTMLElement | null;
export const templateGalleryGrid = document.getElementById('template-gallery-grid') as HTMLElement | null;

export const viewport = document.getElementById('canvas-viewport') as HTMLElement;
export const stageWorld = document.getElementById('stage-world') as HTMLElement;
export const alignGuideX = document.getElementById('align-guide-x') as HTMLElement;
export const alignGuideY = document.getElementById('align-guide-y') as HTMLElement;
export const marqueeBox = document.getElementById('marquee-box') as HTMLElement | null;
export const zonesLayer = document.getElementById('zones-layer') as HTMLElement;
export const notesLayer = document.getElementById('notes-layer') as HTMLElement;
export const wiresSvg = document.getElementById('wires-svg') as unknown as SVGSVGElement;
export const wiresGroup = document.getElementById('wires-group') as unknown as SVGGElement;
export const draftWire = document.getElementById('draft-wire') as unknown as SVGPathElement;
export const nodesLayer = document.getElementById('nodes-layer') as HTMLElement;
export const simPacket = document.getElementById('sim-packet') as HTMLElement;
export const simPacketDot = document.getElementById('sim-packet-dot') as HTMLElement;
export const simPacketLabel = document.getElementById('sim-packet-label') as HTMLElement;

export const hudStatusTip = document.getElementById('hud-status-tip') as HTMLElement;
export const hudSearchInput = document.getElementById('hud-search-input') as HTMLInputElement | null;
export const hudSearchCount = document.getElementById('hud-search-count') as HTMLElement | null;
export const btnClearSearch = document.getElementById('btn-clear-search') as HTMLButtonElement | null;
export const zoomReadout = document.getElementById('zoom-readout') as HTMLElement;
export const btnZoomIn = document.getElementById('btn-zoom-in') as HTMLButtonElement;
export const btnZoomOut = document.getElementById('btn-zoom-out') as HTMLButtonElement;
export const btnZoomFit = document.getElementById('btn-zoom-fit') as HTMLButtonElement;
export const btnZoomFitSelection = document.getElementById('btn-zoom-fit-selection') as HTMLButtonElement;
export const minimapCanvas = document.getElementById('minimap') as HTMLCanvasElement | null;

// Right Panel: Design vs Data View
export const designInspectorPane = document.getElementById('design-inspector-pane') as HTMLElement;
export const propPanelHeading = document.getElementById('prop-panel-heading') as HTMLElement;
export const propSelectionActions = document.getElementById('prop-selection-actions') as HTMLElement;
export const btnPropDuplicate = document.getElementById('btn-prop-duplicate') as HTMLButtonElement;
export const btnPropDelete = document.getElementById('btn-prop-delete') as HTMLButtonElement;
export const propFormContainer = document.getElementById('prop-form-container') as HTMLElement;

export const dataInspectorPane = document.getElementById('data-inspector-pane') as HTMLElement;
export const inspectorScope = document.getElementById('inspector-scope') as HTMLElement;
export const tabInspector = document.getElementById('tab-inspector') as HTMLButtonElement;
export const tabTrace = document.getElementById('tab-trace') as HTMLButtonElement;
export const tabSimulations = document.getElementById('tab-simulations') as HTMLButtonElement;
export const panelInspector = document.getElementById('panel-inspector') as HTMLElement;
export const panelTrace = document.getElementById('panel-trace') as HTMLElement;
export const panelSimulations = document.getElementById('panel-simulations') as HTMLElement;
export const simEditorHint = document.getElementById('sim-editor-hint') as HTMLElement;
export const simEditorList = document.getElementById('sim-editor-list') as HTMLElement;
export const btnAddSimulation = document.getElementById('btn-add-simulation') as HTMLButtonElement;
export const btnResetSelection = document.getElementById('btn-reset-selection') as HTMLButtonElement;
export const btnClearTrace = document.getElementById('btn-clear-trace') as HTMLButtonElement;

export const inspBadge = document.getElementById('insp-badge') as HTMLElement;
export const inspId = document.getElementById('insp-id') as HTMLElement;
export const inspTitle = document.getElementById('insp-title') as HTMLElement;
export const inspSummary = document.getElementById('insp-summary') as HTMLElement;
export const inspMetrics = document.getElementById('insp-metrics') as HTMLElement;
export const inspLineage = document.getElementById('insp-lineage') as HTMLElement;
export const inspCode = document.getElementById('insp-code') as HTMLElement;
export const traceList = document.getElementById('trace-list') as HTMLOListElement;

// Dialogs
export const codeDialog = document.getElementById('code-dialog') as HTMLDialogElement;
export const codeSyncTextarea = document.getElementById('code-sync-textarea') as HTMLTextAreaElement;
export const codeSyncDiagnostics = document.getElementById('code-sync-diagnostics') as HTMLElement;
export const btnCopyCode = document.getElementById('btn-copy-code') as HTMLButtonElement;
export const btnApplyCode = document.getElementById('btn-apply-code') as HTMLButtonElement;

export const exportDialog = document.getElementById('export-dialog') as HTMLDialogElement;
export const btnExportHtml = document.getElementById('btn-export-html') as HTMLButtonElement;
export const btnExportMmd = document.getElementById('btn-export-mmd') as HTMLButtonElement;
export const btnExportSvg = document.getElementById('btn-export-svg') as HTMLButtonElement;
export const btnExportPng = document.getElementById('btn-export-png') as HTMLButtonElement;
export const btnExportGif = document.getElementById('btn-export-gif') as HTMLButtonElement;
export const btnExportJson = document.getElementById('btn-export-json') as HTMLButtonElement;
export const exportDialogTitle = document.getElementById('export-dialog-title') as HTMLElement;
export const exportCards = document.getElementById('export-cards') as HTMLElement;
export const shareLinkBox = document.getElementById('share-link-box') as HTMLElement | null;
export const shareLinkInput = document.getElementById('share-link-input') as HTMLInputElement | null;
export const btnCopyShareLink = document.getElementById('btn-copy-share-link') as HTMLButtonElement | null;
export const shareLinkSize = document.getElementById('share-link-size') as HTMLElement | null;
export const chkShareOmitImages = document.getElementById('chk-share-omit-images') as HTMLInputElement | null;
export const gifExportPanel = document.getElementById('gif-export-panel') as HTMLElement;
export const btnGifBack = document.getElementById('btn-gif-back') as HTMLButtonElement;
export const btnGifWhole = document.getElementById('btn-gif-whole') as HTMLButtonElement;
export const btnGifView = document.getElementById('btn-gif-view') as HTMLButtonElement;
export const gifScenarioList = document.getElementById('gif-scenario-list') as HTMLElement;
export const gifScenarioEmpty = document.getElementById('gif-scenario-empty') as HTMLElement;

export const matrixDialog = document.getElementById('matrix-dialog') as HTMLDialogElement;
export const matrixTbody = document.getElementById('matrix-tbody') as HTMLTableSectionElement;

export const settingsDialog = document.getElementById('settings-dialog') as HTMLDialogElement;
export const chkSnapGrid = document.getElementById('chk-snap-grid') as HTMLInputElement;

export const btnOpenShortcuts = document.getElementById('btn-open-shortcuts') as HTMLButtonElement | null;
export const shortcutsDialog = document.getElementById('shortcuts-dialog') as HTMLDialogElement | null;
export const shortcutsDialogBody = document.getElementById('shortcuts-dialog-body') as HTMLElement | null;
export const btnDismissHudCoach = document.getElementById('btn-dismiss-hud-coach') as HTMLButtonElement | null;
export const hudCoachCard = document.getElementById('hud-coach-card') as HTMLElement | null;
