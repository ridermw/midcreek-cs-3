import { defineConfig } from '@playwright/test'

const root = process.env.CS3_JOB_ROOT ?? '.artifacts/browser-release'

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'release.spec.ts',
  timeout: 45_000,
  workers: 1,
  fullyParallel: false,
  outputDir: `${root}/test-results`,
  reporter: [['list'], ['json', { outputFile: `${root}/playwright-results.json` }]],
  use: {
    channel: process.env.CI ? undefined : 'chrome',
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
})
