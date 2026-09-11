import { AssetLoadError, ContractError } from './contracts'
import type { AssetManifest } from './contracts'
import { resolveAssetUrl, sha256 } from './library'
import { validateManifest } from './validate'
import type { ReadyReceipt, RequiredRequest } from '../diagnostics/metrics'

export interface ReleaseManifestBinding {
  readonly manifestSha256: string
  readonly libraryDigest: string
  readonly profile: string
  readonly profileSha256: string
  readonly recipeSha256: string
}

export async function loadReleaseManifest(
  baseUrl: string, binding: ReleaseManifestBinding | null, signal: AbortSignal,
  onSelection?: (identity: ReadyReceipt['identity'], requests: readonly RequiredRequest[]) => void,
): Promise<AssetManifest> {
  if (!binding) throw new AssetLoadError('RELEASE_BLOCKED', 'library', 'no qualified release library is authorized')
  const url = resolveAssetUrl(baseUrl, 'manifest.json')
  const response = await fetch(url, { signal, redirect: 'error', cache: 'no-store' })
  if (!response.ok) throw new AssetLoadError('HTTP', 'manifest', `request returned ${response.status}`)
  const bytes = await response.arrayBuffer()
  if (bytes.byteLength > 8_388_608) throw new AssetLoadError('MANIFEST_SIZE', 'release', 'manifest exceeds limit')
  const hash = await sha256(bytes)
  if (hash !== binding.manifestSha256) throw new AssetLoadError('MANIFEST_HASH', 'release', 'manifest bytes changed')
  let value: unknown
  try { value = JSON.parse(new TextDecoder().decode(bytes)) } catch {
    throw new AssetLoadError('MANIFEST_JSON', 'release', 'valid manifest JSON required')
  }
  const manifest = value as AssetManifest
  try { validateManifest(manifest) } catch (cause) {
    if (cause instanceof ContractError) throw cause
    throw new AssetLoadError('MANIFEST_SCHEMA', 'release', 'malformed manifest structure')
  }
  if (manifest.libraryDigest !== binding.libraryDigest || manifest.profile !== binding.profile
    || manifest.assets.some((entry) => !entry.file.startsWith(`packages/${binding.libraryDigest}/`) || !entry.file.endsWith('.glb'))) {
    throw new AssetLoadError('PACKAGE_BINDING', 'release', 'manifest differs from the build-bound library')
  }
  const assets = manifest.assets.map((entry) => ({ url: resolveAssetUrl(baseUrl, entry.file), sha256: entry.sha256 }))
  onSelection?.({
    selectionSha256: hash, manifestSha256: hash, libraryDigest: manifest.libraryDigest,
    profile: manifest.profile, profileSha256: binding.profileSha256, recipeSha256: binding.recipeSha256, assets,
  }, [
    { url, role: 'manifest', sha256: hash },
    ...assets.map((entry) => ({ ...entry, role: 'asset' as const })),
  ])
  return manifest
}
