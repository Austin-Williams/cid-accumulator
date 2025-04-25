import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      include: ['source/**/*.ts', 'source/**/*.js'],
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
