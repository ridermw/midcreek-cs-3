import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import { Script } from 'node:vm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PERFORMANCE_BUDGET, WALK_LOOP } from '../src/config/performanceBudget'
import type { FrameReceipt, NamedTarget, NetworkReceipt, ReadyReceipt } from '../src/diagnostics/metrics'
import { freezeStartup, qualify, workloadDirective, workloadPhases } from '../src/diagnostics/metrics'
import { commandWorld, createWorld, tickWorld } from '../src/world/simulation'
import { evaluateRawReports, writeQualification } from '../tools/qualification'
import {
  makeNativeReport, nativePlacementIssues, nativeRunIds, nativeTarget, parseNativeArguments, parseTargetMetadata,
} from '../tools/qualificationNative'
import type { NativePageEvidence, NativeSnapshot } from '../tools/qualificationNative'
import { createNativeWorkload } from '../tools/qualificationWorkload'
import { nativeMain, withNativeLock } from '../tools/qualification-native'

const mocks = vi.hoisted(() => ({
  launch: vi.fn(), build: vi.fn(), network: vi.fn(), root: vi.fn(),
}))
vi.mock('@playwright/test', () => ({ chromium: { launch: mocks.launch } }))
vi.mock('../tests/e2e/qualificationHarness.ts', () => ({
  serveQualification: mocks.build, observeQualificationNetwork: mocks.network,
}))
vi.mock('../tools/qualification.ts', async (original) => ({
  ...await original<typeof import('../tools/qualification.ts')>(), qualificationRoot: mocks.root,
}))

const recipe = {
  firstFrames: PERFORMANCE_BUDGET.firstFrames, warmupSeconds: PERFORMANCE_BUDGET.warmupSeconds,
  windowFrames: PERFORMANCE_BUDGET.windowFrames, walkLoop: WALK_LOOP,
}
const hash = 'a'.repeat(64)
const declaration = {
  macModel: 'synthetic fixture (not hardware evidence)', chip: 'Apple M4 Pro',
  cpuCores: 12, gpuCores: 16, ramGiB: 24, macOS: 'synthetic OS build', powerMode: 'synthetic AC mode',
  display: 'synthetic DELL U3821DW 3840x1600', refreshHz: 60, driver: 'synthetic driver declaration',
  displayBounds: { x: -3840, y: 0, width: 3840, height: 1600 },
}
const observed: NativePageEvidence = {
  visible: true, focused: true, deviceDpr: 1, viewport: [1280, 720],
  screen: { width: 3840, height: 1600, availWidth: 3840, availHeight: 1575, colorDepth: 24 },
  position: { x: -3600, y: 80, width: 1280, height: 850 }, userAgent: 'synthetic Chrome',
  webglVersion: 2, webglRenderer: 'ANGLE Apple M4 Pro Metal', webglVendor: 'synthetic vendor',
  glVersion: 'synthetic WebGL 2', serviceWorker: false,
}
const bounds = { left: -3600, top: 80, width: 1280, height: 850, windowState: 'normal' }
const cliArgs = ['--run-id', 'synthetic-unit', '--window-x', '-3600', '--window-y', '80']

