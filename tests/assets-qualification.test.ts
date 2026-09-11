import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import { canonicalJson, createManifestFromExport, digest } from '../tools/assets/contracts.ts'
import type { ExportReceipt, FileIdentity } from '../tools/assets/contracts.ts'
import {
  loadQualificationAmendment, qualifyAndWriteReceipt, qualifyAssetRuns, runQualificationCli,
} from '../tools/qualify-assets.ts'
import type { QualificationBaseline } from '../tools/qualify-assets.ts'

const roots: string[] = []
const repository = resolve(import.meta.dirname, '..')
const matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
const commit = 'a'.repeat(40)
const hash = (s: string) => digest(s)
const ids = ['floor-slab', 'rack-standard', 'cooling-unit', 'technician-man', 'coolant-leak'] as const
const code = { 'source/check.mjs': hash('checker') }
const box = (x: number, z: number, low: number, high: number) => ({
  min: { x: -x, y: low, z: -z }, max: { x, y: high, z },
})

async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'cs3-qualification-')))
  roots.push(root)
  async function put(path: string, value: unknown): Promise<FileIdentity> {
    const bytes = typeof value === 'string' ? value : canonicalJson(value) + '\n'
    await mkdir(dirname(join(root, path)), { recursive: true })
    await writeFile(join(root, path), bytes)
    return { path, sha256: hash(bytes), bytes: Buffer.byteLength(bytes) }
  }
  const source = await put('source/library.blend', 'synthetic blend')
  await put('source/check.mjs', 'checker')
  const parentAuthorization = await put('authorization.json', { testOnly: true })
  const declarations = ids.map((id, index) => {
    const bounds = [box(8.5, 7.5, -0.1, 0), box(.4, .4, 0, 2.1), box(.4, .4, 0, 2.1),
      box(.25, .2, 0, 1.73), box(.45, .45, 0, .02)][index]!
    const rest = ['Root', 'Body'].map((node) => ({ node, localMatrix: matrix, worldMatrix: matrix }))
    return {
      id, scene: 'Scene', root: 'Root',
      nodes: [
        { id: 'Root', parent: null, mesh: false, primitives: 0, triangles: 0, materials: [], uvSets: [] },
        { id: 'Body', parent: 'Root', mesh: true, primitives: 1, triangles: 1, materials: ['Surface'], uvSets: [] },
      ],
      coordinates: { units: 'meters' as const, up: 'Y' as const, handedness: 'right' as const,
        front: '+Z' as const, pivot: 'floor-center' as const, rootMatrix: matrix },
      geometry: { meshes: 1, primitives: 1, triangles: 1 }, restBounds: bounds, animatedBounds: bounds,
      materials: [{ name: 'Surface', classification: 'portable-pbr' as const, alphaMode: 'OPAQUE' as const,
        baseColor: [1, 1, 1, 1], roughness: .85, metallic: 0, textures: [] }],
      textures: [], allowedExtensions: [], rest,
      clips: id === 'technician-man' ? ['Idle', 'Walk', 'Repair'].map((name) => {
        const duration = name === 'Walk' ? 1 : 2
        return { name, duration, frames: [1, 1 + 30 * duration], fps: 30, fpsBase: 1,
          rootMotion: false, loop: 'duplicate-end' as const,
          tracks: [{ node: 'Body', path: 'translation' as const, interpolation: 'LINEAR' as const, times: [0, duration] }],
          samples: [0, duration / 2, duration].map((time) => ({ time, bounds, transforms: rest })) }
      }) : [],
      permissions: { publicAssetApproved: false, sources: [{
        path: source.path, sha256: source.sha256, attribution: 'Synthetic fixture', terms: 'Test only',
      }], textures: [], fonts: [] },
    }
  })
  const specification = { schema: 1 as const, assets: declarations }
  const inputs: ExportReceipt['inputs'] = []
  for (const [name, role] of [['spec.json', 'specification'], ['exporter.py', 'exporter'], ['builder.py', 'script']] as const) {
    inputs.push({ ...await put(`source/${name}`, name), role })
  }
  const assets = declarations.map((asset) => ({
    ...asset, file: `${asset.id}.glb`, sha256: hash(asset.id), bytes: Buffer.byteLength(asset.id),
  }))
  const technical = {
    schema: 1, kind: 'cs3-library-export', complete: true, sourceSha256: source.sha256,
    strictSpecificationSha256: hash(canonicalJson(specification)), profile: 'cs3-standard-v1',
    authoringReceiptSha256: hash('authoring'), assets,
  }
  const processReceipt = { schema: 1, kind: 'cs3-export-process', exitCode: 0,
    sourceCommit: commit, sourceSha256: source.sha256, exporterRevision: commit }
  for (const [path, value] of Object.entries({
    'technical.json': technical, 'process.json': processReceipt,
    'export.pending.json': { kind: 'cs3-export-pending' },
  })) {
    const item = await put(`r1/${path}`, value)
    inputs.push({ ...item, path, role: 'script' })
  }
  const receipt: ExportReceipt = {
    schema: 1, kind: 'cs3-library-export', complete: true,
    source: { ...source, commit }, specification, specificationSha256: hash(canonicalJson(specification)), inputs,
    profile: 'cs3-standard-v1', profileSha256: hash('profile'), recipeSha256: hash('recipe'),
    tools: { node: '22.23.1', blender: '5.2.1', blenderBuild: '9e2066aef7ef', gltfExporter: '5.2.40' },
    exporter: { path: 'source/exporter.py', sha256: hash('exporter.py'), revision: commit, exitCode: 0 },
    assets,
  }
  const manifest = createManifestFromExport(receipt)
  const exportPin = await put('r1/export.json', manifest.exportReceipt)
  const manifestPin = await put('r1/manifest.json', manifest)
  const identity = {
    sourceCommit: commit, sourceSha256: source.sha256, exporterRevision: commit,
    exporterSha256: receipt.exporter.sha256, specificationSha256: receipt.specificationSha256,
    profile: receipt.profile, profileSha256: receipt.profileSha256, recipeSha256: receipt.recipeSha256,
    exportReceiptSha256: exportPin.sha256, manifestSha256: manifestPin.sha256,
    libraryDigest: manifest.libraryDigest, technicalSha256: hash(canonicalJson(technical) + '\n'),
  }
  async function job(id: string, command: string[], hour: number) {
    const log = await put(`jobs/${id}.log`, 'synthetic log')
    return put(`jobs/${id}.job.json`, {
      authorization_sha256: parentAuthorization.sha256, complete: true, exit_code: 0,
      command, log_sha256: log.sha256, started_utc: `2026-09-11T${hour}:00:00.000Z`,
      seconds: 1, job_timeout_seconds: 900,
    })
  }
  const runs: QualificationBaseline['runs'] = []
  for (const [index, run] of ['r1', 'r2'].entries()) {
    for (const path of ['export.json', 'manifest.json', 'technical.json', 'process.json', 'export.pending.json']) {
      if (run !== 'r1') await put(`${run}/${path}`, await readFile(join(root, 'r1', path), 'utf8'))
    }
    for (const asset of assets) await put(`${run}/candidate/${asset.file}`, asset.id)
    const captures = []
    const browserCaptures = []
    for (let n = 0; n < 30; n++) {
      const file = `view-${n}.png`
      const image = await put(`${run}/source-views/${file}`, `source ${n}`)
      const capture = { file, sha256: image.sha256, asset: ids[n % 5], profile: receipt.profile,
        clip: null, time: 0, camera: { matrix_world: matrix } }
      captures.push(capture)
      await put(`${run}/source-views/${file}.capture.json`, {
        schema: 1, kind: 'cs3-image-capture', renderer: 'source', sourceSha256: source.sha256, capture,
      })
      const browser = await put(`${run}/browser-${file}`, `browser ${n}`)
      const contact = await put(`${run}/contact-${file}`, `contact ${n}`)
      browserCaptures.push({
        file: `browser-${file}`, sha256: browser.sha256, contact: `contact-${file}`, contactSha256: contact.sha256,
        source: file, clip: null, time: 0, profile: receipt.profile, camera: matrix,
      })
      for (const [renderer, name, sha256] of [
        ['browser', `browser-${file}`, browser.sha256], ['comparison', `contact-${file}`, contact.sha256],
      ]) await put(`${run}/${name}.capture.json`, {
        schema: 1, kind: 'cs3-image-capture', renderer, sourceSha256: source.sha256,
        capture: { ...capture, file: name, sha256, camera: matrix },
      })
    }
    const captureReceipt = await put(`${run}/source-views/captures.json`, {
      schema: 1, kind: 'cs3-library-source-captures', complete: true, sourceSha256: source.sha256,
      exportSha256: exportPin.sha256, authoringReceiptSha256: technical.authoringReceiptSha256,
      profile: receipt.profile, captures,
    })
    const checks = await put(`${run}/checks.json`, {
      kind: 'cs3-library-checks', complete: true, source: source.sha256, profile: receipt.profile,
      exportReceiptSha256: exportPin.sha256, captureReceiptSha256: captureReceipt.sha256, code,
      checks: Array.from({ length: 31 }, (_, n) => ({ name: `check ${n}`, pass: true })),
      captures: browserCaptures, blockedExternal: [], browserWarnings: [],
    })
    runs.push({
      id: run, root: run, checks: { ...checks, path: 'checks.json' },
      captures: { ...captureReceipt, path: 'source-views/captures.json' },
      jobs: {
        export: await job(`${run}-export`, ['python3', '-B', 'blender/export_library.py',
          '--source', 'source/library.blend', '--sha256', source.sha256, '--output', run,
          '--source-commit', commit, '--exporter-revision', commit, '--node', 'node', '--blender', 'blender'], 10 + index * 3),
        capture: await job(`${run}-capture`, ['blender', '--background', '--factory-startup', '--disable-autoexec',
          '--python-exit-code', '1', '--python', 'blender/capture_library.py', '--', '--export',
          `${run}/export.json`, '--output', `${run}/source-views`], 11 + index * 3),
        check: await job(`${run}-check`, ['node', 'probes/r2/check.mjs', run, 'checks'], 12 + index * 3),
      },
    })
  }
  const regressionExport = await put('regression/export.json', {
    complete: true, source_sha256: hash('regression source'), script_sha256: hash('regression exporter'),
    artifacts: {}, selection: '8 objects',
  })
  const regressionCaptures = []
  for (let n = 0; n < 10; n++) {
    const image = await put(`regression/${n}.png`, `regression ${n}`)
    regressionCaptures.push({ file: `${n}.png`, sha256: image.sha256 })
  }
  const regressionChecks = await put('regression/checks.json', {
    complete: true, source: hash('regression source'), exportScript: hash('regression exporter'), code,
    checks: Array.from({ length: 16 }, (_, n) => ({ name: `regression ${n}`, pass: true, detail: { nodes: 8 } })),
    captures: regressionCaptures, blockedExternal: [], browserWarnings: [],
  })
  const baseline: QualificationBaseline = {
    repository: 'ridermw/midcreek-cs-3', branch: 'main', parentAuthorization, sourceRoot: 'source',
    identity, checkerCodeSha256: hash(canonicalJson(code)), runs,
    regression: { root: 'regression', sourceSha256: hash('regression source'),
      export: { ...regressionExport, path: 'export.json' }, checks: { ...regressionChecks, path: 'checks.json' },
      job: await job('regression', ['node', 'probes/r2/check.mjs', 'regression', 'checks'], 16) },
  }
  return { root, baseline, put, manifest }
}

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

