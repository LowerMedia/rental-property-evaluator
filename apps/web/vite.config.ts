import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
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
          'vendor-react': ['react', 'react-dom'],
        },
      },
    },
  },
});
