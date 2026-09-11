import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { createCatalog } from '../tools/u5-monitor/catalog.ts'
import * as catalogs from '../tools/u5-monitor/catalog.ts'
import { renderHtml, startMonitor } from '../tools/u5-monitor/server.ts'

const roots: string[] = []
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1ioAAAAASUVORK5CYII=', 'base64')
const digest = createHash('sha256').update(png).digest('hex')

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'cs3-monitor-'))
  roots.push(root)
  const run = path.join(root, '.artifacts/implementation/run')
  const source = path.join(root, '.artifacts/assets/u5-c3/export/source-views')
  await mkdir(source, { recursive: true })
  await mkdir(run, { recursive: true })
  const json = async (file: string, value: unknown) => {
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, JSON.stringify(value))
  }
  await json(path.join(source, '../../authoring.json'), { complete: true, sourceSha256: 'source-c3' })
  await json(path.join(source, '../export.json'), { complete: true, sourceSha256: 'source-c3', assets: [] })
  await json(path.join(run, 'u5-monitor-status.json'), {
    schema: 1, updatedAt: '2026-09-11T14:11:00Z', currentCandidate: 'u5-c3',
    activity: 'Reviewing prototypes', workstreams: [], assetNotes: {},
  })
  return { root, run, source, json, catalog: createCatalog({ repository: root, runDirectory: run }) }
}
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })

