import { defineConfig } from 'vite';

/**
 * Vite SSR build for the thin calc API server (RPE-40).
 *
 * - `ssr` entry: bundles src/index.ts for Node.js, inlining @rpe/engine source.
 * - Node built-ins (node:http, node:url, etc.) are automatically externalised.
 * - Output: dist/index.js (ESM, runnable with `node dist/index.js`).
 */
export default defineConfig({
  build: {
    ssr: 'src/index.ts',
    outDir: 'dist',
    target: 'node20',
    rollupOptions: {
      output: {
        format: 'esm',
        entryFileNames: 'index.js',
      },
    },
    sourcemap: true,
  },
  resolve: {
    conditions: ['import', 'default'],
  },
});
