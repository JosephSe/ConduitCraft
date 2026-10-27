/** Studio minimap. Click or drag to pan. Not included in exported pages. */
import type { StreamTone } from '../types';
import { minimapCanvas, viewport } from './dom';
import { app, applyTransform, setMinimapPainter } from './state';
import {
  minimapMap,
  minimapToWorld,
  nodeRect,
  notesRect,
  panToCenterWorld,
  selectionWorldBounds,
  viewportWorldRect,
  worldToMinimap,
  zoneWorldBounds,
  type MinimapMap,
  type WorldRect,
} from './viewportFrame';

const MINIMAP_CSS_W = 168;
const MINIMAP_CSS_H = 96;

let bound = false;
let paintQueued = false;
let lastMap: MinimapMap | null = null;

export function scheduleMinimapPaint(): void {
  if (paintQueued) return;
  paintQueued = true;
  requestAnimationFrame(() => {
    paintQueued = false;
    renderMinimap();
  });
}

export function renderMinimap(): void {
  const canvas = minimapCanvas;
  if (!canvas) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = MINIMAP_CSS_W;
  const height = MINIMAP_CSS_H;
  const pixelW = Math.round(width * dpr);
  const pixelH = Math.round(height * dpr);
  if (canvas.width !== pixelW || canvas.height !== pixelH) {
    canvas.width = pixelW;
    canvas.height = pixelH;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const styles = getComputedStyle(document.documentElement);
  const color = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;
  const ink = color('--wl-ink-muted', '#596b87');
  const border = color('--wl-border-ui', '#b6c5db');
  const blue = color('--wl-blue', '#1d4ed8');
  const canvasTone = color('--wl-canvas', '#f8fafc');
  const tones: Record<StreamTone, string> = {
    blue,
    emerald: color('--wl-emerald', '#047857'),
    rose: color('--wl-rose', '#be123c'),
    violet: color('--wl-violet', '#5b21b6'),
    amber: color('--wl-amber', '#b45309'),
  };

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const map = minimapMap(app.doc.stageWidth, app.doc.stageHeight, width, height);
  lastMap = map;
  const [stageX, stageY] = worldToMinimap(map, 0, 0);
  const [stageRight, stageBottom] = worldToMinimap(map, app.doc.stageWidth, app.doc.stageHeight);
  ctx.fillStyle = canvasTone;
  ctx.fillRect(stageX, stageY, stageRight - stageX, stageBottom - stageY);
  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  ctx.strokeRect(stageX + 0.5, stageY + 0.5, stageRight - stageX - 1, stageBottom - stageY - 1);

  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = ink;
  for (const zone of app.doc.zones) {
    fillWorld(ctx, map, zoneWorldBounds(zone, app.doc.stageHeight, app.doc.nodes));
  }
  ctx.restore();

  ctx.strokeStyle = ink;
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 2]);
  for (const card of app.doc.notesCards) {
    strokeWorld(ctx, map, notesRect(card));
  }
  ctx.setLineDash([]);

  for (const node of app.doc.nodes) {
    ctx.fillStyle = tones[node.accent] || blue;
    fillWorld(ctx, map, nodeRect(node));
  }

  if (app.selection.type !== 'none') {
    const selected = selectionWorldBounds(app.doc, app.selection);
    if (selected) {
      ctx.strokeStyle = blue;
      ctx.lineWidth = 1.5;
      strokeWorld(ctx, map, selected);
    }
  }

  const viewRect = viewport.getBoundingClientRect();
  const visible = viewportWorldRect(viewRect.width, viewRect.height, app.panX, app.panY, app.scale);
  ctx.strokeStyle = blue;
  ctx.lineWidth = 1.25;
  ctx.globalAlpha = 1;
  strokeWorld(ctx, map, visible);
}

function fillWorld(ctx: CanvasRenderingContext2D, map: MinimapMap, rect: WorldRect): void {
  const [x, y, w, h] = worldSize(map, rect);
  ctx.fillRect(x, y, w, h);
}

function strokeWorld(ctx: CanvasRenderingContext2D, map: MinimapMap, rect: WorldRect): void {
  const [x, y, w, h] = worldSize(map, rect);
  ctx.strokeRect(x + 0.5, y + 0.5, Math.max(0, w - 1), Math.max(0, h - 1));
}

function worldSize(map: MinimapMap, rect: WorldRect): [number, number, number, number] {
  const [x, y] = worldToMinimap(map, rect.x, rect.y);
  const [right, bottom] = worldToMinimap(map, rect.x + rect.width, rect.y + rect.height);
  return [x, y, Math.max(1.5, right - x), Math.max(1.5, bottom - y)];
}

function panMinimapPoint(clientX: number, clientY: number): void {
  const canvas = minimapCanvas;
  if (!canvas || !lastMap) return;
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;
  const px = ((clientX - rect.left) / rect.width) * MINIMAP_CSS_W;
  const py = ((clientY - rect.top) / rect.height) * MINIMAP_CSS_H;
  const [worldX, worldY] = minimapToWorld(lastMap, px, py);
  const view = viewport.getBoundingClientRect();
  const next = panToCenterWorld(worldX, worldY, view.width, view.height, app.scale);
  app.panX = next.panX;
  app.panY = next.panY;
  applyTransform();
}

export function bindMinimap(): void {
  setMinimapPainter(scheduleMinimapPaint);
  scheduleMinimapPaint();
  const canvas = minimapCanvas;
  if (!canvas || bound) return;
  bound = true;

  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    canvas.setPointerCapture(event.pointerId);
    panMinimapPoint(event.clientX, event.clientY);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!canvas.hasPointerCapture(event.pointerId)) return;
    panMinimapPoint(event.clientX, event.clientY);
  });

  for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="theme-choice"]')) {
    radio.addEventListener('change', () => scheduleMinimapPaint());
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => scheduleMinimapPaint());
}
