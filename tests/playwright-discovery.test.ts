import { execFile } from 'node:child_process'
import { readdir } from 'node:fs/promises'
import { promisify } from 'node:util'
import type { JSONReport } from '@playwright/test/reporter'
import { describe, expect, it } from 'vitest'

const exec = promisify(execFile)

async function discover(script: string) {
  const { stdout } = await exec('npm', ['run', '--silent', script, '--', '--list', '--reporter=json'], {
    timeout: 20_000,
  })
  const report: JSONReport = JSON.parse(stdout)
  expect(report.errors).toEqual([])
  return report.suites.map((suite) => suite.file).sort()
}

describe('browser suite discovery', () => {
  it('keeps every ordinary spec but excludes the Pages-only suite', async () => {
    const ordinary = (await readdir('tests/e2e'))
      .filter((file) => file.endsWith('.spec.ts') && file !== 'pages.spec.ts')
      .sort()
    expect(ordinary.length).toBeGreaterThan(0)
    expect(await discover('test:e2e')).toEqual(ordinary)
  })

  it('keeps the Pages command as the exclusive selector of the Pages suite', async () => {
    expect(await discover('test:pages:e2e')).toEqual(['pages.spec.ts'])
  })
})
