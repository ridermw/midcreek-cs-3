import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { browserReleaseFixture } from '../fixtures/release.ts'
import { serveRelease, validateRelease } from '../../tools/release.ts'
import type { ReleaseArtifact } from '../../tools/release.ts'

let server: Awaited<ReturnType<typeof serveRelease>>
function assertRequests(requests: string[], serving: Awaited<ReturnType<typeof serveRelease>>) {
  const origin = new URL(serving.url).origin
  // Blob image decodes have no HTTP path or network transfer. They must stay local;
  // every actual network request still needs both the prefix and an exact member.
  const decoded = requests.filter((url) => url.startsWith('blob:'))
  expect(decoded.filter((url) => new URL(url).origin !== origin)).toEqual([])
  expect(requests.filter((url) => !url.startsWith('blob:') && (!url.startsWith(serving.url)
    || !serving.requests.some((request) => request.path === new URL(url).pathname && request.allowed)))).toEqual([])
}
test.beforeAll(async () => {
  const artifact = await browserReleaseFixture()
  expect((await validateRelease(artifact)).release).toBe('blocked')
  server = await serveRelease(artifact)
})
test.afterAll(async () => { await server?.close() })

test('both real Vite routes request only prefixed allowlisted resources; five synthetic GLBs render', async ({ page }, info) => {
  const errors: string[] = []
  const requests: string[] = []
  page.on('request', (request) => requests.push(request.url()))
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(server.url)
  await expect(page.locator('#build-status')).toHaveText('Showcase ready.')
  await page.getByRole('button', { name: 'Open reference gallery' }).click()
  await expect(page.getByText('Reference gallery awaiting publication approval', { exact: true })).toBeVisible()
  const showcase = [...server.requests]
  expect(showcase.some((request) => request.path.endsWith('.glb'))).toBe(false)
  await page.getByRole('link', { name: 'Play demo', exact: true }).click()
  await expect(page.locator('#load-status')).toContainText('Ready')
  await expect(page.locator('canvas')).toBeVisible()
  expect(server.requests.filter((request) => request.path.endsWith('.glb'))).toHaveLength(5)
  await info.attach('synthetic-request-ledger', {
    body: JSON.stringify({ browser: requests, server: server.requests }, null, 2), contentType: 'application/json',
  })
  assertRequests(requests, server)
  expect(server.requests.filter((request) => !request.allowed || request.status !== 200
    || !request.path.startsWith('/midcreek-cs-3/'))).toEqual([])
  expect(server.requests.some((request) => /development|receipt|\.map/.test(request.path))).toBe(false)
  expect(errors).toEqual([])
})

test('missing nested routes and GLBs cannot be masked by the HTML entry', async ({ request }) => {
  for (const path of ['play/missing.glb', 'play/unknown/', 'assets/library/absent.glb', '../assets/root.js']) {
    const response = await request.get(new URL(path, server.url).href)
    expect(response.status()).toBe(404)
    expect(response.headers()['content-type']).not.toContain('text/html')
  }
})

test('real staging reports blocked play without requesting provisional content; gallery remains deferred', async ({ page }, info) => {
  const artifact: ReleaseArtifact = JSON.parse(await readFile('.artifacts/release/current.json', 'utf8'))
  const report = await validateRelease(artifact)
  expect(report.mode).toBe('staging')
  expect(report.release).toBe('blocked')
  const real = await serveRelease(artifact)
  const requests: string[] = []
  page.on('request', (request) => requests.push(request.url()))
  try {
    await page.goto(real.url)
    await expect(page.locator('#build-status')).toHaveText('Showcase ready.')
    expect(real.requests.some((request) => /gallery|library/.test(request.path))).toBe(false)
    await page.getByRole('button', { name: 'Open reference gallery' }).click()
    if (report.gallery === 'approved-for-staging') {
      await expect(page.locator('.gallery-card')).toHaveCount(6)
      await expect.poll(() => real.requests.filter((request) => request.path.endsWith('.webp')).length).toBe(6)
      expect(real.requests.some((request) => request.path.includes('/originals/'))).toBe(false)
    } else {
      await expect(page.getByText('Reference gallery awaiting publication approval', { exact: true })).toBeVisible()
    }
    await page.getByRole('link', { name: 'Play demo', exact: true }).click()
    await expect(page.locator('#load-status')).toContainText('RELEASE_BLOCKED')
    expect(real.requests.some((request) => /library|development|\.glb/.test(request.path))).toBe(false)
    expect(real.requests.filter((request) => !request.allowed || request.status !== 200
      || !request.path.startsWith('/midcreek-cs-3/'))).toEqual([])
    await info.attach('real-staging-request-ledger', {
      body: JSON.stringify({ browser: requests, server: real.requests }, null, 2), contentType: 'application/json',
    })
    assertRequests(requests, real)
  } finally { await real.close() }
})
