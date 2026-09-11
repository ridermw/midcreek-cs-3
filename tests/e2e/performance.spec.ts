import { expect, test } from '@playwright/test'
import {
  bootQualification, clickQualificationCell, controlledRendering, observeQualificationNetwork, serveQualification,
} from './qualificationHarness'
import { WALK_LOOP } from '../../src/config/performanceBudget'
import { qualify, workloadDirective } from '../../src/diagnostics/metrics'
import type { QualificationReport, WorkloadAction } from '../../src/diagnostics/metrics'
import { writeQualification } from '../../tools/qualification'
import { resolve } from 'node:path'

let server: Awaited<ReturnType<typeof serveQualification>>
test.beforeAll(async () => { server = await serveQualification() })
test.afterAll(async () => { await server?.close() })

test('deterministic retained first-300 and simulation warmup are not named-target timing', async ({ page }) => {
  await controlledRendering(page)
  await bootQualification(page, server.url)
  expect((await page.evaluate(() => window.midcreek.diagnostics.snapshot().ready!.dimensions))).toMatchObject({
    viewport: [1280, 720], canvas: [1280, 600], logical: [1280, 600], drawingBuffer: [1280, 600],
    deviceDpr: 1, applicationDpr: 1,
  })
  await page.evaluate(() => window.u8Frames.step(299))
  const early = await page.evaluate(() => window.midcreek.diagnostics.snapshot())
  expect(early.frames.length).toBeGreaterThanOrEqual(300)
  expect(early.phases).toContainEqual({ name: 'first-300', start: 0, end: 300 })
  expect(early.phases.some((phase) => phase.name === 'idle')).toBe(false)
  await page.evaluate(() => window.u8Frames.step(440))
  const warm = await page.evaluate(() => window.midcreek.diagnostics.snapshot())
  expect(warm.frames.at(-1)!.simulationSeconds).toBeGreaterThanOrEqual(12)
  expect(warm.frames.every((frame, i) => frame.renderCount === i + 1)).toBe(true)
  expect(warm.phases.find((phase) => phase.name === 'warmup')!.end).toBeGreaterThanOrEqual(300)
})

test('retains every actual render in idle, scripted loop, full dispatch and exact orbit/resize windows', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const network = await observeQualificationNetwork(page)
  await controlledRendering(page)
  await bootQualification(page, server.url)
  const actions: WorkloadAction[] = []
  await page.evaluate(() => {
    while (!window.midcreek.diagnostics.snapshot().phases.some((p) => p.name === 'warmup')) window.u8Frames.step()
  })
  const count = () => page.evaluate(() => window.midcreek.diagnostics.snapshot().frames.length)
  const warmupEnd = await count()
  await page.evaluate(() => window.u8Frames.step(300))
  const walkingStart = await count()
  let route = 0
  while (await count() < walkingStart + 300) {
    const before = await count()
    const target = WALK_LOOP[route++ % WALK_LOOP.length]!
    actions.push({ beforeRender: before + 1, type: 'move', cell: target })
    await clickQualificationCell(page, target)
    await page.evaluate((end) => {
      do { window.u8Frames.step() } while (window.midcreek.inspect().world.player.path.length
        && window.midcreek.diagnostics.snapshot().frames.length < end)
    }, walkingStart + 300)
  }
  const dispatchStart = await count()
  actions.push({ beforeRender: dispatchStart + 1, type: 'dispatch' })
  await page.locator('#dispatch').click()
  await page.evaluate(() => {
    let remaining = 2000
    while (window.midcreek.inspect().world.fault.status !== 'resolved' && remaining-- > 0) window.u8Frames.step()
    if (remaining <= 0) throw new Error('Dispatch failed to resolve')
  })
  const orbitStart = await count()
  for (const start of [0, 60, 120, 180, 240]) {
    const directive = workloadDirective('orbit-resize', start, 0)
    if (start) await page.locator('canvas').press('e')
    if (start === 120 || start === 180) {
      await page.setViewportSize({ width: directive.viewport![0], height: directive.viewport![1] })
      await expect.poll(async () => page.evaluate(() => {
        const frames = window.midcreek.diagnostics.snapshot().frames
        return frames.at(-1)!.dimensions.viewport
      })).toEqual(directive.viewport)
    }
    const remaining = orbitStart + start + 60 - await count()
    expect(remaining).toBeGreaterThan(0)
    await page.evaluate((n) => window.u8Frames.step(n), remaining)
  }
  const captured = await page.evaluate(() => {
    window.midcreek.diagnostics.stop()
    return window.midcreek.diagnostics.snapshot()
  })
  expect(errors).toEqual([])
  expect(captured.phases.map((p) => p.name)).toEqual([
    'first-300', 'warmup', 'idle', 'walking', 'dispatch-travel', 'dispatch-repair', 'dispatch-combined', 'orbit-resize',
  ])
  expect(captured.frames).toHaveLength(orbitStart + 300)
  const repair = captured.phases.find((p) => p.name === 'dispatch-repair')!
  expect(captured.frames[repair.start]!.fault.progress).toBe(0)
  expect(captured.frames[repair.end]!.tick - captured.frames[repair.start]!.tick).toBe(120)
  expect(captured.frames[repair.end - 1]!.fault.progress).toBe(119 / 120)
  expect(repair.end - repair.start).not.toBe(300)
  expect(actions.filter((a) => a.type === 'move').length).toBeGreaterThan(1)
  for (const [i, frame] of captured.frames.slice(orbitStart).entries()) {
    expect(frame.dimensions.viewport).toEqual(i >= 120 && i < 180 ? [1024, 768] : [1280, 720])
    expect(frame.camera.heading).toBe(Math.floor(i / 60) % 4)
  }
  const report: QualificationReport = {
    schema: 1, runId: `deterministic-${testInfo.testId}`, clock: 'controlled',
    // No inferred hardware, foreground, profile or target performance qualification.
    target: { contentSha256: await network.contentHash() },
    ready: captured.ready!, startup: captured.startup!, frames: captured.frames, phases: captured.phases,
    actions, interruptions: captured.interruptions, network: await network.snapshot(captured.ready!.timeOrigin),
    boundaries: { warmupEnd, dispatchStart, repairStart: repair.start, orbitStart },
  }
  const result = qualify(report)
  expect(result.status).toBe('unqualified')
  expect(result.failures).toEqual([])
  expect(result.issues.filter((issue) => !/^(target\.|hardware WebGL renderer prerequisite|application commit missing|native report prerequisite|content\/profile\/recipe identity mismatch)/.test(issue))).toEqual([])
  const run = process.env.CS3_JOB_ROOT?.split('/').at(-1) ?? `manual-${Date.now()}`
  const written = await writeQualification([report], resolve(`.artifacts/qualification/${run}/deterministic`))
  expect(written.results).toHaveLength(1)
  await network.close()
})
