import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import {
  canonicalJson,
  createManifestFromExport,
  promoteAssetLibrary,
  selectProvisionalAssetLibrary,
  validateAssetLibrary,
} from '../tools/promote-assets.ts'
import type { ExportReceipt, ProvisionalAmendment, QualifiedApproval, TransactionPhase } from '../tools/promote-assets.ts'
import { validateManifest as validateRuntimeManifest } from '../src/assets/validate.ts'

const IDS = ['floor-slab', 'rack-standard', 'cooling-unit', 'technician-man', 'coolant-leak'] as const
const temporaryRoots: string[] = []
const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
const { publicKey, privateKey } = generateKeyPairSync('ed25519')
const hash = (bytes: string | Buffer): string => createHash('sha256').update(bytes).digest('hex')
const box = (x: number, z: number, low: number, high: number) => ({
  min: { x: -x, y: low, z: -z }, max: { x, y: high, z },
})
const bounds = [
  box(8.5, 7.5, -0.1, 0), box(0.4, 0.4, 0, 2.1), box(0.4, 0.4, 0, 2.1),
  box(0.25, 0.2, 0, 1.73), box(0.45, 0.45, 0, 0.02),
]

// Synthetic declarations exercise the packaging contract, not Blender/appearance qualification.
function receiptFixture(): ExportReceipt {
  const specifications = IDS.map((id, index) => {
    const root = `${id}-root`
    const body = `${id}-body`
    const restBounds = bounds[index]!
    const animatedBounds = index === 3 ? box(0.45, 0.45, 0, 1.8) : restBounds
    const rest = [
      { node: root, localMatrix: [...identity], worldMatrix: [...identity] },
      { node: body, localMatrix: [...identity], worldMatrix: [...identity] },
    ]
    return {
      id, scene: 'Scene', root,
      nodes: [
        { id: root, parent: null, materials: [], mesh: false, primitives: 0, triangles: 0, uvSets: [] },
        { id: body, parent: root, materials: ['Surface'], mesh: true, primitives: 1, triangles: 12, uvSets: [0] },
      ],
      coordinates: {
        units: 'meters' as const, up: 'Y' as const, handedness: 'right' as const,
        front: '+Z' as const, pivot: 'floor-center' as const, rootMatrix: [...identity],
      },
      geometry: { meshes: 1, primitives: 1, triangles: 12 },
      restBounds, animatedBounds,
      materials: [{
        name: 'Surface', classification: 'portable-pbr' as const, alphaMode: 'OPAQUE' as const,
        baseColor: [1, 1, 1, 1], roughness: 0.85, metallic: 0,
        textures: [{ texture: 'Atlas', role: 'base-color' as const, uvSet: 0 }],
      }],
      textures: [{
        name: 'Atlas', width: 2, height: 2, uvSet: 0, colorSpace: 'sRGB' as const,
        role: 'base-color' as const, embedded: true as const,
        sourcePath: 'textures/Atlas.png', sourceSha256: hash('atlas'),
        pixelSha256: hash('decoded-atlas'), pixelFormat: 'RGBA8' as const,
      }],
      allowedExtensions: [],
      clips: index === 3 ? ['Idle', 'Walk', 'Repair'].map((name) => {
        const duration = name === 'Walk' ? 1 : 2
        return {
          name, frames: [1, 1 + duration * 30], fps: 30, fpsBase: 1, duration,
          rootMotion: false as const, loop: 'duplicate-end' as const,
          tracks: [{ node: body, path: 'translation' as const, interpolation: 'LINEAR' as const, times: [0, duration] }],
          samples: [0, duration / 2, duration].map((time) => ({
            time, bounds: restBounds, transforms: structuredClone(rest),
          })),
        }
      }) : [],
      rest,
      permissions: {
        publicAssetApproved: false,
        sources: [{ path: 'library.blend', sha256: hash('blend'), attribution: 'Synthetic owned source', terms: 'Test only' }],
        textures: [{ path: 'textures/Atlas.png', sha256: hash('atlas'), attribution: 'Synthetic atlas', terms: 'Test only' }],
        fonts: [],
      },
    }
  })
  const specification = { schema: 1 as const, assets: structuredClone(specifications) }
  return {
    schema: 1, kind: 'cs3-library-export', complete: true,
    source: { path: 'library.blend', sha256: hash('blend'), bytes: 5, commit: 'a'.repeat(40) },
    specification, specificationSha256: hash(canonicalJson(specification)),
    inputs: [
      { path: 'blender/asset_spec.json', sha256: hash('raw-spec'), bytes: 8, role: 'specification' },
      { path: 'blender/export_library.py', sha256: hash('export-script'), bytes: 13, role: 'exporter' },
      { path: 'blender/build_library.py', sha256: hash('builder'), bytes: 7, role: 'script' },
      { path: 'textures/Atlas.png', sha256: hash('atlas'), bytes: 5, role: 'texture' },
    ],
    profile: 'cs3-standard-v1', profileSha256: hash('profile'), recipeSha256: hash('recipe'),
    tools: { node: '22.23.1', blender: '5.2.1', blenderBuild: '9e2066aef7ef', gltfExporter: '5.2.40' },
    exporter: {
      path: 'blender/export_library.py', sha256: hash('export-script'),
      revision: 'a'.repeat(40), exitCode: 0,
    },
    assets: specifications.map((asset) => {
      const bytes = Buffer.from(`candidate-${asset.id}`)
      return { ...structuredClone(asset), file: `${asset.id}.glb`, sha256: hash(bytes), bytes: bytes.length }
    }),
  }
}

async function temporary() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'cs3-u5-')))
  temporaryRoots.push(root)
  return root
}

