import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    maxWorkers: 1,
    fileParallelism: false,
    testTimeout: 30_000,
  },
})