function syntheticRun() {
  const driver = createNativeWorkload(recipe)
  const frames: FrameReceipt[] = []
  const actions: { beforeRender: number; type: 'move' | 'dispatch'; cell?: { x: number; z: number } }[] = []
  let world = createWorld(417)
  let heading = 0
  let viewport: readonly [number, number] = [1280, 720]
  for (let i = 0; i < 5000; i++) {
    const steps = i && i % 2 === 0 ? [world = tickWorld(world)] : []
    const dimensions = {
      viewport, canvas: [viewport[0], viewport[1] - 120] as const,
      logical: [viewport[0], viewport[1] - 120] as const, drawingBuffer: [viewport[0], viewport[1] - 120] as const,
      deviceDpr: 1, applicationDpr: 1,
    }
    const frame: FrameReceipt = {
      renderCount: i + 1, startedAt: i ? 200 + i * 1000 / 60 : 190, completedAt: i ? 201 + i * 1000 / 60 : 191,
      trigger: i ? 'raf' : 'startup', tick: world.clock.tick, simulationSeconds: world.clock.elapsedSeconds,
      mode: world.player.mode, cell: world.player.cell, path: world.player.path, fault: world.fault,
      paused: false, worldSteps: steps,
      camera: { heading, zoom: 1, projection: Array(16).fill(1), matrixWorld: Array(16).fill(1) },
      dimensions, calls: 1, triangles: 1, visible: true, focused: true,
    }
    // Keep the strict public frame shape (world.fault also contains rackId).
    frames.push({ ...frame, fault: { status: frame.fault.status, progress: frame.fault.progress } })
    const directives = driver.observe(frame)
    if (directives.some((d) => d.type === 'stop')) break
    for (const d of directives) {
      if (d.type === 'move' || d.type === 'dispatch') {
        actions.push(d)
        world = commandWorld(world, d.type === 'dispatch' ? { type: 'dispatch' } : { type: 'move', cell: d.cell! })
      } else if (d.type === 'view') {
        heading = d.heading
        viewport = d.viewport
      }
    }
  }
  const origin = 'http://127.0.0.1:4188'
  const entries = [
    ['play/', 'html'], ['play.js', 'script'], ['play.css', 'style'],
    ['selection.json', 'selection'], ['manifest.json', 'manifest'],
    ...['floor-slab', 'rack-standard', 'cooling-unit', 'technician-man', 'coolant-leak'].map((id) => [`${id}.glb`, 'asset']),
  ] as const
  const startup = freezeStartup({
    origin, timeOrigin: 1_700_000_000_000, readyAt: 200, loadEventEnd: 100, overflow: false, pending: [],
    required: entries.map(([path, role]) => ({
      url: `${origin}/${path}`, role: role as 'html' | 'script' | 'style' | 'selection' | 'manifest' | 'asset', sha256: hash,
    })),
    resources: entries.map(([path, role], i) => ({
      url: `${origin}/${path}`, role: role as 'html' | 'script' | 'style' | 'selection' | 'manifest' | 'asset',
      startTime: i ? 1 : 0, responseEnd: 20, transferSize: 1300, encodedBodySize: 1000, decodedBodySize: 1000,
      cache: 'network', initiatorType: i ? 'fetch' : 'navigation',
    })),
  })
  const ready: ReadyReceipt = {
    generation: 1, timeOrigin: startup.timeOrigin, readyAt: 200, interactiveAt: 200, gpuFinishedAt: 199,
    seed: 417, scenario: 'coolant-leak', firstFrame: frames[0]!, dimensions: frames[0]!.dimensions,
    identity: {
      selectionSha256: hash, manifestSha256: hash, libraryDigest: hash, profile: 'cs3-standard-v1',
      profileSha256: hash, recipeSha256: hash,
      assets: startup.required.filter((r) => r.role === 'asset').map((r) => ({ url: r.url, sha256: hash })),
    },
  }
  const captured: NativeSnapshot = { ready, startup, frames, phases: workloadPhases(frames), interruptions: [] }
  const network: NetworkReceipt = {
    source: 'cdp', complete: true, overflow: false,
    requests: startup.resources.map((r, i) => ({
      requestId: `${i}`, url: r.url, startTime: r.startTime, responseEnd: r.responseEnd,
      encodedBodySize: r.encodedBodySize, transferSize: r.transferSize, cache: 'network', failed: false,
    })),
  }
  const target = nativeTarget(declaration, observed, '153.0.8010.37', 'b'.repeat(40), captured, hash)
  return { captured, network, actions, target }
}