async function candidate() {
  const root = await temporary()
  const candidateRoot = join(root, 'candidate')
  await mkdir(candidateRoot)
  const receipt = receiptFixture()
  for (const asset of receipt.assets) {
    await writeFile(join(candidateRoot, asset.file), `candidate-${asset.id}`)
  }
  return { root, candidateRoot, destinationRoot: join(root, 'published'), receipt }
}

function approvalFor(manifest: ReturnType<typeof createManifestFromExport>) {
  const record: QualifiedApproval = {
    kind: 'cs3-qualified-approval', id: 'synthetic-approval', issuedAt: '2026-09-11T12:00:00.000Z',
    authority: 'synthetic-test-authority',
    parentAuthorizationSha256: hash('synthetic-parent-authorization'),
    binding: {
      manifestSha256: hash(canonicalJson(manifest) + '\n'), libraryDigest: manifest.libraryDigest,
      sourceCommit: manifest.exportReceipt.source.commit, sourceSha256: manifest.exportReceipt.source.sha256,
      profile: manifest.profile, profileSha256: manifest.exportReceipt.profileSha256,
      recipeSha256: manifest.exportReceipt.recipeSha256,
    },
    appearanceAccepted: true, policyApproved: true,
    appearanceEvidenceSha256: hash('synthetic-appearance'),
    publicationPolicySha256: hash('synthetic-policy'),
  }

  return { record, signature: sign(null, Buffer.from(canonicalJson(record)), privateKey).toString('base64') }
}

function expectedIdentity(manifest: ReturnType<typeof createManifestFromExport>) {
  return {
    sourceCommit: manifest.exportReceipt.source.commit, sourceSha256: manifest.exportReceipt.source.sha256,
    specificationSha256: manifest.exportReceipt.specificationSha256,
    exporterSha256: manifest.exportReceipt.exporter.sha256,
    profile: manifest.profile, profileSha256: manifest.exportReceipt.profileSha256,
    recipeSha256: manifest.exportReceipt.recipeSha256,
    exportReceiptSha256: manifest.exportReceiptSha256,
  }
}

async function snapshot(root: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {}
  async function walk(local: string) {
    for (const item of await readdir(join(root, local), { withFileTypes: true })) {
      const file = local ? `${local}/${item.name}` : item.name
      if (item.isDirectory()) await walk(file)
      else result[file] = hash(await readFile(join(root, file)))
    }
  }
  await walk('')
  return result
}

afterEach(async () => {
  for (const root of temporaryRoots.splice(0)) await rm(root, { recursive: true, force: true })
})

function amendmentFor(manifest: ReturnType<typeof createManifestFromExport>) {
  const record: ProvisionalAmendment = {
    kind: 'cs3-provisional-amendment', id: 'synthetic-amendment-only',
    issuedAt: '2026-09-11T12:00:00.000Z', authority: 'synthetic-test-authority',
    parentAuthorizationSha256: hash('synthetic-parent-authorization'),
    binding: approvalFor(manifest).record.binding,
    allowedUses: ['local-playable', 'local-validation'],
  }
  return { record, signature: sign(null, Buffer.from(canonicalJson(record)), privateKey).toString('base64') }
}

