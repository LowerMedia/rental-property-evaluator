/**
 * vite.frontend.config.ts — Frontend (view) script build for rpe/evaluator (RPE-36).
 *
 * Builds src/frontend.tsx → build/frontend.js + build/frontend.css
 *
 * Self-contained: bundles React, @rpe/ui, and @rpe/engine so the block has
 * no runtime dependency on WordPress's wp.element or any other WP package.
 * Tailwind scans @rpe/ui/src via style.css @source directive.
 *
 * IIFE format: script runs immediately when enqueued, no import() needed.
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [tailwindcss(), react()],
  build: {
    outDir: 'build',
    emptyOutDir: false, // editor already cleaned build/
    lib: {
      entry: resolve(__dirname, 'src/frontend.tsx'),
      formats: ['iife'],
      name: '__rpe_frontend_unused',
      fileName: () => 'frontend.js',
    },
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        // Only force CSS to frontend.css (matches block.json "viewStyle" declaration).
        // Other assets (fonts, images, sourcemaps) keep their original hashed names
        // to avoid filename collisions if additional assets are added later.
        assetFileNames: (assetInfo) =>
          assetInfo.name?.endsWith('.css') ? 'frontend[extname]' : '[name]-[hash][extname]',
      },
    },
  },
});
