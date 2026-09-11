import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createTestManifest } from './assets.ts'
import { syntheticGlb } from './assets/glb.ts'
import { canonicalJson, createManifestFromExport, digest } from '../../tools/assets/contracts.ts'
import type { AssetSpecification, ExportReceipt, FileIdentity } from '../../tools/assets/contracts.ts'

export async function put(root: string, path: string, data: string | Buffer): Promise<FileIdentity> {
  await mkdir(dirname(join(root, path)), { recursive: true })
  await writeFile(join(root, path), data)
  return { path, bytes: Buffer.byteLength(data), sha256: digest(data) }
}

function packagedFixture(nested: boolean) {
  const runtime = createTestManifest()
  const buffers = new Map(runtime.assets.map((entry) => [entry.id, Buffer.from(syntheticGlb(entry))]))
  const matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
  const specs: AssetSpecification[] = runtime.assets.map((entry) => {
    const rest = [entry.rootName, 'Body'].map((node) => ({
      node, localMatrix: [...matrix], worldMatrix: [...matrix],
    }))
    return {
      id: entry.id, scene: 'Scene', root: entry.rootName,
      nodes: [
        { id: entry.rootName, parent: null, materials: [], mesh: false, primitives: 0, triangles: 0, uvSets: [] },
        { id: 'Body', parent: entry.rootName, materials: ['Surface'], mesh: true, primitives: 1, triangles: 12, uvSets: [0] },
      ],
      coordinates: {
        units: 'meters', up: 'Y', handedness: 'right', front: '+Z', pivot: 'floor-center', rootMatrix: [...matrix],
      },
      geometry: { meshes: 1, primitives: 1, triangles: 12 },
      restBounds: entry.shape.restBounds, animatedBounds: entry.shape.animatedBounds,
      materials: [{
        name: 'Surface', classification: 'portable-pbr', alphaMode: 'OPAQUE',
        baseColor: [1, 1, 1, 1], roughness: 0.85, metallic: 0, textures: [],
      }],
      textures: [], allowedExtensions: [], rest,
      clips: entry.clips.map((clip) => ({
        name: clip.name, frames: [1, 1 + clip.duration * 30], fps: 30, fpsBase: 1, duration: clip.duration,
        rootMotion: false, loop: 'duplicate-end',
        tracks: [{ node: 'Body', path: 'translation', interpolation: 'LINEAR', times: [0, clip.duration] }],
        samples: [0, clip.duration / 2, clip.duration].map((time) => ({ time, bounds: entry.shape.restBounds, transforms: rest })),
      })),
      permissions: {
        publicAssetApproved: false, textures: [], fonts: [],
        sources: [{ path: 'source/library.blend', sha256: digest('fixture-source'), attribution: 'Owned synthetic boxes', terms: 'Fixture only; not qualification' }],
      },
    }
  })
  const specification = { schema: 1 as const, assets: specs }
  const receipt: ExportReceipt = {
    schema: 1, kind: 'cs3-library-export', complete: true,
    source: { path: 'source/library.blend', sha256: digest('fixture-source'), bytes: 14, commit: 'b'.repeat(40) },
    specification, specificationSha256: digest(canonicalJson(specification)),
    inputs: [
      { path: 'source/spec.json', sha256: digest('fixture-spec'), bytes: 12, role: 'specification' },
      { path: 'source/export.py', sha256: digest('fixture-export'), bytes: 14, role: 'exporter' },
      { path: 'source/build.py', sha256: digest('fixture-build'), bytes: 13, role: 'script' },
    ],
    profile: runtime.profile, profileSha256: digest('fixture-profile'), recipeSha256: digest('fixture-recipe'),
    tools: { node: '22.23.1', blender: '5.2.1', blenderBuild: '9e2066aef7ef', gltfExporter: '5.2.40' },
    exporter: { path: 'source/export.py', sha256: digest('fixture-export'), revision: 'b'.repeat(40), exitCode: 0 },
    assets: specs.map((spec) => ({
      ...spec, file: `${nested ? 'models/' : ''}${spec.id}.glb`,
      sha256: digest(buffers.get(spec.id)!), bytes: buffers.get(spec.id)!.length,
    })),
  }
  return { manifest: createManifestFromExport(receipt), buffers }
}

