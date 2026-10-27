/** Command Palette (Cmd/Ctrl+K) controller. */
import { app, fitSelection, fitToViewport, performRedo, performUndo, pushHistory, setSelection, zoomAround } from './state';
import { autoLayoutDocument, expandStageToFit } from '../core/layout';
import { createNodeFromStencil, createSwimlaneZone, createNotesCard } from '../templates/presets';
import { applySelection, renderAll, renderMatrixTable } from './render';
import { isMac } from './commands';
import { notify } from './toast';
import { closeDialogSmoothly } from './dom';
import { STARTER_TEMPLATES } from './templatesGallery';
import { createShareUrl } from './shareLink';
import { togglePresentation } from './presentation';
import { simulationPlayback } from './simulationPlayback';
import {
  bringToFront,
  sendToBack,
  bringForward,
  sendBackward,
  toggleSelectionLock,
  canGroupSelection,
  groupSelection,
  ungroupSelection,
} from './zOrderLockGroup';
import { responsiveToolbar } from './responsiveToolbar';

export interface PaletteCommand {
  id: string;
  title: string;
  category: 'Components' | 'Canvas & Layout' | 'Mode & View' | 'Edit & History' | 'Export & Sync' | 'Preferences' | 'Nodes' | 'Templates';
  subtitle?: string;
  shortcut?: string;
  keywords?: string[];
  run: () => void;
}

export interface PaletteDeps {
  openCodeDialog: () => void;
  openExportDialog: () => void;
  openSettingsDialog: () => void;
  openShortcutsDialog: () => void;
  openTemplateGallery?: () => void;
  loadTemplateById?: (id: string) => void;
  deleteSelected: () => void;
  duplicateSelected: () => void;
  loadShowcase: () => void;
  runSimulationById: (id: string) => void;
  saveFile?: () => void;
  saveFileAs?: () => void;
  openFile?: () => void;
}

let activeIndex = 0;
let currentFiltered: PaletteCommand[] = [];
let savedDeps: PaletteDeps | null = null;

