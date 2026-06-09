import { defineConfig } from 'vite';

/**
 * Vite SSR build for the thin calc API server (RPE-40).
 *
 * - `ssr.entry`: bundles src/index.ts for Node.js.
 * - `ssr.noExternal`: forces all workspace packages inline. Vite already inlines
 *   linked (workspace) deps by default, but listing them keeps the behaviour explicit
 *   and safe if the packages are ever published/installed from a registry.
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
    noExternal: ['@rpe/engine', '@rpe/rentcast', '@rpe/region-defaults'],
  },
  resolve: {
    conditions: ['import', 'default'],
  },
});
