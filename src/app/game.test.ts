import { readFile } from 'node:fs/promises'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadSelectedManifest, normalizeGameSeed } from './game'
import { selectionAmendment } from '../../docs/architecture/cs3-provisional-development-use-2026-09-11.json'

const base = 'http://127.0.0.1/midcreek-cs-3/assets/library/'
const pointer = {
  schema: 1, kind: 'cs3-asset-pointer', qualification: 'provisional-development',
  libraryDigest: selectionAmendment.binding.libraryDigest,
  manifestSha256: selectionAmendment.binding.manifestSha256,
  manifest: `packages/${selectionAmendment.binding.libraryDigest}/manifest.json`,
}
const retainedIt = process.env.CS3_U7_RETAINED === '1' ? it : it.skip
afterEach(() => { vi.unstubAllGlobals() })

function serve(selection: unknown = pointer, content = '{}') {
  const fetch = vi.fn(async (url: string) => new Response(
    url.endsWith('selection.json') ? JSON.stringify(selection) : content,
  ))
  vi.stubGlobal('fetch', fetch)
  return fetch
}

describe('authorized local package selection', () => {
  it('accepts finite safe seeds beyond the default and rejects invalid seeds', () => {
    expect(normalizeGameSeed(undefined)).toBe(417)
    expect(normalizeGameSeed(418)).toBe(418)
    expect(() => normalizeGameSeed(1.5)).toThrow(/SEED/)
    expect(() => normalizeGameSeed(Number.MAX_SAFE_INTEGER + 1)).toThrow(/SEED/)
  })

  retainedIt('loads the actual frozen manifest, retaining its immutable package paths', async () => {
    const selected = JSON.parse(await readFile('assets/library/development/selection.json', 'utf8'))
    const manifest = await readFile(`assets/library/${selected.manifest}`, 'utf8')
    const fetch = serve(selected, manifest)
    const result = await loadSelectedManifest(base, 'development/selection.json', new AbortController().signal)
    expect(result.libraryDigest).toBe(pointer.libraryDigest)
    expect(result.assets).toHaveLength(5)
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch.mock.calls[1][0]).toBe(`${base}${pointer.manifest}`)
  })

  it.each([
    { ...pointer, manifest: '../private.json' },
    { ...pointer, manifest: 'https://foreign.example/manifest.json' },
    { ...pointer, qualification: 'production' },
    { ...pointer, libraryDigest: 'f'.repeat(64) },
    { ...pointer, manifestSha256: 'f'.repeat(64) },
    null,
  ])('rejects changed or escaping pointers before any asset request', async (invalid) => {
    const fetch = serve(invalid)
    await expect(loadSelectedManifest(base, 'development/selection.json', new AbortController().signal)).rejects.toThrow(/SELECTION/)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('rejects corrupt manifest bytes instead of loading a procedural fallback', async () => {
    serve(pointer, '{}')
    await expect(loadSelectedManifest(base, 'development/selection.json', new AbortController().signal)).rejects.toThrow(/MANIFEST_HASH/)
  })

  it('rejects external provisional use without issuing a request', async () => {
    const fetch = serve()
    await expect(loadSelectedManifest('https://example.com/assets/library/', 'development/selection.json', new AbortController().signal))
      .rejects.toThrow(/LOCAL_ONLY/)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('propagates cancellation and rejects HTTP errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })))
    await expect(loadSelectedManifest(base, 'development/selection.json', new AbortController().signal)).rejects.toThrow(/HTTP/)
    const signal = AbortSignal.abort()
    vi.stubGlobal('fetch', vi.fn(async (_url, options: RequestInit) => { options.signal!.throwIfAborted(); return new Response('') }))
    await expect(loadSelectedManifest(base, 'development/selection.json', signal)).rejects.toThrow()
  })
})