export function getPaletteCommands(deps: PaletteDeps): PaletteCommand[] {
  const mod = isMac() ? '⌘' : 'Ctrl+';
  const commands: PaletteCommand[] = [
    // Components
    {
      id: 'add-actor',
      title: 'Add Actor Stencil',
      subtitle: 'Human role or user initiator',
      category: 'Components',
      keywords: ['actor', 'human', 'user', 'session'],
      run: () => {
        pushHistory();
        const node = createNodeFromStencil('actor', 200, 200, app.doc.nodes.length);
        app.doc.nodes.push(node);
        expandStageToFit(app.doc);
        setSelection({ type: 'node', id: node.id });
        renderAll(true);
        notify('Added Actor stencil');
      },
    },
    {
      id: 'add-core',
      title: 'Add Core System Stencil',
      subtitle: 'Primary application card',
      category: 'Components',
      keywords: ['core', 'system', 'platform', 'app'],
      run: () => {
        pushHistory();
        const node = createNodeFromStencil('core', 200, 200, app.doc.nodes.length);
        app.doc.nodes.push(node);
        expandStageToFit(app.doc);
        setSelection({ type: 'node', id: node.id });
        renderAll(true);
        notify('Added Core System stencil');
      },
    },
    {
      id: 'add-service',
      title: 'Add Service / API Stencil',
      subtitle: 'Microservice, endpoint or worker',
      category: 'Components',
      keywords: ['service', 'api', 'microservice', 'rest', 'grpc', 'worker'],
      run: () => {
        pushHistory();
        const node = createNodeFromStencil('service', 200, 200, app.doc.nodes.length);
        app.doc.nodes.push(node);
        expandStageToFit(app.doc);
        setSelection({ type: 'node', id: node.id });
        renderAll(true);
        notify('Added Service stencil');
      },
    },
    {
      id: 'add-broker',
      title: 'Add Event Broker Stencil',
      subtitle: 'Queue, pub/sub, or message bus',
      category: 'Components',
      keywords: ['broker', 'event', 'queue', 'kafka', 'bus', 'pubsub'],
      run: () => {
        pushHistory();
        const node = createNodeFromStencil('bus', 200, 200, app.doc.nodes.length);
        app.doc.nodes.push(node);
        expandStageToFit(app.doc);
        setSelection({ type: 'node', id: node.id });
        renderAll(true);
        notify('Added Event Broker stencil');
      },
    },
    {
      id: 'add-gate',
      title: 'Add Control Gate Stencil',
      subtitle: 'Policy, security or decision gate',
      category: 'Components',
      keywords: ['gate', 'policy', 'decision', 'guard', 'firewall'],
      run: () => {
        pushHistory();
        const node = createNodeFromStencil('gate', 200, 200, app.doc.nodes.length);
        app.doc.nodes.push(node);
        expandStageToFit(app.doc);
        setSelection({ type: 'node', id: node.id });
        renderAll(true);
        notify('Added Control Gate stencil');
      },
    },
    {
      id: 'add-store',
      title: 'Add Data Store Stencil',
      subtitle: 'Database, cache or ledger',
      category: 'Components',
      keywords: ['database', 'store', 'db', 'sql', 'cache', 'redis', 'ledger'],
      run: () => {
        pushHistory();
        const node = createNodeFromStencil('store', 200, 200, app.doc.nodes.length);
        app.doc.nodes.push(node);
        expandStageToFit(app.doc);
        setSelection({ type: 'node', id: node.id });
        renderAll(true);
        notify('Added Data Store stencil');
      },
    },
    {
      id: 'add-client',
      title: 'Add External Client Stencil',
      subtitle: 'Mobile, browser, or edge client',
      category: 'Components',
      keywords: ['client', 'mobile', 'browser', 'frontend', 'edge'],
      run: () => {
        pushHistory();
        const node = createNodeFromStencil('client', 200, 200, app.doc.nodes.length);
        app.doc.nodes.push(node);
        expandStageToFit(app.doc);
        setSelection({ type: 'node', id: node.id });
        renderAll(true);
        notify('Added Client stencil');
      },
    },
    {
      id: 'add-zone',
      title: 'Add Swimlane Stage Banner',
      subtitle: 'Column boundary for architectural tiers',
      category: 'Components',
      keywords: ['swimlane', 'zone', 'stage', 'column', 'tier'],
      run: () => {
        pushHistory();
        const nextX =
          app.doc.zones.length > 0
            ? Math.max(...app.doc.zones.map((z) => z.x + z.width)) + 24
            : 48;
        const zone = createSwimlaneZone(app.doc.zones.length, nextX);
        app.doc.zones.push(zone);
        expandStageToFit(app.doc);
        setSelection({ type: 'zone', id: zone.id });
        renderAll(true);
        notify('Added Swimlane Stage');
      },
    },
    {
      id: 'add-notes',
      title: 'Add Notes / Spec Checklist Card',
      subtitle: 'Documentation and spec card on stage',
      category: 'Components',
      keywords: ['notes', 'spec', 'checklist', 'card', 'annotation'],
      run: () => {
        pushHistory();
        const notes = createNotesCard(200, 200);
        app.doc.notesCards.push(notes);
        expandStageToFit(app.doc);
        setSelection({ type: 'notes', id: notes.id });
        renderAll(true);
        notify('Added Notes Card');
      },
    },

    // Canvas & Layout
    {
      id: 'auto-layout',
      title: 'Auto-Layout Architecture',
      subtitle: 'Cleanly order components with crossing minimization',
      category: 'Canvas & Layout',
      keywords: ['arrange', 'layout', 'tidy', 'format', 'organize'],
      run: () => {
        if (app.doc.nodes.length === 0) return;
        pushHistory();
        autoLayoutDocument(app.doc);
        renderAll(true);
        fitToViewport();
        notify('Applied auto-layout', { action: { label: 'Undo', onClick: () => performUndo() } });
      },
    },
    {
      id: 'auto-layout-lr',
      title: 'Auto-Layout: Left-to-Right (LR)',
      subtitle: 'Flow diagram horizontally from left to right',
      category: 'Canvas & Layout',
      keywords: ['lr', 'horizontal', 'layout', 'direction'],
      run: () => {
        if (app.doc.nodes.length === 0) return;
        pushHistory();
        autoLayoutDocument(app.doc, { direction: 'LR' });
        renderAll(true);
        fitToViewport();
        notify('Applied auto-layout (LR)', { action: { label: 'Undo', onClick: () => performUndo() } });
      },
    },
    {
      id: 'auto-layout-td',
      title: 'Auto-Layout: Top-to-Bottom (TD)',
      subtitle: 'Flow diagram vertically from top to bottom',
      category: 'Canvas & Layout',
      keywords: ['td', 'vertical', 'layout', 'direction'],
      run: () => {
        if (app.doc.nodes.length === 0) return;
        pushHistory();
        autoLayoutDocument(app.doc, { direction: 'TD' });
        renderAll(true);
        fitToViewport();
        notify('Applied auto-layout (TD)', { action: { label: 'Undo', onClick: () => performUndo() } });
      },
    },
    {
      id: 'auto-layout-compact',
      title: 'Auto-Layout: Compact Spacing',
      subtitle: 'Tightly packed layout for dense architectures',
      category: 'Canvas & Layout',
      keywords: ['compact', 'dense', 'spacing', 'tight', 'layout'],
      run: () => {
        if (app.doc.nodes.length === 0) return;
        pushHistory();
        autoLayoutDocument(app.doc, { spacing: 'compact' });
        renderAll(true);
        fitToViewport();
        notify('Applied compact auto-layout', { action: { label: 'Undo', onClick: () => performUndo() } });
      },
    },
    {
      id: 'auto-layout-spacious',
      title: 'Auto-Layout: Spacious Spacing',
      subtitle: 'Generous breathing room between tiers and components',
      category: 'Canvas & Layout',
      keywords: ['spacious', 'wide', 'roomy', 'spacing', 'layout'],
      run: () => {
        if (app.doc.nodes.length === 0) return;
        pushHistory();
        autoLayoutDocument(app.doc, { spacing: 'spacious' });
        renderAll(true);
        fitToViewport();
        notify('Applied spacious auto-layout', { action: { label: 'Undo', onClick: () => performUndo() } });
      },
    },
    {
      id: 'auto-layout-selection',
      title: 'Auto-Layout Selection Only',
      subtitle: 'Re-arrange only currently selected components',
      category: 'Canvas & Layout',
      keywords: ['selection', 'partial', 'layout', 'arrange'],
      run: () => {
        const ids = app.selection.type === 'multi'
          ? app.selection.ids
          : app.selection.type === 'node'
            ? [app.selection.id]
            : [];
        if (ids.length < 2) {
          notify('Select 2 or more components to layout selection', { tone: 'normal' });
          return;
        }
        pushHistory();
        autoLayoutDocument(app.doc, { selectionOnly: true, selectedNodeIds: ids });
        renderAll(true);
        fitToViewport();
        notify('Auto-arranged selected components', { action: { label: 'Undo', onClick: () => performUndo() } });
      },
    },
    {
      id: 'fit-view',
      title: 'Fit Diagram to Viewport',
      subtitle: 'Frame entire diagram with comfortable padding',
      category: 'Canvas & Layout',
      shortcut: 'Fit',
      keywords: ['fit', 'zoom', 'frame', 'center'],
      run: fitToViewport,
    },
    {
      id: 'fit-selection',
      title: 'Fit Selection to Viewport',
      subtitle: 'Center and zoom selected components',
      category: 'Canvas & Layout',
      keywords: ['fit', 'selection', 'focus'],
      run: fitSelection,
    },
    {
      id: 'zoom-in',
      title: 'Zoom In',
      category: 'Canvas & Layout',
      shortcut: '+',
      keywords: ['zoom', 'magnify', 'closer'],
      run: () => {
        const vp = document.getElementById('canvas-viewport');
        if (!vp) return;
        const rect = vp.getBoundingClientRect();
        zoomAround(app.scale * 1.2, rect.width / 2, rect.height / 2);
      },
    },
    {
      id: 'zoom-out',
      title: 'Zoom Out',
      category: 'Canvas & Layout',
      shortcut: '−',
      keywords: ['zoom', 'smaller', 'out'],
      run: () => {
        const vp = document.getElementById('canvas-viewport');
        if (!vp) return;
        const rect = vp.getBoundingClientRect();
        zoomAround(app.scale / 1.2, rect.width / 2, rect.height / 2);
      },
    },

    // Mode & View
    {
      id: 'mode-design',
      title: 'Switch to Design Mode',
      subtitle: 'Authoring mode with stencil palette and properties',
      category: 'Mode & View',
      keywords: ['design', 'edit', 'draft', 'author'],
      run: () => {
        const radio = document.querySelector<HTMLInputElement>('input[name="workspace-mode"][value="design"]');
        if (radio) {
          radio.checked = true;
          radio.dispatchEvent(new Event('change'));
        }
      },
    },
    {
      id: 'mode-data',
      title: 'Switch to Data View Mode',
      subtitle: 'Interactive live telemetry streams and trace',
      category: 'Mode & View',
      keywords: ['data', 'telemetry', 'trace', 'simulation', 'stream'],
      run: () => {
        const radio = document.querySelector<HTMLInputElement>('input[name="workspace-mode"][value="data"]');
        if (radio) {
          radio.checked = true;
          radio.dispatchEvent(new Event('change'));
        }
      },
    },
    {
      id: 'mode-presentation',
      title: 'Toggle Presentation Mode',
      subtitle: 'Clean fullscreen canvas with guided node tour',
      category: 'Mode & View',
      shortcut: 'P',
      keywords: ['presentation', 'present', 'tour', 'clean', 'fullscreen', 'slides'],
      run: () => {
        togglePresentation(app.doc);
      },
    },
    {
      id: 'toggle-palette',
      title: 'Toggle Component Palette',
      subtitle: 'Collapse or expand left stencil sidebar',
      category: 'Mode & View',
      shortcut: '[',
      keywords: ['sidebar', 'palette', 'stencils', 'left', 'hide', 'show', 'collapse'],
      run: () => {
        responsiveToolbar.togglePalette();
      },
    },
    {
      id: 'toggle-inspector',
      title: 'Toggle Properties Inspector',
      subtitle: 'Collapse or expand right properties panel',
      category: 'Mode & View',
      shortcut: ']',
      keywords: ['inspector', 'properties', 'telemetry', 'right', 'hide', 'show', 'collapse'],
      run: () => {
        responsiveToolbar.toggleInspector();
      },
    },
    {
      id: 'sim-toggle-play',
      title: 'Simulation: Play / Pause',
      subtitle: 'Toggle active packet flow playback',
      category: 'Mode & View',
      keywords: ['play', 'pause', 'simulation', 'step', 'playback'],
      run: () => {
        simulationPlayback.togglePlay();
      },
    },
    {
      id: 'sim-step-forward',
      title: 'Simulation: Step Forward',
      subtitle: 'Advance to the next packet hop',
      category: 'Mode & View',
      keywords: ['step', 'next', 'forward', 'simulation'],
      run: () => {
        simulationPlayback.stepForward();
      },
    },
    {
      id: 'sim-step-backward',
      title: 'Simulation: Step Backward',
      subtitle: 'Go back to previous packet hop',
      category: 'Mode & View',
      keywords: ['step', 'prev', 'back', 'simulation'],
      run: () => {
        simulationPlayback.stepBackward();
      },
    },
    {
      id: 'sim-toggle-loop',
      title: 'Simulation: Toggle Loop',
      subtitle: 'Repeat simulation packet scenario continuously',
      category: 'Mode & View',
      keywords: ['loop', 'repeat', 'continuous', 'simulation'],
      run: () => {
        const looping = simulationPlayback.toggleLoop();
        notify(looping ? 'Simulation loop enabled' : 'Simulation loop disabled');
      },
    },

    // Edit & History
    {
      id: 'edit-undo',
      title: 'Undo',
      subtitle: 'Revert last change',
      category: 'Edit & History',
      shortcut: `${mod}Z`,
      keywords: ['undo', 'revert', 'back'],
      run: performUndo,
    },
    {
      id: 'edit-redo',
      title: 'Redo',
      subtitle: 'Re-apply undone change',
      category: 'Edit & History',
      shortcut: isMac() ? '⌘⇧Z' : 'Ctrl+Y',
      keywords: ['redo', 'forward'],
      run: performRedo,
    },
    {
      id: 'edit-duplicate',
      title: 'Duplicate Selection',
      subtitle: 'Clone selected component(s)',
      category: 'Edit & History',
      shortcut: `${mod}D`,
      keywords: ['duplicate', 'copy', 'clone'],
      run: deps.duplicateSelected,
    },
    {
      id: 'edit-delete',
      title: 'Delete Selection',
      subtitle: 'Remove selected component(s) or wire',
      category: 'Edit & History',
      shortcut: 'Del',
      keywords: ['delete', 'remove', 'trash'],
      run: deps.deleteSelected,
    },
    {
      id: 'edit-lock',
      title: 'Lock / Unlock Selection',
      subtitle: 'Toggle lock to prevent moving or deleting',
      category: 'Edit & History',
      shortcut: `${mod}L`,
      keywords: ['lock', 'unlock', 'freeze', 'protect'],
      run: () => {
        pushHistory();
        const locked = toggleSelectionLock(app.doc, app.selection);
        renderAll(true);
        notify(locked ? 'Locked selection' : 'Unlocked selection');
      },
    },
    {
      id: 'edit-group',
      title: 'Group Components',
      subtitle: 'Group selected components to move together',
      category: 'Edit & History',
      shortcut: `${mod}G`,
      keywords: ['group', 'combine', 'cluster'],
      run: () => {
        if (canGroupSelection(app.selection)) {
          pushHistory();
          groupSelection(app.doc, app.selection);
          renderAll(true);
          notify('Grouped components');
        } else {
          notify('Select 2 or more components to group');
        }
      },
    },
    {
      id: 'edit-ungroup',
      title: 'Ungroup Components',
      subtitle: 'Separate grouped components',
      category: 'Edit & History',
      shortcut: isMac() ? '⌘⇧G' : 'Ctrl+Shift+G',
      keywords: ['ungroup', 'separate', 'break'],
      run: () => {
        pushHistory();
        const ungrouped = ungroupSelection(app.doc, app.selection);
        renderAll(true);
        notify(ungrouped ? 'Ungrouped components' : 'No group to ungroup');
      },
    },
    {
      id: 'edit-bring-to-front',
      title: 'Bring to Front',
      subtitle: 'Move selection to the topmost visual layer',
      category: 'Edit & History',
      shortcut: ']',
      keywords: ['front', 'top', 'layer', 'z-index', 'order'],
      run: () => {
        pushHistory();
        bringToFront(app.doc, app.selection);
        renderAll(true);
        notify('Brought to front');
      },
    },
    {
      id: 'edit-send-to-back',
      title: 'Send to Back',
      subtitle: 'Move selection to the bottom visual layer',
      category: 'Edit & History',
      shortcut: '[',
      keywords: ['back', 'bottom', 'layer', 'z-index', 'order'],
      run: () => {
        pushHistory();
        sendToBack(app.doc, app.selection);
        renderAll(true);
        notify('Sent to back');
      },
    },
    {
      id: 'edit-bring-forward',
      title: 'Bring Forward',
      subtitle: 'Move selection one layer up',
      category: 'Edit & History',
      shortcut: `${mod}]`,
      keywords: ['forward', 'up', 'layer', 'z-index'],
      run: () => {
        pushHistory();
        bringForward(app.doc, app.selection);
        renderAll(true);
        notify('Brought forward');
      },
    },
    {
      id: 'edit-send-backward',
      title: 'Send Backward',
      subtitle: 'Move selection one layer down',
      category: 'Edit & History',
      shortcut: `${mod}[`,
      keywords: ['backward', 'down', 'layer', 'z-index'],
      run: () => {
        pushHistory();
        sendBackward(app.doc, app.selection);
        renderAll(true);
        notify('Sent backward');
      },
    },
    {
      id: 'edit-select-all',
      title: 'Select All Components',
      category: 'Edit & History',
      shortcut: `${mod}A`,
      keywords: ['select', 'all'],
      run: () => {
        const next = {
          type: 'multi' as const,
          ids: app.doc.nodes.map((n) => n.id),
          zoneIds: app.doc.zones.map((z) => z.id),
          notesIds: app.doc.notesCards.map((c) => c.id),
        };
        applySelection(next);
      },
    },

    // Export & Sync
    {
      id: 'save-file',
      title: 'Save Blueprint to Disk',
      subtitle: 'Overwrite opened file or save .blueprint.json',
      category: 'Export & Sync',
      shortcut: `${mod}S`,
      keywords: ['save', 'disk', 'file', 'write', 'store'],
      run: () => {
        if (deps.saveFile) deps.saveFile();
      },
    },
    {
      id: 'save-file-as',
      title: 'Save Blueprint As…',
      subtitle: 'Save a new copy to disk with file picker',
      category: 'Export & Sync',
      shortcut: `${mod}⇧S`,
      keywords: ['save as', 'disk', 'file', 'copy'],
      run: () => {
        if (deps.saveFileAs) deps.saveFileAs();
      },
    },
    {
      id: 'open-file-disk',
      title: 'Open File from Disk',
      subtitle: 'Open .blueprint.json, .mmd or .md architecture file',
      category: 'Export & Sync',
      shortcut: `${mod}O`,
      keywords: ['open', 'load', 'import', 'disk', 'file'],
      run: () => {
        if (deps.openFile) deps.openFile();
      },
    },
    {
      id: 'open-export',
      title: 'Export Diagram Modal',
      subtitle: 'Download PNG, SVG, GIF, HTML or JSON',
      category: 'Export & Sync',
      keywords: ['export', 'download', 'png', 'svg', 'gif', 'html', 'json'],
      run: deps.openExportDialog,
    },
    {
      id: 'open-code',
      title: 'Mermaid (.mmd) & Blueprint Code Sync',
      subtitle: 'View, edit, or copy Mermaid flowchart code',
      category: 'Export & Sync',
      keywords: ['code', 'mermaid', 'markdown', 'blueprint', 'mmd'],
      run: deps.openCodeDialog,
    },
    {
      id: 'open-matrix',
      title: 'Open Architecture Specification Matrix',
      subtitle: 'Interface and protocol ledger table',
      category: 'Export & Sync',
      keywords: ['matrix', 'table', 'spec', 'ledger', 'protocol'],
      run: () => {
        renderMatrixTable();
        const dlg = document.getElementById('matrix-dialog') as HTMLDialogElement | null;
        dlg?.showModal();
      },
    },
    {
      id: 'load-showcase',
      title: 'Load Lumen Relay Showcase',
      subtitle: 'Pre-built harbor city architecture with live telemetry',
      category: 'Export & Sync',
      keywords: ['showcase', 'demo', 'example', 'lumen', 'sample'],
      run: deps.loadShowcase,
    },
    {
      id: 'open-templates',
      title: 'New Architecture / Starter Templates',
      subtitle: 'Browse 7 production starter blueprints or create a blank canvas',
      category: 'Templates',
      keywords: ['new', 'template', 'gallery', 'starter', 'blank', 'architecture'],
      run: () => {
        deps.openTemplateGallery ? deps.openTemplateGallery() : deps.loadShowcase();
      },
    },
    {
      id: 'copy-share-link',
      title: 'Copy Shareable Link',
      subtitle: 'Compress architecture into URL hash and copy to clipboard',
      category: 'Export & Sync',
      keywords: ['share', 'link', 'url', 'hash', 'copy', 'clipboard'],
      run: async () => {
        if (app.doc.nodes.length === 0) {
          notify('Canvas is empty — add components before sharing', { tone: 'error' });
          return;
        }
        try {
          const res = await createShareUrl(app.doc);
          await navigator.clipboard.writeText(res.url);
          notify('Copied shareable link to clipboard!');
        } catch {
          deps.openExportDialog();
        }
      },
    },

    // Preferences & Help
    {
      id: 'open-settings',
      title: 'Studio Preferences',
      subtitle: 'Dark / Light theme and grid snap settings',
      category: 'Preferences',
      keywords: ['settings', 'preferences', 'theme', 'dark', 'light', 'grid', 'snap'],
      run: deps.openSettingsDialog,
    },
    {
      id: 'open-shortcuts',
      title: 'Keyboard Shortcuts Cheat-Sheet',
      subtitle: 'View all keyboard and mouse shortcuts',
      category: 'Preferences',
      shortcut: '?',
      keywords: ['shortcuts', 'hotkeys', 'keys', 'help'],
      run: deps.openShortcutsDialog,
    },
  ];

  // Starter Templates
  for (const t of STARTER_TEMPLATES) {
    commands.push({
      id: `load-template-${t.id}`,
      title: `Load Template: ${t.title}`,
      subtitle: `${t.categoryLabel} · ${t.tag}`,
      category: 'Templates',
      keywords: ['template', 'starter', t.title, t.categoryLabel, t.tag],
      run: () => {
        if (deps.loadTemplateById) {
          deps.loadTemplateById(t.id);
        } else if (deps.openTemplateGallery) {
          deps.openTemplateGallery();
        }
      },
    });
  }

  // Dynamic: Jump to any Node on canvas
  for (const node of app.doc.nodes) {
    commands.push({
      id: `jump-node-${node.id}`,
      title: `Jump to: ${node.title}`,
      subtitle: node.subtitle ? `${node.kind.toUpperCase()} · ${node.subtitle}` : node.kind.toUpperCase(),
      category: 'Nodes',
      keywords: [node.title, node.subtitle, node.kind, node.eyebrow, node.id],
      run: () => {
        setSelection({ type: 'node', id: node.id });
        renderAll(false);
        fitSelection();
        notify(`Focused on "${node.title}"`);
      },
    });
  }

  // Dynamic: Run authored simulations
  for (const sim of app.doc.simulations) {
    commands.push({
      id: `run-sim-${sim.id}`,
      title: `Simulate Flow: ${sim.name}`,
      subtitle: `${sim.steps.length} packet steps`,
      category: 'Mode & View',
      keywords: ['simulate', 'simulation', 'packet', sim.name],
      run: () => {
        const radio = document.querySelector<HTMLInputElement>('input[name="workspace-mode"][value="data"]');
        if (radio) {
          radio.checked = true;
          radio.dispatchEvent(new Event('change'));
        }
        deps.runSimulationById(sim.id);
      },
    });
  }

  return commands;
}

