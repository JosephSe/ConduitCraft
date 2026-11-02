import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { injectPrecache, selectPrecacheAssets } from './tools/swPrecache';

function inlineColorSchemeBoot(): Plugin {
  const bootPath = path.resolve('src/shared/colorSchemeBoot.js');
  return {
    name: 'inline-color-scheme-boot',
    transformIndexHtml(html) {
      const boot = fs.readFileSync(bootPath, 'utf8').trim();
      return html.replace('/*__COLOR_SCHEME_BOOT__*/', boot);
    },
  };
}

function precacheServiceWorker(): Plugin {
  let outDir = 'dist';
  const emitted: string[] = [];
  return {
    name: 'precache-service-worker',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    generateBundle(_options, bundle) {
      emitted.length = 0;
      emitted.push(...Object.keys(bundle));
    },
    writeBundle() {
      const swPath = path.join(outDir, 'sw.js');
      if (!fs.existsSync(swPath)) return;
      const source = fs.readFileSync(swPath, 'utf8');
      fs.writeFileSync(swPath, injectPrecache(source, selectPrecacheAssets(emitted)));
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [inlineColorSchemeBoot(), precacheServiceWorker()],
  cacheDir: path.join(os.tmpdir(), 'blueprint-studio-vite-cache'),
  publicDir: 'public',
  build: {
    emptyOutDir: true,
  },
  server: {
    port: 5180,
    strictPort: false,
  },
});
