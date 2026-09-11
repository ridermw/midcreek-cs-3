import { describe, expect, it } from 'vitest'
import {
  frameStatistics, freezeStartup, qualify, qualifyRepetitions, validateTarget,
  workloadDirective, workloadPhases,
} from './metrics'
import type { FrameReceipt, QualificationReport, ResourceReceipt, StartupInput } from './metrics'
import { PERFORMANCE_BUDGET, WALK_LOOP } from '../config/performanceBudget'
import { evaluateRawReports, writeQualification } from '../../tools/qualification'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { commandWorld, createWorld, tickWorld } from '../world/simulation'
import type { WorkloadAction } from './metrics'

const hash = 'a'.repeat(64)
const origin = 'http://127.0.0.1:4173'
const resource = (path: string, role: ResourceReceipt['role'], start = 1): ResourceReceipt => ({
  url: `${origin}/${path}`, role, startTime: start, responseEnd: start + 10,
  transferSize: 1300, encodedBodySize: 1000, decodedBodySize: 2000,
  cache: 'network', initiatorType: 'fetch',
})
export function startupInput(): StartupInput {
  const resources = [
    resource('play/', 'html', 0), resource('play.js', 'script'), resource('play.css', 'style'),
    resource('selection.json', 'selection'), resource('manifest.json', 'manifest'),
    ...['floor-slab', 'rack-standard', 'cooling-unit', 'technician-man', 'coolant-leak']
      .map((id) => resource(`${id}.glb`, 'asset', 150)),
  ]
  return {
    origin, timeOrigin: 1_700_000_000_000, readyAt: 200, loadEventEnd: 100,
    required: resources.flatMap(({ url, role }) => role === 'other' ? [] : [{ url, role, sha256: hash }]),
    resources, pending: [], overflow: false,
  }
}
export function frame(index: number, patch: Partial<FrameReceipt> = {}): FrameReceipt {
  const result: FrameReceipt = {
    renderCount: index + 1, startedAt: index ? 200 + index * 1000 / 60 : 190,
    completedAt: index ? 201 + index * 1000 / 60 : 191, trigger: index ? 'raf' : 'startup',
    tick: Math.floor(index / 2), simulationSeconds: Math.floor(index / 2) / 30,
    mode: 'idle', fault: { status: 'fault', progress: 0 }, paused: false,
    cell: { x: 2, z: 7 }, path: [], worldSteps: [],
    camera: { heading: 0, zoom: 1, projection: Array(16).fill(1), matrixWorld: Array(16).fill(1) },
    dimensions: {
      viewport: [1280, 720], canvas: [1280, 600], logical: [1280, 600],
      drawingBuffer: [1280, 600], deviceDpr: 1, applicationDpr: 1,
    },
    calls: 250, triangles: 1_000_000, visible: true, focused: true,
    ...patch,
  }
  return {
    ...result,
    worldSteps: patch.worldSteps ?? (index > 0 && index % 2 === 0 ? [{
      seed: 417, clock: { tick: result.tick, elapsedSeconds: result.simulationSeconds },
      player: { mode: result.mode, cell: result.cell, path: result.path },
      fault: { ...result.fault, rackId: 'fixture' }, paused: false, racks: [], message: '',
    }] : []),
  }
}
export function reportFixture(): QualificationReport {
  const frames: FrameReceipt[] = []
  const actions: WorkloadAction[] = []
  let world = createWorld(417)
  const append = (patch: Partial<FrameReceipt> = {}) => {
    const advances = frames.length > 0 && frames.length % 2 === 0
    if (advances) world = tickWorld(world)
    frames.push(frame(frames.length, {
      tick: world.clock.tick, simulationSeconds: world.clock.elapsedSeconds,
      cell: world.player.cell, path: world.player.path, mode: world.player.mode,
      fault: { status: world.fault.status, progress: world.fault.progress },
      worldSteps: advances ? [world] : [], ...patch,
    }))
  }
  // 721 retained renders are needed to reach tick 360 at the controlled 60 Hz clock.
  for (let i = 0; i < 721 + 300; i++) append()
  let routeIndex = 0
  for (let i = 0; i < 300; i++) {
    if (!world.player.path.length) {
      const cell = WALK_LOOP[routeIndex++ % WALK_LOOP.length]!
      world = commandWorld(world, { type: 'move', cell })
      actions.push({ beforeRender: frames.length + 1, type: 'move', cell })
    }
    append()
  }
  const dispatchStart = frames.length
  world = commandWorld(world, { type: 'dispatch' })
  actions.push({ beforeRender: frames.length + 1, type: 'dispatch' })
  while (world.player.mode !== 'repairing') append()
  // The arrival render belongs to the exclusively repairing window.
  const repairStart = frames.length - 1
  while (world.fault.status !== 'resolved') append()
  const orbitStart = frames.length
  for (let i = 0; i < 300; i++) {
    const sample = frame(frames.length, { fault: { status: 'resolved', progress: 1 } })
    append({
      camera: { ...sample.camera, heading: Math.floor(i / 60) % 4 },
      dimensions: i >= 120 && i < 180 ? {
        ...sample.dimensions, viewport: [1024, 768], canvas: [1024, 648],
        logical: [1024, 648], drawingBuffer: [1024, 648],
      } : sample.dimensions,
    })
  }
  const startup = freezeStartup(startupInput())
  return {
    schema: 1, runId: 'unit-fixture-not-a-measurement', clock: 'native',
    target: {
      name: 'CS3-M4Pro-Chrome153-DPR1', macModel: 'fixture Mac', chip: 'Apple M4 Pro',
      cpuCores: 12, gpuCores: 16, ramGiB: 24, macOS: 'fixture build',
      display: 'fixture display', refreshHz: 60, powerMode: 'AC normal',
      browserVersion: '153.0.8010.37', webglVersion: 2, webglRenderer: 'ANGLE Apple M4 Pro Metal',
      backend: 'ANGLE Metal', driver: 'fixture macOS driver',
      headed: true, foreground: true, deviceScaleFactor: 1, applicationDpr: 1,
      coldNavigation: true, cacheDisabled: true, serviceWorker: false,
      compression: 'none', servingMode: 'loopback production build',
      applicationCommit: 'b'.repeat(40), contentSha256: hash, profileSha256: hash, recipeSha256: hash,
    },
    ready: {
      generation: 1, timeOrigin: startup.timeOrigin, readyAt: 200, interactiveAt: 200, gpuFinishedAt: 199,
      seed: 417, scenario: 'coolant-leak', firstFrame: frames[0]!,
      identity: {
        selectionSha256: hash, manifestSha256: hash, libraryDigest: hash,
        profile: 'cs3-standard-v1', profileSha256: hash, recipeSha256: hash,
        assets: startup.required.filter((r) => r.role === 'asset').map((r) => ({ url: r.url, sha256: hash })),
      },
      dimensions: frames[0]!.dimensions,
    },
    startup, frames, phases: workloadPhases(frames),
    actions,
    interruptions: [],
    network: {
      source: 'cdp', complete: true, overflow: false,
      requests: startup.resources.map((r, i) => ({
        requestId: String(i), url: r.url, startTime: r.startTime,
        responseEnd: r.responseEnd, encodedBodySize: r.encodedBodySize,
        transferSize: r.transferSize, cache: r.cache, failed: false,
      })),
    },
    boundaries: { warmupEnd: 721, dispatchStart, repairStart, orbitStart },
  }
}

