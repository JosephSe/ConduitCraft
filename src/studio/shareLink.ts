/**
 * Shareable Link controller (URL hash compression & decompression)
 *
 * Encodes full diagram blueprints into URL hash using standard CompressionStream('deflate')
 * and base64url. Enables zero-backend, instant sharing across browsers.
 */
import type { DiagramDocument } from '../types';
import { parseBlueprintJson, serializeBlueprintJson } from '../exporter/blueprintJson';

export const SHARE_HASH_PREFIX = '#share=';
export const ALT_HASH_PREFIX = '#blueprint=';
export const LARGE_URL_WARNING_THRESHOLD = 8192; // 8 KB URL limit warning

/**
 * Strips embedded base64 data URLs from brand logo and node custom icons
 * to create a lightweight URL payload.
 */
export function stripDocImages(doc: DiagramDocument): DiagramDocument {
  return {
    ...doc,
    brand: {
      ...doc.brand,
      logo: '',
    },
    nodes: doc.nodes.map((node) => {
      if (!node.iconImage) return node;
      const copy = { ...node };
      delete copy.iconImage;
      return copy;
    }),
  };
}

/**
 * Compresses a UTF-8 text string into a URL-safe Base64URL string
 * using the browser's native CompressionStream('deflate').
 */
export async function compressStringToBase64Url(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
  const buffer = await new Response(stream).arrayBuffer();
  const compressed = new Uint8Array(buffer);

  let binary = '';
  for (let i = 0; i < compressed.length; i++) {
    binary += String.fromCharCode(compressed[i]);
  }
  const base64 = btoa(binary);

  // Convert to Base64URL format (RFC 4648 §5)
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Decompresses a Base64URL string back into the original UTF-8 text string
 * using DecompressionStream('deflate').
 */
export async function decompressBase64UrlToString(base64url: string): Promise<string> {
  // Restore base64 padding and standard alphabet
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
  return await new Response(stream).text();
}

export interface ShareUrlResult {
  url: string;
  hash: string;
  rawBytes: number;
  compressedBytes: number;
  isLarge: boolean;
}

/**
 * Generates a full shareable URL for a DiagramDocument.
 */
export async function createShareUrl(
  doc: DiagramDocument,
  options: { omitImages?: boolean; baseUrl?: string } = {},
): Promise<ShareUrlResult> {
  const targetDoc = options.omitImages ? stripDocImages(doc) : doc;
  const jsonText = serializeBlueprintJson(targetDoc);
  const rawBytes = new TextEncoder().encode(jsonText).length;

  const encoded = await compressStringToBase64Url(jsonText);
  const hash = `${SHARE_HASH_PREFIX}${encoded}`;

  let origin = '';
  let pathname = '';
  if (options.baseUrl) {
    const parsedUrl = new URL(options.baseUrl);
    origin = parsedUrl.origin;
    pathname = parsedUrl.pathname;
  } else if (typeof window !== 'undefined' && window.location) {
    origin = window.location.origin;
    pathname = window.location.pathname;
  }

  const url = `${origin}${pathname}${hash}`;
  const isLarge = url.length > LARGE_URL_WARNING_THRESHOLD;

  return {
    url,
    hash,
    rawBytes,
    compressedBytes: encoded.length,
    isLarge,
  };
}

/**
 * Checks a URL hash and decodes a DiagramDocument if present.
 */
export async function decodeSharedDiagramFromHash(hash: string): Promise<DiagramDocument | null> {
  if (!hash) return null;
  let payload = '';
  if (hash.startsWith(SHARE_HASH_PREFIX)) {
    payload = hash.slice(SHARE_HASH_PREFIX.length);
  } else if (hash.startsWith(ALT_HASH_PREFIX)) {
    payload = hash.slice(ALT_HASH_PREFIX.length);
  } else {
    return null;
  }

  if (!payload || payload.trim() === '') return null;

  try {
    const jsonString = await decompressBase64UrlToString(payload.trim());
    const result = parseBlueprintJson(jsonString);
    if (result.ok) {
      return result.doc;
    }
  } catch (err) {
    console.warn('Failed to decompress or parse shared blueprint link:', err);
  }
  return null;
}
