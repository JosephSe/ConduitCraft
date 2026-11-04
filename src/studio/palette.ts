/** Command Palette (Cmd/Ctrl+K) controller. */
import { describeDiagram } from '../core/describe';
import { app, fullDocument, goUpLevel, openComponentLevel, fitSelection, fitToViewport, performRedo, performUndo, pushHistory, setSelection, zoomAround } from './state';
import { autoLayoutDocument, expandStageToFit } from '../core/layout';
import { createNodeFromStencil, createSwimlaneZone, createNotesCard } from '../templates/presets';
import { applySelection, renderAll, renderMatrixTable } from './render';
import { isMac, platformShortcut } from './commands';
import { notify } from './toast';
import { closeDialogSmoothly } from './dom';
import { STARTER_TEMPLATES } from './templatesGallery';
import { createShareUrl } from './shareLink';
import { togglePresentation } from './presentation';
import { setPointerTool } from './pointerTool';
import { simulationPlayback } from './simulationPlayback';
import { applyGroup, applyLockToggle, applyUngroup, applyZOrder } from './zOrderActions';
import { renameSelectionInline } from './inlineRename';
import { responsiveToolbar } from './responsiveToolbar';
import { toggleOutline } from './outlinePanel';
import { HELP_TOPICS } from '../core/helpTopics';
import { openHelp } from './helpPopover';
import { saveSnapshot } from './snapshots';
import { selectionOfStage } from './selection';
import { chaosLensActive, clearFailures, failedIds, toggleFailure } from './chaos';
import { getEffectiveSimulations } from '../core/layout';
import { refreshRunBar } from './runBar';

export interface PaletteCommand {
  id: string;
  title: string;
  category: 'Components' | 'Canvas & Layout' | 'Mode & View' | 'Edit & History' | 'Export & Sync' | 'Preferences' | 'Nodes' | 'Templates' | 'Help';
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
  openHome?: () => void;
  openSnapshotsDialog?: () => void;
  openLibrary?: () => void;
  newDiagram?: () => void;
  duplicateDiagram?: () => void;
  deleteDiagram?: () => void;
  exportAllDiagrams?: () => void;
  newBlueprint: () => void;
  importFile: () => void;
  toggleMotion: () => void;
  installApp: () => void;
}

let activeIndex = 0;
let currentFiltered: PaletteCommand[] = [];
let savedDeps: PaletteDeps | null = null;

