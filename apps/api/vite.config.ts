import { defineConfig } from 'vite';

/**
 * Vite SSR build for the thin calc API server (RPE-40).
 *
 * - `ssr.entry`: bundles src/index.ts for Node.js.
 * - `ssr.noExternal: ['@rpe/engine']`: forces @rpe/engine source inline —
 *   Vite SSR externalises workspace deps by default; this overrides that.
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
  ssr: {
    noExternal: ['@rpe/engine'],
  },
  resolve: {
    conditions: ['import', 'default'],
  },
});
