import { basename, dirname, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  APPROVAL_REVISION, ATTRIBUTION, AUDIT_SHA256, AUTHORIZATION_SHA256, BLUEPRINT_REVISION,
  BLUEPRINT_SHA256, EVIDENCE_SHA256, INVENTORY_SHA256, SHARED_PATHS, SOURCE_REPOSITORY,
  GALLERY_POLICY_FIELDS, PUBLIC_FIELDS, REFERENCE_POLICY_FIELDS,
  SOURCE_REVISION, TERMS, canonicalJson, compare, digest, inventoryDigest, packageDigest,
  referenceInventory, requireReference, safeRelative, sanitizedSidecar, unique,
  validateManifest, validatePngHeader, validateProfile, validatePrompt,
} from './contracts.ts'
import type { Approval, ArtworkRecord, FileIdentity, ReferenceManifest, SupportRecord } from './contracts.ts'
import { approvedDocuments, checkRunBudget, readAuthorization } from './authorization.ts'
import { eachSerial, inspectBlob, openPinnedSource, verifyIgnoredOutputs } from './git.ts'
import { cliArguments, reportCliError } from './cli.ts'
import { ensureDirectory, writeFlushed } from './store.ts'

export function parseAudit(text: string): FileIdentity[] {
  const rows = [...text.matchAll(/^\| `([^`]+\.png)` \| ([0-9]+) \| `([a-f0-9]{64})` \|[ \t]*$/gm)].map((row) => ({
    path: `themes/cel-shift/masters/${safeRelative(row[1]!)}`, bytes: Number(row[2]), sha256: row[3]!,
  }))
  unique(rows.map((row) => row.path), 'DUPLICATE_PATH')
  unique(rows.map((row) => row.sha256), 'DUPLICATE_HASH')
  return rows.sort((a, b) => compare(a.path, b.path))
}

// The pinned theme uses this deliberately small plates subset; this is not a general YAML parser.
export function parseTheme(text: string): string[] {
  const lines = text.split(/\r?\n/)
  const start = lines.indexOf('plates:')
  requireReference(start >= 0, 'THEME', 'themes/cel-shift/theme.yaml', 'plates mapping absent')
  const paths: string[] = []
  let family = ''
  for (const line of lines.slice(start + 1)) {
    if (!line.trim()) continue
    const group = /^  ([a-z0-9-]+):$/.exec(line)
    if (group) { family = group[1]!; continue }
    const image = /^  - ([a-z0-9-]+\.png)$/.exec(line)
    requireReference(image && family, 'THEME', 'themes/cel-shift/theme.yaml', 'unsupported plates structure or unsafe image path')
    paths.push(`themes/cel-shift/masters/${family}/${image[1]}`)
  }
  unique(paths, 'DUPLICATE_PATH')
  return paths.sort(compare)
}

export function promptForMaster(relative: string): string {
  safeRelative(relative)
  const [family, file, extra] = relative.split('/')
  requireReference(family && file && !extra && /^\d+-[a-z0-9-]+\.png$/.test(file), 'CURRENT_PROMPT', relative, 'expected audited family/numbered-master name')
  const stem = file.replace(/^\d+-/, '').replace(/\.png$/, '')
  let prompt: string
  switch (family) {
    case 'key-art':
      requireReference(['hall-fault', 'archer', 'diamond-bright'].includes(stem), 'CURRENT_PROMPT', relative, 'unknown key-art association')
      prompt = stem === 'hall-fault' ? 'key-art' : stem === 'archer' ? 'key-art-archer' : 'key-art-diamond'
      break
    case 'animation': prompt = 'animation-sheet'; break
    case 'calibration': prompt = `calibration-${stem.replace(/^elev-/, '')}`; break
    case 'character-both': prompt = 'technician-pair'; break
    case 'character-man': prompt = `technician-man-${stem}`; break
    case 'character-woman': prompt = `technician-woman-${stem}`; break
    case 'interface': prompt = stem; break
    case 'heading': prompt = stem; break
    case 'state': prompt = 'state-matrix'; break
    default: prompt = `${family}-${stem}`
  }
  return `themes/cel-shift/prompts/${prompt}.mock.md`
}

function exactPaths(actual: string[], expected: string[], scope: string) {
  unique(actual, 'DUPLICATE_PATH')
  const expectedSet = new Set(expected)
  const actualSet = new Set(actual)
  for (const path of expected) requireReference(actualSet.has(path), 'MISSING_FILE', path, `required ${scope} member absent from pinned source`)
  for (const path of actual) requireReference(expectedSet.has(path), 'EXTRA_FILE', path, `unexpected ${scope} member`)
}

function validateOriginalSidecar(text: string, path: string): void {
  let value: unknown
  try { value = JSON.parse(text) } catch { requireReference(false, 'SIDECAR', path, 'invalid original sidecar JSON') }
  requireReference(typeof value === 'object' && value !== null && !Array.isArray(value), 'SIDECAR', path, 'original metadata must be an object')
  const prompt = Reflect.get(value, 'prompt')
  requireReference(typeof prompt === 'string' && prompt.length > 0
    && Reflect.get(value, 'size') === '1536x1024'
    && typeof Reflect.get(value, 'rendered_at') === 'string', 'SIDECAR', path, 'historical expanded prompt, original size and timestamp fields required')
}

export interface PrepareOptions {
  repository: string
  sourceRepository: string
  sourceRevision: string
  authorization: string
}

export async function prepareCandidate(options: PrepareOptions): Promise<ReferenceManifest> {
  const auth = await readAuthorization(options.authorization, options.repository)
  requireReference(options.sourceRevision === SOURCE_REVISION, 'SOURCE_REVISION', options.sourceRevision, 'only the approved complete E6 commit is authorized')
  requireReference(options.sourceRepository === resolve(options.repository, '../midcreek-concept'),
    'SOURCE_IDENTITY', options.sourceRepository, 'source location differs from the reviewed E6 sibling identity')
  await checkRunBudget(auth, 0)
  const { audit, evidence } = await approvedDocuments(options.repository, auth)
  requireReference(evidence.includes(SOURCE_REVISION) && evidence.includes(SOURCE_REPOSITORY),
    'INPUT_HASH', 'evidence-index', 'reviewed source identity is absent')
  const audited = parseAudit(audit)
  requireReference(audited.length === 49 && audited.reduce((sum, file) => sum + file.bytes, 0) === 86349779,
    'AUDIT_INVENTORY', 'source-audit', 'expected dated 49-master inventory and total bytes')
  const source = await openPinnedSource(options.sourceRepository, options.sourceRevision)
  const treePaths = [...source.entries.keys()]
  const masterPaths = audited.map((file) => file.path)
  exactPaths(treePaths.filter((path) => path.startsWith('themes/cel-shift/masters/') && !/-720p\.png(?:\.metadata\.json)?$/.test(path)),
    masterPaths.flatMap((path) => [path, `${path}.metadata.json`]), 'original master/sidecar')
  const promptPaths = treePaths.filter((path) => path.startsWith('themes/cel-shift/prompts/')).sort(compare)
  requireReference(promptPaths.length === 47 && promptPaths.every((path) => /^themes\/cel-shift\/prompts\/[a-z0-9-]+\.mock\.md$/.test(path)),
    'SUPPORT_COUNT', 'prompts', '47 unchanged current prompt files required')
  exactPaths(treePaths.filter((path) => path.startsWith('themes/_shared/')), SHARED_PATHS, 'shared')
  const supportPaths = [...SHARED_PATHS, 'ART-BIBLE.md', 'docs/decisions/projection.md', 'themes/cel-shift/theme.yaml', ...promptPaths].sort(compare)
  const support: SupportRecord[] = []
  const contents = new Map<string, string>()
  await eachSerial(supportPaths, async (path) => {
    const blob = await inspectBlob(source, path, { collect: true })
    requireReference(blob.text !== undefined, 'SOURCE_TEXT', path, 'text read did not complete')
    contents.set(path, blob.text)
    const kind: SupportRecord['kind'] = path.startsWith('themes/_shared/') ? 'shared'
      : path.startsWith('themes/cel-shift/prompts/') ? 'prompt'
        : path === 'ART-BIBLE.md' ? 'art-bible' : path.endsWith('projection.md') ? 'projection' : 'theme'
    support.push({
      id: path, kind, sourceRepository: SOURCE_REPOSITORY, sourceRevision: SOURCE_REVISION,
      sourcePath: path, destination: path, bytes: blob.bytes, sha256: blob.sha256, dependencies: [],
    })
  })
  validateProfile(contents)
  exactPaths(parseTheme(contents.get('themes/cel-shift/theme.yaml')!), masterPaths, 'theme plates')
  const supportSet = new Set(supportPaths)
  for (const file of support.filter((file) => file.kind === 'prompt')) {
    file.dependencies = [validatePrompt(file.sourcePath, contents.get(file.sourcePath)!, supportSet)]
  }
  const artworks: ArtworkRecord[] = []
  await eachSerial(audited, async (file) => {
    // Sequential streams retain only the 33-byte PNG header, never a catalog-wide decode.
    const blob = await inspectBlob(source, file.path)
    requireReference(blob.bytes === file.bytes, 'BYTES', file.path, 'master byte count differs from dated audit')
    requireReference(blob.sha256 === file.sha256, 'HASH', file.path, 'master SHA-256 differs from dated audit')
    validatePngHeader(blob.header, file.path, 1536, 1024)
    const sidecar = await inspectBlob(source, `${file.path}.metadata.json`, { collect: true })
    validateOriginalSidecar(sidecar.text!, sidecar.path)
    const relative = file.path.slice('themes/cel-shift/masters/'.length)
    const currentPrompt = promptForMaster(relative)
    const prompt = support.find((input) => input.sourcePath === currentPrompt && input.kind === 'prompt')
    requireReference(prompt, 'CURRENT_PROMPT', file.path, `missing current input ${currentPrompt}`)
    const approval: Approval = {
      status: 'approved', authority: 'launch-policy-derived', scope: 'local-reference',
      authorizationSha256: AUTHORIZATION_SHA256, sourceSha256: file.sha256, inventorySha256: INVENTORY_SHA256,
      policyFields: [...REFERENCE_POLICY_FIELDS], publicFields: [],
    }
    const restoration = relative === 'animation/01-model-sheet-man.png'
      ? ' The audit identifies restoration from f173f7fea3fe357a37de57fed520115547ed9f9b in b6b1c6af408378039a64998b20383f5407cea1af; this does not establish a unique producing prompt.'
      : ''
    artworks.push({
      id: `cel-shift/${relative.slice(0, -4)}`, family: relative.split('/')[0]!,
      title: relative.slice(0, -4).replace('/', ' / ').replaceAll('-', ' '), role: 'master',
      sourceRepository: SOURCE_REPOSITORY, sourceRevision: SOURCE_REVISION, sourcePath: file.path, destination: file.path,
      bytes: file.bytes, sha256: file.sha256, width: 1536, height: 1024,
      sidecar: {
        originalPath: sidecar.path, originalBytes: sidecar.bytes, originalSha256: sidecar.sha256,
        sanitizedPath: `${file.path}.provenance.json`, sanitizedSha256: '', transformation: 'cs3-provenance-allowlist-v1',
      },
      currentPrompts: [currentPrompt], dependencyPaths: [...prompt.dependencies],
      history: {
        confidence: 'unresolved', exactProducingPrompt: null,
        note: 'Current prompt is a maintained input association, not proof of the exact historical producing prompt. Historical expanded metadata is separately hash-bound; older scale/camera settings do not replace the accepted current specification.' + restoration,
        evidence: [{ path: 'docs/research/cel-shift-source-audit.md', sha256: AUDIT_SHA256, section: 'Historical provenance is not a current visual specification' }],
      },
      attribution: ATTRIBUTION, terms: TERMS, referenceApproval: approval,
      galleryApproval: { ...approval, scope: 'gallery-release-staging', policyFields: [...GALLERY_POLICY_FIELDS], publicFields: [...PUBLIC_FIELDS] },
    })
  })
  const manifest: ReferenceManifest = {
    schemaVersion: 1, packageRevision: 'cs3-reference-v1', packageDigest: '',
    repositoryRoot: options.repository, store: join(options.repository, '.artifacts/references'),
    activeLink: join(options.repository, auth.owned_roots.managed_reference_link),
    sources: [{ id: 'E6', repository: SOURCE_REPOSITORY, revision: SOURCE_REVISION, localPath: options.sourceRepository }],
    authority: {
      authorizationSha256: AUTHORIZATION_SHA256, blueprintRevision: BLUEPRINT_REVISION, approvalRevision: APPROVAL_REVISION,
      inputs: { audit: AUDIT_SHA256, blueprint: BLUEPRINT_SHA256, evidence: EVIDENCE_SHA256 },
    },
    inventorySha256: inventoryDigest(referenceInventory({ support, artworks })), support, artworks,
  }
  requireReference(manifest.inventorySha256 === INVENTORY_SHA256, 'INVENTORY_DIGEST', 'source', 'complete 155-record pin differs from parent approval')
  for (const art of artworks) art.sidecar.sanitizedSha256 = digest(sanitizedSidecar(art))
  manifest.packageDigest = packageDigest(manifest)
  validateManifest(manifest)
  return manifest
}

async function main() {
  const args = cliArguments(['repository', 'source-repository', 'source-revision', 'authorization', 'output'])
  const manifest = await prepareCandidate({
    repository: args.repository!, sourceRepository: args['source-repository']!,
    sourceRevision: args['source-revision']!, authorization: args.authorization!,
  })
  const output = args.output!
  requireReference(resolve(output) === output && dirname(output) === join(manifest.store, 'candidates')
    && /^[a-zA-Z0-9][a-zA-Z0-9._-]*\.json$/.test(basename(output)),
    'OUTPUT_PATH', output, 'candidate output must be an explicit JSON path in the ignored store/candidates directory')
  await verifyIgnoredOutputs(manifest.repositoryRoot, [relative(manifest.repositoryRoot, output)])
  await ensureDirectory(dirname(output))
  await writeFlushed(output, canonicalJson(manifest) + '\n')
  console.log(canonicalJson({ status: 'candidate-prepared-not-imported', packageDigest: manifest.packageDigest, manifest: output }))
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(reportCliError)
}
