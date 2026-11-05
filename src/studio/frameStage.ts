/**
 * Frames on the canvas (F-09): drawing them with the Frame tool, dragging a frame by its title strip (its contents
 * move with it), resizing, and the frame panel in the inspector. Loaded the first time a diagram has a frame or
 * the Frame tool is picked, so it stays out of the entry bundle. The geometry rules live in `core/frames.ts`.
 */
import '../styles/frames.css';
import type { DiagramFrame } from '../types';
import { FRAME_MIN_HEIGHT, FRAME_MIN_WIDTH } from '../core/frames';
import {
  adoptByGeometry,
  createFrame,
  duplicateFrame,
  frameAndDescendantIds,
  groupIntoFrame,
  moveFrame,
  notesInFrames,
  removeFrame,
} from '../core/frameOps';
import { expandStageToFit } from '../core/layout';
import { nextUid } from '../templates/presets';
import { announce } from './a11y';
import { framesLayer, stageWorld, viewport } from './dom';
import { commitRename, startTextEdit } from './inlineRename';
import { notify } from './toast';
import { makeField, makeTextInput, makeTonePicker, renderPropertyEditor } from './inspector';
import { scheduleMinimapPaint } from './minimap';
import { setPointerTool } from './pointerTool';
import { reconcileKeyed } from './reconcile';
import { applySelection, renderAll, renderNodes, renderNotesCards, renderWiresOnly } from './render';
import { app, beginHistoryGesture, endHistoryGesture, performUndo, pushHistory, pushHistoryNudge, screenToWorld, setSelection } from './state';

const area = (f: DiagramFrame) => f.width * f.height;
const snap = (v: number) => (app.snapToGrid ? Math.round(v / 16) * 16 : Math.round(v));
const liveFrame = (id: string) => app.doc.frames?.find((f) => f.id === id);

export function renderFrames(): void {
  // Who owns what follows from where things sit, so it is settled before anything is drawn.
  adoptByGeometry(app.doc);
  // Larger frames first, so a frame inside another is drawn on top of it.
  const frames = [...(app.doc.frames ?? [])].sort((a, b) => area(b) - area(a));
  reconcileKeyed(
    framesLayer,
    frames,
    (f) => f.id,
    (el) => (el as HTMLElement).dataset.frameId,
    () => 'frame',
    createFrameBox,
    (el, f) => paintFrame(el as HTMLElement, f),
  );
  scheduleMinimapPaint();
}

function paintFrame(box: HTMLElement, frame: DiagramFrame): void {
  box.style.setProperty('--fx', String(frame.x));
  box.style.setProperty('--fy', String(frame.y));
  box.style.setProperty('--fw', String(frame.width));
  box.style.setProperty('--fh', String(frame.height));
  box.dataset.tone = frame.tone;
  box.classList.toggle('is-locked', Boolean(frame.locked));
  box.classList.toggle('is-selected', app.selection.type === 'frame' && app.selection.id === frame.id);
  box.setAttribute('aria-label', `Frame ${frame.title}`);
  const bar = box.querySelector('.frame-title-bar');
  if (bar && bar.textContent !== frame.title) bar.textContent = frame.title;
}

/** After components were moved by hand: settle who is inside which frame, and redraw. */
export function settleFrames(): void {
  if (adoptByGeometry(app.doc)) renderFrames();
}

export function renameFrameInline(id: string): void {
  if (app.workspaceMode !== 'design') return;
  const frame = liveFrame(id);
  if (!frame) return;
  if (frame.locked) {
    notify(`"${frame.title}" is locked. Unlock it to rename.`);
    return;
  }
  const textEl = document.querySelector(`.frame-box[data-frame-id="${CSS.escape(id)}"] .frame-title-bar`);
  startTextEdit(textEl, frame.title, 'Frame name', (value) =>
    commitRename('Frame', () => {
      const live = liveFrame(id);
      if (live) live.title = value;
    }, value),
  );
}

