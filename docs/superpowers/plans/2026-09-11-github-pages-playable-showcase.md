# GitHub Pages Playable Showcase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a polished, fully playable Three.js Mid Creek showcase on GitHub Pages using only tracked source files.

**Architecture:** Add a procedural presentation and Pages-specific game orchestrator that reuse the existing deterministic simulation, renderer, camera, input, and HUD without loading GLBs. Build through an explicit Pages mode, validate the generated file/request allowlist, and deploy only after unit and browser contracts pass.

**Tech Stack:** TypeScript 6.0, Three.js 0.185.1, Vite 8.2.2, Vitest 3.2.7, Playwright 1.62.1, GitHub Actions Pages.

**Spec:** `docs/superpowers/specs/2026-09-11-github-pages-playable-showcase-design.md`

## Global Constraints

- Build and publish only from tracked source files and installed dependencies.
- Never read, copy, upload, or require `assets/library/`, `dist/`, `.artifacts/`, reference media, Blender exports, receipts, prompts, captures, logs, or local paths.
- Preserve the existing asset-backed `startGame` and U10 release-validation behavior.
- The Pages playable must support pointer and keyboard movement, dispatch, repair, cancellation, pause, restart, orbit, reset, zoom, responsive layout, and hidden-page time suppression.
- The public page must identify itself as a source-only procedural demo and must not display `RELEASE_BLOCKED` or “provisional assets.”
- All generated URLs must remain under `/midcreek-cs-3/`.

---

### Task 1: Procedural Three.js Presentation

**Files:**
- Create: `src/engine/proceduralPresentation.ts`
- Create: `src/engine/proceduralPresentation.test.ts`
- Read: `src/world/layout.ts`
- Read: `src/engine/presentation.ts`

**Interfaces:**
- Consumes: `createPlacements(world: WorldSnapshot)`, `cellToWorld(cell: Cell)`, `WorldSnapshot`.
- Produces:

```ts
export interface ProceduralPresentation {
  readonly root: Group
  readonly marker: Object3D
  readonly instances: ReadonlyMap<string, Object3D>
  present(world: WorldSnapshot): void
  reset(world: WorldSnapshot): void
  dispose(): void
}

export function createProceduralPresentation(initial: WorldSnapshot): ProceduralPresentation
```

- [ ] **Step 1: Write failing placement and disposal tests**

```ts
import { describe, expect, it, vi } from 'vitest'
import { Mesh } from 'three'
import { createWorld } from '../world/simulation'
import { createProceduralPresentation } from './proceduralPresentation'

describe('source-only procedural presentation', () => {
  it('creates the exact 37 authoritative placements without loading assets', () => {
    const view = createProceduralPresentation(createWorld(417))
    expect(view.instances.size).toBe(37)
    expect(view.instances.get('actor/technician')?.position.toArray()).toEqual([2, 0, 7])
    expect(view.instances.get('rack/rack-00')).toBeDefined()
    view.dispose()
  })

  it('disposes every generated geometry and material exactly once', () => {
    const view = createProceduralPresentation(createWorld(417))
    const geometries = new Set<unknown>()
    const materials = new Set<unknown>()
    view.root.traverse((node) => {
      if (node instanceof Mesh) {
        geometries.add(node.geometry)
        const list = Array.isArray(node.material) ? node.material : [node.material]
        list.forEach((material) => materials.add(material))
      }
    })
    const geometrySpies = [...geometries].map((geometry) => vi.spyOn(geometry as { dispose(): void }, 'dispose'))
    const materialSpies = [...materials].map((material) => vi.spyOn(material as { dispose(): void }, 'dispose'))
    view.dispose()
    view.dispose()
    expect(geometrySpies.every((spy) => spy.mock.calls.length === 1)).toBe(true)
    expect(materialSpies.every((spy) => spy.mock.calls.length === 1)).toBe(true)
  })
})
```

- [ ] **Step 2: Run the tests and confirm the module is missing**

Run: `npm test -- src/engine/proceduralPresentation.test.ts`

Expected: FAIL because `./proceduralPresentation` does not exist.

- [ ] **Step 3: Implement reusable procedural shapes and exact placements**

Create shared geometries/materials for these asset IDs:

```ts
const factories: Record<Placement['assetId'], () => Object3D> = {
  'floor-slab': floorSlab,
  'rack-standard': rack,
  'cooling-unit': coolingUnit,
  'technician-man': technician,
  'coolant-leak': coolantLeak,
}
```

