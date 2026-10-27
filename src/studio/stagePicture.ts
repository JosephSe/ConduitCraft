/** A picture of the canvas as it is drawn, not a simplified redraw. */
import { app } from './state';
import { stageWorld, workspace } from './dom';

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

/**
 * SVG of the live stage. Pass pixel width and height to rasterize sharper than
 * the stage's CSS pixels; the viewBox stays in stage coordinates.
 */
export function renderStagePictureSvg(pixelWidth?: number, pixelHeight?: number): string {
  const stageWidth = Math.max(1, Math.round(app.doc.stageWidth));
  const stageHeight = Math.max(1, Math.round(app.doc.stageHeight));
  const outWidth = pixelWidth ?? stageWidth;
  const outHeight = pixelHeight ?? stageHeight;

  const clone = stageWorld.cloneNode(true) as HTMLElement;
  const liveStreams = [...stageWorld.querySelectorAll<SVGElement>('.conduit-stream')];
  clone.querySelectorAll<SVGElement>('.conduit-stream').forEach((stream, index) => {
    const live = liveStreams[index];
    if (!live) return;
    stream.style.animation = 'none';
    stream.style.strokeDashoffset = getComputedStyle(live).strokeDashoffset;
  });
  clone.removeAttribute('id');
  clone.style.transform = 'none';
  clone.style.width = `${stageWidth}px`;
  clone.style.height = `${stageHeight}px`;

  const shell = document.createElement('section');
  shell.className = 'canvas-shell';
  shell.style.cssText = `position:relative;width:${stageWidth}px;height:${stageHeight}px;overflow:hidden`;
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
    `width:${stageWidth}px`,
    `height:${stageHeight}px`,
    `margin:0`,
    `color:${body.color}`,
    `font-family:${body.fontFamily}`,
    `font-size:${body.fontSize}`,
    `line-height:${body.lineHeight}`,
    `color-scheme:${rootStyle.colorScheme}`,
  ].join(';');
  root.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');

  const style = document.createElement('style');
  style.textContent = documentCss();
  root.append(style, shell);

  const serialized = new XMLSerializer().serializeToString(root);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${outWidth}" height="${outHeight}" viewBox="0 0 ${stageWidth} ${stageHeight}">
  <foreignObject x="0" y="0" width="${stageWidth}" height="${stageHeight}">${serialized}</foreignObject>
</svg>`;
}
