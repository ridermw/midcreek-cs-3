import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { lstat, open, readFile, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { chromium } from '@playwright/test'
import type { Browser, CDPSession, Page } from '@playwright/test'
import { PERFORMANCE_BUDGET, WALK_LOOP } from '../src/config/performanceBudget.ts'
import type { NetworkReceipt, Status } from '../src/diagnostics/metrics.ts'
import { observeQualificationNetwork, serveQualification } from '../tests/e2e/qualificationHarness.ts'
import { qualificationRoot, writeQualification } from './qualification.ts'
import {
  makeNativeReport, nativePlacementIssues, nativeRunIds, nativeTarget, NATIVE_USAGE,
  parseNativeArguments, parseTargetMetadata, readNativePageEvidence,
} from './qualificationNative.ts'
import type { NativeArguments, NativePageEvidence, NativeSnapshot, NativeTargetMetadata } from './qualificationNative.ts'
import { installNativeWorkload } from './qualificationNativePage.ts'
import type { NativePageCapture } from './qualificationNativePage.ts'
import { createNativeWorkload } from './qualificationWorkload.ts'

const exec = promisify(execFile)
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error)
const applicationPaths = ['src', 'config', 'blender/render_profile.json', 'vite.config.ts', 'play', 'index.html', 'package-lock.json', 'docs/architecture/cs3-provisional-development-use-2026-09-11.json']

async function git(...args: string[]) {
  return (await exec('git', args, { maxBuffer: 16 * 1024 * 1024 })).stdout.trim()
}
async function sourceEvidence() {
  return {
    head: await git('rev-parse', 'HEAD'),
    status: await git('status', '--porcelain=v1', '--untracked-files=all'),
    applicationChanges: await git('status', '--porcelain=v1', '--untracked-files=all', '--', ...applicationPaths),
    applicationDiffSha256: sha256(await git('diff', 'HEAD', '--', ...applicationPaths)),
  }
}

export async function withNativeLock<T>(root: string, operation: () => Promise<T>): Promise<T> {
  const path = resolve(root, '.native-runner.lock')
  let lock
  try { lock = await open(path, 'wx', 0o600) } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'EEXIST') {
      throw new Error(`NATIVE_RUN_BUSY: ${path}; do not remove a live runner's lock`)
    }
    throw error
  }
  try {
    await lock.writeFile(`${JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })}\n`)
    return await operation()
  } finally {
    await lock.close()
    await rm(path)
  }
}

async function waitForWorkload(page: Page, timeoutMs: number, signal: AbortSignal) {
  signal.throwIfAborted()
  let abort: () => void = () => {}
  try {
    await Promise.race([
      page.waitForFunction(() => window.u8Native?.done, undefined, { timeout: timeoutMs, polling: 250 }),
      new Promise<never>((_, reject) => {
        abort = () => reject(signal.reason)
        signal.addEventListener('abort', abort, { once: true })
      }),
    ])
  } finally {
    signal.removeEventListener('abort', abort)
  }
}

