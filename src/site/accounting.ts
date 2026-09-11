export interface SiteResource {
  readonly url: string
  readonly role: 'html' | 'script' | 'style' | 'font' | 'other'
  readonly cache: 'network' | 'local' | 'revalidated' | 'unknown'
  readonly startTime: number
  readonly responseEnd: number
  readonly transferSize: number
  readonly encodedBodySize: number
  readonly decodedBodySize: number
}
export interface SiteStartupInput {
  readonly origin: string
  readonly timeOrigin: number
  readonly readyAt: number
  readonly required: readonly string[]
  readonly resources: readonly SiteResource[]
  readonly pending: readonly string[]
  readonly overflow: boolean
  readonly networkVerified?: boolean
}
export interface SiteStartup extends SiteStartupInput {
  readonly status: 'passed' | 'failed' | 'unqualified'
  readonly transferBytes: number
  readonly laterBytes: number
  readonly issues: readonly string[]
}
export function freezeShowcaseStartup(input: SiteStartupInput): SiteStartup {
  const issues: string[] = []
  if (!Number.isFinite(input.timeOrigin) || input.timeOrigin <= 0
    || !Number.isFinite(input.readyAt) || input.readyAt <= 0) issues.push('Invalid navigation clock')
  if (input.pending.length) issues.push('Pending initial requests')
  if (input.overflow) issues.push('Resource timing buffer overflow')
  if (!input.networkVerified) issues.push('Independent network reconciliation required')
  const required = new Set(input.required)
  if (!required.size || required.size !== input.required.length) issues.push('Missing or duplicate required requests')
  const resources = input.resources.filter((r) => !Number.isFinite(r.startTime) || r.startTime <= input.readyAt || required.has(r.url))
  const seen = new Set<string>()
  let transferBytes = 0
  let laterBytes = 0
  for (const resource of resources) {
    let url: URL | undefined
    try { url = new URL(resource.url) } catch { issues.push('Invalid resource URL') }
    if (!url || url.origin !== input.origin) issues.push('Unmeasurable foreign request')
    if (!required.has(resource.url) || /\.map(?:$|\?)/.test(resource.url) || resource.url.includes('/gallery/')) issues.push('Unexpected initial request')
    if (resource.role === 'other') issues.push('Unknown readiness role')
    if (seen.has(resource.url)) issues.push('Duplicate response')
    seen.add(resource.url)
    if (!Number.isFinite(resource.startTime) || resource.startTime < 0 || !Number.isFinite(resource.responseEnd)
      || resource.responseEnd <= 0 || resource.responseEnd < resource.startTime
      || resource.responseEnd > input.readyAt) issues.push('Pending or invalid response')
    if (![resource.transferSize, resource.encodedBodySize, resource.decodedBodySize]
      .every((n) => Number.isSafeInteger(n) && n > 0)
      || resource.transferSize !== resource.encodedBodySize + 300 || resource.cache !== 'network') issues.push('Unmeasurable or cached transfer')
    if (Number.isSafeInteger(resource.transferSize) && resource.transferSize > 0) transferBytes += resource.transferSize
  }
  for (const url of required) if (!seen.has(url)) issues.push('Missing required response')
  for (const r of input.resources) {
    if (r.startTime > input.readyAt && !required.has(r.url) && Number.isSafeInteger(r.transferSize) && r.transferSize > 0) laterBytes += r.transferSize
  }
  const status = issues.length ? 'unqualified' : transferBytes > 2_000_000 ? 'failed' : 'passed'
  return Object.freeze({
    ...input, required: Object.freeze([...input.required]), pending: Object.freeze([...input.pending]),
    resources: Object.freeze(resources.map((r) => Object.freeze({ ...r }))), issues: Object.freeze(issues),
    transferBytes, laterBytes, status,
  })
}
