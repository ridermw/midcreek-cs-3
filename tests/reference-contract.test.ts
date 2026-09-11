import { mkdtemp, mkdir, readFile, readlink, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  canonicalJson, digest, packageDigest, parseManifest, referenceInventory, sanitizedSidecar,
  validateManifest, validateProfile, validatePrompt, validatePngHeader,
} from '../tools/references/contracts.ts'
import { parseAudit, parseTheme, promptForMaster } from '../tools/references/prepare.ts'
import { verifyAuthorizationBytes, verifyCandidate } from '../tools/references/authorization.ts'
import { buildIndex } from '../tools/references/index.ts'
import { eachSerial, inspectBlob, sourceIdentity } from '../tools/references/git.ts'
import type { PinnedSource } from '../tools/references/git.ts'
import { promoteGeneration, resolveActive, verifyFileSet } from '../tools/references/store.ts'
import { syntheticManifest, sourceProfile } from './fixtures/references/synthetic.ts'

const temporary: string[] = []
async function temp() {
  const path = await realpath(await mkdtemp(join(tmpdir(), 'cs3-reference-contract-')))
  temporary.push(path)
  return path
}
afterEach(async () => {
  for (const path of temporary.splice(0)) await rm(path, { recursive: true, force: true })
})

describe('canonical reference contract (synthetic, not source approval)', () => {
  it('requires 49 masters, 47 current prompts, seven shared and three other support inputs', () => {
    const manifest = syntheticManifest()
    expect(() => validateManifest(manifest)).not.toThrow()
    expect(manifest.artworks).toHaveLength(49)
    expect(manifest.support.filter((file) => file.kind === 'prompt')).toHaveLength(47)
    expect(manifest.support.filter((file) => file.kind === 'shared')).toHaveLength(7)
    expect(referenceInventory(manifest)).toHaveLength(155)
    expect(new Set(manifest.artworks.map((art) => art.sha256)).size).toBe(49)
    expect(parseManifest(JSON.stringify(manifest))).toEqual(manifest)
  })

  it('hashes sorted-key compact JSON and binds the logical specification and content identities', () => {
    expect(canonicalJson({ z: 1, a: { y: 2, b: 3 } })).toBe('{"a":{"b":3,"y":2},"z":1}')
    const manifest = syntheticManifest()
    expect(packageDigest(manifest)).toBe(manifest.packageDigest)
    manifest.artworks[0]!.title += ' changed'
    expect(() => validateManifest(manifest)).toThrow(/PACKAGE_DIGEST/)
  })

  it('keeps package identity independent of absolute storage prefixes and record ordering', () => {
    const manifest = syntheticManifest()
    const relocated = structuredClone(manifest)
    relocated.repositoryRoot = '/another/checkout'
    relocated.store = '/another/checkout/.artifacts/references'
    relocated.activeLink = '/another/checkout/references/midcreek'
    relocated.sources[0]!.localPath = '/another/source'
    relocated.artworks.reverse()
    relocated.support.reverse()
    expect(packageDigest(relocated)).toBe(packageDigest(manifest))
  })

  it.each([
    ['MISSING_MASTER', (m: ReturnType<typeof syntheticManifest>) => m.artworks.pop()],
    ['EXTRA_MASTER', (m: ReturnType<typeof syntheticManifest>) => m.artworks.push(structuredClone(m.artworks[0]!))],
    ['SUPPORT_COUNT', (m: ReturnType<typeof syntheticManifest>) => m.support.pop()],
    ['DUPLICATE_ID', (m: ReturnType<typeof syntheticManifest>) => { m.artworks[1]!.id = m.artworks[0]!.id }],
    ['DUPLICATE_HASH', (m: ReturnType<typeof syntheticManifest>) => { m.artworks[1]!.sha256 = m.artworks[0]!.sha256 }],
    ['DUPLICATE_PATH', (m: ReturnType<typeof syntheticManifest>) => { m.artworks[1]!.destination = m.artworks[0]!.destination }],
    ['PATH', (m: ReturnType<typeof syntheticManifest>) => { m.artworks[0]!.destination = '../escape.png' }],
    ['PATH', (m: ReturnType<typeof syntheticManifest>) => { m.artworks[0]!.sourcePath = '/absolute.png' }],
    ['SOURCE_REVISION', (m: ReturnType<typeof syntheticManifest>) => { m.artworks[0]!.sourceRevision = 'a'.repeat(40) }],
    ['DIMENSIONS', (m: ReturnType<typeof syntheticManifest>) => { m.artworks[0]!.width = 1280 }],
    ['ATTRIBUTION', (m: ReturnType<typeof syntheticManifest>) => { m.artworks[0]!.attribution = '' }],
    ['RIGHTS', (m: ReturnType<typeof syntheticManifest>) => { m.artworks[0]!.terms = 'Public domain' }],
    ['APPROVAL', (m: ReturnType<typeof syntheticManifest>) => { m.artworks[0]!.referenceApproval.status = 'denied' }],
    ['APPROVAL', (m: ReturnType<typeof syntheticManifest>) => { m.artworks[0]!.referenceApproval.sourceSha256 = '0'.repeat(64) }],
    ['APPROVAL', (m: ReturnType<typeof syntheticManifest>) => { m.artworks[0]!.galleryApproval.publicFields.push('account') }],
    ['HISTORY', (m: ReturnType<typeof syntheticManifest>) => { m.artworks[0]!.history.evidence = [] }],
    ['HISTORY', (m: ReturnType<typeof syntheticManifest>) => { m.artworks[0]!.history.exactProducingPrompt = 'invented.mock.md' }],
    ['CURRENT_PROMPT', (m: ReturnType<typeof syntheticManifest>) => { m.artworks[0]!.currentPrompts = [] }],
    ['DUPLICATE_PATH', (m: ReturnType<typeof syntheticManifest>) => { m.artworks[0]!.sidecar.originalPath = m.artworks[1]!.sidecar.originalPath }],
  ] as const)('rejects %s with a named error before promotion', (code, mutate) => {
    const manifest = syntheticManifest()
    mutate(manifest)
    manifest.packageDigest = packageDigest(manifest)
    expect(() => validateManifest(manifest)).toThrow(code)
  })

  it('rejects unknown operational fields rather than sanitizing an arbitrary candidate silently', () => {
    const manifest = syntheticManifest()
    const value = { ...manifest, account: 'synthetic-private-sentinel' }
    expect(() => parseManifest(JSON.stringify(value))).toThrow(/UNKNOWN_FIELD/)
    const sidecar = JSON.parse(sanitizedSidecar(manifest.artworks[0]!))
    expect(sidecar.originalSidecarSha256).toBe(manifest.artworks[0]!.sidecar.originalSha256)
    expect(sidecar).not.toHaveProperty('prompt')
    expect(sidecar).not.toHaveProperty('account')
    expect(sidecar).not.toHaveProperty('deployment')
    expect(digest(sanitizedSidecar(manifest.artworks[0]!))).toBe(manifest.artworks[0]!.sidecar.sanitizedSha256)
  })

  it('keeps many-to-one current inputs separate from unresolved historical generation', () => {
    const m = syntheticManifest()
    for (const paths of [
      ['key-art/01-hall-fault.png', 'key-art/02-hall-fault.png'],
      ['animation/01-model-sheet-man.png', 'animation/02-model-sheet-woman.png'],
    ]) {
      expect(promptForMaster(paths[0]!)).toBe(promptForMaster(paths[1]!))
    }
    expect(promptForMaster('character-man/03-scale.png')).toBe('themes/cel-shift/prompts/technician-man-scale.mock.md')
    expect(m.artworks.every((art) => art.history.confidence === 'unresolved')).toBe(true)
    expect(m.artworks.every((art) => art.history.exactProducingPrompt === null)).toBe(true)
    m.artworks[0]!.galleryApproval.status = 'denied'
    m.packageDigest = packageDigest(m)
    expect(() => validateManifest(m)).not.toThrow()
  })

  it('checks actual PNG signature, IHDR, CRC and exact dimensions without image decoding', () => {
    const bytes = Buffer.from('89504e470d0a1a0a0000000d4948445200000600000004000802000000c076faf4', 'hex')
    // CRC is generated transparently here rather than storing any source image.
    const crc = pngCrc(bytes.subarray(12, 29))
    const header = Buffer.concat([bytes.subarray(0, 29), Buffer.alloc(4)])
    header.writeUInt32BE(crc, 29)
    expect(() => validatePngHeader(header, 'synthetic.png', 1536, 1024)).not.toThrow()
    const wrong = Buffer.from(header)
    wrong.writeUInt32BE(1280, 16)
    expect(() => validatePngHeader(wrong, 'synthetic.png', 1536, 1024)).toThrow(/PNG|DIMENSIONS/)
    expect(() => validatePngHeader(Buffer.from('not png'), 'bad.png', 1536, 1024)).toThrow(/PNG/)
  })

  it('requires corrected prose and JSON rather than accepting historical scale/camera', () => {
    const profile = sourceProfile()
    expect(() => validateProfile(profile)).not.toThrow()
    for (const path of ['themes/_shared/foundation.md', 'themes/_shared/character-sheet.md']) {
      const corrupt = new Map(profile)
      corrupt.set(path, corrupt.get(path)!.replace('1.73 m', '1.90 m'))
      expect(() => validateProfile(corrupt)).toThrow(/PROFILE/)
    }
    const corrupt = new Map(profile)
    corrupt.set('themes/_shared/foundation.json', profile.get('themes/_shared/foundation.json')!.replace('"elevation_degrees":35', '"elevation_degrees":57'))
    expect(() => validateProfile(corrupt)).toThrow(/PROFILE/)
  })

  it('resolves original plan paths, including exceptions, and rejects escape or missing bases', () => {
    const support = new Set(syntheticManifest().support.map((file) => file.sourcePath))
    const path = 'themes/cel-shift/prompts/technician-man-scale.mock.md'
    expect(validatePrompt(path, '---\nplan: ../../_shared/turnaround.md\n---\n', support)).toBe('themes/_shared/turnaround.md')
    expect(validatePrompt('themes/cel-shift/prompts/kerb-junctions.mock.md', '---\nplan: ../../_shared/floor-sheet.md\n---\n', support)).toBe('themes/_shared/floor-sheet.md')
    expect(() => validatePrompt(path, '---\nplan: ../../../../escape.md\n---\n', support)).toThrow(/DEPENDENCY/)
    expect(() => validatePrompt(path, '---\nplan: ../../_shared/missing.md\n---\n', support)).toThrow(/DEPENDENCY/)
    expect(() => validatePrompt(path, '---\nplan: ../../_shared/foundation.md\nplan: ../../_shared/turnaround.md\n---\n', support)).toThrow(/DEPENDENCY/)
  })

  it('derives the candidate inventory from the dated audit and theme, not a second catalog', () => {
    const row = '| `animation/01-model-sheet-man.png` | 123 | `' + 'a'.repeat(64) + '` |'
    expect(parseAudit(row)).toEqual([{ path: 'themes/cel-shift/masters/animation/01-model-sheet-man.png', bytes: 123, sha256: 'a'.repeat(64) }])
    expect(() => parseAudit(row + '\n' + row)).toThrow(/DUPLICATE_PATH/)
    expect(parseTheme('plates:\n  animation:\n  - 01-model-sheet-man.png\n')).toEqual(['themes/cel-shift/masters/animation/01-model-sheet-man.png'])
    expect(() => parseTheme('plates:\n  animation:\n  - ../../escape.png\n')).toThrow(/THEME|PATH/)
  })

  it('does not treat self-signed status-approved claims or fabricated inventory hashes as authority', () => {
    expect(() => verifyAuthorizationBytes(Buffer.from('{"status":"authorized"}'))).toThrow(/AUTHORIZATION_DIGEST/)
    const candidate = syntheticManifest()
    const expected = structuredClone(candidate)
    candidate.artworks[0]!.title = 'arbitrary candidate'
    candidate.packageDigest = packageDigest(candidate)
    expect(() => verifyCandidate(candidate, expected)).toThrow(/CANDIDATE_MISMATCH/)
  })

  it.each(['themes/_shared/foundation.md', 'themes/_shared/foundation.json', 'themes/cel-shift/prompts/synthetic-00.mock.md'])(
    'rejects missing required %s independently of artwork counts', (path) => {
      const manifest = syntheticManifest()
      manifest.support = manifest.support.filter((file) => file.sourcePath !== path)
      manifest.packageDigest = packageDigest(manifest)
      expect(() => validateManifest(manifest)).toThrow(/SUPPORT_COUNT/)
    },
  )

  it('rejects unbound inventories, raw-sidecar replacement and escaping dependency associations', () => {
    const m = syntheticManifest()
    m.artworks[0]!.sidecar.sanitizedSha256 = '0'.repeat(64)
    m.packageDigest = packageDigest(m)
    expect(() => validateManifest(m)).toThrow(/SIDECAR_DIGEST/)
    const dependent = syntheticManifest()
    dependent.artworks[0]!.dependencyPaths = ['../escape.md']
    dependent.packageDigest = packageDigest(dependent)
    expect(() => validateManifest(dependent)).toThrow(/DEPENDENCY/)
    const changed = syntheticManifest()
    changed.support[0]!.sha256 = digest('changed-support-bytes')
    changed.packageDigest = packageDigest(changed)
    expect(() => validateManifest(changed)).toThrow(/INVENTORY_DIGEST/)
  })

  it('validates configured source identity without exposing origin credentials', () => {
    expect(sourceIdentity('https://github.com/williamsmat_microsoft/midcreek-concept.git')).toBe('williamsmat_microsoft/midcreek-concept')
    expect(sourceIdentity('https://user@dev.azure.com/williamsmat_microsoft/project/_git/midcreek-concept')).toBe('williamsmat_microsoft/midcreek-concept')
    expect(sourceIdentity('git@ssh.dev.azure.com:v3/williamsmat_microsoft/project/midcreek-concept')).toBe('williamsmat_microsoft/midcreek-concept')
    expect(() => sourceIdentity('https://unapproved.invalid/a/b')).toThrow(/SOURCE_IDENTITY/)
  })

  it('rejects missing and symlinked pinned blobs before any Git process or destination write', async () => {
    const source: PinnedSource = {
      localPath: '/synthetic/no-source', revision: 'a'.repeat(40),
      entries: new Map([['symlink.png', { mode: '120000', type: 'blob', object: 'a'.repeat(40) }]]),
    }
    await expect(inspectBlob(source, 'missing.png')).rejects.toThrow(/MISSING_FILE: missing.png/)
    await expect(inspectBlob(source, 'symlink.png')).rejects.toThrow(/SYMLINK: symlink.png/)
    await expect(inspectBlob(source, '../escape.png')).rejects.toThrow(/PATH/)
  })

  it('bounds the shared blob work queue to one reader and stops on the first failure', async () => {
    let active = 0
    let maximum = 0
    const visited: number[] = []
    await eachSerial([0, 1, 2], async (value) => {
      active++
      maximum = Math.max(maximum, active)
      await new Promise<void>((accept) => setImmediate(accept))
      visited.push(value)
      active--
    })
    expect(maximum).toBe(1)
    expect(visited).toEqual([0, 1, 2])
    visited.length = 0
    await expect(eachSerial([0, 1, 2], async (value) => {
      if (value === 1) throw new Error('HASH: synthetic')
      visited.push(value)
    })).rejects.toThrow(/HASH/)
    expect(visited).toEqual([0])
  })

  it('generates a local-only index with immutable original-on-selection URLs and escaped labels', () => {
    const m = syntheticManifest()
    m.artworks[0]!.title = '<script>not markup</script>'
    m.packageDigest = packageDigest(m)
    const html = buildIndex(m)
    expect(html).toContain(`../../packages/${m.packageDigest}/midcreek/themes/cel-shift/masters/`)
    expect(html).not.toContain('references/midcreek')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('<script>not markup')
    expect(html).toContain('&lt;script&gt;not markup&lt;/script&gt;')
    expect(html).not.toContain('synthetic-private-sentinel')
  })
})

