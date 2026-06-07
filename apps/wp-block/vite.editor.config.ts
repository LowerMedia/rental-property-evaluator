/**
 * vite.editor.config.ts — Editor script build for rpe/evaluator (RPE-36).
 *
 * Builds src/index.ts → build/index.js
 *
 * WordPress provides react, react-dom, and @wordpress/* packages as globals,
 * so they are all marked external and mapped to their WP runtime equivalents.
 * The output is a classic IIFE so it runs when enqueued by wp_enqueue_script.
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  // Classic JSX runtime: emits React.createElement() calls so the `react` →
  // `wp.element` global mapping works correctly at runtime. The automatic
  // runtime would introduce `react/jsx-runtime` imports which are NOT
  // externalized and would either fail or bundle React internals accidentally.
  plugins: [react({ jsxRuntime: 'classic' })],
  build: {
    outDir: 'build',
    emptyOutDir: true, // editor runs first, cleans build/
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['iife'],
      name: '__rpe_editor_unused',
      fileName: () => 'index.js',
    },
    rollupOptions: {
      external: ['react', 'react-dom', /^@wordpress\//],
      output: {
        globals: {
          react: 'wp.element',
          'react-dom': 'wp.element',
          '@wordpress/blocks': 'wp.blocks',
          '@wordpress/element': 'wp.element',
          '@wordpress/components': 'wp.components',
          '@wordpress/i18n': 'wp.i18n',
        },
        assetFileNames: '[name][extname]',
      },
    },
  },
});