/** The palette's dialog gives focus back as it closes, so wait for that before the popover takes focus. */
function showHelpAfterPalette(topicId: string): void {
  const dlg = document.getElementById('command-palette-dialog') as HTMLDialogElement | null;
  if (dlg?.open) dlg.addEventListener('close', () => openHelp(topicId), { once: true });
  else openHelp(topicId);
}

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
      subtitle: 'A note card for documentation',
      category: 'Components',
      keywords: ['notes', 'spec', 'checklist', 'card', 'annotation'],
      run: () => {
        pushHistory();
        const notes = createNotesCard(200, 200);
        app.doc.notesCards.push(notes);
        expandStageToFit(app.doc);
        setSelection({ type: 'notes', id: notes.id });
        renderAll(true);
        notify('Added Note');
      },
    },

    // Canvas & Layout
    {
      id: 'auto-layout',
      title: 'Auto-Layout Architecture',
      subtitle: 'Cleanly order components with crossing minimization',
      category: 'Canvas & Layout',
      keywords: ['arrange', 'layout', 'tidy', 'format', 'organise', 'organize'],
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
      keywords: ['fit', 'zoom', 'frame', 'centre', 'center'],
      run: fitToViewport,
    },
    {
      id: 'fit-selection',
      title: 'Fit Selection to Viewport',
      subtitle: 'Centre and zoom selected components',
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
      title: 'Switch to Design lens',
      shortcut: '1',
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
      title: 'Switch to Traffic lens',
      shortcut: '2',
      subtitle: 'Animated traffic, metrics and trace',
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
      id: 'mode-review',
      title: 'Switch to Review lens',
      shortcut: '3',
      subtitle: 'Insights: single points of failure, cycles, orphans and latency overruns',
      category: 'Mode & View',
      keywords: ['review', 'insights', 'lint', 'issues', 'spof', 'cycle', 'orphan', 'latency', 'budget'],
      run: () => {
        const radio = document.querySelector<HTMLInputElement>('input[name="workspace-mode"][value="review"]');
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
      id: 'toggle-outline',
      title: 'Toggle Text Outline',
      subtitle: 'A keyboard-friendly list of components, wires and levels',
      category: 'Mode & View',
      keywords: ['outline', 'text', 'tree', 'list', 'accessible', 'screen reader', 'navigate', 'keyboard'],
      run: toggleOutline,
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
      title: 'Scenario: Step Forward',
      subtitle: 'Advance to the next packet hop',
      category: 'Mode & View',
      keywords: ['step', 'next', 'forward', 'simulation'],
      run: () => {
        simulationPlayback.stepForward();
      },
    },
    {
      id: 'sim-step-backward',
      title: 'Scenario: Step Backward',
      subtitle: 'Go back to previous packet hop',
      category: 'Mode & View',
      keywords: ['step', 'prev', 'back', 'simulation'],
      run: () => {
        simulationPlayback.stepBackward();
      },
    },
    {
      id: 'sim-toggle-loop',
      title: 'Scenario: Toggle Loop',
      subtitle: 'Repeat the scenario continuously',
      category: 'Mode & View',
      keywords: ['loop', 'repeat', 'continuous', 'simulation'],
      run: () => {
        const looping = simulationPlayback.toggleLoop();
        notify(looping ? 'Scenario loop enabled' : 'Scenario loop disabled');
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
      id: 'edit-rename',
      title: 'Rename Selection',
      subtitle: 'Edit the name of the selected component, swimlane, note or wire label',
      category: 'Edit & History',
      shortcut: 'F2',
      keywords: ['rename', 'title', 'label', 'name', 'edit'],
      run: () => {
        if (!renameSelectionInline()) notify('Select a component, swimlane, note or wire to rename');
      },
    },
    {
      id: 'level-open',
      title: 'Open as a level',
      subtitle: 'Drill into the selected component and draw what is inside it',
      category: 'Mode & View',
      shortcut: `${mod}↵`,
      keywords: ['level', 'drill', 'nested', 'inside', 'zoom in', 'child', 'container', 'c4'],
      run: () => {
        const sel = app.selection;
        if (sel.type !== 'node') notify('Select a component to open as a level');
        else openComponentLevel(sel.id);
      },
    },
    {
      id: 'level-up',
      title: 'Go up a level',
      subtitle: 'Back to the diagram that contains this one',
      category: 'Mode & View',
      shortcut: `${mod}↑`,
      keywords: ['level', 'up', 'parent', 'back', 'zoom out', 'breadcrumb'],
      run: () => {
        if (!goUpLevel()) notify('Already at the top level');
      },
    },
    {
      id: 'chaos-fail',
      // Read each time the menu or palette opens, so a failed component offers to be restored instead.
      get title() {
        const sel = app.selection;
        return sel.type === 'node' && failedIds().includes(sel.id) ? 'Restore this component' : 'Fail this component';
      },
      subtitle: 'Traffic and Review lenses: see what becomes unreachable (press again to restore)',
      category: 'Mode & View',
      shortcut: 'X',
      keywords: ['chaos', 'fail', 'failure', 'outage', 'blast radius', 'break', 'kill'],
      run: () => {
        const sel = app.selection;
        if (!chaosLensActive()) notify('Switch to the Traffic (2) or Review (3) lens to fail a component');
        else if (sel.type !== 'node') notify('Select a component to fail');
        else toggleFailure(sel.id);
      },
    },
    {
      id: 'chaos-clear',
      title: 'Restore all failed components',
      subtitle: 'End the chaos run',
      category: 'Mode & View',
      keywords: ['chaos', 'reset', 'restore', 'recover', 'clear failures'],
      run: clearFailures,
    },
    {
      id: 'chaos-save-scenario',
      title: 'Save failures as a scenario',
      subtitle: 'Keep the current failures with the file as a named chaos scenario',
      category: 'Mode & View',
      keywords: ['chaos', 'save', 'scenario', 'failures'],
      run: () => {
        const ids = failedIds();
        if (ids.length === 0) {
          notify('Fail a component first');
          return;
        }
        const base = simulationPlayback.activeScenario ?? getEffectiveSimulations(app.doc)[0];
        if (!base || base.steps.length === 0) {
          notify('Add a scenario to run the failures against');
          return;
        }
        pushHistory();
        const copy = structuredClone(base);
        copy.id = `chaos-${Date.now().toString(36)}`;
        copy.name = `${base.name}: ${ids.map((id) => app.doc.nodes.find((n) => n.id === id)?.title || id).join(', ')} down`;
        copy.failures = ids;
        const existing = app.doc.simulations.length ? app.doc.simulations : structuredClone(getEffectiveSimulations(app.doc));
        app.doc.simulations = [...existing, copy];
        refreshRunBar();
        notify(`Saved scenario "${copy.name}"`);
      },
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
      run: () => applyLockToggle(),
    },
    {
      id: 'edit-group',
      title: 'Group Components',
      subtitle: 'Group selected components to move together',
      category: 'Edit & History',
      shortcut: `${mod}G`,
      keywords: ['group', 'combine', 'cluster'],
      run: () => applyGroup(),
    },
    {
      id: 'edit-ungroup',
      title: 'Ungroup Components',
      subtitle: 'Separate grouped components',
      category: 'Edit & History',
      shortcut: isMac() ? '⌘⇧G' : 'Ctrl+Shift+G',
      keywords: ['ungroup', 'separate', 'break'],
      run: () => applyUngroup(),
    },
    {
      id: 'edit-bring-to-front',
      title: 'Bring to Front',
      subtitle: 'Move selection to the topmost visual layer',
      category: 'Edit & History',
      shortcut: ']',
      keywords: ['front', 'top', 'layer', 'z-index', 'order'],
      run: () => {
        applyZOrder('front');
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
        applyZOrder('back');
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
        applyZOrder('forward');
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
        applyZOrder('backward');
      },
    },
    {
      id: 'edit-select-all',
      title: 'Select All Components',
      category: 'Edit & History',
      shortcut: `${mod}A`,
      keywords: ['select', 'all'],
      run: () => {
        const next = selectionOfStage({
          nodes: app.doc.nodes.map((n) => n.id),
          zones: app.doc.zones.map((z) => z.id),
          notes: app.doc.notesCards.map((c) => c.id),
        });
        if (next.type !== 'none') applySelection(next);
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
      shortcut: platformShortcut('⌘⇧S'),
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
      keywords: ['open', 'load', 'import', 'disk', 'file'],
      run: () => {
        if (deps.openFile) deps.openFile();
      },
    },
    {
      id: 'open-home',
      title: 'Home',
      subtitle: 'Recent diagrams, templates, and ways to open or import',
      category: 'Export & Sync',
      shortcut: `${mod}O`,
      keywords: ['home', 'recent', 'open', 'start', 'templates', 'diagrams'],
      run: () => deps.openHome?.(),
    },
    {
      id: 'open-library',
      title: 'Your Diagrams…',
      subtitle: 'Open, rename, copy or delete a saved diagram',
      category: 'Export & Sync',
      keywords: ['library', 'diagrams', 'open', 'switch', 'saved', 'recent', 'rename'],
      run: () => deps.openLibrary?.(),
    },
    {
      id: 'new-diagram',
      title: 'New Diagram',
      subtitle: 'Start an empty diagram and keep this one',
      category: 'Export & Sync',
      keywords: ['library', 'new', 'blank', 'another'],
      run: () => deps.newDiagram?.(),
    },
    {
      id: 'duplicate-diagram',
      title: 'Duplicate This Diagram',
      subtitle: 'Save a copy of the open diagram and open it',
      category: 'Export & Sync',
      keywords: ['library', 'copy', 'clone', 'duplicate'],
      run: () => deps.duplicateDiagram?.(),
    },
    {
      id: 'delete-diagram',
      title: 'Delete This Diagram',
      subtitle: 'Remove the open diagram from your saved diagrams (you can undo for 10 seconds)',
      category: 'Export & Sync',
      keywords: ['library', 'delete', 'remove', 'trash'],
      run: () => deps.deleteDiagram?.(),
    },
    {
      id: 'export-all-diagrams',
      title: 'Export All Diagrams (.zip)',
      subtitle: 'Download every saved diagram as Blueprint files in one zip',
      category: 'Export & Sync',
      keywords: ['library', 'export', 'backup', 'zip', 'all'],
      run: () => deps.exportAllDiagrams?.(),
    },
    {
      id: 'open-snapshots',
      title: 'Version Snapshots & Architecture Diff',
      subtitle: 'Browse snapshots and compare them with the current diagram',
      category: 'Export & Sync',
      keywords: ['snapshots', 'diff', 'compare', 'history', 'version', 'milestone'],
      run: () => {
        if (deps.openSnapshotsDialog) deps.openSnapshotsDialog();
      },
    },
    {
      id: 'take-snapshot',
      title: 'Take Snapshot',
      subtitle: 'Save a named checkpoint of the current diagram state',
      category: 'Export & Sync',
      keywords: ['snapshot', 'save', 'checkpoint', 'milestone', 'record'],
      run: () => {
        const snap = saveSnapshot(
          `Snapshot ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
          fullDocument()
        );
        notify(`Recorded snapshot "${snap.name}"`);
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
      title: 'Blueprint File & Mermaid Import',
      subtitle: 'View the Blueprint file, or paste Mermaid to import it',
      category: 'Export & Sync',
      keywords: ['code', 'mermaid', 'paste', 'import', 'markdown', 'blueprint', 'mmd'],
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
      subtitle: 'Pre-built harbor city architecture with animated traffic',
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
      id: 'copy-as-text',
      title: 'Copy as text',
      subtitle: 'A written description of this diagram, for design docs and pull requests',
      category: 'Export & Sync',
      keywords: ['text', 'describe', 'description', 'outline', 'alt', 'accessible', 'copy', 'clipboard'],
      run: async () => {
        if (app.doc.nodes.length === 0) {
          notify('Canvas is empty. Add components before copying a description', { tone: 'error' });
          return;
        }
        try {
          await navigator.clipboard.writeText(describeDiagram(fullDocument()));
          notify('Copied the description as text');
        } catch {
          notify('Could not copy to the clipboard', { tone: 'error' });
        }
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
          const res = await createShareUrl(fullDocument());
          if (res.isLarge) {
            // Too long for many apps: the Share dialog makes the file the main action and offers to drop images.
            notify(`That link is ${(res.url.length / 1024).toFixed(1)} KB, too long for many apps. Download the file instead.`);
            deps.openExportDialog();
            return;
          }
          await navigator.clipboard.writeText(res.url);
          notify('Copied the link. Anyone with it can see the whole diagram; nothing is uploaded.');
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

    // Header controls that the redesigned top bar no longer shows: each stays one palette entry away.
    {
      id: 'new-canvas',
      title: 'New Blueprint…',
      subtitle: 'Start a blank canvas or pick a template',
      category: 'Export & Sync',
      keywords: ['new', 'blank', 'canvas', 'clear'],
      run: deps.newBlueprint,
    },
    {
      id: 'import-file',
      title: 'Import File…',
      subtitle: 'Load a .mmd, .md or .json diagram',
      category: 'Export & Sync',
      keywords: ['import', 'mermaid', 'json', 'markdown'],
      run: deps.importFile,
    },
    {
      id: 'open-insert',
      title: 'Insert Component…',
      subtitle: 'Open the component list',
      category: 'Components',
      shortcut: 'C',
      keywords: ['insert', 'add', 'component', 'stencil'],
      run: () => {
        responsiveToolbar.togglePalette(false);
        document.querySelector<HTMLElement>('#stencil-grid button')?.focus();
      },
    },
    {
      id: 'tool-select',
      title: 'Select Tool',
      subtitle: 'Click and drag to select and move',
      category: 'Canvas & Layout',
      keywords: ['select', 'pointer', 'tool', 'arrow'],
      run: () => setPointerTool('select'),
    },
    {
      id: 'tool-connect',
      title: 'Connect Tool',
      subtitle: 'Click two components to join them with a wire',
      category: 'Canvas & Layout',
      keywords: ['connect', 'wire', 'link', 'tool', 'edge'],
      run: () => setPointerTool('connect'),
    },
    {
      id: 'open-find-replace',
      title: 'Find and Replace',
      subtitle: 'Search titles, wire labels, notes and comments, and change them all at once',
      category: 'Canvas & Layout',
      keywords: ['find', 'replace', 'search', 'rename', 'bulk', 'all', 'text'],
      run: () => {
        void import('./findReplaceDialog').then((m) => m.openFindReplace());
      },
    },
    {
      id: 'tool-hand',
      title: 'Hand Tool',
      subtitle: 'Drag anywhere to pan the canvas',
      category: 'Canvas & Layout',
      keywords: ['hand', 'pan', 'move', 'scroll', 'tool', 'grab'],
      run: () => setPointerTool('hand'),
    },
    {
      id: 'tool-text',
      title: 'Text Tool',
      subtitle: 'Click the canvas to add a text label',
      category: 'Canvas & Layout',
      keywords: ['text', 'label', 'type', 'annotation', 'tool', 'caption'],
      run: () => setPointerTool('text'),
    },
    {
      id: 'wire-from-selection',
      title: 'Wire From Selection',
      subtitle: 'Start a wire from the selected component, then click its target',
      category: 'Canvas & Layout',
      keywords: ['wire', 'connect', 'from', 'link', 'edge'],
      run: () => {
        const sel = app.selection;
        if (sel.type !== 'node') {
          notify('Select a component to start a wire from');
          return;
        }
        const id = sel.id;
        setPointerTool('connect');
        app.connectSourceNodeId = id;
      },
    },
    {
      id: 'toggle-motion',
      title: 'Pause / Resume Wire Animation',
      subtitle: 'Stop or restart the flowing wires',
      category: 'Mode & View',
      keywords: ['pause', 'motion', 'animation', 'freeze'],
      run: deps.toggleMotion,
    },
    {
      id: 'install-app',
      title: 'Install ConduitCraft',
      subtitle: 'Add the app to your device (when your browser offers it)',
      category: 'Preferences',
      keywords: ['install', 'pwa', 'app', 'offline'],
      run: deps.installApp,
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

  // Help topics (R-10): "help: routing styles" finds the same text the ? buttons show.
  for (const topic of HELP_TOPICS) {
    commands.push({
      id: `help-${topic.id}`,
      title: `Help: ${topic.title}`,
      subtitle: topic.body.split(/(?<=[.!?])\s/)[0],
      category: 'Help',
      keywords: ['help', 'guide', 'docs', 'how', ...(topic.keywords ?? [])],
      run: () => showHelpAfterPalette(topic.id),
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

/** The palette command with this id, for other surfaces (context menu) that reuse the same actions. */
export function findPaletteCommand(id: string): PaletteCommand | undefined {
  return savedDeps ? getPaletteCommands(savedDeps).find((c) => c.id === id) : undefined;
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