Build each model from tracked Three.js primitives:

```ts
function rack(): Object3D {
  const root = new Group()
  const shell = new Mesh(new BoxGeometry(0.86, 2.4, 0.9), rackMaterial)
  shell.position.y = 1.2
  shell.castShadow = true
  shell.receiveShadow = true
  root.add(shell)
  for (let y = 0.32; y < 2.2; y += 0.28) {
    const server = new Mesh(new BoxGeometry(0.76, 0.14, 0.92), serverMaterial)
    server.position.set(0, y, -0.02)
    root.add(server)
  }
  return root
}
```

Use `createPlacements(initial)` for all 37 identities and preserve the update
rules from `createPresentation`: technician yaw, route line, leak location,
marker visibility, and reset semantics. Represent walking and repairing with
deterministic procedural motion based only on `world.clock.tick`:

```ts
actor.position.y = world.player.mode === 'walking'
  ? Math.abs(Math.sin(world.clock.tick * Math.PI / 5)) * 0.045
  : 0
actor.rotation.z = world.player.mode === 'repairing'
  ? Math.sin(world.clock.tick * Math.PI / 3) * 0.08
  : 0
```

Track every created geometry/material in identity sets and dispose them once.

- [ ] **Step 4: Add snapshot-state tests**

Test walking position/yaw, route points, repair motion, resolved leak visibility,
and reset:

```ts
const walking = commandWorld(createWorld(417), { type: 'move', cell: { x: 3, z: 7 } })
view.present(walking)
expect(view.instances.get('actor/technician')?.rotation.y).not.toBe(0)
expect(view.route.visible).toBe(true)
```

- [ ] **Step 5: Run the focused tests**

Run: `npm test -- src/engine/proceduralPresentation.test.ts src/engine/presentation.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/engine/proceduralPresentation.ts src/engine/proceduralPresentation.test.ts
git commit -m "feat(demo): add procedural hall presentation"
```

---

### Task 2: Source-Only Playable Orchestrator

**Files:**
- Create: `src/app/pagesGame.ts`
- Create: `src/app/pagesGame.test.ts`
- Modify: `src/ui/hud.ts`
- Modify: `src/play/main.ts`

**Interfaces:**
- Consumes: `createRenderer`, `createProceduralPresentation`, `createSession`,
  `bindGameInput`, `createHud`, `createInspection`.
- Produces:

```ts
export interface PagesGameOptions {
  readonly seed?: number
  readonly scenario?: string
  readonly heading?: number
  readonly zoom?: number
  readonly diagnostics?: boolean
}

export function startPagesGame(
  container: HTMLElement,
  options?: PagesGameOptions,
): Promise<GameHandle>
```

- [ ] **Step 1: Write failing source-only startup tests**

```ts
it('starts ready without fetching a manifest or GLB', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch')
  const game = await startPagesGame(document.querySelector('#game')!)
  expect(fetch).not.toHaveBeenCalled()
  expect(document.querySelector('#load-status')?.textContent)
    .toBe('Ready - source-only public Three.js demo.')
  expect(game.inspect().state).toBe('ready')
  expect(game.inspect().instances).toHaveLength(37)
  game.dispose()
})
```

Add failure tests for invalid seed/camera options and idempotent disposal.

- [ ] **Step 2: Run the test and confirm the module is missing**

Run: `npm test -- src/app/pagesGame.test.ts`

Expected: FAIL because `pagesGame.ts` does not exist.

- [ ] **Step 3: Extract HUD-ready copy as an explicit argument**

Change `createHud` to:

```ts
export function createHud(
  container: HTMLElement,
  onCommand: (command: WorldCommand) => void,
  readyMessage = 'Ready - local provisional assets; appearance pending.',
)
```

and implement:

```ts
ready() { text(status, readyMessage) }
```

Update `src/ui/hud.test.ts` to verify both default and public-demo copy.

- [ ] **Step 4: Implement `startPagesGame`**

Follow `startGame` for canvas/HUD/session/input/RAF/resize/visibility behavior,
but replace the asset lifecycle with synchronous procedural setup:

```ts
const renderer = createRenderer(canvas)
const presentation = createProceduralPresentation(session.snapshot())
renderer.scene.add(presentation.root)
resize()
const firstFrame = renderer.render()
renderer.finishGpu()
session.setReady(true)
hud.ready()
frameId = window.requestAnimationFrame(frame)
```

