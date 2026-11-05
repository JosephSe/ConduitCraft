/**
 * Export every page of the file as a vector picture (D10): one `.svg` per page, in a zip. A lazy chunk, loaded when
 * the "All pages" card in the export dialog is used.
 */
import { createZip, uniqueZipNames } from '../core/zip';
import { pageList, viewOfPage } from '../core/pages';
import { expandStageToFit } from '../core/layout';
import { renderDiagramSvg } from '../exporter/diagramSvg';
import { currentScheme } from './stagePicture';
import { fullDocument } from './state';

/** The zip's bytes and a file name for it, from the whole file. */
export function buildPagesZip(slug: string): { bytes: Uint8Array; filename: string } {
  const whole = fullDocument();
  const scheme = currentScheme();
  const encoder = new TextEncoder();
  const names = uniqueZipNames(
    pageList(whole).map((page) => `${String(page.index + 1).padStart(2, '0')}-${page.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'page'}.svg`),
  );
  const entries = pageList(whole).map((page, i) => {
    const view = viewOfPage(whole, page.index);
    // Each picture describes its own page, not the whole file.
    delete view.pages;
    delete view.pageId;
    view.pageTitle = page.title;
    expandStageToFit(view);
    return { name: names[i], data: encoder.encode(renderDiagramSvg(view, undefined, undefined, scheme)) };
  });
  return { bytes: createZip(entries), filename: `${slug}-pages.zip` };
}

export function downloadPagesZip(slug: string): string {
  const { bytes, filename } = buildPagesZip(slug);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const url = URL.createObjectURL(new Blob([copy.buffer], { type: 'application/zip' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return filename;
}