/** Delete the selected frame. The components inside stay where they are. */
export function deleteFrame(id: string): void {
  const frame = liveFrame(id);
  if (!frame) return;
  if (frame.locked) {
    notify(`Cannot delete locked frame "${frame.title}"`);
    return;
  }
  pushHistory();
  removeFrame(app.doc, id);
  setSelection({ type: 'none' });
  renderAll(true);
  notify('Deleted frame. Its components stay.', { action: { label: 'Undo', onClick: () => performUndo() } });
}

/** Repaint the frames, the components they own, the notes and the wires after a gesture changed positions. */
function repaintAfterChange(): void {
  expandStageToFit(app.doc);
  renderFrames();
  renderNodes();
  renderNotesCards();
  renderWiresOnly();
}

/** Make a frame around the selected components and notes (Group into frame). */
export function groupSelectionToFrame(): void {
  const sel = app.selection;
  const nodeIds = sel.type === 'node' ? [sel.id] : sel.type === 'multi' ? sel.ids : [];
  const noteIds = sel.type === 'notes' ? [sel.id] : sel.type === 'multi' ? (sel.notesIds ?? []) : [];
  if (nodeIds.length + noteIds.length === 0) {
    notify('Select components to put in a frame');
    return;
  }
  pushHistory();
  const frame = groupIntoFrame(app.doc, nodeIds, noteIds, nextUid('frame'));
  if (!frame) return;
  expandStageToFit(app.doc);
  setSelection({ type: 'frame', id: frame.id });
  renderAll(true);
  announce(`Grouped into a frame. ${app.doc.nodes.filter((n) => n.frameId === frame.id).length} components inside it.`);
}

/** Duplicate the selected frame with everything in it. */
export function duplicateSelectedFrame(): void {
  const sel = app.selection;
  if (sel.type !== 'frame') return;
  pushHistory();
  const copy = duplicateFrame(app.doc, sel.id, nextUid);
  if (!copy) return;
  expandStageToFit(app.doc);
  setSelection({ type: 'frame', id: copy.id });
  renderAll(true);
  notify('Duplicated frame and what is in it');
}

/** Move a frame and what it holds from the keyboard. */
export function nudgeFrame(id: string, dx: number, dy: number): boolean {
  const frame = liveFrame(id);
  if (!frame) return false;
  if (frame.locked) {
    notify(`"${frame.title}" is locked. Unlock it to move it.`);
    return false;
  }
  pushHistoryNudge();
  moveFrame(app.doc, id, dx, dy);
  repaintAfterChange();
  announce(`Frame ${frame.title} moved`);
  return true;
}

