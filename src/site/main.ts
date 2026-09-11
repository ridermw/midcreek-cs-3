import { assetUrl } from '../shared/urls.ts'
import { architecture, controls, results } from './content.ts'
import { element as required, initializeGallery } from './gallery.ts'
import { freezeShowcaseStartup } from './accounting.ts'
import type { SiteResource, SiteStartup } from './accounting.ts'
import './style.css'

declare global {
  interface Window {
    showcase: { readonly startup: SiteStartup; readonly laterBytes: () => number }
  }
}
for (const [selector, entries] of [
  ['#architecture-list', architecture], ['#controls-list', controls], ['#results-list', results],
] as const) {
  const root = required(selector)
  for (const [title, detail] of entries) {
    const item = document.createElement('div')
    const heading = document.createElement('h3'); heading.textContent = title
    const paragraph = document.createElement('p'); paragraph.textContent = detail
    item.append(heading, paragraph); root.append(item)
  }
}
required<HTMLAnchorElement>('#play-link').href = assetUrl('play/')
initializeGallery(document.documentElement.dataset.publication === 'approved-for-staging')

let overflow = false
performance.setResourceTimingBufferSize(2000)
performance.addEventListener('resourcetimingbufferfull', () => { overflow = true })
function resource(entry: PerformanceResourceTiming): SiteResource {
  return {
    url: entry.name,
    role: entry.entryType === 'navigation' ? 'html' : entry.name.endsWith('.js') ? 'script'
      : entry.name.endsWith('.css') ? 'style' : /\.(woff2?|ttf)$/.test(entry.name) ? 'font' : 'other',
    cache: entry.transferSize === 0 ? 'local' : entry.transferSize === 300 ? 'revalidated'
      : entry.transferSize > 300 ? 'network' : 'unknown',
    startTime: entry.startTime, responseEnd: entry.responseEnd,
    transferSize: entry.transferSize, encodedBodySize: entry.encodedBodySize, decodedBodySize: entry.decodedBodySize,
  }
}
const ready = () => requestAnimationFrame(() => {
  const readyAt = performance.now()
  const requiredUrls = [
    location.href,
    ...[...document.querySelectorAll<HTMLScriptElement>('script[src]')].map((s) => s.src),
    ...[...document.querySelectorAll<HTMLLinkElement>('link[rel=stylesheet],link[rel=modulepreload]')].map((l) => l.href),
  ]
  const startup = freezeShowcaseStartup({
    origin: location.origin, timeOrigin: performance.timeOrigin, readyAt, required: requiredUrls,
    resources: [...performance.getEntriesByType('navigation'), ...performance.getEntriesByType('resource')]
      .filter((entry): entry is PerformanceResourceTiming => entry instanceof PerformanceResourceTiming)
      .map(resource),
    // Resource Timing alone cannot detect every unfinished/failed request.
    // Qualification must reconcile this frozen candidate with an independent network ledger.
    pending: [], overflow, networkVerified: false,
  })
  Object.defineProperty(window, 'showcase', {
    value: Object.freeze({
      startup,
      laterBytes: () => performance.getEntriesByType('resource')
        .filter((r): r is PerformanceResourceTiming => r instanceof PerformanceResourceTiming
          && r.startTime > readyAt && r.name.startsWith(new URL(assetUrl('gallery/'), location.origin).href))
        .reduce((sum, r) => sum + r.transferSize, 0),
    }),
  })
  required<HTMLButtonElement>('#gallery-toggle').disabled = false
  required('#build-status').textContent = 'Showcase ready.'
  performance.mark('showcase-interactive')
})
if (document.readyState === 'complete') ready()
else window.addEventListener('load', ready, { once: true })