Use identity `source-only-pages-demo-v1`. Reuse the same pointer behavior:
marker hit dispatches; otherwise `renderer.pick` enqueues a move. Cap DPR at 1.5.
Expose the existing `GameHandle` shape and inspection data.

- [ ] **Step 5: Select the orchestrator through an explicit build flag**

Extend the entry environment:

```ts
interface ImportMetaEnv {
  readonly CS3_PAGES_DEMO?: boolean
  readonly CS3_RELEASE_BINDING: ReleaseManifestBinding | null | undefined
}
```

Then:

```ts
const game = import.meta.env.CS3_PAGES_DEMO
  ? await startPagesGame(container)
  : await startGame(container, {
      baseUrl: assetUrl('assets/library/'),
      releaseBinding: import.meta.env.CS3_RELEASE_BINDING,
      diagnostics: new URLSearchParams(window.location.search).has('qualification'),
    })
```

- [ ] **Step 6: Run focused unit tests and typecheck**

Run: `npm test -- src/app/pagesGame.test.ts src/ui/hud.test.ts src/app/game.test.ts`

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/pagesGame.ts src/app/pagesGame.test.ts src/ui/hud.ts src/ui/hud.test.ts src/play/main.ts
git commit -m "feat(demo): add source-only playable runtime"
```

---

### Task 3: Pages Build and Public Showcase Mode

**Files:**
- Create: `tools/pages.ts`
- Create: `tests/pages-contract.test.ts`
- Modify: `src/site/main.ts`
- Modify: `src/site/content.ts`
- Modify: `index.html`
- Modify: `package.json`
- Modify: `vite.config.ts`

**Interfaces:**
- Produces:

```ts
export interface PagesArtifact {
  readonly root: string
  readonly files: readonly { path: string; bytes: number; sha256: string }[]
}