async function runNative(
  runId: string, options: NativeArguments, metadata: NativeTargetMetadata, root: string, signal: AbortSignal,
): Promise<Status> {
  let server: Awaited<ReturnType<typeof serveQualification>> | undefined
  let browser: Browser | undefined
  let page: Page | undefined
  let cdp: CDPSession | undefined
  let observer: Awaited<ReturnType<typeof observeQualificationNetwork>> | undefined
  let captured: NativeSnapshot | undefined
  let workload: Omit<NativePageCapture, 'stop'> | undefined
  let observed: NativePageEvidence | undefined
  let browserVersion: string | undefined
  let contentSha256: string | undefined
  let applicationCommit = ''
  let timeOrigin = 0
  let collecting = true
  let windowId: number | undefined
  let sourceBefore: Awaited<ReturnType<typeof sourceEvidence>> | undefined
  const errors: { wallTime: number; kind: string; detail: string }[] = []
  const record = (kind: string, error: unknown) => errors.push({ wallTime: Date.now(), kind, detail: errorText(error) })
  let network: NetworkReceipt = { source: 'cdp', complete: false, overflow: false, requests: [] }
  const evidence: Record<string, unknown> = {
    schema: 1, runner: 'u8-native', startedAt: new Date().toISOString(), runId,
    declaration: metadata, options,
    refreshSource: 'operator declaration tied to explicit desktop display bounds; never inferred from built-in display or RAF',
  }
  const recipe = {
    firstFrames: PERFORMANCE_BUDGET.firstFrames, warmupSeconds: PERFORMANCE_BUDGET.warmupSeconds,
    windowFrames: PERFORMANCE_BUDGET.windowFrames, walkLoop: WALK_LOOP,
  }
  const script = `(${installNativeWorkload.toString()})(${createNativeWorkload.toString()},${JSON.stringify(recipe)});`
  evidence.workloadSha256 = sha256(script)
  evidence.runnerSha256 = sha256(await readFile(new URL(import.meta.url), 'utf8'))
  try {
    signal.throwIfAborted()
    applicationCommit = await git('rev-parse', '--verify', `${options.applicationCommit}^{commit}`)
    sourceBefore = await sourceEvidence()
    evidence.sourceBefore = sourceBefore
    if (applicationCommit !== sourceBefore.head) record('application-commit', 'requested application commit is not runtime git HEAD')
    if (sourceBefore.applicationChanges) record('application-source', 'application/build inputs differ from the recorded commit')
    server = await serveQualification({ port: options.port })
    signal.throwIfAborted()
    const launchArgs = [`--window-position=${options.windowX},${options.windowY}`, '--window-size=1280,850']
    evidence.launch = { channel: 'chrome', headless: false, args: launchArgs }
    browser = await chromium.launch({ channel: 'chrome', headless: false, args: launchArgs })
    browserVersion = browser.version()
    browser.on('disconnected', () => { if (collecting) record('browser-disconnected', 'Chrome disconnected before capture completed') })
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, serviceWorkers: 'block',
    })
    page = await context.newPage()
    page.on('pageerror', (error) => { if (collecting) record('page-error', error) })
    page.on('crash', () => { if (collecting) record('page-crash', 'page crashed') })
    page.on('close', () => { if (collecting) record('page-closed', 'page closed before capture completed') })
    cdp = await context.newCDPSession(page)
    evidence.browser = await cdp.send('Browser.getVersion')
    const window = await cdp.send('Browser.getWindowForTarget')
    windowId = window.windowId
    await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } })
    await cdp.send('Browser.setWindowBounds', { windowId, bounds: { left: options.windowX, top: options.windowY } })
    const initialBounds = (await cdp.send('Browser.getWindowBounds', { windowId })).bounds
    evidence.initialWindowBounds = initialBounds
    for (const issue of nativePlacementIssues(initialBounds, metadata, options)) record('display-prerequisite', issue)
    observer = await observeQualificationNetwork(page)
    let resizing = false
    await page.exposeFunction('u8Resize', async (width: number, height: number) => {
      if (resizing || !((width === 1024 && height === 768) || (width === 1280 && height === 720))) {
        throw new Error('NATIVE_RESIZE: invalid or overlapping viewport request')
      }
      resizing = true
      try { await page!.setViewportSize({ width, height }) } finally { resizing = false }
    })
    await page.addInitScript({ content: script })
    await page.bringToFront()
    await page.goto(server.url, { waitUntil: 'load', timeout: Math.min(options.timeoutMs, 40_000) })
    await page.bringToFront()
    await waitForWorkload(page, options.timeoutMs, signal)
  } catch (error) {
    record('runner-error', error)
  } finally {
    if (page && !page.isClosed()) {
      try {
        const result = await page.evaluate(() => {
          window.u8Native?.stop()
          return {
            captured: window.midcreek?.diagnostics.snapshot(), timeOrigin: performance.timeOrigin,
            workload: window.u8Native ? {
              done: window.u8Native.done, actions: window.u8Native.actions,
              interruptions: window.u8Native.interruptions,
              resizeRequests: window.u8Native.resizeRequests, windowPositions: window.u8Native.windowPositions,
            } : undefined,
          }
        })
        captured = result.captured
        workload = result.workload
        timeOrigin = result.timeOrigin
      } catch (error) { record('capture-error', error) }
      try { observed = await page.evaluate(readNativePageEvidence) } catch (error) { record('page-evidence-error', error) }
      if (cdp && windowId !== undefined) {
        try {
          const finalBounds = (await cdp.send('Browser.getWindowBounds', { windowId })).bounds
          evidence.finalWindowBounds = finalBounds
          for (const issue of nativePlacementIssues(finalBounds, metadata, options)) record('display-prerequisite', issue)
        } catch (error) { record('display-evidence-error', error) }
      }
    }
    if (observer) {
      try { network = await observer.snapshot(timeOrigin) } catch (error) { record('network-evidence-error', error) }
      try { contentSha256 = await observer.contentHash() } catch (error) { record('content-hash-error', error) }
      try { await observer.close() } catch (error) { record('network-close-error', error) }
    }
    try {
      const sourceAfter = await sourceEvidence()
      evidence.sourceAfter = sourceAfter
      if (!sourceBefore || sourceBefore.head !== sourceAfter.head || sourceBefore.applicationDiffSha256 !== sourceAfter.applicationDiffSha256
        || sourceBefore.applicationChanges !== sourceAfter.applicationChanges) record('application-source', 'application source changed during run')
    } catch (error) { record('source-evidence-error', error) }
    collecting = false
    if (browser) {
      try { await browser.close() } catch (error) { record('browser-close-error', error) }
    }
    if (server) {
      try { await server.close() } catch (error) { record('server-close-error', error) }
    }
  }
  const report = makeNativeReport({
    runId, captured, network, actions: workload?.actions ?? [],
    target: nativeTarget(metadata, observed, browserVersion, applicationCommit, captured, contentSha256),
    interruptions: [...(workload?.interruptions ?? []), ...errors.map((error) => ({
      at: timeOrigin ? Math.max(0, error.wallTime - timeOrigin) : 0, kind: error.kind, detail: error.detail,
    }))],
  })
  evidence.page = observed
  evidence.workload = workload
  evidence.errors = errors
  evidence.finishedAt = new Date().toISOString()
  const output = resolve(root, runId)
  const result = await writeQualification([report], output, evidence)
  // The writer deliberately leaves a one-report aggregate unqualified. Report the individual run separately.
  const status = result.results[0]?.status ?? 'unqualified'
  console.log(JSON.stringify({ runId, status, report: resolve(output, 'runs/1/report.json'), result: resolve(output, 'result.json') }))
  return status
}

