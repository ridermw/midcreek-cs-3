import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { build } from 'vite'
import {
  deriveGallery, loadPublicationInputs, parsePolicy, validateThumbnail,
  verifySource, AWAITING, THUMBNAIL_RECIPE,
} from '../tools/site/publication.ts'
import type { PublicationPolicy } from '../tools/site/publication.ts'
import { parseGalleryIndex } from '../src/site/content.ts'
import { freezeShowcaseStartup } from '../src/site/accounting.ts'
import { digest, packageDigest, parseManifest, PUBLIC_FIELDS } from '../tools/references/contracts.ts'

const policyText = () => readFile('config/publication-allowlist.json', 'utf8')
const inputs = () => loadPublicationInputs(resolve('.'))
const retainedIt = process.env.CS3_U9_RETAINED === '1' ? it : it.skip

describe('U9 exact launch-policy projection', () => {
  it('keeps an empty policy honestly awaiting, without making a second inventory', () => {
    const empty = parsePolicy('{"schemaVersion":1,"referenceGrant":null,"captures":[]}')
    expect(deriveGallery(null, empty, [])).toEqual({ schemaVersion: 1, status: 'awaiting-approval', items: [] })
    expect(AWAITING).toBe('Reference gallery awaiting publication approval')
  })

  retainedIt('proves the real U4 package and exact launch policy before projecting approved sources', async () => {
    const source = await inputs()
    expect(source).not.toBeNull()
    if (!source) throw new Error('Local U4/launch proof is required for populated-content validation')
    expect(source.manifest.artworks).toHaveLength(49)
    expect(source.policy.referenceGrant?.publicFields).toEqual(PUBLIC_FIELDS)
    expect(source.policy.referenceGrant?.thumbnail).toEqual(THUMBNAIL_RECIPE)
    const art = source.manifest.artworks[0]!
    const bytes = await readFile(resolve(source.packageRoot, art.destination))
    expect(() => verifySource(art, bytes)).not.toThrow()
    const changed = Buffer.from(bytes); changed[changed.length - 1] ^= 1
    expect(() => verifySource(art, changed)).toThrow(/SOURCE_HASH/)
    expect(() => deriveGallery(source.manifest, source.policy, [])).toThrow(/MISSING_THUMBNAIL/)
  })

  it.each([
    ['unknown top-level metadata', (p: PublicationPolicy) => { Reflect.set(p, 'accountId', 'private') }],
    ['private grant metadata', (p: PublicationPolicy) => { Reflect.set(p.referenceGrant!, 'machinePath', '/private/source') }],
    ['wrong authorization', (p: PublicationPolicy) => { p.referenceGrant!.authorizationSha256 = '0'.repeat(64) }],
    ['changed input inventory', (p: PublicationPolicy) => { p.referenceGrant!.inventorySha256 = '0'.repeat(64) }],
    ['broader use', (p: PublicationPolicy) => { p.referenceGrant!.uses.push('preload-original') }],
    ['unapproved capture', (p: PublicationPolicy) => { Reflect.set(p, 'captures', [{ mediaUrl: 'private/render.png' }]) }],
    ['unknown public field', (p: PublicationPolicy) => { p.referenceGrant!.publicFields.push('prompt') }],
    ['changed recipe', (p: PublicationPolicy) => { Reflect.set(p.referenceGrant!.thumbnail, 'quality', 0.7) }],
    ['missing credit', (p: PublicationPolicy) => { p.referenceGrant!.attribution = '' }],
    ['missing terms', (p: PublicationPolicy) => { p.referenceGrant!.terms = '' }],
  ])('rejects %s, never sanitizes it into approval', async (_name, change) => {
    const policy = JSON.parse(await policyText())
    change(policy)
    expect(() => parsePolicy(JSON.stringify(policy))).toThrow()
  })

  retainedIt('rejects self-consistent but unreviewed input bytes, denied use and private titles', async () => {
    const source = await inputs()
    if (!source) throw new Error('Missing local publication proof')
    for (const change of [
      (m: typeof source.manifest) => { m.artworks[0]!.galleryApproval.status = 'denied' },
      (m: typeof source.manifest) => { m.artworks[0]!.title = '/Users/private/person/photo' },
      (m: typeof source.manifest) => { m.inventorySha256 = '0'.repeat(64) },
    ]) {
      const manifest = structuredClone(source.manifest)
      change(manifest)
      manifest.packageDigest = packageDigest(manifest)
      expect(() => deriveGallery(manifest, source.policy, [])).toThrow()
    }
    const raw = JSON.parse(await readFile(resolve(source.packageRoot, 'reference-manifest.json'), 'utf8'))
    raw.artworks[0].privatePhoto = 'private'
    expect(() => parseManifest(JSON.stringify(raw))).toThrow(/UNKNOWN_FIELD/)
  })

  it('rejects unknown public fields, private paths, captures and missing credit even at the browser boundary', () => {
    const item = {
      id: 'cel-shift/rack/01-front', family: 'rack', title: 'rack / 01 front',
      displayRole: 'concept reference',
      sourceRepository: 'williamsmat_microsoft/midcreek-concept',
      sourceRevision: '870603632c4b6665c513d0fa692a3ee2dae2b683',
      sourcePath: 'themes/cel-shift/masters/rack/01-front.png',
      sha256: { source: 'a'.repeat(64), thumbnail: 'b'.repeat(64) },
      width: 1536, height: 1024,
      attribution: 'Cel Shift concept art - williamsmat_microsoft/midcreek-concept at 870603632c4b6665c513d0fa692a3ee2dae2b683',
      terms: 'Approved for CS3 use and release staging only; no broader license inferred.',
      caption: 'Concept reference; not a game capture or an appearance acceptance.',
      mediaUrl: { original: `gallery/originals/${'a'.repeat(64)}.png`, thumbnail: `gallery/thumbnails/${'b'.repeat(64)}.webp` },
    }
    const index = { schemaVersion: 1, status: 'approved-for-staging', items: [item] }
    expect(parseGalleryIndex(index).items).toHaveLength(1)
    for (const bad of [
      { ...item, accountId: 'private' }, { ...item, attribution: '' }, { ...item, terms: '' },
      { ...item, displayRole: 'game capture' },
      ...['/assets/a.png', '../secret', 'https://example.com/a.png', 'file:///private/a', 'gallery/%2e%2e/a', 'gallery/raw-sidecar.json']
        .map((original) => ({ ...item, mediaUrl: { ...item.mediaUrl, original } })),
    ]) expect(() => parseGalleryIndex({ ...index, items: [bad] })).toThrow(/PUBLIC_/)
    expect(() => parseGalleryIndex({ ...index, privatePath: '/private' })).toThrow(/PUBLIC_/)
    expect(() => parseGalleryIndex({ ...index, status: 'awaiting-approval' })).toThrow(/PUBLIC_/)
  })
})