describe('navigation startup ledger', () => {
  it('counts late required requests after load, all completed responses, and freezes once', () => {
    const input = startupInput()
    const gallery = resource('gallery.webp', 'other', 210)
    const startup = freezeStartup({ ...input, resources: [...input.resources, gallery] })
    expect(startup.transferBytes).toBe(13_000)
    expect(startup.resources.filter((r) => r.startTime > input.loadEventEnd)).toHaveLength(5)
    expect(startup.readyAt).toBe(200)
    expect(startup.timeOrigin).toBe(input.timeOrigin)
    expect(Object.isFrozen(startup.resources[0])).toBe(true)
    expect(startup.resources.some((r) => r.url === gallery.url)).toBe(false)
  })
  it('does not count embedded blob images a second time', () => {
    const input = startupInput()
    const startup = freezeStartup({ ...input, resources: [
      ...input.resources, { ...resource('image', 'other'), url: `blob:${origin}/image` },
    ] })
    expect(startup.transferBytes).toBe(13_000)
    expect(startup.issues).toEqual([])
  })
  it.each(['transferSize', 'encodedBodySize', 'decodedBodySize'] as const)('rejects zero %s', (field) => {
    const input = startupInput()
    const resources = input.resources.map((r, i) => i === 4 ? { ...r, [field]: 0 } : r)
    expect(freezeStartup({ ...input, resources }).issues.join(' ')).toMatch(/unmeasurable/)
  })
  it('counts but invalidates unexpected completed responses; retains pending and missing evidence', () => {
    const input = startupInput()
    expect(freezeStartup({ ...input, resources: [...input.resources, resource('extra', 'other')] }))
      .toMatchObject({ transferBytes: 14_300, issues: expect.arrayContaining([expect.stringMatching(/unexpected/)]) })
    expect(freezeStartup({ ...input, pending: [`${origin}/pending`] }).issues.join(' ')).toMatch(/pending/)
    expect(freezeStartup({ ...input, resources: input.resources.slice(0, -1) }).issues.join(' ')).toMatch(/missing/)
    expect(freezeStartup({ ...input, overflow: true }).issues.join(' ')).toMatch(/overflow/)
  })
  it('rejects required responses finishing after ready, foreign resources and cache hits', () => {
    const input = startupInput()
    for (const patch of [{ responseEnd: 201 }, { url: 'https://other.test/file' }, { cache: 'local' as const }]) {
      expect(freezeStartup({
        ...input, resources: input.resources.map((r, i) => i === 4 ? { ...r, ...patch } : r),
      }).issues.length).toBeGreaterThan(0)
    }
  })
  it('rejects five unrelated GLBs and per-response role tampering, not just a count of five', () => {
    const input = startupInput()
    const replaced = (url: string) => url.replace('coolant-leak.glb', 'unrelated.glb')
    expect(freezeStartup({
      ...input, required: input.required.map((r) => ({ ...r, url: replaced(r.url) })),
      resources: input.resources.map((r) => ({ ...r, url: replaced(r.url) })),
    }).issues.join(' ')).toMatch(/GLB/)
    expect(qualify({
      ...reportFixture(),
      startup: { ...freezeStartup(input), resources: input.resources.map((r) => ({ ...r, role: 'other' })) },
    }).status).toBe('unqualified')
  })
})

