import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      // Only include files in source/
      include: ['source/**/*.ts', 'source/**/*.js'],
      // Exclude test files, type declarations, and vendor bundles
      exclude: [
        'soljson-*.js',
        '**/node_modules/**',
        '**/dist/**',
        '**/build/**',
        '**/*.d.ts',
        '**/test/**',
      ],
    },
  },
})