describe('U9 thumbnail recipe and output identities', () => {
  retainedIt('accepts only exact 384x256 WebP, <=60000 bytes, source/output hashes and pinned recipe metadata', async () => {
    // The guarded browser suite supplies actual Canvas bytes, not a fake image fixture.
    const file = JSON.parse(await readFile('.artifacts/site/current.json', 'utf8'))
    const receipt = JSON.parse(await readFile(resolve(file.root, 'receipt.json'), 'utf8'))
    expect(receipt.thumbnails).toHaveLength(49)
    for (const record of receipt.thumbnails) {
      const bytes = await readFile(resolve(file.root, record.file))
      expect(bytes.length).toBeLessThanOrEqual(60_000)
      expect(() => validateThumbnail(record, bytes, record.sourceSha256)).not.toThrow()
      for (const patch of [
        { width: 383 }, { height: 255 }, { bytes: 60001 }, { sourceSha256: '0'.repeat(64) },
        { outputSha256: '0'.repeat(64) }, { recipe: { ...THUMBNAIL_RECIPE, quality: 0.9 } },
        { browserVersion: '' }, { playwrightVersion: 'unreviewed' }, { privatePath: '/private' },
        { encoderSha256: '0'.repeat(64) },
        { file: '../private.webp' },
      ]) expect(() => validateThumbnail({ ...record, ...patch }, bytes, record.sourceSha256)).toThrow()
      expect(() => validateThumbnail(record, Buffer.alloc(60001), record.sourceSha256)).toThrow()
    }
    const source = await inputs()
    if (!source) throw new Error('Missing local proof')
    const projection = deriveGallery(source.manifest, source.policy, receipt.thumbnails)
    expect(projection.items).toHaveLength(49)
    expect(JSON.stringify(projection)).not.toMatch(/currentPrompts|sidecar|localPath|repositoryRoot|private|\.artifacts/)
    const extra = { ...receipt.thumbnails[0], sourceSha256: digest('unknown source') }
    expect(() => deriveGallery(source.manifest, source.policy, [...receipt.thumbnails, extra])).toThrow()
    expect(() => deriveGallery(source.manifest, source.policy, structuredClone(receipt.thumbnails))).toThrow(/UNAPPROVED_THUMBNAIL/)
  })
})