describe('retained frame qualification', () => {
  it('uses elapsed completed intervals, full long samples, nearest-rank p95', () => {
    const frames = [frame(0, { completedAt: 201 }), frame(1, { completedAt: 211 }), frame(2, { completedAt: 241 })]
    expect(frameStatistics(frames)).toMatchObject({ intervals: 2, elapsedMs: 40, meanFps: 50, p95Ms: 30 })
    const samples = Array.from({ length: 21 }, (_, i) => frame(i, { completedAt: i * (i === 20 ? 100 : 10) }))
    expect(frameStatistics(samples).p95Ms).toBe(10)
    expect(frameStatistics(samples).meanFps).toBe(10)
  })
  it('keeps first 300 separate, waits for both warmup conditions and names dispatch windows', () => {
    const report = reportFixture()
    expect(report.phases).toContainEqual({ name: 'first-300', start: 0, end: 300 })
    expect(report.phases).toContainEqual({ name: 'warmup', start: 0, end: 721 })
    expect(report.phases).toContainEqual({ name: 'idle', start: 721, end: 1021 })
    expect(report.phases).toContainEqual({ name: 'walking', start: 1021, end: 1321 })
    expect(report.phases.find((p) => p.name === 'dispatch-repair')).toMatchObject({
      start: report.boundaries.repairStart, end: report.boundaries.orbitStart - 1,
    })
    const slowSimulation = report.frames.slice(0, 800).map((f, i) => ({ ...f, simulationSeconds: i / 100 }))
    expect(workloadPhases(slowSimulation).some((p) => p.name === 'idle')).toBe(false)
  })
  it('specifies a valid loop and the exact orbit resize and restore schedule', () => {
    expect(workloadDirective('walking', 0, 0)).toEqual({ type: 'move', cell: WALK_LOOP[0] })
    expect(workloadDirective('orbit-resize', 119, 0)).toMatchObject({ heading: 1, viewport: [1280, 720] })
    expect(workloadDirective('orbit-resize', 120, 0)).toMatchObject({ heading: 2, viewport: [1024, 768] })
    expect(workloadDirective('orbit-resize', 179, 0)).toMatchObject({ viewport: [1024, 768] })
    expect(workloadDirective('orbit-resize', 180, 0)).toMatchObject({ heading: 3, viewport: [1280, 720] })
  })
  it('accepts exact ceilings and rejects one-byte/call/triangle excess without rounding', () => {
    expect(PERFORMANCE_BUDGET).toMatchObject({ calls: 250, triangles: 1_000_000, gameBytes: 15_000_000, meanFps: 59, p95Ms: 18 })
    const report = reportFixture()
    expect(qualify(report).issues).toEqual([])
    expect(qualify(report).status).toBe('passed')
    for (const patch of [{ calls: 251 }, { triangles: 1_000_001 }]) {
      const frames = report.frames.map((f, i) => i === 800 ? { ...f, ...patch } : f)
      expect(qualify({ ...report, frames }).status).toBe('failed')
    }
    const input = startupInput()
    for (const extra of [0, 1]) {
      const transferSize = 15_000_000 - 9 * 1300 + extra
      const resources = input.resources.map((r, i) => i ? r : {
        ...r, transferSize, encodedBodySize: transferSize - 300, decodedBodySize: transferSize - 300,
      })
      const startup = freezeStartup({ ...input, resources })
      const network = { ...report.network, requests: report.network.requests.map((r, i) => ({
        ...r, transferSize: resources[i]!.transferSize, encodedBodySize: resources[i]!.encodedBodySize,
      })) }
      expect(qualify({ ...report, startup, network }).status).toBe(extra ? 'failed' : 'passed')
    }
  })
  it('rejects inconsistent transfer ledgers, impossible readiness chronology and invalid triggers', () => {
    const report = reportFixture()
    expect(qualify({
      ...report,
      startup: { ...report.startup, resources: report.startup.resources.map((r, i) =>
        i ? r : { ...r, transferSize: r.encodedBodySize + 1 }) },
    }).status).toBe('unqualified')
    expect(qualify({
      ...report,
      ready: { ...report.ready, firstFrame: { ...report.ready.firstFrame, startedAt: 2 } },
      frames: report.frames.map((f, i) => i ? f : { ...f, startedAt: 2 }),
    }).status).toBe('unqualified')
    expect(qualify({
      ...report, frames: report.frames.map((f, i) => i ? f : { ...f, trigger: 'no-render' as 'raf' }),
    }).status).toBe('unqualified')
  })
  it('accepts the retained ANGLE Metal renderer token order and rejects a fabricated dispatch journey', () => {
    const report = reportFixture()
    expect(validateTarget({
      ...report.target,
      webglRenderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M4 Pro, Unspecified Version)',
    })).not.toContain('hardware WebGL renderer prerequisite')
    const frames = report.frames.map((f, i) => i < report.boundaries.dispatchStart ? f : {
      ...f, cell: { x: 999, z: 999 }, path: [],
      worldSteps: f.worldSteps.map((step) => ({
        ...step, player: { ...step.player, cell: { x: 999, z: 999 }, path: [] },
        fault: { ...step.fault, rackId: 'missing' },
      })),
    })
    expect(qualify({ ...report, frames }).status).toBe('unqualified')
  })
  it('does not pass missing target fields, headless/controlled clocks, hidden/error or dropped renders', () => {
    const report = reportFixture()
    for (const key of Object.keys(report.target)) {
      const target = { ...report.target }
      delete target[key as keyof typeof target]
      expect(validateTarget(target).length, key).toBeGreaterThan(0)
    }
    expect(qualify({ ...report, target: { ...report.target, headed: false } }).status).toBe('unqualified')
    expect(qualify({ ...report, clock: 'controlled' }).status).toBe('unqualified')
    expect(qualify({ ...report, interruptions: [{ at: 250, kind: 'hidden', detail: 'hidden' }] }).status).toBe('unqualified')
    expect(qualify({ ...report, frames: report.frames.filter((_, i) => i !== 800) }).status).toBe('unqualified')
    expect(qualify({ ...report, network: { ...report.network, requests: [] } }).status).toBe('unqualified')
    expect(qualify({ ...report, frames: report.frames.map((f, i) => i === 800 ? { ...f, visible: false } : f) }).status).toBe('unqualified')
  })
  it('fails long intervals rather than dropping them and rejects shortened/mislabelled windows', () => {
    const report = reportFixture()
    const frames = report.frames.map((f, i) => i >= 800 ? {
      ...f, startedAt: f.startedAt + 1000, completedAt: f.completedAt + 1000,
    } : f)
    expect(qualify({ ...report, frames }).status).toBe('failed')
    expect(qualify({ ...report, phases: report.phases.filter((p) => p.name !== 'walking') }).status).toBe('unqualified')
    expect(qualify({ ...report, frames: report.frames.map((f, i) => i === report.boundaries.orbitStart + 179
      ? { ...f, dimensions: frame(0).dimensions } : f) }).status).toBe('unqualified')
  })
  it('rejects boundary lies, invalid route actions and missing network time/byte reconciliation', () => {
    const report = reportFixture()
    expect(qualify({ ...report, boundaries: { ...report.boundaries, warmupEnd: 300 } }).status).toBe('unqualified')
    expect(qualify({ ...report, actions: [...report.actions, { beforeRender: 1022, type: 'move', cell: WALK_LOOP[0] }] }).status).toBe('unqualified')
    for (const patch of [{ responseEnd: 12_000 }, { transferSize: 1 }, { startTime: NaN }]) {
      expect(qualify({
        ...report, network: { ...report.network, requests: report.network.requests.map((r, i) => i ? r : { ...r, ...patch }) },
      }).status).toBe('unqualified')
    }
  })
  it('keeps simulation steps inside a long render, including arrival zero, instead of losing repair boundaries', () => {
    const report = reportFixture()
    const start = report.boundaries.repairStart
    const arrival = report.frames[start]!
    const frames = report.frames.filter((_, i) => i !== start && i !== start + 1)
      .map((f, i) => ({
        ...f, renderCount: i + 1,
        worldSteps: i === start ? [...arrival.worldSteps, ...f.worldSteps] : f.worldSteps,
      }))
    const phases = workloadPhases(frames)
    const modified = {
      ...report, frames, phases, boundaries: { ...report.boundaries, orbitStart: report.boundaries.orbitStart - 2 },
    }
    expect(qualify(modified).issues).toEqual([])
    expect(qualify(modified).windows.find((p) => p.name === 'dispatch-repair')!.stats.frames).toBe(238)
    expect(qualify({ ...report, frames: report.frames.map((f, i) => i === start ? { ...f, worldSteps: [] } : f) }).status).toBe('unqualified')
  })
  it('rejects walking labels without the scripted valid route actually advancing', () => {
    const report = reportFixture()
    const walking = report.phases.find((p) => p.name === 'walking')!
    const frames = report.frames.map((f, i) => i < walking.start || i >= walking.end ? f : {
      ...f, mode: 'walking' as const, cell: { x: 2, z: 7 }, path: [WALK_LOOP[0]],
      worldSteps: f.worldSteps.map((s) => ({ ...s, player: {
        mode: 'walking' as const, cell: { x: 2, z: 7 }, path: [WALK_LOOP[0]],
      } })),
    })
    expect(qualify({ ...report, frames }).status).toBe('unqualified')
  })
  it('requires three distinct fresh matching repetitions, never just the best', () => {
    const report = reportFixture()
    expect(qualifyRepetitions([report]).status).toBe('unqualified')
    expect(qualifyRepetitions([report, report, report]).status).toBe('unqualified')
    const reports = [0, 1, 2].map((i) => ({
      ...report, runId: `run-${i}`,
      ready: { ...report.ready, timeOrigin: report.ready.timeOrigin + i * 100_000 },
      startup: { ...report.startup, timeOrigin: report.startup.timeOrigin + i * 100_000 },
    }))
    expect(qualifyRepetitions(reports).status).toBe('passed')
    expect(qualifyRepetitions(reports.map((r, i) => i === 1
      ? { ...r, frames: r.frames.map((f, j) => j === 800 ? { ...f, calls: 251 } : f) } : r)).status).toBe('failed')
  })
  it('rejects malformed raw shapes explicitly, including missing nested timing and counter values', () => {
    expect(evaluateRawReports([{}]).status).toBe('unqualified')
    const report = reportFixture()
    const raw = JSON.parse(JSON.stringify(report))
    delete raw.frames[2].triangles
    expect(evaluateRawReports([raw]).issues.join(' ')).toMatch(/frames.*triangles/)
    delete raw.ready
    expect(evaluateRawReports([raw]).status).toBe('unqualified')
  })
  it('writes deterministic private raw evidence and a separate allowlisted projection, never a browser', async () => {
    const root = resolve('.artifacts/qualification')
    await mkdir(root, { recursive: true })
    const directory = await mkdtemp(`${root}/u8-unit-`)
    try {
      const report = reportFixture()
      const output = `${directory}/result`
      await writeQualification([report], output)
      const result = JSON.parse(await readFile(`${output}/result.json`, 'utf8'))
      const projection = JSON.parse(await readFile(`${output}/sanitized/result.json`, 'utf8'))
      expect(result.status).toBe('unqualified')
      expect(Object.keys(projection).sort()).toEqual(['repetitions', 'schema', 'status', 'target'])
      expect(JSON.stringify(projection)).not.toContain('fixture Mac')
      expect(JSON.stringify(projection)).not.toContain('http:')
      expect(JSON.parse(await readFile(`${output}/runs/1/frames.json`, 'utf8'))).toEqual(report.frames)
      expect(JSON.parse(await readFile(`${output}/runs/1/startup.json`, 'utf8'))).toEqual(report.startup)
      const checksums = JSON.parse(await readFile(`${output}/checksums.json`, 'utf8'))
      expect(checksums['runs/1/frames.json']).toMatch(/^[a-f0-9]{64}$/)
      await writeQualification([report], `${directory}/same-input`)
      expect(await readFile(`${directory}/same-input/result.json`, 'utf8')).toBe(await readFile(`${output}/result.json`, 'utf8'))
      expect(await readFile(`${directory}/same-input/checksums.json`, 'utf8')).toBe(await readFile(`${output}/checksums.json`, 'utf8'))
      await expect(writeQualification([report], output)).rejects.toThrow(/EXISTING/)
      await expect(writeQualification([report], resolve('dist/qualification'))).rejects.toThrow(/OUTPUT_SCOPE/)
    } finally {
      await rm(directory, { recursive: true })
    }
  })
})
