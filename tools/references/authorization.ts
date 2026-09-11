import { readFile, statfs } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import {
  APPROVAL_REVISION, AUDIT_SHA256, AUTHORIZATION_SHA256, BLUEPRINT_REVISION, BLUEPRINT_SHA256,
  EVIDENCE_SHA256, INVENTORY_SHA256, SOURCE_REVISION, canonicalJson, digest, requireReference,
} from './contracts.ts'
import type { ReferenceManifest } from './contracts.ts'
import { readPinnedDocument } from './git.ts'
import { assertNoSymlink } from './store.ts'

interface LaunchAuthorization {
  schema: number
  status: string
  repository: string
  branch: string
  reviewed_blueprint_revision: string
  r3_approval_record: string
  owned_roots: { repository: string, managed_reference_link: string }
  resources: {
    work_deadline_utc: string
    max_additional_bytes: number
    baseline_repository_bytes: number
    reserve_bytes: number
    min_free_bytes: number
  }
  inputs: Record<string, string>
}

// Trust comes from this reviewed launch digest, never from candidate-supplied "approved".
export function verifyAuthorizationBytes(bytes: Uint8Array): LaunchAuthorization {
  requireReference(digest(bytes) === AUTHORIZATION_SHA256, 'AUTHORIZATION_DIGEST', 'authorization', 'not the approved parent authorization bytes')
  // The byte-for-byte trust anchor fixes this shape; arbitrary JSON never reaches this parse.
  const auth: LaunchAuthorization = JSON.parse(Buffer.from(bytes).toString('utf8'))
  requireReference(auth.schema === 1 && auth.status === 'authorized' && auth.repository === 'ridermw/midcreek-cs-3'
    && auth.branch === 'main' && auth.reviewed_blueprint_revision === BLUEPRINT_REVISION
    && auth.r3_approval_record === APPROVAL_REVISION && auth.inputs.concept_revision === SOURCE_REVISION
    && auth.inputs.concept_inventory_155_records === INVENTORY_SHA256,
  'AUTHORIZATION', 'authorization', 'launch identity or pinned inputs mismatch')
  return auth
}

export async function readAuthorization(path: string, repository?: string) {
  requireReference(resolve(path) === path, 'PATH', path, 'explicit absolute authorization path required')
  await assertNoSymlink(path)
  const auth = verifyAuthorizationBytes(await readFile(path))
  const root = auth.owned_roots.repository
  requireReference(!repository || repository === root, 'AUTHORIZATION_ROOT', repository ?? root, 'repository differs from parent grant')
  requireReference(path === join(root, '.artifacts/implementation/20260910T232859Z/authorization.json'),
    'AUTHORIZATION_ROOT', path, 'authorization must be read at its reviewed private location')
  requireReference(auth.owned_roots.managed_reference_link === 'references/midcreek', 'AUTHORIZATION_ROOT', root, 'managed-link grant differs')
  await assertNoSymlink(root)
  return auth
}

export async function approvedDocuments(repository: string, auth: LaunchAuthorization): Promise<{ audit: string, evidence: string }> {
  const result = { audit: '', evidence: '' }
  for (const [path, expected, key] of [
    ['docs/architecture/cs3-blueprint.md', BLUEPRINT_SHA256, 'blueprint'],
    ['docs/research/cel-shift-source-audit.md', AUDIT_SHA256, 'audit'],
    ['docs/research/evidence-index.md', EVIDENCE_SHA256, 'evidence'],
  ] as const) {
    const text = await readPinnedDocument(repository, APPROVAL_REVISION, path)
    requireReference(digest(text) === expected && auth.inputs[path] === expected, 'INPUT_HASH', path, 'approved pinned document bytes differ')
    if (key !== 'blueprint') result[key] = text
  }
  return result
}

export function verifyCandidate(candidate: ReferenceManifest, expected: ReferenceManifest): void {
  requireReference(canonicalJson(candidate) === canonicalJson(expected), 'CANDIDATE_MISMATCH', 'manifest',
    'candidate differs from the deterministic audit/pinned-blob/parent-policy derivation')
}

export async function checkRunBudget(auth: LaunchAuthorization, additionalBytes: number): Promise<void> {
  requireReference(Date.now() < Date.parse(auth.resources.work_deadline_utc), 'AUTHORIZATION_EXPIRED', 'authorization', 'work deadline elapsed; resumption does not renew it')
  requireReference(Number.isSafeInteger(additionalBytes) && additionalBytes >= 0
    && additionalBytes + auth.resources.reserve_bytes < auth.resources.max_additional_bytes,
  'DISK_BUDGET', 'package', 'candidate exceeds additional-disk grant and reserve')
  const available = await statfs(auth.owned_roots.repository)
  requireReference(available.bavail * available.bsize - additionalBytes >= auth.resources.min_free_bytes,
    'DISK_FLOOR', 'package', 'minimum free-space floor would be crossed')
  const { stdout } = await promisify(execFile)('du', ['-sk', auth.owned_roots.repository], {
    maxBuffer: 4096, env: { ...process.env, LC_ALL: 'C' },
  })
  const usedKiB = Number(/^([0-9]+)\s/.exec(stdout)?.[1])
  requireReference(Number.isSafeInteger(usedKiB), 'DISK_USAGE', 'repository', 'cannot establish current disk usage')
  const alreadyAdded = Math.max(0, usedKiB * 1024 - auth.resources.baseline_repository_bytes)
  requireReference(alreadyAdded + additionalBytes + auth.resources.reserve_bytes <= auth.resources.max_additional_bytes,
    'DISK_BUDGET', 'repository', 'run-wide additional disk grant including reserve would be exceeded')
}
