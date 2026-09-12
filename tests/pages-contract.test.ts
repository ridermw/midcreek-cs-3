import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { cp, lstat, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildPages, validatePages } from '../tools/pages.ts'
import type { PagesArtifact } from '../tools/pages.ts'

const exec = promisify(execFile)
const workspace = resolve('.artifacts/pages-tests', randomUUID())
let repository: string
let artifact: PagesArtifact

async function put(root: string, path: string, data: string) {
  await mkdir(dirname(join(root, path)), { recursive: true })
  await writeFile(join(root, path), data)
}
async function copyArtifact() {
  const root = join(workspace, randomUUID())
  await cp(artifact.root, root, { recursive: true })
  return root
}

beforeAll(async () => {
  repository = join(workspace, 'repository')
  await mkdir(repository, { recursive: true })
  const { stdout } = await exec('git', ['ls-files', '-z', 'src', 'play', 'index.html',
    'vite.config.ts', 'tsconfig.json', 'package.json', 'blender/render_profile.json',
    'docs/architecture/cs3-provisional-development-use-2026-09-11.json'])
  for (const path of stdout.split('\0').filter(Boolean)) {
    await mkdir(dirname(join(repository, path)), { recursive: true })
    await cp(resolve(path), join(repository, path))
  }
  await exec('git', ['init', '-q', repository])
  await exec('git', ['-C', repository, 'add', '.'])
  await symlink(resolve('node_modules'), join(repository, 'node_modules'), 'dir')
  await put(repository, '.gitignore', '/assets/library/\n/references/\n/public/\n/.artifacts/\n/.env*\n')
  // These inputs must not even be opened, not merely omitted from dist.
  for (const path of ['assets/library', 'references', 'public', '.env', '.env.production']) {
    await mkdir(dirname(join(repository, path)), { recursive: true })
    await symlink('/nonexistent-pages-private-input', join(repository, path))
  }
  artifact = await buildPages(repository)
}, 60_000)
afterAll(async () => { await rm(workspace, { recursive: true, force: true }) })