describe('native CLI arguments and explicit metadata (no browser)', () => {
  it('requires explicit signed desktop coordinates and safe run IDs; CLI overrides env', () => {
    expect(parseNativeArguments(cliArgs, { CS3_U8_WINDOW_X: '5' })).toMatchObject({
      windowX: -3600, windowY: 80, repeat: 1, applicationCommit: 'HEAD', port: 4188,
    })
    expect(parseNativeArguments([], {
      CS3_U8_RUN_ID: 'env-run', CS3_U8_WINDOW_X: '-1', CS3_U8_WINDOW_Y: '0', CS3_U8_REPEAT: '3',
    })).toMatchObject({ runId: 'env-run', windowX: -1, windowY: 0, repeat: 3 })
    expect(nativeRunIds({ runId: 'example', repeat: 1 })).toEqual(['example'])
    expect(nativeRunIds({ runId: 'example', repeat: 3 })).toEqual(['example-01', 'example-02', 'example-03'])
  })
  it.each([
    [], ['--run-id', '../escape', '--window-x', '0', '--window-y', '0'],
    [...cliArgs, '--repeat', '0'], [...cliArgs, '--repeat', '101'], [...cliArgs, '--repeat', '1.2'],
    [...cliArgs, '--window-x', '0'], [...cliArgs, '--headed', 'true'],
    [...cliArgs, '--application-commit', 'main'], [...cliArgs, '--port', '65536'],
    ['--run-id', 'missing-position'],
  ].map((args) => ({ args })))('rejects malformed options $args before any launch', ({ args }) => {
    expect(() => parseNativeArguments(args)).toThrow(/USAGE/)
  })
  it('accepts honest missing/mismatched target declarations but rejects spoofed observed fields', () => {
    expect(parseTargetMetadata({})).toEqual({})
    expect(parseTargetMetadata({ ...declaration, refreshHz: 120 }).refreshHz).toBe(120)
    for (const value of [
      null, [], { cpuCores: '12' }, { refreshHz: NaN }, { display: '' },
      { browserVersion: '153.0.8010.37' }, { foreground: true }, { contentSha256: hash },
      { displayBounds: { x: 0, y: 0, width: 1 } }, { displayBounds: { x: 0, y: 0, width: -1, height: 1 } },
    ]) expect(() => parseTargetMetadata(value)).toThrow(/TARGET_METADATA/)
  })
  it('uses observed Chrome/WebGL/DPR/focus and rejects built-in/straddling/unknown placement', () => {
    expect(nativePlacementIssues(bounds, declaration, { windowX: -3600, windowY: 80 })).toEqual([])
    for (const changed of [{ ...bounds, left: 0 }, { ...bounds, width: 4000 }, { ...bounds, windowState: 'minimized' }, {}]) {
      expect(nativePlacementIssues(changed, declaration, { windowX: -3600, windowY: 80 }).length).toBeGreaterThan(0)
    }
    expect(nativePlacementIssues(bounds, {}, { windowX: -3600, windowY: 80 })).toContainEqual(expect.stringMatching(/displayBounds/))
    const data = syntheticRun()
    expect(nativeTarget(declaration, { ...observed, focused: false, webglRenderer: 'SwiftShader', deviceDpr: 2 },
      'unexpected-version', 'b'.repeat(40), data.captured, hash)).toMatchObject({
      browserVersion: 'unexpected-version', foreground: false, deviceScaleFactor: 2, backend: 'unverified',
      webglRenderer: 'SwiftShader', profileSha256: hash, recipeSha256: hash,
    })
  })
  it('runs the exact documented Node entry/help without a headed browser', async () => {
    const { stdout } = await promisify(execFile)(process.execPath, [
      '--experimental-strip-types', '--import', './tools/qualificationRuntime.ts', 'tools/qualification-native.ts', '--help',
    ])
    expect(stdout).toContain('npm run qualify:native')
    expect(stdout).toContain('--window-x')
  })
})

describe('native workload and report shape using synthetic simulation, not timing evidence', () => {
  it('retains all eight phases, complete repair and every exact orbit viewport/heading', () => {
    const data = syntheticRun()
    const report = makeNativeReport({ runId: 'synthetic-only', ...data, interruptions: [] })
    const checked = evaluateRawReports([report])
    expect(checked.issues).toEqual(['three fresh distinct repetitions required'])
    expect(checked.results[0]?.issues).toEqual([])
    expect(checked.results[0]?.failures).toEqual([])
    expect(report.clock).toBe('native')
    expect(report.phases).toHaveLength(8)
    const { frames, boundaries } = report
    expect(boundaries.warmupEnd).toBeGreaterThanOrEqual(300)
    expect(frames[boundaries.warmupEnd - 1]!.simulationSeconds).toBeGreaterThanOrEqual(12)
    const repair = report.phases.find((p) => p.name === 'dispatch-repair')!
    expect(frames[repair.start]!.fault.progress).toBe(0)
    expect(frames[repair.end]!.tick - frames[repair.start]!.tick).toBe(120)
    expect(frames[repair.end - 1]!.fault.progress).toBe(119 / 120)
    expect(frames).toHaveLength(boundaries.orbitStart + 300)
    for (const [i, frame] of frames.slice(boundaries.orbitStart).entries()) {
      const directive = workloadDirective('orbit-resize', i, 0)
      expect(frame.camera.heading).toBe(directive.heading)
      expect(frame.dimensions.viewport).toEqual(directive.viewport)
    }
    const driver = createNativeWorkload(recipe)
    expect(() => driver.observe(frames[1]!)).toThrow(/WORKLOAD_SEQUENCE/)
  })
  it('does not finish warmup before 300 renders even if simulation time is already >=12s', () => {
    const driver = createNativeWorkload(recipe)
    const frame = syntheticRun().captured.frames[0]!
    for (let i = 1; i < 600; i++) expect(driver.observe({ ...frame, renderCount: i, simulationSeconds: 12 })).toEqual([])
    expect(driver.observe({ ...frame, renderCount: 600, simulationSeconds: 12 })).toEqual([
      { type: 'move', beforeRender: 601, cell: WALK_LOOP[0] },
    ])
  })
  it('retains target misses, interruptions, resize races and incomplete startup rather than claiming success', () => {
    const data = syntheticRun()
    const report = makeNativeReport({
      runId: 'synthetic-miss', ...data, target: { ...data.target, refreshHz: 120 },
      interruptions: [{ kind: 'hidden', at: 1000, detail: 'synthetic hidden event between frames' }],
    })
    expect(evaluateRawReports([report]).results[0]).toMatchObject({
      status: 'unqualified', issues: expect.arrayContaining(['target.refreshHz prerequisite', 'interrupted run']),
    })
    const orbit = report.boundaries.orbitStart
    const lateResize = {
      ...report, interruptions: [], target: data.target,
      frames: report.frames.map((f, i) => i === orbit + 120 ? { ...f, dimensions: report.frames[orbit]!.dimensions } : f),
    }
    expect(evaluateRawReports([lateResize]).results[0]?.issues.join(' ')).toContain('camera/viewport workload mismatch')
    const absent = makeNativeReport({
      runId: 'synthetic-startup-failed', target: {}, network: data.network, actions: [], interruptions: [],
    })
    expect(absent.ready).toBeNull()
    expect(absent.frames).toEqual([])
    expect(evaluateRawReports([absent]).issues.join(' ')).toContain('REPORT_SHAPE: report.ready')
  })
})