function pngCrc(data: Buffer) {
  let crc = 0xffffffff
  for (const byte of data) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}

describe('real POSIX filesystem transaction with tiny synthetic payloads', () => {
  async function setup() {
    const root = await temp()
    const store = join(root, '.artifacts/references')
    const activeLink = join(root, 'references/midcreek')
    const make = (label: string) => ({
      store, activeLink, packageDigest: digest(label),
      build: async (packageRoot: string, indexRoot: string) => {
        await writeFile(join(packageRoot, 'payload.txt'), label)
        await writeFile(join(indexRoot, 'index.html'), label)
      },
      verify: async (packageRoot: string, indexRoot: string) => {
        await verifyFileSet(packageRoot, [{ path: 'payload.txt', bytes: Buffer.byteLength(label), sha256: digest(label) }])
        await verifyFileSet(indexRoot, [{ path: 'index.html', bytes: Buffer.byteLength(label), sha256: digest(label) }])
      },
    })
    return { root, store, activeLink, make }
  }

  it('promotes whole packages atomically, preserves prior generation and resolves readers once', async () => {
    const { make, activeLink, store } = await setup()
    await promoteGeneration(make('old'))
    const reader = await resolveActive(store, activeLink)
    await promoteGeneration(make('new'))
    expect(await readFile(join(reader, 'payload.txt'), 'utf8')).toBe('old')
    expect(await readFile(join(await resolveActive(store, activeLink), 'payload.txt'), 'utf8')).toBe('new')
    expect(await readdir(join(store, 'receipts'))).toHaveLength(2)
    await promoteGeneration(make('new'))
    expect(await readFile(join(reader, 'payload.txt'), 'utf8')).toBe('old')
  })

  it.each(['after-build', 'before-package-rename', 'before-pointer-rename', 'after-pointer-rename'] as const)(
    'failure at %s leaves an entirely old or entirely new reader view', async (phase) => {
      const { make, activeLink, store } = await setup()
      await promoteGeneration(make('old'))
      await expect(promoteGeneration({
        ...make('new'),
        onPhase: async (current) => { if (current === phase) throw new Error(`INTERRUPTED:${phase}`) },
      })).rejects.toThrow(/INTERRUPTED/)
      const current = await resolveActive(store, activeLink)
      expect(await readFile(join(current, 'payload.txt'), 'utf8')).toBe(phase === 'after-pointer-rename' ? 'new' : 'old')
      expect(await readFile(join(store, 'packages', digest('old'), 'midcreek/payload.txt'), 'utf8')).toBe('old')
    },
  )

  it('failed initial stage exposes no pointer and releases its exclusive lock', async () => {
    const { make, activeLink } = await setup()
    await expect(promoteGeneration({
      ...make('new'), build: async () => { throw new Error('WRITE_FAILED:payload.txt') },
    })).rejects.toThrow(/WRITE_FAILED/)
    await expect(readlink(activeLink)).rejects.toMatchObject({ code: 'ENOENT' })
    await promoteGeneration(make('new'))
  })

  it('holds the exclusive lock during source and approval preflight too', async () => {
    const { make } = await setup()
    await promoteGeneration({
      ...make('old'),
      preflight: async () => {
        await expect(promoteGeneration(make('new'))).rejects.toThrow(/LOCKED/)
      },
    })
  })

  it('rejects a simultaneous importer without disturbing the first owner', async () => {
    const { make } = await setup()
    await promoteGeneration({
      ...make('old'),
      onPhase: async (phase) => {
        if (phase === 'after-build') await expect(promoteGeneration(make('new'))).rejects.toThrow(/LOCKED/)
      },
    })
  })

  it.each(['directory', 'symlink'] as const)('refuses a preexisting unmanaged %s', async (kind) => {
    const { make, activeLink, root } = await setup()
    await mkdir(join(root, 'references'), { recursive: true })
    if (kind === 'directory') await mkdir(activeLink)
    else await symlink(root, activeLink)
    await expect(promoteGeneration(make('new'))).rejects.toThrow(/UNMANAGED/)
  })

  it('rejects even an in-store lookalike symlink without a managed ownership record', async () => {
    const { make, activeLink, store, root } = await setup()
    await mkdir(join(root, 'references'), { recursive: true })
    const forged = join(store, 'packages', digest('forged'), 'midcreek')
    await mkdir(forged, { recursive: true })
    await symlink(forged, activeLink)
    await expect(promoteGeneration(make('new'))).rejects.toThrow(/UNMANAGED/)
  })

  it('rejects extra, missing, hash/byte mismatch and symlinked package inputs', async () => {
    const root = await temp()
    const expected = [{ path: 'ok.txt', bytes: 2, sha256: digest('ok') }]
    await expect(verifyFileSet(root, expected)).rejects.toThrow(/MISSING_FILE/)
    await writeFile(join(root, 'ok.txt'), 'ok')
    await writeFile(join(root, 'extra.txt'), 'extra')
    await expect(verifyFileSet(root, expected)).rejects.toThrow(/EXTRA_FILE/)
    await rm(join(root, 'extra.txt'))
    await writeFile(join(root, 'ok.txt'), 'no')
    await expect(verifyFileSet(root, expected)).rejects.toThrow(/HASH/)
    await writeFile(join(root, 'ok.txt'), 'long')
    await expect(verifyFileSet(root, expected)).rejects.toThrow(/BYTES/)
    await rm(join(root, 'ok.txt'))
    await symlink(join(root, 'other'), join(root, 'ok.txt'))
    await expect(verifyFileSet(root, expected)).rejects.toThrow(/SYMLINK/)
  })

  it('rejects parent symlink escapes before creating a stage', async () => {
    const { make, root } = await setup()
    const other = await temp()
    await mkdir(join(root, '.artifacts'))
    await symlink(other, join(root, '.artifacts/references'))
    await expect(promoteGeneration(make('new'))).rejects.toThrow(/SYMLINK/)
    expect(await readdir(other)).toEqual([])
  })

  it.each(['missing', 'extra', 'hash', 'symlink'] as const)('a %s staged member never replaces the previous pointer', async (failure) => {
    const { make, store, activeLink } = await setup()
    await promoteGeneration(make('old'))
    const candidate = make('new')
    await expect(promoteGeneration({
      ...candidate,
      build: async (packageRoot, indexRoot) => {
        await candidate.build(packageRoot, indexRoot)
        const path = join(packageRoot, 'payload.txt')
        if (failure === 'missing') await rm(path)
        if (failure === 'extra') await writeFile(join(packageRoot, 'unapproved.txt'), 'x')
        if (failure === 'hash') await writeFile(path, 'bad')
        if (failure === 'symlink') { await rm(path); await symlink(indexRoot, path) }
      },
    })).rejects.toThrow(/MISSING_FILE|EXTRA_FILE|HASH|SYMLINK/)
    expect(await readFile(join(await resolveActive(store, activeLink), 'payload.txt'), 'utf8')).toBe('old')
  })

  it('never overwrites a tampered addressed generation', async () => {
    const { make, store, activeLink } = await setup()
    await promoteGeneration(make('old'))
    await promoteGeneration(make('new'))
    await writeFile(join(store, 'packages', digest('old'), 'midcreek/payload.txt'), 'bad')
    await expect(promoteGeneration(make('old'))).rejects.toThrow(/HASH/)
    expect(await readFile(join(await resolveActive(store, activeLink), 'payload.txt'), 'utf8')).toBe('new')
  })

  it('rejects an incomplete index and retains the previous complete package', async () => {
    const { make, store, activeLink } = await setup()
    await promoteGeneration(make('old'))
    const candidate = make('new')
    await expect(promoteGeneration({
      ...candidate,
      build: async (packageRoot, indexRoot) => {
        await candidate.build(packageRoot, indexRoot)
        await rm(join(indexRoot, 'index.html'))
      },
    })).rejects.toThrow(/MISSING_FILE: index.html/)
    expect(await readFile(join(await resolveActive(store, activeLink), 'payload.txt'), 'utf8')).toBe('old')
  })
})