export async function buildPages(repository?: string): Promise<PagesArtifact>
export async function validatePages(root: string): Promise<PagesArtifact>
```

- [ ] **Step 1: Write failing source-only artifact tests**

```ts
it('builds a playable artifact without reading or copying ignored inputs', async () => {
  const artifact = await buildPages(resolve('.'))
  const paths = artifact.files.map((file) => file.path)
  expect(paths).toContain('index.html')
  expect(paths).toContain('play/index.html')
  expect(paths.some((path) => /gallery|assets\/library|\.glb$/i.test(path))).toBe(false)
  const text = await Promise.all(paths.filter((path) => /\.(html|js|css)$/.test(path))
    .map((path) => readFile(join(artifact.root, path), 'utf8')))
  expect(text.join('\n')).not.toMatch(/RELEASE_BLOCKED|provisional assets|\.artifacts|\/Users\//)
})
```

Add a test that inserts `assets/library/leak.glb` into a copied artifact and
expects `validatePages` to reject with `PAGES_FORBIDDEN`.

- [ ] **Step 2: Run the contract and confirm the module is missing**

Run: `npm test -- tests/pages-contract.test.ts`

Expected: FAIL because `tools/pages.ts` does not exist.

- [ ] **Step 3: Add explicit Vite Pages mode**

Read `CS3_PAGES_DEMO` in `vite.config.ts` and define a compile-time boolean:

```ts
const pages = process.env.CS3_PAGES_DEMO === '1'

export default defineConfig({
  base: '/midcreek-cs-3/',
  define: { 'import.meta.env.CS3_PAGES_DEMO': JSON.stringify(pages) },
  // existing publicDir/cache/build configuration
})
```

Do not change `CS3_RELEASE_BINDING` behavior in ordinary builds.

- [ ] **Step 4: Implement deterministic Pages build validation**

`buildPages` must:

1. create `.artifacts/pages/<uuid>/dist`
2. invoke Vite with `CS3_PAGES_DEMO=1`
3. enumerate every output file without following symlinks
4. allow only `.html`, `.js`, `.css`, `.json`, `.svg`, `.png`, `.webp`, `.ico`,
   `.woff`, and `.woff2`
5. reject paths containing `gallery/`, `assets/library/`, `.glb`, `.map`,
   `.artifacts`, `receipt`, `prompt`, `capture`, or `log`
6. scan text outputs for absolute local paths, private sentinels,
   `RELEASE_BLOCKED`, and “provisional assets”
7. parse HTML `src`, `href`, and `srcset`, CSS `url()`, and direct JavaScript
   `fetch`/`import` string URLs; require the `/midcreek-cs-3/` prefix and exact
   artifact membership
8. write `pages-manifest.json` with canonical path/byte/hash records

The CLI exits nonzero on validation failure:

```ts
if (import.meta.url === pathToFileURL(resolve(process.argv[1]!)).href) {
  const artifact = await buildPages()
  console.log(`PAGES_ARTIFACT: ${artifact.root}`)
}
```

- [ ] **Step 5: Switch showcase content in Pages mode**

In `src/site/main.ts`, derive:

```ts
const pagesDemo = import.meta.env.CS3_PAGES_DEMO === true
initializeGallery(!pagesDemo && document.documentElement.dataset.publication === 'approved-for-staging')
```

When `pagesDemo`:

- hide/remove `#references` gallery controls and the Blender/reference studies
- set `#build-status` to `Source-only playable showcase ready.`
- set the hero muted line to `Public Three.js demo built entirely from tracked source.`
- use results copy that preserves technical truth but does not describe the page
  as blocked or provisional

- [ ] **Step 6: Add scripts**

```json
"pages:build": "CS3_PAGES_DEMO=1 node --experimental-strip-types tools/pages.ts",
"pages:test": "vitest run tests/pages-contract.test.ts"
```

- [ ] **Step 7: Run contract, portable suite, and typecheck**

Run: `npm test -- tests/pages-contract.test.ts tests/build-contract.test.ts`

Run: `npm run typecheck`

Run: `npm run test:portable`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add tools/pages.ts tests/pages-contract.test.ts src/site/main.ts src/site/content.ts index.html package.json vite.config.ts
git commit -m "feat(site): build a source-only Pages showcase"
```

---

### Task 4: Built Pages Browser Journey

**Files:**
- Create: `playwright.pages.config.ts`
- Create: `tests/e2e/pages.spec.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: artifact emitted by `npm run pages:build`.
- Produces: `npm run test:pages:e2e`.

- [ ] **Step 1: Write the failing browser journey**

```ts
test('source-only Pages showcase completes the repair journey', async ({ page }) => {
  const requests: string[] = []
  page.on('request', (request) => requests.push(request.url()))
  await page.goto('/')
  await expect(page.locator('#build-status')).toHaveText('Source-only playable showcase ready.')
  await page.getByRole('link', { name: 'Play demo' }).click()
  await expect(page.locator('#load-status')).toHaveText('Ready - source-only public Three.js demo.')
  await page.getByRole('button', { name: 'Dispatch technician' }).click()
  await expect.poll(() => page.evaluate(() => window.midcreek.inspect().world.fault.status),
    { timeout: 15_000 }).toBe('resolved')
  expect(requests.some((url) => /assets\/library|gallery|\.glb/i.test(url))).toBe(false)
})
```

Add tests for keyboard movement, repair cancellation, pause/restart, orbit/zoom,
narrow layout, back navigation, 404 behavior, and all requests remaining under
`/midcreek-cs-3/`.

- [ ] **Step 2: Run and observe the missing configuration**

Run: `npm run test:pages:e2e`

Expected: FAIL because the script/config does not exist.

- [ ] **Step 3: Add a strict Pages preview configuration**

Configure Playwright to run `npm run pages:build` followed by a small strict
static server rooted at the emitted artifact. Reuse the existing Chrome channel,
single worker, DPR 1, 1280×720 viewport, and retained-on-failure traces.

Expose the built path through `.artifacts/pages/current.json`; the server must
map directory requests to `index.html` and return plain 404 for unknown files.

- [ ] **Step 4: Add package script**

```json
"test:pages:e2e": "playwright test --config playwright.pages.config.ts"
```

- [ ] **Step 5: Run the Pages browser suite**

Run: `npm run test:pages:e2e`

Expected: PASS with no ignored asset/media requests.

- [ ] **Step 6: Commit**

```bash
git add playwright.pages.config.ts tests/e2e/pages.spec.ts package.json
git commit -m "test(site): cover the built Pages playable"
```

---

### Task 5: GitHub Pages Workflow, README Link, and Deployment

**Files:**
- Create: `.github/workflows/pages.yml`
- Modify: `.github/workflows/quality.yml`
- Modify: `README.md`

**Interfaces:**
- Consumes: `npm run pages:build`, `npm run test:pages:e2e`.
- Produces: `https://ridermw.github.io/midcreek-cs-3/`.

- [ ] **Step 1: Add workflow contract assertions**

Extend `tests/pages-contract.test.ts`:

```ts
it('uses a least-privilege pinned Pages workflow', async () => {
  const workflow = await readFile('.github/workflows/pages.yml', 'utf8')
  expect(workflow).toContain('pages: write')
  expect(workflow).toContain('id-token: write')
  expect(workflow).toContain('npm run pages:build')
  expect(workflow).toContain('npm run test:pages:e2e')
  expect(workflow).not.toMatch(/pull_request_target|secrets\.|assets\/library|\.artifacts\/release/)
  expect(workflow.match(/uses: [^\n]+@[a-f0-9]{40}/g)?.length).toBeGreaterThanOrEqual(4)
})
```

- [ ] **Step 2: Run the contract and confirm the workflow is missing**

Run: `npm test -- tests/pages-contract.test.ts`

Expected: FAIL because `.github/workflows/pages.yml` does not exist.

- [ ] **Step 3: Add the pinned Pages workflow**

Use:

```yaml
name: Deploy source-only playable showcase

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-24.04
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683
        with:
          persist-credentials: false
      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020
        with:
          node-version: '22.23.1'
      - run: npm ci
      - run: npm run typecheck
      - run: npm run test:portable
      - run: npx --no-install playwright install --with-deps chrome
      - run: npm run pages:build
      - run: npm run test:pages:e2e
      - uses: actions/configure-pages@983d7736d9b0ae728b81ab479565c72886d7745b
      - uses: actions/upload-pages-artifact@56afc609e74202658d3ffba0e8f6dda462b719fa
        with:
          path: .artifacts/pages/current/dist

  deploy:
    needs: build
    permissions:
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-24.04
    steps:
      - name: Deploy
        id: deployment
        uses: actions/deploy-pages@f9b0b2d2b4a2f7aa2ec8a056fe6c0f400c28a8f0
```

Before implementation, verify current official action commit SHAs and replace
any stale example SHA above with the current immutable release commit.

- [ ] **Step 4: Keep quality and deploy responsibilities separate**

Do not add Pages permissions to `quality.yml`. Add only `npm run pages:test` to
its portable validation if the new contracts are not already included by
`test:portable`.

- [ ] **Step 5: Put the live link at the top of README**

Directly after the title:

```md
**[Play the live Three.js showcase](https://ridermw.github.io/midcreek-cs-3/)**

The hosted demo is built only from tracked source code. It publishes no ignored
asset library, reference media, or local qualification evidence.
```

Update the Pages section with local commands:

```sh
npm run pages:build
npm run test:pages:e2e
```

- [ ] **Step 6: Run all final local gates**

Run: `npm run typecheck`

Run: `npm run test:portable`

Run: `npm run pages:build`

Run: `npm run test:pages:e2e`

Run: `npm run build`

Run: `npm run release:expect-blocked`

Run: `git diff --check`

Expected: all commands pass; the ordinary U10 release remains blocked while the
separate source-only Pages artifact is playable.

- [ ] **Step 7: Review, commit, and push**

```bash
git add .github/workflows/pages.yml .github/workflows/quality.yml README.md
git commit -m "feat(site): deploy the playable showcase to Pages"
git push origin main
```

- [ ] **Step 8: Enable and verify GitHub Pages**

Run:

```bash
GH_TOKEN=$(gh auth token --user ridermw) gh api \
  -X POST repos/ridermw/midcreek-cs-3/pages \
  -f build_type=workflow
```

If the API reports that Pages already exists, verify `build_type` is `workflow`
instead of replacing unrelated settings.

Monitor the `Deploy source-only playable showcase` workflow to completion. Then
verify:

```bash
curl --fail --location https://ridermw.github.io/midcreek-cs-3/
curl --fail --location https://ridermw.github.io/midcreek-cs-3/play/
```

Open the live Play route in Chrome and complete dispatch, travel, and repair.

- [ ] **Step 9: Record exact deployment status**

Update `README.md` only if the final URL differs. Record the deployed commit and
workflow run in the final response. Do not describe the source-only demo as C5
appearance acceptance or named-target performance qualification.
