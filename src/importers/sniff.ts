/** Tiny checks used before an importer's own code is loaded, so they stay out of the lazy chunks. */

/** A draw.io file, by extension or by the first element in the text. */
export function looksLikeDrawio(fileName: string, text: string): boolean {
  if (/\.drawio$/i.test(fileName)) return true;
  const head = text.slice(0, 2000);
  return /<mxfile[\s>]/.test(head) || /<mxGraphModel[\s>]/.test(head);
}

/** An Excalidraw scene, by extension or by its `"type": "excalidraw"` marker near the top. */
export function looksLikeExcalidraw(fileName: string, text: string): boolean {
  if (/\.excalidraw$/i.test(fileName)) return true;
  return /"type"\s*:\s*"excalidraw/.test(text.slice(0, 1000));
}