describe('technical-only two-run qualification', () => {
  it('is deterministic, hashes evidence, and grants no appearance/performance/publication approval', async () => {
    const { root, baseline } = await fixture()
    const result = await qualifyAssetRuns(root, baseline)
    expect(result).toEqual(await qualifyAssetRuns(root, baseline))
    expect(result.technicalQualified).toBe(true)
    expect(result.gates).toMatchObject({
      appearance: { accepted: false, status: 'pending' }, performance: { qualified: false, status: 'pending' },
      publication: { approved: false, status: 'blocked' }, release: { approved: false, status: 'blocked' },
    })
    expect(result.inputs.some((item) => item.path === 'r2/candidate/technician-man.glb')).toBe(true)
    expect(result.runs.map((run) => [run.checkCount, run.captureCount])).toEqual([[31, 30], [31, 30]])
    expect(result.regression.checkCount).toBe(16)
  })

  it.each(['one', 'three', 'duplicate', 'alias'] as const)('rejects %s run selection', async (fault) => {
    const { root, baseline } = await fixture()
    if (fault === 'one') baseline.runs.pop()
    if (fault === 'three') baseline.runs.push(structuredClone(baseline.runs[0]!))
    if (fault === 'duplicate') baseline.runs[1] = structuredClone(baseline.runs[0]!)
    if (fault === 'alias') {
      await symlink(join(root, 'r1'), join(root, 'alias'))
      baseline.runs[1]!.root = 'alias'
    }
    await expect(qualifyAssetRuns(root, baseline)).rejects.toThrow()
  })

  it.each([
    'sourceCommit', 'sourceSha256', 'exporterRevision', 'exporterSha256', 'specificationSha256',
    'profile', 'profileSha256', 'recipeSha256', 'libraryDigest', 'manifestSha256', 'technicalSha256',
    'exportReceiptSha256',
  ] as const)('rejects stale %s', async (key) => {
    const { root, baseline } = await fixture()
    baseline.identity[key] = key === 'profile' ? 'other-profile' : 'b'.repeat(key.endsWith('Commit') || key === 'exporterRevision' ? 40 : 64)
    await expect(qualifyAssetRuns(root, baseline)).rejects.toThrow()
  })

  it.each([
    'r2/export.json', 'r2/manifest.json', 'r2/technical.json', 'r2/process.json', 'r2/export.pending.json',
    'r2/checks.json', 'r2/candidate/technician-man.glb', 'r2/source-views/captures.json',
    'r2/source-views/view-0.png', 'r2/browser-view-0.png', 'r2/contact-view-0.png',
    'r2/browser-view-0.png.capture.json', 'jobs/r2-export.job.json', 'jobs/r2-check.log',
    'regression/checks.json', 'regression/export.json', 'regression/0.png', 'source/library.blend', 'source/check.mjs',
  ])('rejects missing or corrupt input %s', async (path) => {
    const { root, baseline, put } = await fixture()
    await put(path, 'corrupt')
    await expect(qualifyAssetRuns(root, baseline)).rejects.toThrow()
    await rm(join(root, path))
    await expect(qualifyAssetRuns(root, baseline)).rejects.toThrow()
  })

  it.each(['incomplete', 'failed', 'missing-check', 'extra-check', 'duplicate-check', 'missing-capture', 'code', 'source', 'export', 'capture'] as const)(
    'rejects semantically %s checker evidence even with a matching receipt hash', async (fault) => {
      const { root, baseline, put } = await fixture()
      const pin = baseline.runs[1]!.checks
      const check = JSON.parse(await readFile(join(root, 'r2', pin.path), 'utf8'))
      if (fault === 'incomplete') check.complete = false
      if (fault === 'failed') check.checks[0].pass = false
      if (fault === 'missing-check') check.checks.pop()
      if (fault === 'extra-check') check.checks.push({ name: 'extra', pass: true })
      if (fault === 'duplicate-check') check.checks[1] = check.checks[0]
      if (fault === 'missing-capture') check.captures.pop()
      if (fault === 'code') check.code['check.mjs'] = hash('stale')
      if (fault === 'source') check.source = hash('stale')
      if (fault === 'export') check.exportReceiptSha256 = hash('stale')
      if (fault === 'capture') check.captureReceiptSha256 = hash('stale')
      baseline.runs[1]!.checks = { ...await put(`r2/${pin.path}`, check), path: pin.path }
      await expect(qualifyAssetRuns(root, baseline)).rejects.toThrow()
    },
  )

  it.each(['incomplete', 'exit', 'command', 'authorization', 'future'] as const)('rejects %s guarded jobs', async (fault) => {
    const { root, baseline, put } = await fixture()
    const pin = baseline.runs[1]!.jobs.check
    const job = JSON.parse(await readFile(join(root, pin.path), 'utf8'))
    if (fault === 'incomplete') job.complete = false
    if (fault === 'exit') job.exit_code = 1
    if (fault === 'command') job.command[2] = 'r1'
    if (fault === 'authorization') job.authorization_sha256 = hash('other')
    if (fault === 'future') job.started_utc = '2999-01-01T00:00:00Z'
    baseline.runs[1]!.jobs.check = await put(pin.path, job)
    await expect(qualifyAssetRuns(root, baseline)).rejects.toThrow()
  })

  it('rejects extra candidate files and never creates a production pointer', async () => {
    const { root, baseline, put } = await fixture()
    await put('r2/candidate/extra.glb', 'extra')
    await expect(qualifyAssetRuns(root, baseline)).rejects.toThrow()
    await expect(readFile(join(root, 'assets/library/manifest.json'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it.each(['incomplete', 'failed', 'missing-check', 'extra-capture', 'source', 'code', 'nodes'] as const)(
    'rejects a semantically %s R2 regression with repinned bytes', async (fault) => {
      const { root, baseline, put } = await fixture()
      const pin = baseline.regression.checks
      const checks = JSON.parse(await readFile(join(root, 'regression', pin.path), 'utf8'))
      if (fault === 'incomplete') checks.complete = false
      if (fault === 'failed') checks.checks[0].pass = false
      if (fault === 'missing-check') checks.checks.pop()
      if (fault === 'extra-capture') checks.captures.push(checks.captures[0])
      if (fault === 'source') checks.source = hash('stale')
      if (fault === 'code') checks.code['check.mjs'] = hash('stale')
      if (fault === 'nodes') for (const check of checks.checks) check.detail.nodes = 7
      baseline.regression.checks = { ...await put(`regression/${pin.path}`, checks), path: pin.path }
      await expect(qualifyAssetRuns(root, baseline)).rejects.toThrow()
    },
  )

  it('does not turn image-comparison numbers into appearance acceptance', async () => {
    const { root, baseline, put } = await fixture()
    for (const run of baseline.runs) {
      const path = `${run.root}/${run.checks.path}`
      const checks = JSON.parse(await readFile(join(root, path), 'utf8'))
      for (const capture of checks.captures) capture.comparison = { meanAbsoluteRgb: 255, silhouetteIoU: 0 }
      run.checks = { ...await put(path, checks), path: run.checks.path }
    }
    const result = await qualifyAssetRuns(root, baseline)
    expect(result.technicalQualified).toBe(true)
    expect(result.gates.appearance).toEqual({ accepted: false, status: 'pending' })
  })

  it('atomically writes canonical, idempotent local receipts without selecting a package', async () => {
    const { root, baseline } = await fixture()
    const result = await qualifyAndWriteReceipt(root, baseline)
    const bytes = await readFile(result.receiptPath, 'utf8')
    expect(bytes).toBe(canonicalJson(result.qualification) + '\n')
    expect(result.receiptPath).toContain('/.artifacts/assets/u5-c5/')
    expect(await qualifyAndWriteReceipt(root, baseline)).toEqual(result)
    await expect(readFile(join(root, 'assets/library/development/selection.json'))).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(join(root, 'assets/library/manifest.json'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('preserves an existing receipt on stale evidence or differing output', async () => {
    const { root, baseline, put } = await fixture()
    const result = await qualifyAndWriteReceipt(root, baseline)
    const bytes = await readFile(result.receiptPath, 'utf8')
    await put('r2/candidate/floor-slab.glb', 'bad')
    await expect(qualifyAndWriteReceipt(root, baseline)).rejects.toThrow()
    expect(await readFile(result.receiptPath, 'utf8')).toBe(bytes)
    await put('r2/candidate/floor-slab.glb', 'floor-slab')
    await writeFile(result.receiptPath, 'different prior receipt')
    await expect(qualifyAndWriteReceipt(root, baseline)).rejects.toThrow(/refusing replacement/)
    expect(await readFile(result.receiptPath, 'utf8')).toBe('different prior receipt')
  })

  it('loads a strict unsigned selection subobject and rejects extra authority fields', async () => {
    const { root, put } = await fixture()
    const path = 'docs/architecture/cs3-provisional-development-use-2026-09-11.json'
    const amendment = JSON.parse(await readFile(join(repository, path), 'utf8'))
    await put(path, amendment)
    expect((await loadQualificationAmendment(root)).selectionAmendment.allowedUses)
      .toEqual(['local-playable', 'local-showcase', 'local-validation'])
    amendment.selectionAmendment.appearanceAccepted = true
    await put(path, amendment)
    await expect(loadQualificationAmendment(root)).rejects.toThrow(/UNKNOWN_FIELD/)
  })

  it.each(['missing-authority', 'worker', 'uses', 'appearance', 'private-path'] as const)(
    'rejects contradictory outer amendment authority: %s', async (fault) => {
      const { root, put } = await fixture()
      const path = 'docs/architecture/cs3-provisional-development-use-2026-09-11.json'
      const amendment = JSON.parse(await readFile(join(repository, path), 'utf8'))
      if (fault === 'missing-authority') delete amendment.authority
      if (fault === 'worker') amendment.authority.actor = 'worker'
      if (fault === 'uses') amendment.allowedUses = []
      if (fault === 'appearance') amendment.checkpointState.appearanceAccepted = true
      if (fault === 'private-path') amendment.authority.objectivePath = '/Users/private/objective.md'
      await put(path, amendment)
      await expect(loadQualificationAmendment(root)).rejects.toThrow()
    },
  )

  it('executes as a typed Node CLI and fails invalid arguments noninteractively', async () => {
    await expect(promisify(execFile)(process.execPath, ['--experimental-strip-types',
      join(repository, 'tools/qualify-assets.ts'), '--publish'])).rejects.toMatchObject({
      code: 1, stderr: expect.stringContaining('ARGUMENTS'),
    })
  })

  it('rejects invalid CLI options before reading evidence or writing output', async () => {
    await expect(runQualificationCli(repository, ['--select', 'public-release'])).rejects.toThrow()
    await expect(runQualificationCli(repository, ['--output', 'assets/library/manifest.json'])).rejects.toThrow()
  })

  it('ignores development packages, receipts, locks and all pointers by default', async () => {
    const paths = ['assets/library/development/selection.json', 'assets/library/packages/hash/model.glb',
      'assets/library/receipts/hash.json', 'assets/library/.promotion.lock', 'assets/library/manifest.json']
    const { stdout } = await promisify(execFile)('git', ['check-ignore', '--no-index', ...paths], { cwd: repository })
    expect(stdout.trim().split('\n')).toEqual(paths)
  })
})

it.runIf(process.env.CS3_U5_RETAINED === '1')('qualifies the actual frozen retained runs read-only', async () => {
  const amendment = await loadQualificationAmendment(repository)
  const result = await qualifyAssetRuns(repository, amendment.technicalQualification)
  expect(result.identity.libraryDigest).toBe('200366356f3665ac9ef45c404bd9462e29b2ae0c813b688c4df3ed2cf119a934')
  expect(result.runs.map((run) => run.checkCount)).toEqual([31, 31])
  expect(result.regression.checkCount).toBe(16)
  expect(amendment.selectionAmendment.binding.manifestSha256).toBe(result.identity.manifestSha256)
}, 120_000)