describe('U9 cold startup accounting and entry isolation', () => {
  const origin = 'http://127.0.0.1:4173'
  const html = `${origin}/midcreek-cs-3/`
  const script = `${origin}/midcreek-cs-3/assets/showcase.js`
  const resource = (url: string, transferSize: number) => ({
    url, role: url === html ? 'html' as const : 'script' as const, cache: 'network' as const,
    startTime: 0, responseEnd: 10, transferSize,
    encodedBodySize: transferSize - 300, decodedBodySize: transferSize - 300,
  })
  const sample = () => ({
    origin, timeOrigin: 1000, readyAt: 20, required: [html, script],
    resources: [resource(html, 1000), resource(script, 1_999_000)], pending: [] as string[], overflow: false, networkVerified: true,
  })
  it('checks the exact cap, freezes startup, and separates later gallery bytes', () => {
    const input = sample()
    expect(freezeShowcaseStartup(input).status).toBe('passed')
    input.resources[1]!.transferSize++
    input.resources[1]!.encodedBodySize++
    input.resources[1]!.decodedBodySize++
    expect(freezeShowcaseStartup(input).status).toBe('failed')
    const later = sample()
    later.resources.push({ ...resource(`${origin}/midcreek-cs-3/gallery/index.json`, 5000), startTime: 21, responseEnd: 25 })
    const receipt = freezeShowcaseStartup(later)
    expect(receipt.transferBytes).toBe(2_000_000)
    expect(receipt.laterBytes).toBe(5000)
    expect(Object.isFrozen(receipt)).toBe(true)
  })
  it('invalidates unknown/zero transfers, extra/source-map responses and pending initial requests', () => {
    for (const path of ['assets/showcase.js.map', 'private.json', 'gallery/index.json']) {
      const input = sample()
      input.resources.push(resource(`${origin}/midcreek-cs-3/${path}`, 400))
      expect(freezeShowcaseStartup(input).status).toBe('unqualified')
    }
    for (const patch of [
      { pending: ['delayed-initial'] }, { overflow: true },
      { networkVerified: false },
      { resources: [resource(html, 0), resource(script, 1000)] },
      { resources: [resource('https://example.com/a.js', 0)] },
      { resources: [resource(html, 1000)] },
      { resources: [resource(html, 1000), { ...resource(script, 1000), responseEnd: 22 }] },
    ]) expect(freezeShowcaseStartup({ ...sample(), ...patch }).status).toBe('unqualified')
  })
  it('walks complete static/dynamic build graphs: neither entry imports the other domain', async () => {
    const result = await build({ configFile: resolve('vite.config.ts'), logLevel: 'error', build: { write: false } })
    const files = (Array.isArray(result) ? result : [result]).flatMap((r) => 'output' in r ? r.output : [])
    const chunks = files.filter((f) => f.type === 'chunk')
    const walk = (name: string): string[] => {
      const seen = new Set<string>()
      const visit = (fileName: string) => {
        if (seen.has(fileName)) return
        seen.add(fileName)
        const chunk = chunks.find((c) => c.fileName === fileName)
        if (chunk) [...chunk.imports, ...chunk.dynamicImports].forEach(visit)
      }
      const entry = chunks.find((c) => c.name === name)
      if (!entry) throw new Error(`Missing ${name}`)
      visit(entry.fileName)
      return chunks.filter((c) => seen.has(c.fileName)).flatMap((c) => c.moduleIds)
    }
    expect(walk('showcase').join('\n')).not.toMatch(/node_modules\/three|\/src\/(?:game|app|engine|world|assets|diagnostics)\//)
    expect(walk('play').join('\n')).not.toMatch(/\/src\/site\/|\/tools\/(?:site|references)\/|reference-manifest|publication-allowlist/)
    expect(files.some((f) => f.fileName.endsWith('.map'))).toBe(false)
  })
})
