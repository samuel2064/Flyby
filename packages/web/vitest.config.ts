import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: './test-output/coverage',
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 79,
        lines: 82,
      },
    },
  },
})
