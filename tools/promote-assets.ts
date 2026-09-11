import { KeyObject, verify } from 'node:crypto'
import {
  array, boolean, candidateFiles, canonicalJson, choice, digest, object, parseJson, requireAsset,
  sha256, text, unique, validatePackagedManifest,
} from './assets/contracts.ts'
import type { PackagedManifest } from './assets/contracts.ts'
import { publishGeneration, verifyFileSet } from './assets/store.ts'
import type { PhaseObserver, PublicationResult } from './assets/store.ts'
export {
  AssetPackagingError, canonicalJson, createManifestFromExport, parseExportReceipt,
} from './assets/contracts.ts'
export type { AssetSpecification, ExportReceipt, PackagedManifest } from './assets/contracts.ts'
export type { TransactionPhase, TransactionPaths, PublicationResult } from './assets/store.ts'

export interface ApprovalBinding {
  manifestSha256: string
  libraryDigest: string
  sourceCommit: string
  sourceSha256: string
  profile: string
  profileSha256: string
  recipeSha256: string
}
export interface QualifiedApproval {
  kind: 'cs3-qualified-approval'
  id: string
  issuedAt: string
  authority: string
  parentAuthorizationSha256: string
  binding: ApprovalBinding
  appearanceAccepted: boolean
  policyApproved: boolean
  appearanceEvidenceSha256: string
  publicationPolicySha256: string
}
export interface SignedApproval<T> { record: T; signature: string }
export interface PromotionRequest {
  candidateRoot: string
  destinationRoot: string
  manifest: PackagedManifest
  approval?: SignedApproval<QualifiedApproval> | QualifiedApproval
  trustedPublicKey?: KeyObject
  trustedParentAuthorizationSha256?: string
  onPhase?: PhaseObserver
}

const bindingParser = object({
  manifestSha256: sha256, libraryDigest: sha256, sourceCommit: text, sourceSha256: sha256,
  profile: text, profileSha256: sha256, recipeSha256: sha256,
})
const approvalParser = object({
  kind: choice('cs3-qualified-approval'), id: text, issuedAt: text, authority: text, binding: bindingParser,
  parentAuthorizationSha256: sha256,
  appearanceAccepted: boolean, policyApproved: boolean, appearanceEvidenceSha256: sha256, publicationPolicySha256: sha256,
})

function manifestBinding(manifest: PackagedManifest): ApprovalBinding {
  return {
    manifestSha256: digest(canonicalJson(manifest) + '\n'), libraryDigest: manifest.libraryDigest,
    sourceCommit: manifest.exportReceipt.source.commit, sourceSha256: manifest.exportReceipt.source.sha256,
    profile: manifest.profile, profileSha256: manifest.exportReceipt.profileSha256,
    recipeSha256: manifest.exportReceipt.recipeSha256,
  }
}

function verifySignature(record: unknown, signature: unknown, key: KeyObject): void {
  requireAsset(key instanceof KeyObject && key.type === 'public' && key.asymmetricKeyType === 'ed25519',
    'APPROVAL_SIGNATURE', 'key', 'independently trusted Ed25519 public key required')
  requireAsset(typeof signature === 'string' && /^[A-Za-z0-9+/]{86}==$/.test(signature),
    'APPROVAL_SIGNATURE', 'approval', 'canonical Ed25519 signature required')
  const bytes = Buffer.from(signature, 'base64')
  requireAsset(bytes.toString('base64') === signature && verify(null, Buffer.from(canonicalJson(record)), key, bytes),
    'APPROVAL_SIGNATURE', 'approval', 'signature does not match the caller-trusted key')
}

function verifyDate(value: string): void {
  const date = new Date(value)
  requireAsset(Number.isFinite(date.getTime()) && date.toISOString() === value && date.getTime() <= Date.now(),
    'APPROVAL_DATE', 'issuedAt', 'an actual nonfuture ISO UTC date required')
}

export function verifyQualifiedApproval(
  request: Pick<PromotionRequest, 'approval' | 'trustedPublicKey' | 'trustedParentAuthorizationSha256'>,
  binding: ApprovalBinding,
) {
  requireAsset(request.approval, 'APPEARANCE_POLICY_GATE', 'approval',
    'explicit appearance and publication approval required')
  const approval = parseJson(canonicalJson(request.approval))
  const signed = approval !== null && typeof approval === 'object' && Object.hasOwn(approval, 'record')
    ? object({ record: approvalParser, signature: (value: unknown) => value })(approval, 'approval')
    : null
  const record = signed ? signed.record : approvalParser(approval, 'approval')
  if (signed) {
    requireAsset(request.trustedPublicKey, 'APPROVAL_SIGNATURE', 'key', 'trusted signature key required')
    verifySignature(record, signed.signature, request.trustedPublicKey)
  } else {
    requireAsset(request.trustedParentAuthorizationSha256 === record.parentAuthorizationSha256,
      'AUTHORIZATION_DIGEST', 'approval', 'approval must bind the independently trusted parent authorization')
  }
  verifyDate(record.issuedAt)
  requireAsset(record.appearanceAccepted && record.policyApproved,
    'APPEARANCE_POLICY_GATE', 'approval', 'both appearance acceptance and publication policy approval required')
  requireAsset(canonicalJson(record.binding) === canonicalJson(binding),
    'APPROVAL_BINDING', 'approval', 'approval is for a different manifest/source/profile/recipe/library')
  return { record, approval: signed ?? record }
}