describe('source-only Pages generation', () => {
  it('builds a playable artifact without reading or copying ignored inputs', async () => {
    const paths = artifact.files.map((file) => file.path)
    expect(paths).toContain('index.html')
    expect(paths).toContain('play/index.html')
    expect(paths.some((path) => /gallery|assets\/library|\.glb$/i.test(path))).toBe(false)
    const text = await Promise.all(paths.filter((path) => /\.(html|js|css)$/.test(path))
      .map((path) => readFile(join(artifact.root, path), 'utf8')))
    expect(text.join('\n')).not.toMatch(/RELEASE_BLOCKED|provisional assets|\.artifacts|\/Users\//)
    expect(text.join('\n')).toContain('Ready - source-only public Three.js demo.')
    expect(text.join('\n')).not.toMatch(/assets\/library\//)
  })

  it('publishes a real current directory with canonical manifest identities outside dist', async () => {
    expect(artifact.root).toBe(join(repository, '.artifacts/pages/current/dist'))
    expect((await lstat(dirname(artifact.root))).isDirectory()).toBe(true)
    const manifest = await readFile(join(artifact.root, '../pages-manifest.json'), 'utf8')
    expect(manifest).toBe(`${JSON.stringify({ files: artifact.files.map(({ path, bytes, sha256 }) => ({ bytes, path, sha256 })) })}\n`)
    expect(artifact.files.map((file) => file.path)).toEqual(artifact.files.map((file) => file.path).sort())
    for (const file of artifact.files) {
      const bytes = await readFile(join(artifact.root, file.path))
      expect(file.bytes).toBe(bytes.length)
      expect(file.sha256).toBe(createHash('sha256').update(bytes).digest('hex'))
    }
    expect(await readdir(dirname(artifact.root))).toEqual(['dist', 'pages-manifest.json'])
    await expect(lstat(join(repository, '.artifacts/pages/current.json'))).rejects.toThrow(/ENOENT/)
    expect(await validatePages(artifact.root)).toEqual(artifact)
  })

  it('builds public copy with no reference controls or studies even before JavaScript executes', async () => {
    const html = await readFile(join(artifact.root, 'index.html'), 'utf8')
    expect(html).toContain('Public Three.js demo built entirely from tracked source.')
    expect(html).toContain('Source-only playable showcase ready.')
    expect(html).not.toMatch(/id="(?:references|studies|gallery-toggle|image-dialog)"|href="#references"/)
    expect(html).not.toMatch(/Blender|provisional|blocked|gallery/i)
    const manifest = JSON.parse(await readFile(join(artifact.root, '.vite/manifest.json'), 'utf8'))
    const script = await readFile(join(artifact.root, manifest['index.html'].file), 'utf8')
    expect(script).not.toMatch(/provisional|Production\/release blocked|Authored asset pipeline/i)
  })

  it('replaces the complete generation without a missing current window or stale files', async () => {
    const previous = await readFile(join(artifact.root, '../pages-manifest.json'), 'utf8')
    await put(artifact.root, 'stale.json', '{}')
    const errors: unknown[] = []
    let running = true
    const observer = (async () => {
      while (running) {
        try {
          await readFile(join(artifact.root, 'index.html'))
          await readFile(join(artifact.root, '../pages-manifest.json'))
        } catch (error) { errors.push(error) }
        await new Promise((done) => setTimeout(done, 1))
      }
    })()
    try { artifact = await buildPages(repository) } finally { running = false; await observer }
    expect(errors).toEqual([])
    expect(await readFile(join(artifact.root, '../pages-manifest.json'), 'utf8')).toBe(previous)
    await expect(lstat(join(artifact.root, 'stale.json'))).rejects.toThrow(/ENOENT/)
    expect(await readdir(join(repository, '.artifacts/pages'))).toEqual(['current'])
  }, 60_000)

  it('preserves the previous generation when validation fails and exits nonzero through the CLI', async () => {
    const before = await readFile(join(artifact.root, '../pages-manifest.json'), 'utf8')
    const original = await readFile(join(repository, 'index.html'), 'utf8')
    await put(repository, 'index.html', original.replace('</main>', '<p>PRIVATE_SENTINEL_DO_NOT_PUBLISH</p></main>'))
    try {
      await expect(buildPages(repository)).rejects.toThrow(/PAGES_FORBIDDEN/)
      await expect(exec(process.execPath, ['--experimental-strip-types', resolve('tools/pages.ts')], { cwd: repository }))
        .rejects.toMatchObject({ code: 1, stderr: expect.stringContaining('PAGES_FORBIDDEN') })
      expect(await readFile(join(artifact.root, '../pages-manifest.json'), 'utf8')).toBe(before)
      expect(await validatePages(artifact.root)).toEqual(artifact)
      expect(await readdir(join(repository, '.artifacts/pages'))).toEqual(['current'])
    } finally { await put(repository, 'index.html', original) }
  }, 60_000)

  it('rejects a newly imported ignored source instead of reading its contents', async () => {
    const main = await readFile(join(repository, 'src/site/main.ts'), 'utf8')
    await put(repository, 'src/site/main.ts', `import '../../.artifacts/secret.ts'\n${main}`)
    await put(repository, '.artifacts/secret.ts', 'throw new Error("should never run")')
    try {
      await expect(buildPages(repository)).rejects.toThrow(/PAGES_FORBIDDEN/)
    } finally { await put(repository, 'src/site/main.ts', main) }
  })

  it('does not mistake a nested ignored node_modules directory for installed dependencies', async () => {
    const main = await readFile(join(repository, 'src/site/main.ts'), 'utf8')
    await put(repository, 'src/site/main.ts', `import '../../.artifacts/node_modules/secret.ts'\n${main}`)
    await put(repository, '.artifacts/node_modules/secret.ts', 'console.info("untracked source")')
    try {
      await expect(buildPages(repository)).rejects.toThrow(/PAGES_FORBIDDEN/)
    } finally { await put(repository, 'src/site/main.ts', main) }
  })

  it('rejects ignored source even if it was force-added to the index', async () => {
    const main = await readFile(join(repository, 'src/site/main.ts'), 'utf8')
    await put(repository, '.artifacts/forced.ts', 'console.info("ignored source")')
    await exec('git', ['-C', repository, 'add', '-f', '.artifacts/forced.ts'])
    await put(repository, 'src/site/main.ts', `import '../../.artifacts/forced.ts'\n${main}`)
    try {
      await expect(buildPages(repository)).rejects.toThrow(/PAGES_FORBIDDEN/)
    } finally { await put(repository, 'src/site/main.ts', main) }
  })

  it('refuses concurrent publication without touching the current artifact', async () => {
    const lock = join(repository, '.artifacts/pages/.build-lock')
    const before = await readFile(join(artifact.root, '../pages-manifest.json'), 'utf8')
    await mkdir(lock)
    try {
      await expect(buildPages(repository)).rejects.toThrow(/PAGES_BUSY/)
      expect(await readFile(join(artifact.root, '../pages-manifest.json'), 'utf8')).toBe(before)
    } finally { await rm(lock, { recursive: true }) }
  })

  it.each(['0', 'true'])('keeps ordinary runtime and showcase copy unless the flag is exactly 1 (%s)', async (flag) => {
    const root = join(workspace, randomUUID())
    await exec(process.execPath, [resolve('node_modules/vite/bin/vite.js'), 'build',
      '--outDir', root, '--emptyOutDir'], { env: { ...process.env, CS3_PAGES_DEMO: flag } })
    const manifest = JSON.parse(await readFile(join(root, '.vite/manifest.json'), 'utf8'))
    expect(await readFile(join(root, 'index.html'), 'utf8')).toContain('id="references"')
    expect(await readFile(join(root, manifest['index.html'].file), 'utf8')).toContain('Production/release blocked')
    const play = await readFile(join(root, manifest['play/index.html'].file), 'utf8')
    expect(play).toContain('RELEASE_BLOCKED')
    expect(play).toContain('Ready - local provisional assets; appearance pending.')
    expect(play).not.toContain('Ready - source-only public Three.js demo.')
  })
})

describe('Pages validation fails closed', () => {
  it.each([
    'assets/library/leak.glb', 'gallery/index.json', 'Gallery/a.png', 'assets/model.GLB',
    'assets/a.js.map', '.artifacts/state.json', 'receipt.json', 'prompt.json', 'capture.png',
    'logs/a.json', 'notes.txt', 'source.ts', 'font.ttf',
  ])('rejects forbidden output %s', async (path) => {
    const root = await copyArtifact()
    await put(root, path, '{}')
    await expect(validatePages(root)).rejects.toThrow(/PAGES_FORBIDDEN/)
  })

  it.each([
    'PRIVATE_SENTINEL_DO_NOT_PUBLISH', '\\u0050RIVATE_SENTINEL',
    '\\x50RIVATE_SENTINEL', '/Users/private/person', '\\/Users\\/private\\/person',
    '/home/private/source', '/tmp/private/source', 'file:///private/source',
    'C:\\\\private\\\\person.png', 'rawPrompt', 'privatePath',
    'RELEASE_BLOCKED', 'provisional assets', '.artifacts/internal.json',
  ])('rejects private or misleading bundled text %s', async (text) => {
    const root = await copyArtifact()
    await put(root, 'assets/extra.js', `"${text}"`)
    await expect(validatePages(root)).rejects.toThrow(/PAGES_FORBIDDEN/)
  })

  it.each([
    ['index.html', '<img src="/outside.png">'],
    ['index.html', '<a href="/">escape</a>'],
    ['index.html', '<script src="//example.test/a.js"></script>'],
    ['index.html', '<img src=/midcreek-cs-3/missing.png>'],
    ['index.html', '<img srcset="/midcreek-cs-3/index.html 1x, /missing.png 2x">'],
    ['index.html', '<img src="&#47;outside.png">'],
    ['index.html', '<img alt=">" src="/outside.png">'],
    ['index.html', '<script>fetch("/outside.json")</script>'],
    ['index.html', '<div style="background:url(/outside.png)"></div>'],
    ['assets/extra.css', 'a{background:url("/outside.png")}'],
    ['assets/extra.css', 'a{background:url(/midcreek-cs-3/missing.png)}'],
    ['assets/extra.js', 'fetch("/midcreek-cs-3/missing.json", {cache:"no-store"})'],
    ['assets/extra.js', 'import("/midcreek-cs-3/missing.js")'],
    ['assets/extra.js', 'import("/midcreek-cs-3/gallery/")'],
    ['assets/extra.js', 'fetch("/midcreek-cs-3/assets/library/")'],
    ['assets/extra.js', 'fetch("/midcreek-cs-3/%2e%2e/outside.json")'],
    ['assets/extra.js', 'import "/midcreek-cs-3/missing.js"'],
    ['assets/extra.js', 'fetch(`https://example.test/data.json`)'],
    ['assets/extra.js', 'fetch(`/midcreek-cs-3/gallery/${name}.json`)'],
    ['assets/extra.js', 'fetch(`/midcreek-cs-3/assets/library/${name}.json`)'],
  ])('rejects escaped, missing or forbidden requests in %s: %s', async (path, text) => {
    const root = await copyArtifact()
    await put(root, path, text)
    await expect(validatePages(root)).rejects.toThrow(/PAGES_(?:FORBIDDEN|URL|DEPENDENCY)/)
  })

  it('allows only exact local dependencies, fragments, navigation indexes and inert inline favicon', async () => {
    const root = await copyArtifact()
    await put(root, 'index.html', '<a href="#main">Skip</a><a href="/midcreek-cs-3/play/">Play</a>'
      + '<link rel="icon" href="data:,"><img srcset="/midcreek-cs-3/a.png 1x, /midcreek-cs-3/a.webp 2x">'
      + '<script>fetch("/midcreek-cs-3/data.json")</script>')
    await put(root, 'assets/extra.js', 'import "../data.json"; fetch("/midcreek-cs-3/data.json")')
    await put(root, 'assets/extra.css', 'a{background:url("/midcreek-cs-3/a.png")}')
    await put(root, 'data.json', '{}')
    await put(root, 'a.png', 'image')
    await put(root, 'a.webp', 'image')
    expect((await validatePages(root)).files.some((file) => file.path === 'data.json')).toBe(true)
  })

  it.each(['index.html', 'play/index.html'])('requires entry %s', async (path) => {
    const root = await copyArtifact()
    await rm(join(root, path))
    await expect(validatePages(root)).rejects.toThrow(/PAGES_MISSING/)
  })

  it('rejects symlinked files, directories and artifact roots without following them', async () => {
    for (const path of ['assets/link.js', 'linked']) {
      const root = await copyArtifact()
      await symlink('/nonexistent-private-input', join(root, path))
      await expect(validatePages(root)).rejects.toThrow(/PAGES_FORBIDDEN/)
    }
    const root = join(workspace, randomUUID())
    await symlink(artifact.root, root)
    await expect(validatePages(root)).rejects.toThrow(/PAGES_FORBIDDEN/)
  })
})

async function pagesWorkflow() {
  const workflow = await readFile('.github/workflows/pages.yml', 'utf8')
  const [header, jobs] = workflow.split('\njobs:\n')
  expect(header).toBeDefined()
  expect(jobs).toBeDefined()
  expect([...jobs!.matchAll(/^  ([\w-]+):$/gm)].map((match) => match[1])).toEqual(['build', 'deploy'])
  const [build, deploy] = jobs!.split('\n  deploy:\n')
  return { workflow, header: header!, build: build!, deploy: deploy! }
}

describe('Pages workflow contract', () => {
  it('restricts publication to main with least-privilege build and deploy jobs', async () => {
    const { workflow, header, build, deploy } = await pagesWorkflow()
    expect(header).toMatch(/^on:\n  push:\n    branches: \[main\]\n  workflow_dispatch:\s*$/m)
    expect(header).toMatch(/^permissions:\n  contents: read\n(?:\n|$)/m)
    expect(header).toMatch(/^concurrency:\n  group: pages\n  cancel-in-progress: false$/m)
    expect(build).toMatch(/^    if: github\.ref == 'refs\/heads\/main'$/m)
    expect(deploy).toMatch(/^    if: github\.ref == 'refs\/heads\/main'$/m)
    expect(build).toMatch(/^    runs-on: ubuntu-24\.04$/m)
    expect(build).toMatch(/^    timeout-minutes: 20$/m)
    expect(build).not.toMatch(/permissions:|pages: write|id-token: write|environment:/)
    expect(deploy).toMatch(/^    needs: build$/m)
    expect(deploy).toMatch(/^    permissions:\n      pages: write\n      id-token: write\n(?:\n|    \S)/m)
    expect(deploy).toMatch(/^    environment:\n      name: github-pages\n      url: \$\{\{ steps\.deployment\.outputs\.page_url \}\}$/m)
    expect(deploy).toMatch(/^        id: deployment$/m)
    expect(deploy).not.toMatch(/^\s+(?:run|env):|actions\/(?:checkout|setup-node|upload-pages-artifact)@/m)
    expect(workflow).not.toMatch(/pull_request|workflow_run|secrets\.|write-all|continue-on-error|always\(\)|enablement: true/)
    expect(workflow).not.toMatch(/assets\/library|\.artifacts\/release|gallery:build|npm run build\b|download-artifact|actions\/cache@/)
  })

  it('pins every action to the verified official release commit and isolates credentials', async () => {
    const { workflow, build, deploy } = await pagesWorkflow()
    const uses = [...workflow.matchAll(/^\s+(?:- )?uses: (.+)$/gm)].map((match) => match[1])
    expect(uses).toEqual([
      'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1',
      'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0',
      'actions/upload-pages-artifact@fc324d3547104276b827a68afc52ff2a11cc49c9 # v5.0.0',
      'actions/configure-pages@45bfe0192ca1faeb007ade9deae92b16b8254a0d # v6.0.0',
      'actions/deploy-pages@368f82528645a54fb793d4d04e342629a3f51346 # v5.0.1',
    ])
    expect(build).toMatch(/actions\/checkout@[^\n]+\n        with:\n          persist-credentials: false\n/)
    expect(build).toMatch(/actions\/setup-node@[^\n]+\n        with:\n          node-version: '22\.23\.1'\n          check-latest: false\n          package-manager-cache: false\n/)
    expect(build).toContain('test "$(node --version)" = "v22.23.1"')
    expect(build).toContain('test "$(npm --version)" = "10.9.8"')
    expect(deploy).toMatch(/actions\/configure-pages@[^\n]+\n        with:\n          enablement: false\n/)
  })

  it('uploads only the exact source-only generation that passed all build and browser gates', async () => {
    const { build } = await pagesWorkflow()
    const gates = [
      'npm ci',
      'npm run typecheck',
      'npm run test:portable',
      'npx --no-install playwright install --with-deps chrome',
      'npm run pages:build',
      'cp .artifacts/pages/current/pages-manifest.json "$RUNNER_TEMP/pages-tested-manifest.json"',
      'npm run test:pages:e2e',
      "const artifact = await validatePages('.artifacts/pages/current/dist')",
      'deepStrictEqual(current, tested)',
      'deepStrictEqual({ files: artifact.files }, tested)',
      'uses: actions/upload-pages-artifact@',
    ]
    let previous = -1
    for (const gate of gates) {
      const position = build.indexOf(gate)
      expect(position, `missing or reordered gate: ${gate}`).toBeGreaterThan(previous)
      previous = position
    }
    expect(build).toContain('node --experimental-strip-types --input-type=module <<\'NODE\'')
    expect(build).toContain("import { deepStrictEqual } from 'node:assert/strict'")
    expect(build).toContain("import { validatePages } from './tools/pages.ts'")
    expect(build).toContain("const tested = JSON.parse(await readFile(`${process.env.RUNNER_TEMP}/pages-tested-manifest.json`, 'utf8'))")
    expect(build).toContain("const current = JSON.parse(await readFile('.artifacts/pages/current/pages-manifest.json', 'utf8'))")
    expect(build.match(/npm run pages:build/g)).toHaveLength(1)
    expect(build.match(/npm run test:pages:e2e/g)).toHaveLength(1)
    expect(build.slice(build.indexOf('uses: actions/upload-pages-artifact@'))).toMatch(
      /^uses: actions\/upload-pages-artifact@[^\n]+\n        with:\n          path: \.artifacts\/pages\/current\/dist\n          include-hidden-files: true\n          retention-days: 1\s*$/,
    )
    const config = await readFile('playwright.pages.config.ts', 'utf8')
    expect(config).toContain("command: 'npm run pages:build && node --experimental-strip-types playwright.pages.config.ts --serve'")
    expect(config).toContain("const current = join(repository, '.artifacts/pages/current')")
    expect(config).toContain("const artifact = await validatePages(join(current, 'dist'))")
    expect(config).toContain('reuseExistingServer: false')
  })

  it.each(['unchanged', 'changed files', 'changed manifest', 'replaced generation', 'forbidden output'] as const)(
    'executes the workflow upload gate against %s', async (change) => {
      const { build } = await pagesWorkflow()
      const gate = build.match(
        /^      - name: Verify tested artifact identities before upload\n        run: \|\n((?:          .*\n|\n)+)/m,
      )
      expect(gate, 'the actual pre-upload verification script must run in this test').not.toBeNull()
      const command = gate![1]!.replace(/^          /gm, '')
      const root = join(workspace, randomUUID())
      const dist = join(root, '.artifacts/pages/current/dist')
      await cp(artifact.root, dist, { recursive: true })
      await symlink(resolve('tools'), join(root, 'tools'), 'dir')
      const manifest = await readFile(join(artifact.root, '../pages-manifest.json'), 'utf8')
      await put(root, 'pages-tested-manifest.json', manifest)
      await put(root, '.artifacts/pages/current/pages-manifest.json', manifest)
      if (change === 'changed files' || change === 'replaced generation') {
        await put(dist, 'index.html', `${await readFile(join(dist, 'index.html'), 'utf8')}\n<!-- untested -->`)
      }
      if (change === 'replaced generation') {
        const changed = await validatePages(dist)
        await put(root, '.artifacts/pages/current/pages-manifest.json', JSON.stringify({ files: changed.files }))
      }
      if (change === 'changed manifest') {
        await put(root, '.artifacts/pages/current/pages-manifest.json', JSON.stringify({ files: [] }))
      }
      if (change === 'forbidden output') await put(dist, 'receipt.json', '{}')
      const result = exec('bash', ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', command], {
        cwd: root, env: { ...process.env, RUNNER_TEMP: root },
      })
      if (change === 'unchanged') await expect(result).resolves.toMatchObject({ stdout: '' })
      else await expect(result).rejects.toMatchObject({
        code: 1,
        stderr: expect.stringMatching(change === 'forbidden output' ? /PAGES_FORBIDDEN/ : /AssertionError/),
      })
    },
  )

  it('keeps Pages contracts in portable quality validation without publication privileges', async () => {
    const [quality, packageText, config] = await Promise.all([
      readFile('.github/workflows/quality.yml', 'utf8'),
      readFile('package.json', 'utf8'),
      readFile('vitest.config.ts', 'utf8'),
    ])
    const { scripts } = JSON.parse(packageText)
    expect(scripts['test:portable']).toBe('vitest run')
    expect(config).toContain("'tests/**/*.test.ts'")
    expect(quality).toContain('npm run test:portable')
    expect(quality).toMatch(/^permissions:\n  contents: read\n(?:\n|$)/m)
    expect(quality).not.toMatch(/pages: write|id-token: write|actions\/(?:configure-pages|upload-pages-artifact|deploy-pages)@/)
  })
})
