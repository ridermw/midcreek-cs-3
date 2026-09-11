import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  canonicalJson, digest, packageFiles, parseManifest, requireReference, validateManifest,
} from './contracts.ts'
import type { ReferenceManifest } from './contracts.ts'
import { assertNoSymlink, verifyFileSet } from './store.ts'
import { cliArguments, reportCliError } from './cli.ts'

function escapeHtml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}
export function buildIndex(manifest: ReferenceManifest): string {
  validateManifest(manifest)
  const items = manifest.artworks.map((art) => {
    const url = `../../packages/${manifest.packageDigest}/midcreek/${art.destination.split('/').map(encodeURIComponent).join('/')}`
    return `<li><a href="${escapeHtml(url)}">${escapeHtml(art.title)}</a> <small>${escapeHtml(art.family)} / ${art.width} x ${art.height} / ${art.bytes} bytes</small></li>`
  }).join('\n')
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>Cel Shift - local reference package</title>
<style>body{font:16px system-ui,sans-serif;line-height:1.6;max-width:72rem;margin:2rem auto;padding:0 1rem}small{color:#555}code{overflow-wrap:anywhere}li{margin:.5rem 0}</style></head>
<body><h1>Cel Shift - local references</h1><p>Private/local reference browsing only. This is not a public gallery or a publication approval.</p>
<p>Originals load only when selected. Current prompt associations are not claims of unique historical generation inputs.</p>
<p>Package: <code>${manifest.packageDigest}</code></p>
<p>${escapeHtml(manifest.artworks[0]!.attribution)}<br>${escapeHtml(manifest.artworks[0]!.terms)}</p>
<ol>${items}</ol></body></html>\n`
}

export function indexFiles(manifest: ReferenceManifest) {
  const html = buildIndex(manifest)
  return [{ path: 'index.html', bytes: Buffer.byteLength(html), sha256: digest(html) }]
}

// The importer creates the index in the same transaction. This CLI validates and locates that
// immutable result, never repairs or mutates an already-addressed generation.
async function main() {
  const args = cliArguments(['manifest', 'store'])
  await assertNoSymlink(args.manifest!)
  const manifest = parseManifest(await readFile(args.manifest!, 'utf8'))
  requireReference(args.store === manifest.store, 'STORE_IDENTITY', args.store!, 'explicit store must match reviewed manifest')
  const packageRoot = join(manifest.store, 'packages', manifest.packageDigest, 'midcreek')
  requireReference(resolve(args.manifest!) === join(packageRoot, 'reference-manifest.json'),
    'INDEX_MANIFEST', args.manifest!, 'index reads the selected immutable package manifest, not an active-link/candidate alias')
  await assertNoSymlink(dirname(packageRoot))
  await verifyFileSet(packageRoot, packageFiles(manifest))
  const indexRoot = join(manifest.store, 'index', manifest.packageDigest)
  await verifyFileSet(indexRoot, indexFiles(manifest))
  console.log(canonicalJson({ status: 'local-index-verified', packageDigest: manifest.packageDigest, index: join(indexRoot, 'index.html') }))
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(reportCliError)
}
