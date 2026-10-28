/** A picture of the canvas as it is drawn, not a simplified redraw. */
import type { StreamTone } from '../types';
import { TONE_CSS } from '../shared/tones';
import { app } from './state';
import { stageWorld, viewport, workspace } from './dom';

export interface StagePictureOptions {
  /** Steps animated wires. Omit to keep the dash where it is on screen. */
  dashOffset?: number;
  /** Crop to the canvas viewport, including the current pan and zoom. */
  currentView?: boolean;
  /** Components lit for one scenario hop. */
  activeNodes?: readonly string[];
  tone?: StreamTone;
  packetLabel?: string;
}

function collectCss(sheet: CSSStyleSheet, chunks: string[]): void {
  let rules: CSSRuleList;
  try {
    rules = sheet.cssRules;
  } catch {
    return;
  }
  for (const rule of rules) {
    if (rule instanceof CSSImportRule) {
      if (rule.styleSheet) collectCss(rule.styleSheet, chunks);
      continue;
    }
    chunks.push(rule.cssText);
  }
}

function documentCss(): string {
  const chunks: string[] = [];
  for (const sheet of document.styleSheets) collectCss(sheet, chunks);
  return chunks.join('\n');
}

function customProperties(style: CSSStyleDeclaration): string {
  const parts: string[] = [];
  for (const prop of style) {
    if (prop.startsWith('--')) parts.push(`${prop}:${style.getPropertyValue(prop)}`);
  }
  return parts.join(';');
}

function paintScenario(clone: HTMLElement, frame: StagePictureOptions): void {
  const activeNodes = frame.activeNodes ?? [];
  if (activeNodes.length === 0) return;
  const tone = frame.tone ?? 'emerald';
  const [accent, soft] = TONE_CSS[tone];
  const active = new Set(activeNodes);
  clone.querySelectorAll<HTMLElement>('.arch-node').forEach((node) => {
    if (!active.has(node.dataset.node ?? '')) {
      delete node.dataset.simActive;
      node.style.removeProperty('--sim-accent');
      node.style.removeProperty('--sim-accent-soft');
      return;
    }
    node.dataset.simActive = 'true';
    node.style.setProperty('--sim-accent', accent);
    node.style.setProperty('--sim-accent-soft', soft);
  });

  const anchor = app.doc.nodes.find((node) => node.id === activeNodes[0]);
  const packet = clone.querySelector<HTMLElement>('#sim-packet');
  if (!packet) return;
  if (!anchor) {
    packet.hidden = true;
    return;
  }
  packet.hidden = false;
  packet.dataset.tone = tone;
  const label = packet.querySelector('#sim-packet-label');
  if (label) label.textContent = frame.packetLabel || anchor.title;
  const dot = packet.querySelector<HTMLElement>('#sim-packet-dot');
  if (dot) dot.style.background = accent;
  packet.style.setProperty('--px', String(Math.round(anchor.x + anchor.width / 2)));
  packet.style.setProperty('--py', String(Math.round(anchor.y + anchor.height / 2 - 62)));
}

/**
 * SVG of the live stage. Pass pixel width and height to rasterize sharper than
 * the stage's CSS pixels; the viewBox stays in stage coordinates.
 * A dash offset steps animated wires for one GIF frame. Without it, the still
 * picture keeps the dash where it is on screen.
 */
export function renderStagePictureSvg(
  pixelWidth?: number,
  pixelHeight?: number,
  frame?: StagePictureOptions,
): string {
  const stageWidth = Math.max(1, Math.round(app.doc.stageWidth));
  const stageHeight = Math.max(1, Math.round(app.doc.stageHeight));
  const currentView = Boolean(frame?.currentView) && viewport.clientWidth > 0 && viewport.clientHeight > 0;
  const frameWidth = currentView ? Math.max(1, Math.round(viewport.clientWidth)) : stageWidth;
  const frameHeight = currentView ? Math.max(1, Math.round(viewport.clientHeight)) : stageHeight;
  const outWidth = pixelWidth ?? frameWidth;
  const outHeight = pixelHeight ?? frameHeight;

  const clone = stageWorld.cloneNode(true) as HTMLElement;
  const liveStreams = [...stageWorld.querySelectorAll<SVGElement>('.conduit-stream')];
  clone.querySelectorAll<SVGElement>('.conduit-stream').forEach((stream, index) => {
    const live = liveStreams[index];
    if (!live) return;
    const computed = getComputedStyle(live);
    const dashed = computed.strokeDasharray !== 'none' && computed.strokeDasharray !== '';
    stream.style.animation = 'none';
    if (frame?.dashOffset !== undefined && dashed) {
      stream.style.strokeDasharray = computed.strokeDasharray;
      stream.style.strokeDashoffset = `${frame.dashOffset}px`;
      return;
    }
    stream.style.strokeDashoffset = computed.strokeDashoffset;
  });
  clone.querySelectorAll<HTMLElement>('.align-guide, .marquee-box, #draft-wire').forEach((el) => {
    el.setAttribute('hidden', '');
  });
  if (frame) paintScenario(clone, frame);
  clone.removeAttribute('id');
  // The live stage uses CSS zoom. This picture keeps the previous scale transform.
  clone.style.removeProperty('zoom');
  if (currentView) {
    const scale = app.scale || 1;
    clone.style.transform = `translate(${app.panX}px, ${app.panY}px) scale(${scale})`;
  } else {
    clone.style.transform = 'none';
  }
  clone.style.width = `${stageWidth}px`;
  clone.style.height = `${stageHeight}px`;

  const shell = document.createElement('section');
  shell.className = 'canvas-shell';
  shell.style.cssText = `position:relative;width:${frameWidth}px;height:${frameHeight}px;overflow:hidden;background:transparent !important;background-image:none !important;box-shadow:none !important;`;
  shell.appendChild(clone);

  const root = document.createElement('div');
  root.className = 'workspace';
  for (const name of workspace.getAttributeNames()) {
    if (name.startsWith('data-')) root.setAttribute(name, workspace.getAttribute(name) ?? '');
  }
  const body = getComputedStyle(document.body);
  const rootStyle = getComputedStyle(document.documentElement);
  root.style.cssText = [
    customProperties(rootStyle),
    'display:block',
    `width:${frameWidth}px`,
    `height:${frameHeight}px`,
    `margin:0`,
    `color:${body.color}`,
    `font-family:${body.fontFamily}`,
    `font-size:${body.fontSize}`,
    `line-height:${body.lineHeight}`,
    `color-scheme:${rootStyle.colorScheme}`,
    'background:transparent !important',
    'background-color:transparent !important',
    'background-image:none !important',
    'box-shadow:none !important',
  ].join(';');
  root.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');

  const style = document.createElement('style');
  style.textContent = documentCss() + `
    .workspace,
    .canvas-shell,
    .canvas-viewport,
    .stage-world {
      background: transparent !important;
      background-color: transparent !important;
      background-image: none !important;
      box-shadow: none !important;
    }
  `;
  root.append(style, shell);

  const serialized = new XMLSerializer().serializeToString(root);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${outWidth}" height="${outHeight}" viewBox="0 0 ${frameWidth} ${frameHeight}">
  <foreignObject x="0" y="0" width="${frameWidth}" height="${frameHeight}">${serialized}</foreignObject>
</svg>`;
}
