import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { canonicalJson, createManifestFromExport, validateAssetLibrary } from './promote-assets.ts'
import { digest, requireAsset } from './assets/contracts.ts'

export async function finalizeExportReceipt(output: string, input: string): Promise<void> {
  const manifest = createManifestFromExport(input)
  const receipt = manifest.exportReceipt
  requireAsset(receipt.tools.node === process.versions.node, 'TOOL_IDENTITY', 'node', 'actual finalizer runtime required')
  const technical = receipt.inputs.find((item) => item.path === 'technical.json' && item.role === 'script')
  requireAsset(technical, 'TECHNICAL_INPUT', 'technical.json', 'hash-bound technical evidence required')
  const bytes = await readFile(join(output, technical.path))
  requireAsset(bytes.length === technical.bytes && digest(bytes) === technical.sha256,
    'TECHNICAL_IDENTITY', technical.path, 'technical receipt bytes changed')
  await validateAssetLibrary({
    candidateRoot: join(output, 'candidate'), manifest,
    expected: {
      sourceCommit: receipt.source.commit, sourceSha256: receipt.source.sha256,
      specificationSha256: receipt.specificationSha256, exporterSha256: receipt.exporter.sha256,
      profile: receipt.profile, profileSha256: receipt.profileSha256, recipeSha256: receipt.recipeSha256,
      exportReceiptSha256: manifest.exportReceiptSha256,
    },
  })
  // Export receipt is the completion marker. A failed write never produces a complete marker.
  await writeFile(join(output, 'manifest.json'), canonicalJson(manifest) + '\n', { flag: 'wx' })
  await writeFile(join(output, 'export.json'), canonicalJson(receipt) + '\n', { flag: 'wx' })
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  requireAsset(process.argv.length === 3, 'ARGUMENTS', 'export-receipt', 'one owned export directory required')
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk))
  await finalizeExportReceipt(resolve(process.argv[2]!), Buffer.concat(chunks).toString('utf8'))
}
