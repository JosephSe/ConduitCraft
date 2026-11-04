/**
 * Decides which file importer a file belongs to (B9b). This module, the file-type checks and the studio side of every
 * importer load together as one lazy chunk, so the entry bundle holds a single `import()` instead of a check and a
 * wrapper per format. A new importer is added here and nowhere in the entry.
 */
import {
  looksLikeAsyncApi,
  looksLikeCompose,
  looksLikeDrawio,
  looksLikeExcalidraw,
  looksLikeKubernetes,
  looksLikeOpenApi,
} from '../importers/sniff';
import {
  importAsyncApiText,
  importComposeText,
  importDrawioText,
  importExcalidrawText,
  importKubernetesText,
  importOpenApiText,
} from './fileImports';

type Import = (text: string, title: string) => Promise<boolean>;

/** In order: the first format whose check matches takes the file. Blueprint JSON, Blueprint files and Mermaid match none. */
const ROUTES: Array<{ matches: (name: string, text: string) => boolean; run: Import; fallbackTitle: string }> = [
  { matches: looksLikeDrawio, run: importDrawioText, fallbackTitle: 'Imported draw.io' },
  { matches: looksLikeExcalidraw, run: importExcalidrawText, fallbackTitle: 'Imported Excalidraw' },
  { matches: looksLikeOpenApi, run: importOpenApiText, fallbackTitle: 'Imported API' },
  { matches: looksLikeAsyncApi, run: importAsyncApiText, fallbackTitle: 'Imported messaging API' },
  { matches: looksLikeKubernetes, run: importKubernetesText, fallbackTitle: 'Imported cluster' },
  { matches: looksLikeCompose, run: importComposeText, fallbackTitle: 'Imported Compose' },
];

/**
 * Start the import for a file one of the importers recognises, and return true. Return false for any other file, which
 * the caller reads as Blueprint JSON, a Blueprint file or Mermaid. The import itself carries on in the background.
 */
export function routeImportedFile(fileName: string, text: string, title: string | undefined): boolean {
  const route = ROUTES.find((r) => r.matches(fileName, text));
  if (!route) return false;
  void route.run(text, title ?? route.fallbackTitle);
  return true;
}
