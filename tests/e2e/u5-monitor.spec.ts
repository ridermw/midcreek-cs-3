import { expect, test } from '@playwright/test'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { startMonitor } from '../../tools/u5-monitor/server.ts'

test('monitor filters, receipt arrival, inspector and offline snapshot work in Chrome', async ({ page }) => {
  const root = await mkdtemp(path.join(tmpdir(), 'cs3-monitor-browser-'))
  const run = path.join(root, '.artifacts/implementation/run')
  const source = path.join(root, '.artifacts/assets/u5-fixture/export/source-views')
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1ioAAAAASUVORK5CYII=', 'base64')
  const sha256 = createHash('sha256').update(png).digest('hex')
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  let monitor: Awaited<ReturnType<typeof startMonitor>> | undefined
  try {
    await mkdir(source, { recursive: true })
    await mkdir(run, { recursive: true })
    await writeFile(path.join(source, '../../authoring.json'), JSON.stringify({ complete: true, sourceSha256: 'fixture-source' }))
    await writeFile(path.join(run, 'u5-monitor-status.json'), JSON.stringify({
      schema: 1, updatedAt: '2026-09-11T14:11:00Z', currentCandidate: 'u5-fixture',
      activity: 'Synthetic UI test, not asset evidence', workstreams: [], assetNotes: {},
    }))
    monitor = await startMonitor({ repository: root, runDirectory: run, intervalMs: 100 })
    await page.goto(monitor.url)
    await expect(page.locator('#kind option')).toHaveCount(10)
    for (const kind of ['all', 'source', 'browser', 'comparison', 'study', 'hall', 'texture', 'reference', 'unverified', 'outputs']) {
      await page.selectOption('#kind', kind)
      await expect(page.locator('#kind')).toHaveValue(kind)
    }
    const file = path.join(source, 'new.png')
    await writeFile(file, png)
    await expect(page.locator('.image-card')).toContainText('Awaiting a capture receipt', { timeout: 15_000 })
    await writeFile(`${file}.capture.json`, JSON.stringify({
      kind: 'cs3-image-capture', renderer: 'source', sourceSha256: 'fixture-source',
      capture: { file: 'new.png', sha256, asset: 'technician-man', label: 'walk-quarter',
        clip: 'Walk', time: 0.25, profile: 'cs3-standard-v1' },
    }))
    await expect(page.locator('.image-card')).toContainText('walk-quarter', { timeout: 15_000 })
    await page.selectOption('#kind', 'source')
    await page.selectOption('#candidate', 'u5-fixture')
    await page.selectOption('#asset', 'technician-man')
    await page.locator('.image-button').click()
    await expect(page.locator('#inspector')).toBeVisible()
    await expect(page.locator('#details')).toContainText('Walk / 0.2500 s')
    await expect(page.locator('#details')).toContainText('Bytes match the capture receipt')
    await page.click('#close')
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`${monitor.url}?clawpilotTheme=dark`)
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.goto(pathToFileURL(monitor.snapshotFile).href)
    await expect(page.locator('#snapshot-notice')).toBeVisible()
    await expect(page.locator('#refresh')).toBeDisabled()
    expect(errors).toEqual([])
  } finally {
    await monitor?.close()
    await rm(root, { recursive: true, force: true })
  }
})
