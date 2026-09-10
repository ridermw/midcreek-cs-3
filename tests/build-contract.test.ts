import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { build } from 'vite'
import { assetUrl } from '../src/shared/urls'

describe('project-prefixed delivery', () => {
  it('resolves entries and media below the configured project prefix', () => {
    expect(assetUrl('play/', '/midcreek-cs-3/')).toBe('/midcreek-cs-3/play/')
    expect(assetUrl('assets/library/rack.glb', '/midcreek-cs-3/'))
      .toBe('/midcreek-cs-3/assets/library/rack.glb')
    expect(assetUrl('', '/midcreek-cs-3/')).toBe('/midcreek-cs-3/')
  })

  it.each([
    '/assets/a.glb', '//external/a', '../a', 'a/../b', './a', 'https://example.com/a',
    'file:///tmp/a', 'C:\\private\\a', 'a\\b', '%2e%2e/a', 'a/%2f/b',
    'a?x=1', 'a#fragment', 'a\u0000b', 'a//b', '%252e%252e/a',
  ])('rejects invalid media URL %s instead of escaping the package', (path) => {
    expect(() => assetUrl(path, '/midcreek-cs-3/')).toThrow()
  })

  it.each(['https://example.com/', '//a/', 'relative/', '/a/../', '/a'])(
    'rejects invalid base %s', (base) => {
      expect(() => assetUrl('play/', base)).toThrow()
    },
  )

  it('builds both independent HTML entries with prefixed script URLs and no copied public tree', async () => {
    const output = await build({ configFile: resolve('vite.config.ts'), build: { write: false } })
    const outputs = Array.isArray(output) ? output : [output]
    const files = outputs.flatMap((entry) => 'output' in entry ? entry.output : [])
    const names = files.map((file) => file.fileName)
    expect(names).toContain('index.html')
    expect(names).toContain('play/index.html')
    for (const name of ['index.html', 'play/index.html']) {
      const html = files.find((file) => file.fileName === name)
      expect(html?.type).toBe('asset')
      if (html?.type !== 'asset') throw new Error(`Missing HTML: ${name}`)
      expect(String(html.source)).toMatch(/src="\/midcreek-cs-3\/assets\/[^"]+\.js"/)
      expect(String(html.source)).not.toMatch(/src="\/assets\//)
    }
    expect(names.some((name) => name.endsWith('.map'))).toBe(false)
    const site = files.find((file) => file.type === 'chunk' && file.name === 'showcase')
    const play = files.find((file) => file.type === 'chunk' && file.name === 'play')
    expect(site?.type).toBe('chunk')
    expect(play?.type).toBe('chunk')
    if (site?.type !== 'chunk' || play?.type !== 'chunk') throw new Error('Missing entry chunks')
    expect(site.imports).not.toContain(play.fileName)
    expect(play.imports).not.toContain(site.fileName)
  })

  it('locks the dependency and script graph without an accidental Rust prerequisite', async () => {
    const manifest = JSON.parse(await readFile('package.json', 'utf8'))
    const lock = JSON.parse(await readFile('package-lock.json', 'utf8'))
    for (const [name, version] of Object.entries({
      ...manifest.dependencies, ...manifest.devDependencies,
    })) {
      expect(version).toMatch(/^\d+\.\d+\.\d+(?:-[\w.]+)?$/)
      expect(lock.packages[`node_modules/${name}`].version).toBe(version)
    }
    expect(JSON.stringify(manifest)).not.toMatch(/\b(?:cargo|bevy|rustc|wasm-pack)\b/i)
    expect(Object.keys(lock.packages).some((name) => /(?:cargo|bevy|rustc)/i.test(name))).toBe(false)
  })
})