function createFrameBox(frame: DiagramFrame): HTMLElement {
  const box = document.createElement('div');
  box.className = 'frame-box';
  box.dataset.frameId = frame.id;
  box.setAttribute('role', 'group');
  const bar = document.createElement('div');
  bar.className = 'frame-title-bar';
  const handle = document.createElement('div');
  handle.className = 'frame-resize-handle';
  handle.title = 'Drag to resize the frame';
  box.append(bar, handle);

  // --- Move: dragging the title strip carries the frame, the frames inside it and what they own.
  let start: { x: number; y: number } | null = null;
  let origins = new Map<string, [number, number]>();
  let moved = false;

  bar.addEventListener('pointerdown', (e) => {
    if (app.workspaceMode !== 'design' || e.button !== 0) return;
    const current = liveFrame(frame.id);
    if (!current) return;
    e.stopPropagation();
    applySelection({ type: 'frame', id: current.id }, { refreshIfUnchanged: true });
    if (current.locked) return;
    const ids = frameAndDescendantIds(app.doc.frames ?? [], current.id);
    origins = new Map();
    for (const f of app.doc.frames ?? []) if (ids.has(f.id)) origins.set(`f:${f.id}`, [f.x, f.y]);
    for (const n of app.doc.nodes) if (n.frameId && ids.has(n.frameId)) origins.set(`n:${n.id}`, [n.x, n.y]);
    for (const c of notesInFrames(app.doc, ids)) origins.set(`c:${c.id}`, [c.x, c.y]);
    start = { x: e.clientX, y: e.clientY };
    moved = false;
    bar.setPointerCapture(e.pointerId);
  });
  bar.addEventListener('pointermove', (e) => {
    if (!start || !bar.hasPointerCapture(e.pointerId)) return;
    const dx = (e.clientX - start.x) / app.scale;
    const dy = (e.clientY - start.y) / app.scale;
    if (!moved && Math.hypot(dx, dy) > 4) {
      beginHistoryGesture();
      pushHistory();
      moved = true;
      box.classList.add('dragging');
    }
    if (!moved) return;
    // Put everything back where the gesture began, then move it by the whole step, so rounding never builds up.
    for (const f of app.doc.frames ?? []) {
      const o = origins.get(`f:${f.id}`);
      if (o) [f.x, f.y] = o;
    }
    for (const n of app.doc.nodes) {
      const o = origins.get(`n:${n.id}`);
      if (o) [n.x, n.y] = o;
    }
    for (const c of app.doc.notesCards) {
      const o = origins.get(`c:${c.id}`);
      if (o) [c.x, c.y] = o;
    }
    moveFrame(app.doc, frame.id, snap(dx), snap(dy));
    repaintAfterChange();
  });
  const endMove = () => {
    const didMove = moved;
    start = null;
    moved = false;
    box.classList.remove('dragging');
    if (didMove) {
      endHistoryGesture();
      renderPropertyEditor();
    }
  };
  bar.addEventListener('pointerup', (e) => {
    e.stopPropagation();
    endMove();
  });
  bar.addEventListener('lostpointercapture', endMove);
  bar.addEventListener('dblclick', (e) => {
    if (app.workspaceMode !== 'design') return;
    e.stopPropagation();
    renameFrameInline(frame.id);
  });

  // --- Resize from the bottom-right handle.
  let resizeStart: { x: number; y: number; w: number; h: number } | null = null;
  let resized = false;
  handle.addEventListener('pointerdown', (e) => {
    if (app.workspaceMode !== 'design' || e.button !== 0) return;
    const current = liveFrame(frame.id);
    if (!current || current.locked) return;
    e.stopPropagation();
    applySelection({ type: 'frame', id: current.id });
    resizeStart = { x: e.clientX, y: e.clientY, w: current.width, h: current.height };
    resized = false;
    handle.setPointerCapture(e.pointerId);
  });
  handle.addEventListener('pointermove', (e) => {
    const current = liveFrame(frame.id);
    if (!resizeStart || !current || !handle.hasPointerCapture(e.pointerId)) return;
    const dw = (e.clientX - resizeStart.x) / app.scale;
    const dh = (e.clientY - resizeStart.y) / app.scale;
    if (!resized && Math.hypot(dw, dh) > 4) {
      beginHistoryGesture();
      pushHistory();
      resized = true;
    }
    if (!resized) return;
    current.width = Math.max(FRAME_MIN_WIDTH, snap(resizeStart.w + dw));
    current.height = Math.max(FRAME_MIN_HEIGHT, snap(resizeStart.h + dh));
    expandStageToFit(app.doc);
    renderFrames();
  });
  const endResize = () => {
    resizeStart = null;
    if (!resized) return;
    resized = false;
    // What now lies inside the frame belongs to it, and what no longer does is let go.
    adoptByGeometry(app.doc);
    endHistoryGesture();
    renderAll(true);
  };
  handle.addEventListener('pointerup', (e) => {
    e.stopPropagation();
    endResize();
  });
  handle.addEventListener('lostpointercapture', endResize);

  return box;
}

// ---------------------------------------------------------------------------
// The Frame tool: drag on the canvas to draw a frame; a plain click makes a default-sized one.
// ---------------------------------------------------------------------------
const DEFAULT_FRAME_WIDTH = 288;
const DEFAULT_FRAME_HEIGHT = 192;
let draft: HTMLElement | null = null;
let origin: [number, number] | null = null;
let drawPointer = -1;