describe('U5 separate provisional development selection', () => {
  it('accepts an actual hash-bound amendment without inventing signing infrastructure', async () => {
    const { candidateRoot, destinationRoot, receipt } = await candidate()
    const manifest = createManifestFromExport(receipt)
    const amendment = amendmentFor(manifest).record
    await selectProvisionalAssetLibrary({
      candidateRoot, destinationRoot, manifest, use: 'local-playable',
      parentAuthorizationSha256: hash('synthetic-parent-authorization'),
      trustedParentAuthorizationSha256: hash('synthetic-parent-authorization'),
      amendment,
    })
    expect(JSON.parse(await readFile(join(destinationRoot, 'development/selection.json'), 'utf8')).libraryDigest)
      .toBe(manifest.libraryDigest)
  })

  it('requires a real caller-supplied amendment; the continuation plan and candidate flags grant nothing', async () => {
    const { candidateRoot, destinationRoot, receipt } = await candidate()
    const manifest = createManifestFromExport(receipt)
    await expect(selectProvisionalAssetLibrary({
      candidateRoot, destinationRoot, manifest, use: 'local-playable',
      parentAuthorizationSha256: hash('synthetic-parent-authorization'), trustedPublicKey: publicKey,
    })).rejects.toMatchObject({ code: 'PROVISIONAL_GATE' })
    await expect(readFile(join(destinationRoot, 'manifest.json'))).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(join(destinationRoot, 'development/selection.json'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('selects development-only bytes without creating or changing the qualified pointer', async () => {
    const { candidateRoot, destinationRoot, receipt } = await candidate()
    const manifest = createManifestFromExport(receipt)
    const request = {
      candidateRoot, destinationRoot, manifest, use: 'local-playable' as const,
      parentAuthorizationSha256: hash('synthetic-parent-authorization'),
      trustedPublicKey: publicKey, amendment: amendmentFor(manifest),
    }
    await selectProvisionalAssetLibrary(request)
    await expect(readFile(join(destinationRoot, 'manifest.json'))).rejects.toMatchObject({ code: 'ENOENT' })
    const selection = JSON.parse(await readFile(join(destinationRoot, 'development/selection.json'), 'utf8'))
    expect(selection.qualification).toBe('provisional-development')
    expect(selection.libraryDigest).toBe(manifest.libraryDigest)
    const record = JSON.parse(await readFile(join(destinationRoot, selection.receipt), 'utf8'))
    expect(record.approval.amendment).toEqual(request.amendment)
    expect(record.approval.selectedUse).toBe('local-playable')
    expect(record.approval.parentAuthorizationSha256).toBe(request.parentAuthorizationSha256)
    expect(JSON.parse(await readFile(join(destinationRoot, selection.manifest), 'utf8')).appearanceAccepted).toBe(false)
    await promoteAssetLibrary({
      candidateRoot, destinationRoot, manifest, approval: approvalFor(manifest), trustedPublicKey: publicKey,
    })
    const qualifiedBefore = await readFile(join(destinationRoot, 'manifest.json'))
    receipt.recipeSha256 = hash('different-development-recipe')
    const next = createManifestFromExport(receipt)
    await selectProvisionalAssetLibrary({ ...request, manifest: next, amendment: amendmentFor(next) })
    expect(await readFile(join(destinationRoot, 'manifest.json'))).toEqual(qualifiedBefore)
    expect(JSON.parse(await readFile(join(destinationRoot, 'development/selection.json'), 'utf8')).libraryDigest).toBe(next.libraryDigest)
  })

  it.each([
    'signature', 'parent', 'date', 'invalid-calendar-date', 'missing-identity', 'use',
    'manifestSha256', 'libraryDigest', 'sourceCommit', 'sourceSha256', 'profile', 'profileSha256', 'recipeSha256',
  ] as const)('rejects a provisional amendment with wrong %s', async (fault) => {
    const { candidateRoot, destinationRoot, receipt } = await candidate()
    const manifest = createManifestFromExport(receipt)
    const amendment = amendmentFor(manifest)
    if (fault === 'parent') amendment.record.parentAuthorizationSha256 = hash('another-parent')
    else if (fault === 'date') amendment.record.issuedAt = 'not-dated'
    else if (fault === 'invalid-calendar-date') amendment.record.issuedAt = '2026-02-30T12:00:00.000Z'
    else if (fault === 'missing-identity') amendment.record.id = ''
    else if (fault === 'use') amendment.record.allowedUses = ['local-validation']
    else if (fault !== 'signature') amendment.record.binding[fault] = fault === 'profile' ? 'other' : 'b'.repeat(fault === 'sourceCommit' ? 40 : 64)
    amendment.signature = sign(null, Buffer.from(canonicalJson(amendment.record)), privateKey).toString('base64')
    if (fault === 'signature') amendment.signature = Buffer.alloc(64).toString('base64')
    const code = fault === 'signature' ? 'APPROVAL_SIGNATURE'
      : ['date', 'invalid-calendar-date'].includes(fault) ? 'APPROVAL_DATE'
        : fault === 'missing-identity' ? 'FIELD_TYPE'
          : ['parent', 'use'].includes(fault) ? 'PROVISIONAL_GATE' : 'APPROVAL_BINDING'
    await expect(selectProvisionalAssetLibrary({
      candidateRoot, destinationRoot, manifest, use: 'local-playable',
      parentAuthorizationSha256: hash('synthetic-parent-authorization'), trustedPublicKey: publicKey, amendment,
    })).rejects.toMatchObject({ code })
    await expect(readFile(join(destinationRoot, 'manifest.json'))).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(join(destinationRoot, 'development/selection.json'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('preserves both selections if provisional activation is interrupted immediately before replacement', async () => {
    const { candidateRoot, destinationRoot, receipt } = await candidate()
    const manifest = createManifestFromExport(receipt)
    await promoteAssetLibrary({ candidateRoot, destinationRoot, manifest, approval: approvalFor(manifest), trustedPublicKey: publicKey })
    const request = {
      candidateRoot, destinationRoot, manifest, use: 'local-playable' as const,
      parentAuthorizationSha256: hash('synthetic-parent-authorization'), trustedPublicKey: publicKey,
      amendment: amendmentFor(manifest),
    }
    await selectProvisionalAssetLibrary(request)
    const productionBefore = await readFile(join(destinationRoot, 'manifest.json'))
    const developmentBefore = await readFile(join(destinationRoot, 'development/selection.json'))
    receipt.recipeSha256 = hash('new-provisional-recipe')
    const next = createManifestFromExport(receipt)
    await expect(selectProvisionalAssetLibrary({
      ...request, manifest: next, amendment: amendmentFor(next),
      onPhase: async (phase) => { if (phase === 'before-pointer-replace') throw new Error('provisional-interrupted') },
    })).rejects.toThrow('provisional-interrupted')
    expect(await readFile(join(destinationRoot, 'manifest.json'))).toEqual(productionBefore)
    expect(await readFile(join(destinationRoot, 'development/selection.json'))).toEqual(developmentBefore)
  })
})

describe('U5 complete receipt and canonical manifest', () => {
  it('creates a deterministic runtime-compatible manifest without asserting appearance acceptance', () => {
    const manifest = createManifestFromExport(receiptFixture())
    expect(manifest.assets.map((asset) => asset.id)).toEqual([...IDS])
    expect(manifest.assets.every((asset) => asset.file.startsWith(`packages/${manifest.libraryDigest}/`))).toBe(true)
    expect(manifest.assets[3]!.rootName).toBe('technician-man-root')
    expect(manifest.assets[3]!.shape.restBounds).toEqual(bounds[3])
    expect(manifest.appearanceAccepted).toBe(false)
    expect(canonicalJson(manifest)).not.toContain('/Users/')
  })

  it('canonicalizes equivalent record arrays, but preserves ordered matrices and frame ranges', () => {
    const receipt = receiptFixture()
    const reordered = structuredClone(receipt)
    reordered.inputs.reverse()
    reordered.assets.reverse()
    reordered.specification.assets.reverse()
    for (const asset of [...reordered.assets, ...reordered.specification.assets]) {
      asset.nodes.reverse()
      asset.rest.reverse()
      asset.clips.reverse()
      for (const clip of asset.clips) {
        clip.tracks.reverse()
        clip.samples.reverse()
        for (const sample of clip.samples) sample.transforms.reverse()
      }
    }
    expect(createManifestFromExport(reordered)).toEqual(createManifestFromExport(receipt))
    const changed = receiptFixture()
    changed.recipeSha256 = hash('different-recipe')
    expect(createManifestFromExport(changed).libraryDigest).not.toBe(createManifestFromExport(receipt).libraryDigest)
  })

  it('changes the library digest when asset IDs are rebound to different files', () => {
    const receipt = receiptFixture()
    const changed = structuredClone(receipt)
    const cooling = changed.assets.find((asset) => asset.id === 'cooling-unit')!
    const leak = changed.assets.find((asset) => asset.id === 'coolant-leak')!
    ;[cooling.file, leak.file] = [leak.file, cooling.file]
    ;[cooling.sha256, leak.sha256] = [leak.sha256, cooling.sha256]
    ;[cooling.bytes, leak.bytes] = [leak.bytes, cooling.bytes]
    expect(createManifestFromExport(changed).libraryDigest)
      .not.toBe(createManifestFromExport(receipt).libraryDigest)
  })

  it('normalizes observed clip duration while rejecting compounded bounds tolerance', () => {
    const receipt = receiptFixture()
    receipt.assets[3]!.clips[0]!.duration = 2.000005
    receipt.specification.assets[3]!.clips[0]!.duration = 2.000005
    receipt.specificationSha256 = hash(canonicalJson(receipt.specification))
    const manifest = createManifestFromExport(receipt)
    expect(() => validateRuntimeManifest(manifest)).not.toThrow()
    expect(manifest.assets[3]!.clips[0]!.duration).toBe(2)

    receipt.assets[1]!.animatedBounds.min.x = -0.4001
    receipt.specification.assets[1]!.animatedBounds.min.x = -0.4001
    receipt.assets[1]!.restBounds.min.x = -0.40025
    receipt.specification.assets[1]!.restBounds.min.x = -0.40025
    receipt.specificationSha256 = hash(canonicalJson(receipt.specification))
    expect(() => createManifestFromExport(receipt)).toThrow(/BOUNDS/)
  })

  it('treats UV-set inventory order as irrelevant while preserving keyframe order', () => {
    const receipt = receiptFixture()
    for (const asset of [...receipt.assets, ...receipt.specification.assets]) asset.nodes[1]!.uvSets = [0, 1]
    receipt.specificationSha256 = hash(canonicalJson(receipt.specification))
    const reordered = structuredClone(receipt)
    for (const asset of [...reordered.assets, ...reordered.specification.assets]) asset.nodes[1]!.uvSets.reverse()
    expect(createManifestFromExport(reordered)).toEqual(createManifestFromExport(receipt))
    reordered.assets[3]!.clips[0]!.tracks[0]!.times.reverse()
    expect(() => createManifestFromExport(reordered)).toThrow('TRACK_TIME')
  })

  it.each([
    ['INCOMPLETE_EXPORT', (r: ExportReceipt) => { r.complete = false }],
    ['UNKNOWN_FIELD', (r: ExportReceipt) => { Object.assign(r, { appearanceAccepted: true }) }],
    ['MISSING_FIELD', (r: ExportReceipt) => { Reflect.deleteProperty(r, 'tools') }],
    ['EXPORTER_FAILED', (r: ExportReceipt) => { r.exporter.exitCode = 1 }],
    ['MISSING_FIELD', (r: ExportReceipt) => { Reflect.deleteProperty(r, 'exporter') }],
    ['ASSET_SET', (r: ExportReceipt) => { r.assets.pop() }],
    ['DUPLICATE_ID', (r: ExportReceipt) => { r.assets[1]!.id = r.assets[0]!.id }],
    ['PATH', (r: ExportReceipt) => { r.assets[0]!.file = '../escape.glb' }],
    ['PATH', (r: ExportReceipt) => { r.assets[0]!.file = '/absolute.glb' }],
    ['PATH', (r: ExportReceipt) => { r.assets[0]!.file = 'x//asset.glb' }],
    ['PATH', (r: ExportReceipt) => { r.assets[0]!.file = 'x/%2e%2e/asset.glb' }],
    ['DUPLICATE_PATH', (r: ExportReceipt) => { r.assets[1]!.file = r.assets[0]!.file }],
    ['HASH', (r: ExportReceipt) => { r.source.sha256 = 'not-a-hash' }],
    ['SOURCE_IDENTITY', (r: ExportReceipt) => { r.source.commit = 'main' }],
    ['SPECIFICATION_HASH', (r: ExportReceipt) => { r.specificationSha256 = hash('stale-spec') }],
    ['INPUT_IDENTITY', (r: ExportReceipt) => { r.exporter.sha256 = hash('stale-exporter') }],
    ['NONFINITE', (r: ExportReceipt) => { r.assets[0]!.restBounds.max.x = Infinity }],
    ['MISSING_FIELD', (r: ExportReceipt) => { Reflect.deleteProperty(r.assets[0]!, 'permissions') }],
    ['MISSING_FIELD', (r: ExportReceipt) => { Reflect.deleteProperty(r.assets[0]!, 'geometry') }],
    ['NODE_PARENT', (r: ExportReceipt) => { r.assets[0]!.nodes[1]!.parent = 'missing' }],
    ['ROOT_TRANSFORM', (r: ExportReceipt) => { r.assets[0]!.coordinates.rootMatrix[12] = 0.1 }],
    ['GEOMETRY', (r: ExportReceipt) => { r.assets[0]!.nodes[1]!.triangles = 0 }],
    ['TEXTURE_BINDING', (r: ExportReceipt) => { r.assets[0]!.textures = [] }],
    ['TEXTURE_UV', (r: ExportReceipt) => { r.assets[0]!.nodes[1]!.uvSets = [] }],
    ['CLIP_SET', (r: ExportReceipt) => { r.assets[3]!.clips.pop() }],
    ['TRACK_TARGET', (r: ExportReceipt) => { r.assets[3]!.clips[0]!.tracks[0]!.node = 'missing' }],
    ['ROOT_MOTION', (r: ExportReceipt) => { r.assets[3]!.clips[0]!.tracks[0]!.node = r.assets[3]!.root }],
    ['REST_TRANSFORM', (r: ExportReceipt) => { r.assets[3]!.rest.pop() }],
    ['POSE_SAMPLES', (r: ExportReceipt) => { r.assets[3]!.clips[0]!.samples.pop() }],
    ['DECLARED_CONTENT', (r: ExportReceipt) => { r.assets[0]!.materials[0]!.roughness = 0.5 }],
  ] as const)('rejects malformed or stale receipt: %s', (code, mutate) => {
    const receipt = receiptFixture()
    mutate(receipt)
    expect(() => createManifestFromExport(receipt)).toThrow(code)
  })

  it('rejects duplicate JSON keys rather than accepting the last value', () => {
    const json = JSON.stringify(receiptFixture()).replace('"complete":true', '"complete":false,"complete":true')
    expect(() => createManifestFromExport(json)).toThrow('DUPLICATE_FIELD')
  })

  it.each([
    ['PATH_CONFLICT', (r: ExportReceipt) => { r.assets[1]!.file = `${r.assets[0]!.file}/nested.glb` }],
    ['PATH', (r: ExportReceipt) => { r.assets[0]!.file = 'manifest.json/nested.glb' }],
    ['JSON_VALUE', (r: ExportReceipt) => { Object.defineProperty(r.assets, Symbol('ignored'), { value: true }) }],
  ] as const)('rejects otherwise hidden or conflicting receipt data: %s', (code, mutate) => {
    const receipt = receiptFixture()
    mutate(receipt)
    expect(() => createManifestFromExport(receipt)).toThrow(code)
  })
})

describe('U5 manifest and promotion controls', () => {
  it('accepts an actual hash-bound qualified approval without requiring a signature', async () => {
    const { candidateRoot, destinationRoot, receipt } = await candidate()
    const manifest = createManifestFromExport(receipt)
    await promoteAssetLibrary({
      candidateRoot, destinationRoot, manifest,
      approval: approvalFor(manifest).record,
      trustedParentAuthorizationSha256: hash('synthetic-parent-authorization'),
    })
    expect(JSON.parse(await readFile(join(destinationRoot, 'manifest.json'), 'utf8')).libraryDigest)
      .toBe(manifest.libraryDigest)
  })

  it('rejects default promotion when appearance or policy approval is absent', async () => {
    const { candidateRoot, destinationRoot, receipt } = await candidate()
    const manifest = createManifestFromExport(receipt)
    await expect(promoteAssetLibrary({ candidateRoot, destinationRoot, manifest }))
      .rejects.toMatchObject({ code: 'APPEARANCE_POLICY_GATE' })
    await expect(readFile(join(destinationRoot, 'manifest.json'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('publishes approved bytes atomically and preserves the exact pointer on a failed candidate', async () => {
    const { candidateRoot, destinationRoot, receipt } = await candidate()
    const manifest = createManifestFromExport(receipt)
    const request = { candidateRoot, destinationRoot, manifest, approval: approvalFor(manifest), trustedPublicKey: publicKey }
    await promoteAssetLibrary(request)
    const before = await readFile(join(destinationRoot, 'manifest.json'))
    expect(JSON.parse(before.toString()).libraryDigest).toBe(manifest.libraryDigest)
    await writeFile(join(candidateRoot, 'technician-man.glb'), 'corrupted candidate')
    await expect(promoteAssetLibrary(request)).rejects.toMatchObject({ code: 'CANDIDATE_HASH' })
    expect(await readFile(join(destinationRoot, 'manifest.json'))).toEqual(before)
  })

  it('validates exact candidate files against independently pinned export identities without publishing', async () => {
    const { candidateRoot, destinationRoot, receipt } = await candidate()
    const manifest = createManifestFromExport(receipt)
    const expected = expectedIdentity(manifest)
    await expect(validateAssetLibrary({ candidateRoot, manifest, expected })).resolves.toMatchObject({
      libraryDigest: manifest.libraryDigest,
    })
    await expect(readdir(destinationRoot)).rejects.toMatchObject({ code: 'ENOENT' })
    for (const key of ['sourceCommit', 'sourceSha256', 'specificationSha256', 'exporterSha256',
      'profile', 'profileSha256', 'recipeSha256', 'exportReceiptSha256'] as const) {
      await expect(validateAssetLibrary({ candidateRoot, manifest, expected: { ...expected, [key]: 'stale' } }))
        .rejects.toMatchObject({ code: 'STALE_EXPORT' })
    }
  })

  it.each(['extra', 'empty-directory', 'missing', 'hash', 'bytes', 'symlink', 'ancestor-symlink'] as const)(
    'rejects %s candidate without leaving an active pointer', async (fault) => {
      const context = await candidate()
      const { candidateRoot, destinationRoot, receipt, root } = context
      const manifest = createManifestFromExport(receipt)
      let selectedRoot = candidateRoot
      const path = join(candidateRoot, receipt.assets[0]!.file)
      if (fault === 'extra') await writeFile(join(candidateRoot, 'unlisted.txt'), 'extra')
      if (fault === 'empty-directory') await mkdir(join(candidateRoot, 'unlisted'))
      if (fault === 'missing') await rm(path)
      if (fault === 'hash') await writeFile(path, Buffer.alloc(receipt.assets[0]!.bytes))
      if (fault === 'bytes') await writeFile(path, 'short')
      if (fault === 'symlink') {
        await rm(path)
        await symlink(join(candidateRoot, receipt.assets[1]!.file), path)
      }
      if (fault === 'ancestor-symlink') {
        selectedRoot = join(root, 'linked-candidate')
        await symlink(candidateRoot, selectedRoot)
      }
      const code = fault.includes('symlink') ? 'SYMLINK'
        : fault === 'missing' ? 'MISSING_FILE'
          : ['extra', 'empty-directory'].includes(fault) ? 'EXTRA_FILE' : 'CANDIDATE_HASH'
      await expect(promoteAssetLibrary({
        candidateRoot: selectedRoot, destinationRoot, manifest, approval: approvalFor(manifest), trustedPublicKey: publicKey,
      })).rejects.toMatchObject({ code })
      await expect(readFile(join(destinationRoot, 'manifest.json'))).rejects.toMatchObject({ code: 'ENOENT' })
    },
  )

  it.each(['unsigned', 'forged', 'missing-key', 'wrong-key', 'binding', 'appearance', 'policy'] as const)(
    'rejects %s approval, independently of candidate permission booleans', async (fault) => {
      const { candidateRoot, destinationRoot, receipt } = await candidate()
      for (const asset of [...receipt.assets, ...receipt.specification.assets]) asset.permissions.publicAssetApproved = true
      receipt.specificationSha256 = hash(canonicalJson(receipt.specification))
      const manifest = createManifestFromExport(receipt)
      const approval = approvalFor(manifest)
      if (fault === 'unsigned') approval.signature = ''
      if (fault === 'forged') approval.record.authority = 'pretend-reviewer'
      if (fault === 'binding') approval.record.binding.sourceSha256 = hash('wrong-source')
      if (fault === 'appearance') approval.record.appearanceAccepted = false
      if (fault === 'policy') approval.record.policyApproved = false
      if (['binding', 'appearance', 'policy'].includes(fault)) {
        approval.signature = sign(null, Buffer.from(canonicalJson(approval.record)), privateKey).toString('base64')
      }
      const key = fault === 'missing-key' ? undefined
        : fault === 'wrong-key' ? generateKeyPairSync('ed25519').publicKey : publicKey
      const code = ['appearance', 'policy'].includes(fault) ? 'APPEARANCE_POLICY_GATE'
        : fault === 'missing-key' ? 'APPROVAL_SIGNATURE'
        : fault === 'binding' ? 'APPROVAL_BINDING' : 'APPROVAL_SIGNATURE'
      await expect(promoteAssetLibrary({
        candidateRoot, destinationRoot, manifest, approval, trustedPublicKey: key,
      })).rejects.toMatchObject({ code })
      await expect(readFile(join(destinationRoot, 'manifest.json'))).rejects.toMatchObject({ code: 'ENOENT' })
    },
  )

  it.each(['after-staging', 'before-pointer-replace'] as const)(
    'preserves no-prior and prior-pointer state on interruption at %s', async (phase) => {
      const { candidateRoot, destinationRoot, receipt } = await candidate()
      const first = createManifestFromExport(receipt)
      for (const prior of [false, true]) {
        if (prior) await promoteAssetLibrary({
          candidateRoot, destinationRoot, manifest: first, approval: approvalFor(first), trustedPublicKey: publicKey,
        })
        const before = prior ? await readFile(join(destinationRoot, 'manifest.json')) : null
        const oldPackage = prior ? await snapshot(join(destinationRoot, 'packages', first.libraryDigest)) : null
        const changed = structuredClone(receipt)
        changed.recipeSha256 = hash('next recipe')
        const next = createManifestFromExport(changed)
        await expect(promoteAssetLibrary({
          candidateRoot, destinationRoot, manifest: next, approval: approvalFor(next), trustedPublicKey: publicKey,
          onPhase: async (observed: TransactionPhase) => { if (observed === phase) throw new Error(`interrupt:${phase}`) },
        })).rejects.toThrow(`interrupt:${phase}`)
        if (prior) {
          expect(await readFile(join(destinationRoot, 'manifest.json'))).toEqual(before)
          expect(await snapshot(join(destinationRoot, 'packages', first.libraryDigest))).toEqual(oldPackage)
        } else {
          await expect(readFile(join(destinationRoot, 'manifest.json'))).rejects.toMatchObject({ code: 'ENOENT' })
        }
      }
    },
  )

  it('reports post-activation failures with the activated generation identity', async () => {
    const { candidateRoot, destinationRoot, receipt } = await candidate()
    const manifest = createManifestFromExport(receipt)
    const request = {
      candidateRoot, destinationRoot, manifest,
      approval: approvalFor(manifest), trustedPublicKey: publicKey,
      onPhase: async (phase: TransactionPhase) => {
        if (phase === 'after-pointer-replace') throw new Error('post-activation failure')
      },
    }
    await expect(promoteAssetLibrary(request)).rejects.toMatchObject({
      code: 'ACTIVATED_WITH_ERRORS',
      activated: true,
      libraryDigest: manifest.libraryDigest,
    })
    expect(JSON.parse(await readFile(join(destinationRoot, 'manifest.json'), 'utf8')).libraryDigest)
      .toBe(manifest.libraryDigest)
  })

  it('keeps all generations, checks the completed manifest hash, and makes repeat promotion idempotent', async () => {
    const { candidateRoot, destinationRoot, receipt } = await candidate()
    const first = createManifestFromExport(receipt)
    const request = { candidateRoot, destinationRoot, manifest: first, approval: approvalFor(first), trustedPublicKey: publicKey }
    await promoteAssetLibrary(request)
    const firstPackage = await snapshot(join(destinationRoot, 'packages', first.libraryDigest))
    await promoteAssetLibrary(request)
    expect(await snapshot(join(destinationRoot, 'packages', first.libraryDigest))).toEqual(firstPackage)
    receipt.recipeSha256 = hash('new-recipe')
    const next = createManifestFromExport(receipt)
    await promoteAssetLibrary({ ...request, manifest: next, approval: approvalFor(next) })
    const pointer = JSON.parse(await readFile(join(destinationRoot, 'manifest.json'), 'utf8'))
    const completed = await readFile(join(destinationRoot, pointer.manifest))
    expect(pointer.manifestSha256).toBe(hash(completed))
    expect(pointer.libraryDigest).toBe(next.libraryDigest)
    expect(pointer.qualification).toBe('qualified')
    const publication = JSON.parse(await readFile(join(destinationRoot, pointer.receipt), 'utf8'))
    expect(publication.manifestSha256).toBe(hash(completed))
    expect(publication.approval).toEqual(approvalFor(next))
    expect(await snapshot(join(destinationRoot, 'packages', first.libraryDigest))).toEqual(firstPackage)
    for (const asset of next.assets) expect(hash(await readFile(join(destinationRoot, asset.file)))).toBe(asset.sha256)
    expect(JSON.stringify(pointer)).not.toContain(destinationRoot)
  })

  it('uses the same digest and completed manifest in different stores and supports nested candidate paths', async () => {
    const { candidateRoot, destinationRoot, receipt } = await candidate()
    const asset = receipt.assets[0]!
    const bytes = await readFile(join(candidateRoot, asset.file))
    await rm(join(candidateRoot, asset.file))
    asset.file = `nested/${asset.file}`
    await mkdir(join(candidateRoot, 'nested'))
    await writeFile(join(candidateRoot, asset.file), bytes)
    const manifest = createManifestFromExport(receipt)
    const secondStore = join(await temporary(), 'relocated')
    for (const store of [destinationRoot, secondStore]) await promoteAssetLibrary({
      candidateRoot, destinationRoot: store, manifest, approval: approvalFor(manifest), trustedPublicKey: publicKey,
    })
    expect(await readFile(join(destinationRoot, 'manifest.json'))).toEqual(await readFile(join(secondStore, 'manifest.json')))
    expect(await snapshot(join(destinationRoot, 'packages', manifest.libraryDigest)))
      .toEqual(await snapshot(join(secondStore, 'packages', manifest.libraryDigest)))
  })

  it('rejects an altered completed manifest and bare approval booleans without touching a previous pointer', async () => {
    const { candidateRoot, destinationRoot, receipt } = await candidate()
    const manifest = createManifestFromExport(receipt)
    const request = { candidateRoot, destinationRoot, manifest, approval: approvalFor(manifest), trustedPublicKey: publicKey }
    await promoteAssetLibrary(request)
    const before = await readFile(join(destinationRoot, 'manifest.json'))
    const altered = structuredClone(manifest)
    Object.assign(altered.assets[0]!, { file: '../escape.glb' })
    await expect(promoteAssetLibrary({ ...request, manifest: altered })).rejects.toMatchObject({ code: 'MANIFEST' })
    Object.assign(request, { approval: { appearanceAccepted: true, policyApproved: true } })
    await expect(promoteAssetLibrary(request)).rejects.toMatchObject({ code: 'MISSING_FIELD' })
    expect(await readFile(join(destinationRoot, 'manifest.json'))).toEqual(before)
  })

  it('does not overwrite an existing content-addressed package whose bytes were changed externally', async () => {
    const { candidateRoot, destinationRoot, receipt } = await candidate()
    const manifest = createManifestFromExport(receipt)
    const request = { candidateRoot, destinationRoot, manifest, approval: approvalFor(manifest), trustedPublicKey: publicKey }
    await promoteAssetLibrary(request)
    const before = await readFile(join(destinationRoot, 'manifest.json'))
    const path = join(destinationRoot, manifest.assets[0]!.file)
    await writeFile(path, 'external corruption')
    await expect(promoteAssetLibrary(request)).rejects.toMatchObject({ code: 'CANDIDATE_HASH' })
    expect(await readFile(join(destinationRoot, 'manifest.json'))).toEqual(before)
    expect(await readFile(path, 'utf8')).toBe('external corruption')
  })

  it('rechecks staged bytes and final package/manifest after injected transaction boundaries', async () => {
    for (const phase of ['after-staging', 'before-pointer-replace'] as const) {
      for (const target of ['asset', 'manifest'] as const) {
        const { candidateRoot, destinationRoot, receipt } = await candidate()
        const manifest = createManifestFromExport(receipt)
        await expect(promoteAssetLibrary({
          candidateRoot, destinationRoot, manifest, approval: approvalFor(manifest), trustedPublicKey: publicKey,
          onPhase: async (observed, paths) => {
            if (observed === phase) await writeFile(join(paths.packageRoot,
              target === 'asset' ? receipt.assets[0]!.file : 'manifest.json'), 'corrupt')
          },
        })).rejects.toMatchObject({ code: 'CANDIDATE_HASH' })
        await expect(readFile(join(destinationRoot, 'manifest.json'))).rejects.toMatchObject({ code: 'ENOENT' })
      }
    }
  })

  it('refuses overlapping roots, symlink destinations and unmanaged existing pointers', async () => {
    const { candidateRoot, destinationRoot, receipt, root } = await candidate()
    const manifest = createManifestFromExport(receipt)
    const request = { candidateRoot, destinationRoot, manifest, approval: approvalFor(manifest), trustedPublicKey: publicKey }
    await expect(promoteAssetLibrary({ ...request, destinationRoot: join(candidateRoot, 'published') }))
      .rejects.toMatchObject({ code: 'PATH_OVERLAP' })
    await mkdir(destinationRoot)
    await symlink(destinationRoot, join(root, 'linked'))
    await expect(promoteAssetLibrary({ ...request, destinationRoot: join(root, 'linked') }))
      .rejects.toMatchObject({ code: 'SYMLINK' })
    const previous = Buffer.from('unmanaged pointer bytes\n')
    await writeFile(join(destinationRoot, 'manifest.json'), previous)
    await expect(promoteAssetLibrary(request)).rejects.toMatchObject({ code: 'UNMANAGED_POINTER' })
    expect(await readFile(join(destinationRoot, 'manifest.json'))).toEqual(previous)
  })

  it('rejects case-aliased candidate and destination roots on case-insensitive filesystems', async () => {
    const { candidateRoot, receipt } = await candidate()
    const alias = candidateRoot.replace(/candidate$/, 'CANDIDATE')
    let aliasIdentity: string
    try {
      aliasIdentity = await realpath(alias)
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return
      throw error
    }
    if (aliasIdentity !== candidateRoot) return
    const manifest = createManifestFromExport(receipt)
    await expect(promoteAssetLibrary({
      candidateRoot, destinationRoot: alias, manifest,
      approval: approvalFor(manifest), trustedPublicKey: publicKey,
    })).rejects.toMatchObject({ code: 'PATH_OVERLAP' })
  })

  it('does not steal an existing lock or overwrite an externally changed pointer', async () => {
    const { candidateRoot, destinationRoot, receipt } = await candidate()
    const manifest = createManifestFromExport(receipt)
    const request = { candidateRoot, destinationRoot, manifest, approval: approvalFor(manifest), trustedPublicKey: publicKey }
    await mkdir(destinationRoot)
    await writeFile(join(destinationRoot, '.promotion.lock'), 'another transaction')
    await expect(promoteAssetLibrary(request)).rejects.toMatchObject({ code: 'LOCKED' })
    expect(await readFile(join(destinationRoot, '.promotion.lock'), 'utf8')).toBe('another transaction')
    await rm(join(destinationRoot, '.promotion.lock'))
    await promoteAssetLibrary(request)
    const externallyChanged = Buffer.from('external change: preserve exactly')
    await expect(promoteAssetLibrary({
      ...request,
      onPhase: async (phase) => {
        if (phase === 'before-pointer-replace') await writeFile(join(destinationRoot, 'manifest.json'), externallyChanged)
      },
    })).rejects.toMatchObject({ code: 'POINTER_CHANGED' })
    expect(await readFile(join(destinationRoot, 'manifest.json'))).toEqual(externallyChanged)
  })

  it.each(['after-staging', 'before-pointer-replace'] as const)(
    'survives an actual Node process exit at %s with and without a previous generation', async (phase) => {
      for (const prior of [false, true]) {
        const { root, candidateRoot, destinationRoot, receipt } = await candidate()
        const first = createManifestFromExport(receipt)
        if (prior) await promoteAssetLibrary({
          candidateRoot, destinationRoot, manifest: first, approval: approvalFor(first), trustedPublicKey: publicKey,
        })
        const before = prior ? await readFile(join(destinationRoot, 'manifest.json')) : null
        const oldPackage = prior ? await snapshot(join(destinationRoot, 'packages', first.libraryDigest)) : null
        receipt.recipeSha256 = hash('next-crash-test-recipe')
        const next = createManifestFromExport(receipt)
        const requestPath = join(root, 'child-request.json')
        await writeFile(requestPath, JSON.stringify({
          candidateRoot, destinationRoot, manifest: next, approval: approvalFor(next),
          publicKey: publicKey.export({ type: 'spki', format: 'pem' }),
        }))
        const source = `
          import { readFile } from 'node:fs/promises'
          import { createPublicKey } from 'node:crypto'
          const [moduleUrl, requestPath, stopPhase] = process.argv.slice(1)
          const { promoteAssetLibrary } = await import(moduleUrl)
          const { publicKey, ...request } = JSON.parse(await readFile(requestPath, 'utf8'))
          await promoteAssetLibrary({
            ...request, trustedPublicKey: createPublicKey(publicKey),
            onPhase: async (phase) => { if (phase === stopPhase) process.exit(23) },
          })
        `
        try {
          await promisify(execFile)(process.execPath, [
            '--experimental-strip-types', '--input-type=module', '-e', source,
            new URL('../tools/promote-assets.ts', import.meta.url).href, requestPath, phase,
          ])
          throw new Error('child publication unexpectedly completed')
        } catch (error) {
          if (!(error instanceof Error) || !('code' in error) || error.code !== 23) {
            throw new Error(`child publication failed before ${phase}: ${String(Reflect.get(error as object, 'stderr'))}`)
          }
        }
        expect(await readFile(join(destinationRoot, '.promotion.lock'), 'utf8')).toContain(next.libraryDigest)
        if (prior) {
          expect(await readFile(join(destinationRoot, 'manifest.json'))).toEqual(before)
          expect(await snapshot(join(destinationRoot, 'packages', first.libraryDigest))).toEqual(oldPackage)
        } else {
          await expect(readFile(join(destinationRoot, 'manifest.json'))).rejects.toMatchObject({ code: 'ENOENT' })
        }
      }
    },
  )
})