export function filterPaletteCommands(commands: PaletteCommand[], query: string): PaletteCommand[] {
  const q = query.trim().toLowerCase();
  if (!q) return commands;

  const terms = q.split(/\s+/).filter(Boolean);

  return commands.filter((cmd) => {
    const haystacks = [
      cmd.title.toLowerCase(),
      cmd.category.toLowerCase(),
      cmd.subtitle?.toLowerCase() || '',
      ...(cmd.keywords?.map((k) => k.toLowerCase()) || []),
    ];

    return terms.every((term) => haystacks.some((h) => h.includes(term)));
  });
}

export function openCommandPalette(): void {
  const dlg = document.getElementById('command-palette-dialog') as HTMLDialogElement | null;
  const input = document.getElementById('cmd-palette-input') as HTMLInputElement | null;
  if (!dlg || !input || !savedDeps) return;

  input.value = '';
  activeIndex = 0;
  currentFiltered = getPaletteCommands(savedDeps);
  renderResults();
  dlg.showModal();
  input.focus();
}

export function closeCommandPalette(): void {
  const dlg = document.getElementById('command-palette-dialog') as HTMLDialogElement | null;
  if (dlg && dlg.open) {
    void closeDialogSmoothly(dlg);
  }
}

function renderResults(): void {
  const container = document.getElementById('cmd-palette-results');
  if (!container) return;

  container.replaceChildren();

  if (currentFiltered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'palette-empty-msg';
    empty.textContent = 'No matching commands or components found.';
    container.appendChild(empty);
    return;
  }

  currentFiltered.forEach((cmd, idx) => {
    const item = document.createElement('div');
    item.className = `palette-item${idx === activeIndex ? ' is-active' : ''}`;
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', String(idx === activeIndex));
    item.id = `palette-opt-${idx}`;

    const main = document.createElement('div');
    main.className = 'palette-item-main';

    const badge = document.createElement('span');
    badge.className = 'palette-item-badge';
    badge.textContent = cmd.category;

    const title = document.createElement('span');
    title.className = 'palette-item-title';
    title.textContent = cmd.title;

    main.append(badge, title);

    if (cmd.subtitle) {
      const sub = document.createElement('span');
      sub.className = 'palette-item-subtitle';
      sub.textContent = cmd.subtitle;
      main.appendChild(sub);
    }

    item.appendChild(main);

    if (cmd.shortcut) {
      const sc = document.createElement('span');
      sc.className = 'palette-item-shortcut';
      sc.innerHTML = `<kbd>${cmd.shortcut}</kbd>`;
      item.appendChild(sc);
    }

    item.addEventListener('mouseenter', () => {
      activeIndex = idx;
      updateActiveVisual();
    });

    item.addEventListener('click', () => {
      executeActiveCommand();
    });

    container.appendChild(item);
  });

  scrollActiveIntoView();
}

