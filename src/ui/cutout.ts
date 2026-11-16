/**
 * A component's cut-out (7.1): its own outline, 38 by 30, drawn from the canvas plates.
 * The dock (S3) hosts the slot. The palette and the rail already use this drawing.
 */
import { getNodeDimensions } from '../core/layout';
import {
  cylinderPlate,
  drawnShape,
  nodeShapePlate,
  pipePlate,
  queueDrawsPipe,
  storeDrawsBucket,
  storeDrawsCylinder,
} from '../core/nodeStyle';
import { streamLanes } from '../core/queues';
import type { NodeIconName, NodeKind, NodeQueue, NodeShape } from '../types';
import { ACTOR_FIGURE, nodeIconShapes } from './icons';

export const CUTOUT_WIDTH = 38;
export const CUTOUT_HEIGHT = 30;
export const CUTOUT_STROKE = 1.4;

/** Card corner on the sheet is 1.1rem. A rounded card is 1.75rem. */
const CARD_RADIUS = 17.6;
const ROUNDED_RADIUS = 28;

export interface CutoutSource {
  kind: string;
  /** Card kinds are all one outline, so the kind's icon is drawn small inside it (Q10). */
  icon?: NodeIconName;
  shape?: NodeShape;
  queue?: NodeQueue;
  /** Stencils keep the queue on `preset`, the same place `createNodeFromStencil` reads it. */
  preset?: { queue?: NodeQueue };
  width?: number;
  height?: number;
  direction?: 'LR' | 'TD';
}

export interface CutoutDrawing {
  /** figure, cylinder, bucket, pipe, or the plate name. Cards stay `card`. */
  kind: string;
  width: number;
  height: number;
  /** Elements in the source box, before they are fitted into 38×30. */
  inner: string;
}

function nodeBox(source: CutoutSource): { width: number; height: number } {
  if (source.width && source.height) return { width: source.width, height: source.height };
  return getNodeDimensions(source.kind as NodeKind);
}

function queueOf(source: CutoutSource): NodeQueue | undefined {
  return source.queue ?? source.preset?.queue;
}

/** The outline a stencil or a node is drawn with, in the canvas's own coordinates. */
export function cutoutDrawing(source: CutoutSource): CutoutDrawing {
  const shape = source.shape;
  const direction = source.direction ?? 'LR';

  if (source.kind === 'actor') {
    const { width, height, head, body } = ACTOR_FIGURE;
    return {
      kind: 'figure',
      width,
      height,
      inner: `<circle cx="${head.cx}" cy="${head.cy}" r="${head.r}"/><path d="${body}"/>`,
    };
  }

  const box = nodeBox(source);

  if (storeDrawsCylinder(source.kind, shape)) {
    const bucket = storeDrawsBucket(source.kind, shape);
    const plate = cylinderPlate(box.width, box.height, bucket);
    return {
      kind: bucket ? 'bucket' : 'cylinder',
      width: plate.width,
      height: plate.height,
      inner: `<path d="${plate.body}"/><ellipse class="cutout-mark" cx="${plate.cx}" cy="${plate.cy}" rx="${plate.rx}" ry="${plate.ry}"/>`,
    };
  }

  if (queueDrawsPipe(source.kind, shape)) {
    const plate = pipePlate(box.width, box.height, streamLanes({ kind: source.kind, queue: queueOf(source) }));
    const lanes = plate.lanes ? `<path class="cutout-mark" d="${plate.lanes}"/>` : '';
    return {
      kind: 'pipe',
      width: plate.width,
      height: plate.height,
      inner: `<path d="${plate.body}"/>${lanes}<ellipse class="cutout-mark" cx="${plate.cx}" cy="${plate.cy}" rx="${plate.rx}" ry="${plate.ry}"/>`,
    };
  }

  // A default load balancer is a trapezoid. drawnShape is what the sheet uses.
  const drawn = drawnShape(source.kind, shape);
  const plate = nodeShapePlate(drawn, box.width, box.height, direction);
  if (plate) {
    const inner =
      plate.kind === 'ellipse'
        ? `<ellipse cx="${plate.cx}" cy="${plate.cy}" rx="${plate.rx}" ry="${plate.ry}"/>`
        : `<polygon points="${plate.points}"/>`;
    return { kind: drawn ?? 'plate', width: box.width, height: box.height, inner };
  }

  const rx = shape === 'pill' ? Math.min(box.width, box.height) / 2 : shape === 'rounded' ? ROUNDED_RADIUS : CARD_RADIUS;
  return {
    kind: 'card',
    width: box.width,
    height: box.height,
    inner: `<rect x="0" y="0" width="${box.width}" height="${box.height}" rx="${rx}"/>`,
  };
}

function fit(width: number, height: number): string {
  const scale = Math.min((CUTOUT_WIDTH - 2) / width, (CUTOUT_HEIGHT - 2) / height);
  const ox = (CUTOUT_WIDTH - width * scale) / 2;
  const oy = (CUTOUT_HEIGHT - height * scale) / 2;
  const n = (value: number) => String(Math.round(value * 1000) / 1000);
  return `translate(${n(ox)} ${n(oy)}) scale(${n(scale)})`;
}

export interface CutoutOptions {
  /** The copy under the pointer, at the component's own size. The slot it left stays an outline. */
  carried?: boolean;
}

/** An SVG of the outline. Carried copies use the source box so they can grow without stretching. */
export function renderCutoutMarkup(source: CutoutSource, options: CutoutOptions = {}): string {
  const drawing = cutoutDrawing(source);
  const paint = `fill="none" stroke="var(--cc-ink-3)" stroke-width="${CUTOUT_STROKE}" stroke-linecap="round" stroke-linejoin="round"`;
  if (options.carried) {
    return `<svg class="cutout is-carried" data-cutout="${drawing.kind}" viewBox="0 0 ${drawing.width} ${drawing.height}" width="100%" height="100%" ${paint} preserveAspectRatio="xMidYMid meet" overflow="visible" aria-hidden="true" focusable="false">${drawing.inner}</svg>`;
  }
  // A 12 px kind mark, centred. fill-opacity is inherited and the reach rules only set `fill`, so the mark stays unfilled.
  const mark =
    drawing.kind === 'card' && source.icon
      ? `<g class="cutout-icon" fill-opacity="0" stroke-width="2.6" transform="translate(${(CUTOUT_WIDTH - 12) / 2} ${(CUTOUT_HEIGHT - 12) / 2}) scale(0.5)">${nodeIconShapes(source.icon)}</g>`
      : '';
  return `<svg class="cutout" data-cutout="${drawing.kind}" viewBox="0 0 ${CUTOUT_WIDTH} ${CUTOUT_HEIGHT}" width="${CUTOUT_WIDTH}" height="${CUTOUT_HEIGHT}" ${paint} overflow="visible" aria-hidden="true" focusable="false"><g transform="${fit(drawing.width, drawing.height)}">${drawing.inner}</g>${mark}</svg>`;
}

/** True when this source has an outline. Every stencil does. */
export function hasCutout(source: CutoutSource): boolean {
  return cutoutDrawing(source).inner.length > 0;
}
