import { defineConfig } from '@playwright/test'

const runRoot = process.env.CS3_JOB_ROOT ?? process.env.CS3_RUN_ROOT ?? '.artifacts/browser'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45_000,
  workers: 1,
  fullyParallel: false,
  outputDir: `${runRoot}/test-results`,
  reporter: [['list'], ['json', { outputFile: `${runRoot}/playwright-results.json` }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4173/midcreek-cs-3/',
    channel: 'chrome',
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : {
    command: 'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173/midcreek-cs-3/',
    reuseExistingServer: false,
  },
})
