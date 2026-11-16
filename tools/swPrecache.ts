import { createHash } from 'node:crypto';

/** Built files worth precaching: hashed JS/CSS chunks (including lazy chunks and workers) and the self-hosted fonts. */
export function selectPrecacheAssets(fileNames: string[]): string[] {
  return fileNames
    .filter((name) => /\.(js|css|woff2)$/.test(name))
    .map((name) => `./${name.replace(/^\.?\//, '')}`)
    .sort();
}

/** Stable id derived from the asset list; hashed file names change whenever content does. */
export function buildId(assets: string[]): string {
  return createHash('sha256').update(assets.join('\n')).digest('hex').slice(0, 8);
}

/** Fill the placeholders in public/sw.js. Throws if the template was changed and no longer matches. */
export function injectPrecache(swSource: string, assets: string[]): string {
  if (!swSource.includes('/*__PRECACHE__*/') || !swSource.includes('__BUILD_ID__')) {
    throw new Error('sw.js is missing the /*__PRECACHE__*/ or __BUILD_ID__ placeholder.');
  }
  return swSource
    .replace('/*__PRECACHE__*/', assets.map((a) => JSON.stringify(a)).join(', '))
    .replaceAll('__BUILD_ID__', buildId(assets));
}