describe('U5 monitor receipt labels', () => {
  it('labels source images from receipts and never infers appearance acceptance from a passing check', async () => {
    const f = await fixture()
    await writeFile(path.join(f.source, 'misleading-cel-name.png'), png)
    await f.json(path.join(f.source, 'captures.json'), {
      kind: 'cs3-library-source-captures', complete: true, sourceSha256: 'source-c3',
      captures: [{ file: 'misleading-cel-name.png', sha256: digest, asset: 'technician-man',
        label: 'walk-quarter', clip: 'Walk', time: 0.25, profile: 'cs3-standard-v1' }],
    })
    await f.json(path.join(f.source, '../checks-pass.json'), {
      kind: 'cs3-library-checks', complete: true, source: 'source-c3',
      checks: [{ name: 'transport', pass: true }], captures: [],
    })
    const data = await f.catalog.refresh()
    expect(data.images).toHaveLength(1)
    expect(data.images[0]).toMatchObject({ kind: 'source', candidate: 'u5-c3', asset: 'technician-man',
      clip: 'Walk', time: 0.25, profile: 'cs3-standard-v1', integrity: 'matched' })
    expect(data.candidates[0]?.technical).toMatchObject({ passed: 1, failed: 0, complete: true })
    expect(data.candidates[0]?.appearance).toBe('Not accepted by this monitor')
  })

  it('discovers new files immediately as unverified, then adopts per-image metadata without guessing labels', async () => {
    const f = await fixture()
    expect((await f.catalog.refresh()).images).toHaveLength(0)
    const file = path.join(f.source, 'new.png')
    await writeFile(file, png)
    expect((await f.catalog.refresh()).images[0]).toMatchObject({ kind: 'unverified', integrity: 'unverified',
      asset: 'Unclassified', label: 'Awaiting a capture receipt' })
    await f.json(`${file}.capture.json`, {
      kind: 'cs3-image-capture', sourceSha256: 'source-c3', renderer: 'source',
      capture: { file: 'new.png', sha256: digest, asset: 'rack-standard', label: 'rest-45',
        clip: null, time: 0, profile: 'cs3-standard-v1' },
    })
    expect((await f.catalog.refresh()).images[0]).toMatchObject({ kind: 'source', integrity: 'matched',
      asset: 'rack-standard', batchComplete: false })
    await f.json(`${file}.capture.json`, {
      kind: 'cs3-image-capture', sourceSha256: 'source-c3', renderer: 'comparison',
      capture: { file: 'new.png', sha256: digest, asset: 'rack-standard', label: 'rest-45' },
    })
    expect((await f.catalog.refresh()).images[0]).toMatchObject({
      kind: 'comparison', batchComplete: false, note: 'Left: Blender source. Right: Three.js browser.',
    })
    const infrastructure = path.join(f.run, 'u5-monitor-browser')
    await mkdir(infrastructure)
    await writeFile(path.join(infrastructure, 'monitor-screenshot.png'), png)
    expect((await f.catalog.refresh()).images).toHaveLength(1)
  })

  it('flags modified image bytes and rejects receipt traversal and symlink escapes', async () => {
    const f = await fixture()
    await writeFile(path.join(f.source, 'changed.png'), png)
    await writeFile(path.join(f.root, 'outside.png'), png)
    await symlink(path.join(f.root, 'outside.png'), path.join(f.source, 'escape.png'))
    await f.json(path.join(f.source, 'captures.json'), {
      kind: 'cs3-library-source-captures', complete: true, sourceSha256: 'source-c3',
      captures: [
        { file: 'changed.png', sha256: 'wrong', asset: 'rack-standard', label: 'rest' },
        { file: '../../../../outside.png', sha256: digest, asset: 'rack-standard', label: 'escape' },
      ],
    })
    const data = await f.catalog.refresh()
    expect(data.images).toHaveLength(1)
    expect(data.images[0]?.integrity).toBe('mismatch')
    expect(data.issues.some(issue => issue.includes('CAPTURE_PATH'))).toBe(true)
    expect(f.catalog.media('not-registered')).toBeUndefined()
    expect(f.catalog.media(data.images[0]!.id)).toBe(path.join(f.source, 'changed.png'))
  })

  it('joins browser comparisons to their source metadata and identifies experimental hall captures', async () => {
    const f = await fixture()
    await writeFile(path.join(f.source, 'source.png'), png)
    await f.json(path.join(f.source, 'captures.json'), {
      kind: 'cs3-library-source-captures', complete: true, sourceSha256: 'source-c3',
      captures: [{ file: 'source.png', sha256: digest, asset: 'rack-standard', label: 'rest-225', time: 0 }],
    })
    await writeFile(path.join(f.source, '../pair.png'), png)
    await f.json(path.join(f.source, '../checks-1.json'), {
      kind: 'cs3-library-checks', source: 'source-c3', complete: true, checks: [],
      captures: [{ source: 'source.png', contact: 'pair.png', contactSha256: digest, time: 0,
        profile: 'cs3-standard-v1' }],
    })
    const study = path.join(f.run, 'u5-hall-study-next')
    await mkdir(study)
    await writeFile(path.join(study, 'hall.png'), png)
    await f.json(path.join(study, 'study.json'), { complete: true, captures: [
      { file: 'hall.png', sha256: digest, sourceSha256: 'source-c3', profileId: 'cel-ink-fine',
        state: 'repair', heading: 225, roots: [{ id: 'actor/technician' }], dimensions: [1280, 720] },
    ] })
    const images = (await f.catalog.refresh()).images
    expect(images.find(image => image.kind === 'comparison')).toMatchObject({ asset: 'rack-standard',
      label: 'rest-225', note: 'Left: Blender source. Right: Three.js browser.' })
    expect(images.find(image => image.kind === 'hall')).toMatchObject({ candidate: 'u5-c3',
      profile: 'cel-ink-fine', asset: 'Hall', heading: 225, label: 'Static hall: repair' })
  })

  it('surfaces malformed status and escapes embedded HTML payloads', async () => {
    const f = await fixture()
    await writeFile(path.join(f.run, 'u5-monitor-status.json'), '{broken')
    const data = await f.catalog.refresh()
    expect(data.status).toBeNull()
    expect(data.issues.some(issue => issue.includes('u5-monitor-status.json'))).toBe(true)
    data.issues.push('</script><script>alert("bad")</script>')
    const html = renderHtml('<script type="application/json" id="data">/* DATA */</script>', data)
    expect(html).not.toContain('</script><script>alert')
    expect(html).toContain('\\u003c/script>')
  })

  it('serves only indexed immutable images, refreshes new output and leaves an HTML snapshot', async () => {
    const f = await fixture()
    await writeFile(path.join(f.source, 'live.png'), png)
    const monitor = await startMonitor({ repository: f.root, runDirectory: f.run, intervalMs: 60_000 })
    try {
      const page = await fetch(monitor.url)
      expect(page.status).toBe(200)
      expect(await page.text()).toContain('U5 Visual Monitor')
      const first = await (await fetch(`${monitor.url}state.json`)).json()
      const image = first.images[0]
      expect(Buffer.from(await (await fetch(new URL(image.mediaUrl, monitor.url))).arrayBuffer())).toEqual(png)
      expect((await fetch(`${monitor.url}../outside.png`)).status).toBe(404)
      expect((await fetch(monitor.url, { method: 'POST' })).status).toBe(405)
      expect((await fetch(monitor.url, { headers: { Origin: 'https://example.invalid' } })).status).toBe(403)
      expect((await fetch(new URL(`/media/${image.id}?v=wrong`, monitor.url))).status).toBe(409)
      await writeFile(path.join(f.source, 'arrived.png'), png)
      await monitor.refresh()
      expect((await (await fetch(`${monitor.url}state.json`)).json()).images).toHaveLength(2)
      expect(await readFile(monitor.snapshotFile, 'utf8')).toContain('file://')
    } finally { await monitor.close() }
    await expect(readFile(path.join(f.run, 'u5-monitor/server.lock'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('refuses a symlinked run directory before writing monitor output', async () => {
    const f = await fixture()
    const outside = await mkdtemp(path.join(tmpdir(), 'cs3-monitor-outside-'))
    roots.push(outside)
    const linked = path.join(f.root, '.artifacts/implementation/linked')
    await symlink(outside, linked)
    let monitor: Awaited<ReturnType<typeof startMonitor>> | undefined
    try {
      await expect((async () => {
        monitor = await startMonitor({ repository: f.root, runDirectory: linked })
      })()).rejects.toThrow(/MONITOR_ROOT_SYMLINK/)
    } finally { await monitor?.close() }
  })

  it('holds ownership until an active refresh drains and shares concurrent shutdown completion', async () => {
    const f = await fixture()
    const actualCreateCatalog = createCatalog
    let release!: () => void
    let entered!: () => void
    let pause = false
    const gate = new Promise<void>(resolve => { release = resolve })
    const started = new Promise<void>(resolve => { entered = resolve })
    const spy = vi.spyOn(catalogs, 'createCatalog').mockImplementation(options => {
      const catalog = actualCreateCatalog(options)
      return { ...catalog, async refresh() {
        if (pause) { entered(); await gate }
        return catalog.refresh()
      } }
    })
    let monitor: Awaited<ReturnType<typeof startMonitor>> | undefined
    let refresh: Promise<void> | undefined
    let closing: Promise<void> | undefined
    try {
      monitor = await startMonitor({ repository: f.root, runDirectory: f.run, intervalMs: 60_000 })
      await writeFile(path.join(f.source, 'arrived.png'), png)
      pause = true
      refresh = monitor.refresh()
      await started
      closing = monitor.close()
      expect(monitor.close()).toBe(closing)
      const outcome = await Promise.race([
        closing.then(() => 'closed'),
        new Promise<string>(resolve => { setTimeout(() => resolve('waiting'), 50) }),
      ])
      expect(outcome).toBe('waiting')
      expect(await readFile(path.join(f.run, 'u5-monitor/server.lock'), 'utf8')).toContain('"pid"')
      release()
      await Promise.all([refresh, closing])
      expect(await readFile(monitor.snapshotFile, 'utf8')).toContain('arrived.png')
      await expect(readFile(path.join(f.run, 'u5-monitor/server.lock'))).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      release()
      await refresh
      await closing
      await monitor?.close()
      spy.mockRestore()
    }
  })
})
