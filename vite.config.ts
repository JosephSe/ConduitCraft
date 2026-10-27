import os from 'node:os';
import path from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  cacheDir: path.join(os.tmpdir(), 'blueprint-studio-vite-cache'),
  publicDir: false,
  build: {
    emptyOutDir: false,
  },
  server: {
    port: 5180,
    strictPort: false,
  },
});
