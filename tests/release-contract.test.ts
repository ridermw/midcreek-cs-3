import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { digest } from '../tools/assets/contracts.ts'
import { put, releaseFixture } from './fixtures/release.ts'

let release: typeof import('../tools/release.ts')
const roots: string[] = []
beforeAll(async () => {
  expect(existsSync(resolve('tools/release.ts')), 'U10 must implement release enforcement').toBe(true)
  release = await import('../tools/release.ts')
})
it.each([
  '{"note":"\\/Users\\/private\\/source"}',
  '{"note":"\\u0050RIVATE_SENTINEL_DO_NOT_PUBLISH"}',
])('rejects encoded private bundled content %s', async (privateText) => {
  const input = await fixture()
  await put(input.viteRoot, 'assets/play.js', privateText)
  await expect(release.stageRelease(input)).rejects.toThrow(/PRIVATE/)
})
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})
async function fixture(nested = false) {
  const value = await releaseFixture(resolve('.'), nested)
  roots.push(value.root)
  return value
}
async function staged() {
  const input = await fixture()
  const artifact = await release.stageRelease(input)
  roots.push(join(artifact.root, '..'))
  return { input, artifact }
}

describe('U10 exact release mechanics, never qualification', () => {
  it('copies only manifest-derived Vite output, reviewed gallery and six qualified library members', async () => {
    const { artifact } = await staged()
    const paths = artifact.files.map((file) => file.path)
    expect(paths).toHaveLength(12)
    expect(paths).toContain('assets/library/manifest.json')
    expect(paths.filter((path) => path.endsWith('.glb'))).toHaveLength(5)
    expect(paths).not.toContain('assets/library/development/selection.json')
    expect(paths).not.toContain('receipt.json')
    expect(paths).not.toContain('unapproved-original.png')
    const report = await release.validateRelease(artifact)
    expect(report.mechanics).toBe('passed')
    expect(report.release).toBe('blocked')
    expect(report.deployment).toBe('unauthorized')
    expect(report.mode).toBe('fixture')
  })

  it('keeps appearance, named-target performance, production library and release gates separate', async () => {
    const { artifact } = await staged()
    const report = await release.validateRelease(artifact)
    expect(report.appearance).toBe('pending')
    expect(report.performance).toBe('unqualified')
    expect(report.productionLibrary).toBe('blocked')
    expect(report.blockers).toEqual(expect.arrayContaining([
      'APPEARANCE_PENDING', 'PERFORMANCE_UNQUALIFIED', 'PRODUCTION_LIBRARY_BLOCKED', 'RELEASE_REVIEW_PENDING',
    ]))
  })
  it('preserves validated nested GLB paths relative to the selected content-addressed package', async () => {
    const input = await fixture(true)
    const artifact = await release.stageRelease(input)
    roots.push(join(artifact.root, '..'))
    const expected = `packages/${input.library.binding.libraryDigest}/models/rack-standard.glb`
    expect(artifact.files.some((file) => file.path === `assets/library/${expected}`)).toBe(true)
    const server = await release.serveRelease(artifact)
    try {
      const { loadReleaseManifest } = await import('../src/assets/releaseManifest.ts')
      const manifest = await loadReleaseManifest(`${server.url}assets/library/`, input.library.binding, new AbortController().signal)
      expect(manifest.assets.find((asset) => asset.id === 'rack-standard')?.file).toBe(expected)
      expect((await fetch(`${server.url}assets/library/${expected}`)).status).toBe(200)
    } finally { await server.close() }
  })

  it.each(['index.html', 'play/index.html', 'assets/play.js'])('rejects missing built %s', async (path) => {
    const input = await fixture()
    await rm(join(input.viteRoot, path))
    await expect(release.stageRelease(input)).rejects.toThrow(/MISSING|ENOENT/)
  })
  it.each([
    ['assets/extra.js', 'extra'],
    ['assets/unapproved.GLB', 'not an approved GLB'],
    ['assets/leak.js.map', '{}'],
    ['raw/prompt.txt', 'prompt'],
    ['gallery/originals/unapproved.png', 'unapproved'],
    ['gallery/thumbnails/unapproved.webp', 'unapproved'],
    ['Cargo.toml', '[package]'],
  ])('rejects undeclared Vite output %s', async (path, data) => {
    const input = await fixture()
    await put(input.viteRoot, path, data)
    await expect(release.stageRelease(input)).rejects.toThrow(/EXTRA|FORBIDDEN/)
  })
  it.each([
    '<img src="/assets/root.png">',
    '<a href="/">root escape</a>',
    '<script src="//example.test/a.js"></script>',
    '<script src="https://example.test/a.js"></script>',
    '<script src="/midcreek-cs-3/missing.js"></script>',
    '<script src="/midcreek-cs-3/play/missing.js"></script>',
    '<img srcset="/outside.png 1x">',
  ])('rejects escaped or missing HTML dependency %s', async (html) => {
    const input = await fixture()
    await put(input.viteRoot, 'index.html', html)
    await expect(release.stageRelease(input)).rejects.toThrow(/URL|DEPENDENCY/)
  })
  it.each([
    'fetch("/midcreek-cs-3/../../outside.json", { cache: "no-store" })',
    'fetch("/midcreek-cs-3/missing.json", { signal: controller.signal })',
  ])('rejects escaped or missing JavaScript dependency with options: %s', async (javascript) => {
    const input = await fixture()
    await put(input.viteRoot, 'assets/play.js', javascript)
    await expect(release.stageRelease(input)).rejects.toThrow(/URL|DEPENDENCY/)
  })
  it.each([
    'PRIVATE_SENTINEL_DO_NOT_PUBLISH', '/Users/private/person/photo',
    '/home/private/source', 'file:///private/prompt.txt', 'rawPrompt',
  ])('rejects private bundled content %s', async (privateText) => {
    const input = await fixture()
    await put(input.viteRoot, 'assets/play.js', JSON.stringify(privateText))
    await expect(release.stageRelease(input)).rejects.toThrow(/PRIVATE/)
  })
  it('does not misclassify a three-byte drive-like sequence in compressed media as a private path', () => {
    expect(() => release.inspectReleaseBytes('gallery/originals/synthetic.png',
      Buffer.from([0xff, 0x43, 0x3a, 0x5c, 0, 0xff]))).not.toThrow()
    expect(() => release.inspectReleaseBytes('assets/app.js', Buffer.from('"C:\\\\private\\\\person.png"')))
      .toThrow(/PRIVATE/)
  })
  it.each(['assets/run.log', 'assets/raw-prompt.json', 'assets/render.capture.json', 'assets/source.blend'])(
    'rejects raw authoring/operational member %s even with an innocuous body', (path) => {
      expect(() => release.inspectReleaseBytes(path, Buffer.from('{}'))).toThrow(/FORBIDDEN/)
    },
  )
  it('rejects a source map even when inserted into the Vite manifest', async () => {
    const input = await fixture()
    const manifest = JSON.parse(await readFile(join(input.viteRoot, '.vite/manifest.json'), 'utf8'))
    manifest.map = { file: 'assets/play.js.map' }
    manifest['play/index.html'].imports = ['map']
    await put(input.viteRoot, '.vite/manifest.json', JSON.stringify(manifest))
    await put(input.viteRoot, 'assets/play.js.map', '{}')
    await expect(release.stageRelease(input)).rejects.toThrow(/FORBIDDEN/)
  })
  it('rejects duplicate and unresolved Vite manifest records', async () => {
    const input = await fixture()
    await put(input.viteRoot, '.vite/manifest.json',
      '{"index.html":{"file":"assets/site.js","src":"index.html","isEntry":true},"index.html":{}}')
    await expect(release.stageRelease(input)).rejects.toThrow(/DUPLICATE/)
  })
  it.each(['appearanceAccepted', 'policyApproved'])('requires %s binding', async (field) => {
    const input = await fixture()
    const pointer = JSON.parse(await readFile(join(input.library.root, 'manifest.json'), 'utf8'))
    const receipt = JSON.parse(await readFile(join(input.library.root, pointer.receipt), 'utf8'))
    receipt.approval[field] = false
    const bytes = JSON.stringify(receipt)
    await put(input.library.root, pointer.receipt, bytes)
    pointer.receiptSha256 = digest(bytes)
    await put(input.library.root, 'manifest.json', JSON.stringify(pointer))
    await expect(release.stageRelease(input)).rejects.toThrow(/LIBRARY_APPROVAL/)
  })
  it('rejects self-consistent approval for a different recipe', async () => {
    const input = await fixture()
    input.library.binding.recipeSha256 = digest('not reviewed')
    await expect(release.stageRelease(input)).rejects.toThrow(/BINDING/)
  })
  it('rejects absent or altered technical evidence even when the pointer and approval agree', async () => {
    const input = await fixture()
    await put(input.library.root, 'technical.json', '{"technicalQualified":true}')
    await expect(release.stageRelease(input)).rejects.toThrow(/HASH|TECHNICAL/)
  })
  it('cannot infer technical qualification merely from an existing receipt filename', async () => {
    const input = await fixture()
    await put(input.root, '.artifacts/assets/u5-c5/technical-qualification-2026-09-11.json', '{}')
    await expect(release.releaseStatus(input.root, 'awaiting-approval')).rejects.toThrow(/TECHNICAL/)
  })
  it('rejects duplicate gallery members and extra receipt-authorized media not in the public projection', async () => {
    const input = await fixture()
    const receipt = JSON.parse(await readFile(join(input.gallery.root, 'receipt.json'), 'utf8'))
    receipt.members.push(receipt.members[0])
    const data = JSON.stringify(receipt)
    await put(input.gallery.root, 'receipt.json', data)
    input.gallery.receiptSha256 = digest(data)
    await expect(release.stageRelease(input)).rejects.toThrow(/DUPLICATE/)
    receipt.members.pop()
    receipt.members.push(await put(input.gallery.root, 'gallery/originals/extra.png', 'unapproved'))
    const extra = JSON.stringify(receipt)
    await put(input.gallery.root, 'receipt.json', extra)
    input.gallery.receiptSha256 = digest(extra)
    await expect(release.stageRelease(input)).rejects.toThrow(/ALLOWLIST/)
  })
  it('never treats a provisional pointer as qualified', async () => {
    const input = await fixture()
    const pointer = JSON.parse(await readFile(join(input.library.root, 'manifest.json'), 'utf8'))
    pointer.qualification = 'provisional-development'
    await put(input.library.root, 'manifest.json', JSON.stringify(pointer))
    await expect(release.stageRelease(input)).rejects.toThrow(/QUALIFIED_POINTER/)
  })
  it('rejects missing or changed selected GLB bytes', async () => {
    const input = await fixture()
    await put(input.library.root, `packages/${input.library.binding.libraryDigest}/rack-standard.glb`, 'changed')
    await expect(release.stageRelease(input)).rejects.toThrow(/HASH/)
  })
  it('rejects an incomplete selected package and unlisted files inside its immutable generation', async () => {
    const input = await fixture()
    const packagePath = `packages/${input.library.binding.libraryDigest}`
    await put(input.library.root, `${packagePath}/unapproved.png`, 'unapproved')
    await expect(release.stageRelease(input)).rejects.toThrow(/EXTRA/)
    await rm(join(input.library.root, packagePath, 'unapproved.png'))
    await rm(join(input.library.root, packagePath, 'rack-standard.glb'))
    await expect(release.stageRelease(input)).rejects.toThrow(/MISSING|ENOENT/)
  })
  it('rejects private extras inside an otherwise valid GLB', async () => {
    const input = await fixture()
    const path = `packages/${input.library.binding.libraryDigest}/rack-standard.glb`
    const bytes = await readFile(join(input.library.root, path))
    expect(() => release.inspectReleaseBytes(path, bytes)).not.toThrow()
    const size = bytes.readUInt32LE(12)
    const json = JSON.parse(bytes.toString('utf8', 20, 20 + size))
    json.nodes[0].extras = { note: 'PRIVATE_SENTINEL_DO_NOT_PUBLISH' }
    const encoded = Buffer.from(JSON.stringify(json))
    const padded = Buffer.alloc(Math.ceil(encoded.length / 4) * 4, 32); encoded.copy(padded)
    const changed = Buffer.concat([bytes.subarray(0, 20), padded, bytes.subarray(20 + size)])
    changed.writeUInt32LE(changed.length, 8); changed.writeUInt32LE(padded.length, 12)
    expect(() => release.inspectReleaseBytes(path, changed)).toThrow(/PRIVATE|EXTRAS/)
  })
  it.each(['index.html', 'play/index.html', 'assets/library/manifest.json'])('rejects stale artifact missing %s', async (path) => {
    const { artifact } = await staged()
    await rm(join(artifact.root, path))
    await expect(release.validateRelease(artifact)).rejects.toThrow(/MISSING|ENOENT/)
  })
  it('rejects extra, modified and duplicate artifact identities', async () => {
    const { artifact } = await staged()
    await put(artifact.root, 'extra.json', '{}')
    await expect(release.validateRelease(artifact)).rejects.toThrow(/EXTRA/)
    await rm(join(artifact.root, 'extra.json'))
    await put(artifact.root, 'assets/play.js', 'changed')
    await expect(release.validateRelease(artifact)).rejects.toThrow(/HASH/)
    artifact.files.push(artifact.files[0]!)
    await expect(release.validateRelease(artifact)).rejects.toThrow(/DUPLICATE|RECEIPT/)
  })
  it('never reuses a previous or partially written generation', async () => {
    const { input, artifact } = await staged()
    const next = await release.stageRelease(input)
    roots.push(join(next.root, '..'))
    expect(next.root).not.toBe(artifact.root)
    await put(artifact.root, 'stale.txt', 'prior generation')
    expect((await release.validateRelease(next)).mechanics).toBe('passed')
    const receipt = join(next.root, '../receipt.json')
    await writeFile(receipt, '{"complete":false}')
    await expect(release.validateRelease(next)).rejects.toThrow(/RECEIPT/)
  })
  it('does not trust a rewritten receipt to authorize an extra output', async () => {
    const { artifact } = await staged()
    artifact.files.push(await put(artifact.root, 'gallery/originals/forged.png', 'not reviewed'))
    const path = join(artifact.root, '../receipt.json')
    const receipt = JSON.parse(await readFile(path, 'utf8'))
    receipt.files = artifact.files
    const data = JSON.stringify(receipt)
    await writeFile(path, data)
    artifact.receiptSha256 = digest(data)
    await expect(release.validateRelease(artifact)).rejects.toThrow(/ALLOWLIST/)
  })
  it('snapshots the qualified pointer once; later pointer replacement cannot redirect selected bytes', async () => {
    const input = await fixture()
    const snapshot = await release.snapshotQualifiedLibrary(input.library)
    await put(input.library.root, 'manifest.json', '{"qualification":"provisional-development"}')
    expect(snapshot).toHaveLength(6)
    expect(snapshot.find((file) => file.path === 'assets/library/manifest.json')?.sha256)
      .toBe(input.library.binding.manifestSha256)
    expect(snapshot.every((file) => digest(file.data) === file.sha256)).toBe(true)
  })
  it('rejects the prior artifact after an interrupted newer build attempt', async () => {
    const { artifact } = await staged()
    expect(() => release.validateBuildAttempt(artifact, { schema: 1, complete: false, buildId: artifact.buildId }))
      .toThrow(/STALE/)
    expect(() => release.validateBuildAttempt(artifact, { schema: 1, complete: true, buildId: 'different-generation' }))
      .toThrow(/STALE/)
    expect(() => release.validateBuildAttempt(artifact, { schema: 1, complete: true, buildId: artifact.buildId }))
      .not.toThrow()
  })
  it('rejects symlink inputs', async () => {
    const input = await fixture()
    await rm(join(input.viteRoot, 'assets/play.js'))
    await symlink(join(input.viteRoot, 'assets/site.js'), join(input.viteRoot, 'assets/play.js'))
    await expect(release.stageRelease(input)).rejects.toThrow(/SYMLINK/)
  })
  it('rejects Cargo/Rust/Bevy prerequisites in the actual package graph', () => {
    for (const bad of ['cargo build', 'rustc main.rs', 'bevy', 'wasm-pack build']) {
      expect(() => release.validatePrerequisites({ scripts: { build: bad } }, { packages: {} })).toThrow(/PREREQUISITE/)
    }
    expect(() => release.validatePrerequisites({ scripts: {} }, { packages: { 'node_modules/bevy': {} } })).toThrow(/PREREQUISITE/)
  })
  it('serves only exact prefixed files and returns 404, never fallback HTML', async () => {
    const { artifact } = await staged()
    const server = await release.serveRelease(artifact)
    try {
      expect((await fetch(server.url)).status).toBe(200)
      expect((await fetch(`${server.url}play/`)).status).toBe(200)
      for (const path of ['missing.js', 'play/missing.glb', '../assets/play.js', 'gallery/no.png']) {
        const response = await fetch(new URL(path, server.url))
        expect(response.status).toBe(404)
        expect(response.headers.get('content-type')).not.toContain('text/html')
      }
      await rm(join(artifact.root, 'assets/play.js'))
      expect((await fetch(`${server.url}assets/play.js`)).status).toBe(404)
    } finally { await server.close() }
  })
  it('loads only the hash-bound release manifest and rejects modified binding or absent authority', async () => {
    const { input, artifact } = await staged()
    const server = await release.serveRelease(artifact)
    try {
      const { loadReleaseManifest } = await import('../src/assets/releaseManifest.ts')
      const base = `${server.url}assets/library/`
      const signal = new AbortController().signal
      const result = await loadReleaseManifest(base, input.library.binding, signal)
      expect(result.assets).toHaveLength(5)
      await expect(loadReleaseManifest(base, { ...input.library.binding, manifestSha256: '0'.repeat(64) }, signal))
        .rejects.toThrow(/MANIFEST_HASH/)
      await expect(loadReleaseManifest(base, null, signal)).rejects.toThrow(/RELEASE_BLOCKED/)
      expect(server.requests.every((request) => request.path.endsWith('assets/library/manifest.json'))).toBe(true)
    } finally { await server.close() }
  })
  it('builds awaiting/blocking paths without local authority on a clean repository', async () => {
    const input = await fixture()
    await mkdir(join(input.root, 'config'), { recursive: true })
    await put(input.root, 'config/publication-allowlist.json', '{"schemaVersion":1,"referenceGrant":null,"captures":[]}')
    expect(await release.releaseStatus(input.root, 'awaiting-approval')).toMatchObject({
      technical: 'unavailable', gallery: 'awaiting-approval', appearance: 'pending',
      performance: 'unqualified', productionLibrary: 'blocked', release: 'blocked', deployment: 'unauthorized',
    })
  })
})
