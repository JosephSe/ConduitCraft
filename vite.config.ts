import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';

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

export default defineConfig({
  base: './',
  plugins: [inlineColorSchemeBoot()],
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