describe.skipIf(process.env.CS3_REFERENCE_FULL_IMPORT !== '1')('approved pinned full import (parent-owned opt-in)', () => {
  it('prepares and imports the actual 49/47/7 package without staging or publication', async () => {
    const { prepareCandidate } = await import('../tools/references/prepare.ts')
    const { importReferences } = await import('../tools/references/import.ts')
    const repository = resolve(import.meta.dirname, '..')
    const authorization = join(repository, '.artifacts/implementation/20260910T232859Z/authorization.json')
    const manifest = await prepareCandidate({
      repository, sourceRepository: resolve(repository, '../midcreek-concept'), authorization,
      sourceRevision: '870603632c4b6665c513d0fa692a3ee2dae2b683',
    })
    const result = await importReferences({
      manifest, authorization, sourceRevision: manifest.sources[0]!.revision,
      store: join(repository, '.artifacts/references'),
    })
    expect(manifest.artworks).toHaveLength(49)
    expect(manifest.support.filter((file) => file.kind === 'prompt')).toHaveLength(47)
    expect(manifest.support.filter((file) => file.kind === 'shared')).toHaveLength(7)
    expect(manifest.artworks.reduce((sum, art) => sum + art.bytes, 0)).toBe(86349779)
    expect(result.packageRoot).toBe(await resolveActive(result.store, manifest.activeLink))
    expect(await readFile(join(result.packageRoot, 'reference-manifest.json'), 'utf8')).toBe(canonicalJson(manifest) + '\n')
  }, 180_000)
})
