import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    passWithNoTests: true,
    include: [
      'packages/*/tests/**/*.test.ts',
      'packages/*/src/**/*.test.ts',
      'apps/*/tests/**/*.test.ts',
    ],
    coverage: {
      provider: 'v8',
      include: ['packages/engine/src/**'],
      thresholds: { lines: 80, functions: 80, branches: 80 },
    },
  },
});