export async function nativeMain(args: readonly string[], env: NodeJS.ProcessEnv = process.env) {
  if (args.length === 1 && args[0] === '--help') { console.log(NATIVE_USAGE); return 0 }
  const options = parseNativeArguments(args, env)
  const fromFile: unknown = options.targetFile ? JSON.parse(await readFile(options.targetFile, 'utf8')) : {}
  const fromEnv: unknown = options.targetJson ? JSON.parse(options.targetJson) : {}
  const metadata = parseTargetMetadata({ ...parseTargetMetadata(fromEnv), ...parseTargetMetadata(fromFile) })
  const root = await qualificationRoot()
  return withNativeLock(root, async () => {
    const ids = nativeRunIds(options)
    for (const runId of ids) {
      try {
        await lstat(resolve(root, runId))
        throw new Error(`EXISTING_OUTPUT: preserve previous evidence: ${runId}`)
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
      }
    }
    const abort = new AbortController()
    const stop = (signal: string) => abort.abort(new Error(`RUN_INTERRUPTED: ${signal}`))
    const sigint = () => stop('SIGINT'), sigterm = () => stop('SIGTERM')
    process.once('SIGINT', sigint)
    process.once('SIGTERM', sigterm)
    const statuses: Status[] = []
    try {
      for (const runId of ids) {
        statuses.push(await runNative(runId, options, metadata, root, abort.signal))
        if (abort.signal.aborted) break
      }
    } finally {
      process.removeListener('SIGINT', sigint)
      process.removeListener('SIGTERM', sigterm)
    }
    return statuses.includes('unqualified') || abort.signal.aborted ? 2 : statuses.includes('failed') ? 1 : 0
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  nativeMain(process.argv.slice(2)).then((code) => { process.exitCode = code }, (error: unknown) => {
    console.error(JSON.stringify({ status: 'unqualified', issues: [errorText(error)] }))
    process.exitCode = 2
  })
}
