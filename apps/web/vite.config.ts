import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  server: {
    // E11 (RPE-96): cookie auth is same-origin by design — proxy /v1 to
    // the local API so sessions work in dev without credentialed CORS
    proxy: {
      '/v1': {
        target: process.env['RPE_API_PROXY'] ?? 'http://localhost:3001',
        changeOrigin: false,
      },
    },
  },
  plugins: [tailwindcss(), react()],
  build: {
    // Warn when any individual chunk exceeds 250 kB (gzip ~75 kB).
    // This acts as the perf regression gate — a PR that tips over it
    // needs a justification before landing.
    chunkSizeWarningLimit: 250,
    rollupOptions: {
      output: {
        // Split react + react-dom into a shared vendor chunk so the app
        // chunk stays small and the vendor chunk can be cached independently.
        manualChunks: {
          // Include all React sub-entrypoints so Rollup routes every import
          // (including react-dom/client used by main.tsx and the jsx runtime
          // used by the compiler transform) into the same vendor chunk.
          'vendor-react': ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'],
        },
      },
    },
  },
});