describe('native CLI lifecycle with mocked browser/CDP only', () => {
  let scratch: string
  beforeEach(async () => {
    vi.clearAllMocks()
    await mkdir(resolve('.artifacts/qualification'), { recursive: true })
    scratch = await mkdtemp(resolve('.artifacts/qualification/portable-native-'))
    mocks.root.mockResolvedValue(scratch)
  })
  afterEach(async () => { await rm(scratch, { recursive: true, force: true }) })

  function browserFixture(waitError?: Error) {
    const data = syntheticRun()
    const close = vi.fn().mockResolvedValue(undefined)
    const cdp = {
      send: vi.fn(async (method: string) => method === 'Browser.getWindowForTarget' ? { windowId: 1, bounds }
        : method === 'Browser.getWindowBounds' ? { bounds }
          : method === 'Browser.getVersion' ? { product: 'Chrome/153.0.8010.37' } : {}),
    }
    const page = {
      on: vi.fn(), isClosed: () => false, bringToFront: vi.fn(), goto: vi.fn(), exposeFunction: vi.fn(),
      setViewportSize: vi.fn(), addInitScript: vi.fn(({ content }: { content: string }) => {
        expect(() => new Script(content)).not.toThrow()
        expect(content).not.toMatch(/(?:requestAnimationFrame|performance\.now)\s*=/)
        expect(content).not.toContain('u8Frames')
      }),
      waitForFunction: vi.fn(async () => { if (waitError) throw waitError }),
      evaluate: vi.fn(async (fn: Function) => fn.name === 'readNativePageEvidence' ? observed : {
        captured: data.captured, timeOrigin: data.captured.ready!.timeOrigin,
        workload: { done: true, actions: data.actions, interruptions: [], resizeRequests: [], windowPositions: [] },
      }),
    }
    mocks.launch.mockImplementation(async () => ({
      version: () => '153.0.8010.37', on: vi.fn(), close,
      newContext: vi.fn(async (options) => {
        expect(options).toEqual({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, serviceWorkers: 'block' })
        return { newPage: async () => page, newCDPSession: async () => cdp }
      }),
    }))
    mocks.build.mockResolvedValue({ url: 'http://127.0.0.1:4188/midcreek-cs-3/play/?qualification=1', close: vi.fn() })
    mocks.network.mockResolvedValue({
      snapshot: async () => data.network, contentHash: async () => hash, close: vi.fn(),
    })
    return { page, close, cdp, data }
  }
  it('launches fresh headed Chrome serially with explicit position, then writes one complete raw report per run', async () => {
    const { page, close, cdp } = browserFixture()
    await nativeMain([...cliArgs, '--repeat', '2'], { CS3_U8_TARGET_JSON: JSON.stringify(declaration) })
    expect(mocks.launch).toHaveBeenCalledTimes(2)
    expect(mocks.launch).toHaveBeenCalledWith({
      channel: 'chrome', headless: false, args: ['--window-position=-3600,80', '--window-size=1280,850'],
    })
    expect(close.mock.invocationCallOrder[0]).toBeLessThan(mocks.launch.mock.invocationCallOrder[1]!)
    expect(page.bringToFront).toHaveBeenCalledTimes(4)
    expect(mocks.build).toHaveBeenCalledWith({ port: 4188 })
    expect(mocks.network.mock.invocationCallOrder[0]).toBeLessThan(page.goto.mock.invocationCallOrder[0]!)
    expect(cdp.send).toHaveBeenCalledWith('Browser.setWindowBounds', { windowId: 1, bounds: { left: -3600, top: 80 } })
    for (const id of ['synthetic-unit-01', 'synthetic-unit-02']) {
      const raw: unknown = JSON.parse(await readFile(resolve(scratch, id, 'runs/1/report.json'), 'utf8'))
      expect(evaluateRawReports([raw]).results).toHaveLength(1)
      expect(raw).toMatchObject({ schema: 1, clock: 'native', runId: id, target: { contentSha256: hash, profileSha256: hash, recipeSha256: hash } })
      const checksums = JSON.parse(await readFile(resolve(scratch, id, 'checksums.json'), 'utf8'))
      const bytes = await readFile(resolve(scratch, id, 'evidence.json'))
      expect(checksums['evidence.json']).toBe(createHash('sha256').update(bytes).digest('hex'))
    }
  })
  it('writes retained raw frames after a timeout and returns unqualified, then releases resources and lock', async () => {
    const { data, close } = browserFixture(new Error('synthetic timeout'))
    expect(await nativeMain(cliArgs, { CS3_U8_TARGET_JSON: JSON.stringify(declaration) })).toBe(2)
    const raw = JSON.parse(await readFile(resolve(scratch, 'synthetic-unit/runs/1/report.json'), 'utf8'))
    expect(raw.frames).toHaveLength(data.captured.frames.length)
    expect(raw.interruptions).toContainEqual(expect.objectContaining({ kind: 'runner-error', detail: 'synthetic timeout' }))
    expect(close).toHaveBeenCalledOnce()
    await expect(readFile(resolve(scratch, '.native-runner.lock'))).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(nativeMain(cliArgs, {})).rejects.toThrow(/EXISTING_OUTPUT/)
    expect(mocks.launch).toHaveBeenCalledOnce()
  })
  it('preserves startup failure evidence with explicit shape rejection, never synthetic readiness', async () => {
    mocks.build.mockRejectedValueOnce(new Error('synthetic missing selected library'))
    expect(await nativeMain(cliArgs, {})).toBe(2)
    expect(mocks.launch).not.toHaveBeenCalled()
    const raw = JSON.parse(await readFile(resolve(scratch, 'synthetic-unit/runs/1/report.json'), 'utf8'))
    expect(raw).toMatchObject({ clock: 'native', ready: null, startup: null, frames: [], network: { complete: false } })
    const result = JSON.parse(await readFile(resolve(scratch, 'synthetic-unit/result.json'), 'utf8'))
    expect(result.status).toBe('unqualified')
    expect(result.issues.join(' ')).toContain('REPORT_SHAPE')
  })
  it('rejects concurrent runners and preserves an existing lock; rejection cleanup is scoped', async () => {
    await withNativeLock(scratch, async () => {
      await expect(withNativeLock(scratch, async () => 1)).rejects.toThrow(/NATIVE_RUN_BUSY/)
      expect(JSON.parse(await readFile(resolve(scratch, '.native-runner.lock'), 'utf8')).pid).toBe(process.pid)
    })
    await expect(withNativeLock(scratch, async () => { throw new Error('synthetic failure') })).rejects.toThrow('synthetic failure')
    await expect(readFile(resolve(scratch, '.native-runner.lock'))).rejects.toMatchObject({ code: 'ENOENT' })
  })
  it('includes supplementary evidence in private checksums without changing strict raw report shape', async () => {
    const data = syntheticRun()
    const report = makeNativeReport({ runId: 'synthetic-writer', ...data, interruptions: [] })
    const result = await writeQualification([report], resolve(scratch, 'writer'), { declaration, observed })
    expect(result.results).toHaveLength(1)
    const target: Partial<NamedTarget> = JSON.parse(await readFile(resolve(scratch, 'writer/runs/1/target.json'), 'utf8'))
    expect(target.display).toBe(declaration.display)
    expect(result.results[0]?.issues).toEqual([])
    const complete = { ...report, ready: data.captured.ready!, startup: data.captured.startup! }
    expect(qualify(complete).issues).toEqual([])
  })
})