function updateActiveVisual(): void {
  const container = document.getElementById('cmd-palette-results');
  if (!container) return;

  const items = container.querySelectorAll('.palette-item');
  items.forEach((item, idx) => {
    const isActive = idx === activeIndex;
    item.classList.toggle('is-active', isActive);
    item.setAttribute('aria-selected', String(isActive));
  });
  scrollActiveIntoView();
}

function scrollActiveIntoView(): void {
  const activeEl = document.getElementById(`palette-opt-${activeIndex}`);
  activeEl?.scrollIntoView({ block: 'nearest' });
}

function executeActiveCommand(): void {
  const cmd = currentFiltered[activeIndex];
  if (!cmd) return;
  closeCommandPalette();
  cmd.run();
}

export function initCommandPalette(deps: PaletteDeps): void {
  savedDeps = deps;
  const dlg = document.getElementById('command-palette-dialog') as HTMLDialogElement | null;
  const input = document.getElementById('cmd-palette-input') as HTMLInputElement | null;
  const btnTrigger = document.getElementById('btn-open-palette') as HTMLButtonElement | null;

  btnTrigger?.addEventListener('click', openCommandPalette);

  if (!dlg || !input) return;

  input.addEventListener('input', () => {
    if (!savedDeps) return;
    const all = getPaletteCommands(savedDeps);
    currentFiltered = filterPaletteCommands(all, input.value);
    activeIndex = 0;
    renderResults();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (currentFiltered.length > 0) {
        activeIndex = (activeIndex + 1) % currentFiltered.length;
        updateActiveVisual();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (currentFiltered.length > 0) {
        activeIndex = (activeIndex - 1 + currentFiltered.length) % currentFiltered.length;
        updateActiveVisual();
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      executeActiveCommand();
    }
  });

  // Global Cmd+K / Ctrl+K shortcut
  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (dlg.open) {
        closeCommandPalette();
      } else {
        openCommandPalette();
      }
    }
  });
}
