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
    noExternal: ['@rpe/engine', '@rpe/rentcast', '@rpe/region-defaults', '@rpe/db', '@rpe/report', '@rpe/property'],
    // Native/N-API and driver packages must stay runtime requires —
    // rollup cannot ingest .node binaries (E11 entry wiring pulls
    // @rpe/db → argon2/better-sqlite3/pg into the graph)
    external: ['@node-rs/argon2', 'better-sqlite3', 'pg', 'better-auth', 'drizzle-orm'],
  },
  resolve: {
    conditions: ['import', 'default'],
  },
});
