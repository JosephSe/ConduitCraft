/**
 * Starter Architecture Templates Gallery (preview SVG renderer + full catalog re-export).
 *
 * The catalog itself lives in `templatesCatalog.ts` so `diagramSvg` is only loaded when previews are rendered.
 */
import type { DiagramDocument } from '../types';
import { parseBlueprintJson } from '../exporter/blueprintJson';
import { renderDiagramSvg } from '../exporter/diagramSvg';

export * from './templatesCatalog';

/** The theme the thumbnails are drawn in: the page's, so a dark studio shows dark sheets. */
function previewScheme(): 'light' | 'dark' {
  if (typeof document === 'undefined') return 'light';
  const theme = document.documentElement.getAttribute('data-theme');
  if (theme === 'graphite' || theme === 'dark') return 'dark';
  if (theme === 'vellum' || theme === 'light') return 'light';
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Renders an inline vector SVG preview for a blueprint JSON or Document.
 */
export function renderTemplatePreviewSvg(source: string | DiagramDocument, scheme: 'light' | 'dark' = previewScheme()): string {
  let doc: DiagramDocument;
  if (typeof source === 'string') {
    const parsed = parseBlueprintJson(source);
    if (!parsed.ok) return '';
    doc = parsed.doc;
  } else {
    doc = source;
  }

  const rawSvg = renderDiagramSvg(doc, undefined, undefined, scheme);
  return rawSvg
    .replace(/<\?xml[^>]*\?>/g, '')
    .replace(/width="\d+"\s+height="\d+"/, 'width="100%" height="100%" preserveAspectRatio="xMidYMid meet"')
    // One-way wires get a hook for the hover effect (S9): the line draws itself once.
    .replace(/<path ([^>]*?)marker-end=/g, '<path class="tpl-wire" pathLength="100" $1marker-end=')
    .trim();
}