// Owned boxes and an empty gallery. These receipts authorize fixture mechanics only.
export async function releaseFixture(repository: string, nested = false) {
  const root = join(repository, '.artifacts/release-fixtures', randomUUID())
  const viteRoot = join(root, 'vite')
  const galleryRoot = join(root, 'gallery')
  const libraryRoot = join(root, 'library')
  const { manifest, buffers } = packagedFixture(nested)
  for (const entry of manifest.assets) await put(libraryRoot, entry.file, buffers.get(entry.id)!)
  const manifestFile = await put(libraryRoot, `packages/${manifest.libraryDigest}/manifest.json`,
    canonicalJson(manifest) + '\n')
  const binding = {
    manifestSha256: manifestFile.sha256, libraryDigest: manifest.libraryDigest,
    profile: manifest.profile, profileSha256: digest('fixture-profile'), recipeSha256: digest('fixture-recipe'),
    sourceCommit: 'b'.repeat(40), sourceSha256: digest('fixture-source'),
    technicalSha256: digest('fixture-technical'), appearanceEvidenceSha256: digest('fixture-appearance'),
    publicationPolicySha256: digest('fixture-policy'), parentAuthorizationSha256: digest('fixture-parent'),
  }
  const technical = await put(libraryRoot, 'technical.json', JSON.stringify({
    schema: 1, kind: 'cs3-technical-qualification', qualification: 'technical-only', technicalQualified: true,
    identity: {
      manifestSha256: binding.manifestSha256, libraryDigest: binding.libraryDigest,
      sourceCommit: binding.sourceCommit, sourceSha256: binding.sourceSha256,
      profile: binding.profile, profileSha256: binding.profileSha256, recipeSha256: binding.recipeSha256,
    },
  }))
  binding.technicalSha256 = technical.sha256
  const { technicalSha256: _technical, appearanceEvidenceSha256, publicationPolicySha256, parentAuthorizationSha256, ...approvalBinding } = binding
  const receipt = await put(libraryRoot, `receipts/${digest('fixture-receipt')}.json`, JSON.stringify({
    schema: 1, kind: 'cs3-asset-publication', qualification: 'qualified',
    libraryDigest: manifest.libraryDigest, manifestSha256: binding.manifestSha256,
    approval: {
      kind: 'cs3-qualified-approval', id: 'synthetic-fixture', issuedAt: '2026-09-11T00:00:00.000Z',
      authority: 'Synthetic fixture only', parentAuthorizationSha256,
      binding: approvalBinding, appearanceAccepted: true, policyApproved: true,
      appearanceEvidenceSha256, publicationPolicySha256,
    },
  }))
  const pointer = {
    schema: 1, kind: 'cs3-asset-pointer', qualification: 'qualified',
    libraryDigest: manifest.libraryDigest, manifest: manifestFile.path, manifestSha256: manifestFile.sha256,
    receipt: receipt.path, receiptSha256: receipt.sha256,
  }
  await put(libraryRoot, 'manifest.json', JSON.stringify(pointer))
  await put(libraryRoot, 'development/selection.json', 'PRIVATE_SENTINEL_DO_NOT_PUBLISH')
  const index = await put(galleryRoot, 'gallery/index.json',
    '{"schemaVersion":1,"status":"awaiting-approval","items":[]}\n')
  const galleryReceipt = await put(galleryRoot, 'receipt.json', JSON.stringify({
    schemaVersion: 1, status: 'awaiting-approval', members: [index],
  }))
  await put(galleryRoot, 'unapproved-original.png', 'PRIVATE_SENTINEL_DO_NOT_PUBLISH')
  const viteManifest = {
    'index.html': { file: 'assets/site.js', src: 'index.html', isEntry: true },
    'play/index.html': { file: 'assets/play.js', src: 'play/index.html', isEntry: true },
  }
  await put(viteRoot, '.vite/manifest.json', JSON.stringify(viteManifest))
  await put(viteRoot, 'index.html', '<script type="module" src="/midcreek-cs-3/assets/site.js"></script>')
  await put(viteRoot, 'play/index.html', '<script type="module" src="/midcreek-cs-3/assets/play.js"></script>')
  await put(viteRoot, 'assets/site.js', 'console.log("fixture showcase")')
  await put(viteRoot, 'assets/play.js', 'console.log("fixture play")')
  return {
    root, repository, viteRoot, mode: 'fixture' as const,
    gallery: { root: galleryRoot, receiptSha256: galleryReceipt.sha256 },
    library: { root: libraryRoot, binding, technicalPath: join(libraryRoot, technical.path) },
  }
}

export async function browserReleaseFixture(repository = resolve('.')) {
  const release = await import('../../tools/release.ts')
  const fixture = await releaseFixture(repository)
  await release.buildReleaseVite(repository, fixture.viteRoot, fixture.library.binding, 'awaiting-approval')
  return release.stageRelease(fixture)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const artifact = await browserReleaseFixture()
  await put(resolve('.'), '.artifacts/release/fixture.json', canonicalJson(artifact) + '\n')
  console.log(`Synthetic file mechanics only: ${artifact.root}; release blocked; deployment unauthorized.`)
  // Keep the test fixture receipt independently readable by the CLI contract.
  await readFile(join(artifact.root, '../receipt.json'))
}
