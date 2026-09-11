import { readFile } from 'node:fs/promises'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadSelectedManifest, normalizeGameSeed } from './game'

const base = 'http://127.0.0.1/midcreek-cs-3/assets/library/'
const pointer = JSON.parse(await readFile('assets/library/development/selection.json', 'utf8'))
const manifest = await readFile(`assets/library/${pointer.manifest}`, 'utf8')
afterEach(() => { vi.unstubAllGlobals() })

function serve(selection: unknown = pointer, content = manifest) {
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

  it('loads the actual frozen manifest, retaining its immutable package paths', async () => {
    const fetch = serve()
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
