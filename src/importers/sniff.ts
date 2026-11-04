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

/** An OpenAPI 3 description, as YAML or JSON, by its `openapi` line near the top. */
export function looksLikeOpenApi(_fileName: string, text: string): boolean {
  const head = text.slice(0, 3000);
  return /(^|[{,])\s*"?openapi"?\s*:\s*['"]?3/m.test(head);
}

/** A Docker Compose file, by name (`docker-compose.yml`, `compose.yaml`) or by a top-level `services:` section. */
export function looksLikeCompose(fileName: string, text: string): boolean {
  if (/(^|[\\/])(docker-)?compose[^\\/]*\.ya?ml$/i.test(fileName)) return true;
  if (!/\.ya?ml$/i.test(fileName)) return false;
  const head = text.slice(0, 6000);
  return /^services:/m.test(head) && !/^\s*"?openapi"?\s*:/m.test(head) && !/^apiVersion:/m.test(head);
}
