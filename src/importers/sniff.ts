/** Tiny checks used before an importer's own code is loaded, so they stay out of the lazy chunks. */

/** A draw.io file, by extension or by the first element in the text. */
export function looksLikeDrawio(fileName: string, text: string): boolean {
  if (/\.drawio$/i.test(fileName)) return true;
  const head = text.slice(0, 2000);
  return /<mxfile[\s>]/.test(head) || /<mxGraphModel[\s>]/.test(head);
}