export async function promoteAssetLibrary(request: PromotionRequest): Promise<PublicationResult> {
  const manifest = validatePackagedManifest(request.manifest)
  const { approval } = verifyQualifiedApproval(request, manifestBinding(manifest))
  return publishGeneration({
    candidateRoot: request.candidateRoot, destinationRoot: request.destinationRoot,
    manifest, qualification: 'qualified', approval, onPhase: request.onPhase,
  })
}

export interface ExportIdentity {
  sourceCommit: string
  sourceSha256: string
  specificationSha256: string
  exporterSha256: string
  profile: string
  profileSha256: string
  recipeSha256: string
  exportReceiptSha256: string
}

const developmentUse = choice('local-playable', 'local-showcase', 'local-validation')
export type DevelopmentUse = ReturnType<typeof developmentUse>
export interface ProvisionalAmendment {
  kind: 'cs3-provisional-amendment'
  id: string
  issuedAt: string
  authority: string
  parentAuthorizationSha256: string
  binding: ApprovalBinding
  allowedUses: DevelopmentUse[]
}
export interface ProvisionalSelectionRequest {
  candidateRoot: string
  destinationRoot: string
  manifest: PackagedManifest
  use: DevelopmentUse
  parentAuthorizationSha256: string
  amendment?: SignedApproval<ProvisionalAmendment> | ProvisionalAmendment
  trustedPublicKey?: KeyObject
  trustedParentAuthorizationSha256?: string
  onPhase?: PhaseObserver
}
const amendmentParser = object({
  kind: choice('cs3-provisional-amendment'), id: text, issuedAt: text, authority: text,
  parentAuthorizationSha256: sha256, binding: bindingParser, allowedUses: array(developmentUse),
})

export async function selectProvisionalAssetLibrary(request: ProvisionalSelectionRequest): Promise<PublicationResult> {
  requireAsset(request.amendment, 'PROVISIONAL_GATE', 'amendment',
    'explicit dated development amendment required')
  const manifest = validatePackagedManifest(request.manifest)
  const amendment = parseJson(canonicalJson(request.amendment))
  const signed = amendment !== null && typeof amendment === 'object' && Object.hasOwn(amendment, 'record')
    ? object({ record: amendmentParser, signature: (value: unknown) => value })(amendment, 'amendment')
    : null
  const record = signed ? signed.record : amendmentParser(amendment, 'amendment')
  if (signed) {
    requireAsset(request.trustedPublicKey, 'APPROVAL_SIGNATURE', 'key', 'trusted signature key required')
    verifySignature(record, signed.signature, request.trustedPublicKey)
  } else {
    requireAsset(request.trustedParentAuthorizationSha256 === request.parentAuthorizationSha256,
      'AUTHORIZATION_DIGEST', 'amendment', 'caller must independently pin the parent authorization')
  }
  verifyDate(record.issuedAt)
  unique(record.allowedUses, 'PROVISIONAL_GATE', 'allowedUses')
  requireAsset(record.parentAuthorizationSha256 === request.parentAuthorizationSha256
    && record.allowedUses.includes(request.use),
  'PROVISIONAL_GATE', 'amendment', 'parent authorization or allowed development use mismatch')
  requireAsset(canonicalJson(record.binding) === canonicalJson(manifestBinding(manifest)),
    'APPROVAL_BINDING', 'amendment', 'amendment is for a different manifest/source/profile/recipe/library')
  return publishGeneration({
    candidateRoot: request.candidateRoot, destinationRoot: request.destinationRoot,
    manifest, qualification: 'provisional-development',
    approval: {
      amendment: signed ?? record, selectedUse: request.use, parentAuthorizationSha256: request.parentAuthorizationSha256,
    },
    onPhase: request.onPhase,
  })
}

export async function validateAssetLibrary(request: {
  candidateRoot: string; manifest: PackagedManifest; expected: ExportIdentity
}): Promise<PackagedManifest> {
  const manifest = validatePackagedManifest(request.manifest)
  const receipt = manifest.exportReceipt
  const expected: ExportIdentity = {
    sourceCommit: receipt.source.commit, sourceSha256: receipt.source.sha256,
    specificationSha256: receipt.specificationSha256, exporterSha256: receipt.exporter.sha256,
    profile: receipt.profile, profileSha256: receipt.profileSha256, recipeSha256: receipt.recipeSha256,
    exportReceiptSha256: manifest.exportReceiptSha256,
  }
  requireAsset(canonicalJson(request.expected) === canonicalJson(expected),
    'STALE_EXPORT', 'expected', 'receipt disagrees with independently pinned inputs')
  await verifyFileSet(request.candidateRoot, candidateFiles(manifest))
  return manifest
}
