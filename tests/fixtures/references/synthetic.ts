import {
  ATTRIBUTION, AUDIT_SHA256, AUTHORIZATION_SHA256, BLUEPRINT_REVISION, BLUEPRINT_SHA256,
  EVIDENCE_SHA256, APPROVAL_REVISION, SOURCE_REPOSITORY, SOURCE_REVISION, TERMS,
  GALLERY_POLICY_FIELDS, PUBLIC_FIELDS, REFERENCE_POLICY_FIELDS,
  digest, inventoryDigest, packageDigest, referenceInventory, sanitizedSidecar,
} from '../../../tools/references/contracts.ts'
import type { ArtworkRecord, ReferenceManifest, SupportRecord } from '../../../tools/references/contracts.ts'

// No artwork or source prose: these fixtures exercise shape and policy plumbing, not real approval.
export function sourceProfile(): Map<string, string> {
  return new Map([
    ['ART-BIBLE.md', '35 degrees orthographic rotated isometric diamond'],
    ['docs/decisions/projection.md', 'Status: ACCEPTED. rotated isometric (diamond)'],
    ['themes/_shared/foundation.md', '35 degrees down from horizontal. Orthographic diamond. 2.10 m rack, 1.73 m man, 1.58 m woman.'],
    ['themes/_shared/character-sheet.md', '2.10 m rack, 1.73 m man, 1.58 m woman.'],
    ['themes/_shared/foundation.json', JSON.stringify({
      camera: { elevation_degrees: 35, azimuth_degrees: 45, projection: 'orthographic', orbit_steps: 4, orbit_step_degrees: 90 },
      geometry: { rack_height_m: 2.1, technician_man_height_m: 1.73, technician_woman_height_m: 1.58 },
    })],
  ])
}

export function syntheticManifest(): ReferenceManifest {
  const support: SupportRecord[] = []
  const add = (sourcePath: string, kind: SupportRecord['kind'], dependencies: string[] = []) => {
    support.push({
      id: sourcePath, kind, sourceRepository: SOURCE_REPOSITORY, sourceRevision: SOURCE_REVISION,
      sourcePath, destination: sourcePath, bytes: sourcePath.length, sha256: digest(sourcePath), dependencies,
    })
  }
  for (const name of ['foundation.md', 'foundation.json', 'character-sheet.md', 'floor-sheet.md', 'interface-sheet.md', 'rack-sheet.md', 'turnaround.md']) {
    add(`themes/_shared/${name}`, 'shared')
  }
  add('ART-BIBLE.md', 'art-bible')
  add('docs/decisions/projection.md', 'projection')
  add('themes/cel-shift/theme.yaml', 'theme')
  for (let i = 0; i < 47; i++) {
    add(`themes/cel-shift/prompts/synthetic-${String(i).padStart(2, '0')}.mock.md`, 'prompt', ['themes/_shared/foundation.md'])
  }
  const artworks: ArtworkRecord[] = []
  for (let i = 0; i < 49; i++) {
    const stem = `${String(i).padStart(2, '0')}-synthetic`
    const sourcePath = `themes/cel-shift/masters/synthetic/${stem}.png`
    const sha256 = digest(`synthetic-master-${i}`)
    const approval = {
      status: 'approved' as const, authority: 'launch-policy-derived' as const, scope: 'local-reference' as const,
      authorizationSha256: AUTHORIZATION_SHA256, sourceSha256: sha256, inventorySha256: '0'.repeat(64),
      policyFields: [...REFERENCE_POLICY_FIELDS], publicFields: [],
    }
    artworks.push({
      id: `cel-shift/synthetic/${stem}`, family: 'synthetic', title: `Synthetic ${i}`, role: 'master',
      sourceRepository: SOURCE_REPOSITORY, sourceRevision: SOURCE_REVISION, sourcePath, destination: sourcePath,
      bytes: 33, sha256, width: 1536, height: 1024,
      sidecar: {
        originalPath: `${sourcePath}.metadata.json`, originalBytes: 2 + i, originalSha256: digest(`synthetic-sidecar-${i}`),
        sanitizedPath: `${sourcePath}.provenance.json`, sanitizedSha256: '0'.repeat(64), transformation: 'cs3-provenance-allowlist-v1',
      },
      currentPrompts: [`themes/cel-shift/prompts/synthetic-${String(i % 47).padStart(2, '0')}.mock.md`],
      dependencyPaths: ['themes/_shared/foundation.md'],
      history: {
        confidence: 'unresolved', exactProducingPrompt: null,
        note: 'Current prompt is a maintained input association, not proof of the exact historical producing prompt.',
        evidence: [{ path: 'docs/research/cel-shift-source-audit.md', sha256: AUDIT_SHA256, section: 'Historical provenance is not a current visual specification' }],
      },
      attribution: ATTRIBUTION, terms: TERMS,
      referenceApproval: approval,
      galleryApproval: { ...approval, scope: 'gallery-release-staging', policyFields: [...GALLERY_POLICY_FIELDS], publicFields: [...PUBLIC_FIELDS] },
    })
  }
  const manifest: ReferenceManifest = {
    schemaVersion: 1, packageRevision: 'cs3-reference-v1', packageDigest: '0'.repeat(64),
    repositoryRoot: '/synthetic/cs3', store: '/synthetic/cs3/.artifacts/references', activeLink: '/synthetic/cs3/references/midcreek',
    sources: [{ id: 'E6', repository: SOURCE_REPOSITORY, revision: SOURCE_REVISION, localPath: '/synthetic/midcreek-concept' }],
    authority: {
      authorizationSha256: AUTHORIZATION_SHA256, blueprintRevision: BLUEPRINT_REVISION, approvalRevision: APPROVAL_REVISION,
      inputs: { audit: AUDIT_SHA256, blueprint: BLUEPRINT_SHA256, evidence: EVIDENCE_SHA256 },
    },
    inventorySha256: '0'.repeat(64), support, artworks,
  }
  manifest.inventorySha256 = inventoryDigest(referenceInventory(manifest))
  for (const art of artworks) {
    art.referenceApproval.inventorySha256 = manifest.inventorySha256
    art.galleryApproval.inventorySha256 = manifest.inventorySha256
    art.sidecar.sanitizedSha256 = digest(sanitizedSidecar(art))
  }
  manifest.packageDigest = packageDigest(manifest)
  return manifest
}
