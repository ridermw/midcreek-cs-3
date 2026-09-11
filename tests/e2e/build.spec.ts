import { expect, test } from '@playwright/test'

test('the built entries navigate under the project prefix without cross-loading', async ({ page }) => {
  const failed: string[] = []
  const urls: string[] = []
  page.on('pageerror', (error) => failed.push(error.message))
  page.on('requestfailed', (request) => failed.push(`${request.url()}: ${request.failure()?.errorText}`))
  page.on('response', (response) => {
    urls.push(new URL(response.url()).pathname)
    if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`)
  })
  await page.goto('./')
  await expect(page.getByRole('link', { name: 'Play demo' }))
    .toHaveAttribute('href', '/midcreek-cs-3/play/')
  await expect(page.getByRole('status')).toContainText('Entry build ready')
  expect(urls.every((url) => url.startsWith('/midcreek-cs-3/'))).toBe(true)
  await page.getByRole('link', { name: 'Play demo' }).click()
  await expect(page).toHaveURL(/\/midcreek-cs-3\/play\/$/)
  // The ordinary build intentionally does not copy the ignored local package.
  await expect(page.locator('#load-status')).toHaveText('Unable to start (MANIFEST_JSON). Reload to try again.')
  await expect(page.getByRole('button', { name: 'Reload' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Dispatch technician' })).toBeDisabled()
  expect(urls).toContain('/midcreek-cs-3/assets/library/development/selection.json')
  expect(urls.some((url) => url.endsWith('.glb'))).toBe(false)
  await page.getByRole('link', { name: 'Back to showcase' }).click()
  await expect(page).toHaveURL(/\/midcreek-cs-3\/$/)
  expect(failed).toEqual([])
})