function draftRect(to: [number, number]) {
  const [ox, oy] = origin ?? to;
  return { x: Math.min(ox, to[0]), y: Math.min(oy, to[1]), width: Math.abs(to[0] - ox), height: Math.abs(to[1] - oy) };
}

function endDraw(): void {
  draft?.remove();
  draft = null;
  origin = null;
  drawPointer = -1;
}

viewport.addEventListener(
  'pointerdown',
  (e) => {
    if (app.pointerTool !== 'frame' || app.workspaceMode !== 'design' || e.button !== 0) return;
    // Capture phase, ahead of whatever is under the pointer: drawing a frame around components must not move them.
    e.stopImmediatePropagation();
    e.preventDefault();
    origin = screenToWorld(e.clientX, e.clientY);
    drawPointer = e.pointerId;
    draft = document.createElement('div');
    draft.className = 'frame-draft';
    draft.style.setProperty('--fx', String(origin[0]));
    draft.style.setProperty('--fy', String(origin[1]));
    draft.style.setProperty('--fw', '0');
    draft.style.setProperty('--fh', '0');
    stageWorld.appendChild(draft);
    viewport.setPointerCapture(e.pointerId);
  },
  true,
);

viewport.addEventListener(
  'pointermove',
  (e) => {
    if (!origin || !draft || e.pointerId !== drawPointer) return;
    e.stopImmediatePropagation();
    const r = draftRect(screenToWorld(e.clientX, e.clientY));
    draft.style.setProperty('--fx', String(r.x));
    draft.style.setProperty('--fy', String(r.y));
    draft.style.setProperty('--fw', String(r.width));
    draft.style.setProperty('--fh', String(r.height));
  },
  true,
);

viewport.addEventListener(
  'pointerup',
  (e) => {
    if (!origin || e.pointerId !== drawPointer) return;
    e.stopImmediatePropagation();
    const end = screenToWorld(e.clientX, e.clientY);
    const dragged = draftRect(end);
    endDraw();
    const tiny = dragged.width < 24 && dragged.height < 24;
    const rect = tiny ? { x: dragged.x, y: dragged.y, width: DEFAULT_FRAME_WIDTH, height: DEFAULT_FRAME_HEIGHT } : dragged;
    pushHistory();
    const frame = createFrame(
      nextUid('frame'),
      { x: Math.max(16, snap(rect.x)), y: Math.max(24, snap(rect.y)), width: snap(rect.width), height: snap(rect.height) },
      'blue',
    );
    (app.doc.frames ??= []).push(frame);
    adoptByGeometry(app.doc);
    expandStageToFit(app.doc);
    setSelection({ type: 'frame', id: frame.id });
    setPointerTool('select');
    renderAll(true);
    announce(`Added a frame. ${app.doc.nodes.filter((n) => n.frameId === frame.id).length} components inside it.`);
  },
  true,
);

viewport.addEventListener('lostpointercapture', (e) => {
  if (e.pointerId === drawPointer) endDraw();
});

// ---------------------------------------------------------------------------
// Inspector panel
// ---------------------------------------------------------------------------
export function mountFrameFields(form: HTMLElement, id: string): void {
  const frame = liveFrame(id);
  if (!frame) return;
  form.append(
    makeField(
      'prop-frame-title',
      'Name',
      makeTextInput(frame.title, (v) => {
        frame.title = v;
        renderFrames();
      }),
    ),
    makeTonePicker('frame-tone', frame.tone, (tone) => {
      pushHistory();
      frame.tone = tone;
      renderFrames();
    }),
  );
  const hint = document.createElement('p');
  hint.className = 'prop-hint';
  hint.textContent = 'Components inside a frame move with it. Drag the title strip to move, the corner to resize.';
  form.appendChild(hint);
}
