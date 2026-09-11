import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { canonicalJson, createManifestFromExport, validateAssetLibrary } from '../tools/promote-assets.ts'
import { digest } from '../tools/assets/contracts.ts'
import { finalizeExportReceipt } from '../tools/export-receipt.ts'

test('canonical Python hashes agree with Node for float32 keys, matrices and numeric boundaries', () => {
  const text = execFileSync('python3', ['-B', '-c', `
import math, random, struct, sys
sys.path.insert(0, "blender")
from export_receipt import canonical_json
rng = random.Random(417)
values = [0.0, -0.0, 1.0, 1e-7, 1e-6, 1e20, 1e21, 1e23]
for _ in range(1000):
    value = struct.unpack("<f", rng.randbytes(4))[0]
    if math.isfinite(value):
        values.append(value)
values.extend(i / 60 for i in range(121))
print(canonical_json({
  "values": values,
  "numericKeys": {"10": "ten", "2": "two", "name": "value"},
  "mixedRecords": [{"time": 2, "node": "b"}, {"node": "a"}, {"time": 1, "node": "c"}],
}), end="")
`], { encoding: 'utf8' })
  assert.equal(text, canonicalJson(JSON.parse(text)))
})

test('Python exporter mapping feeds the unchanged strict packaging API under Node strip-types', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'cs3-exporter-mapping-')))
  try {
    const output = join(root, 'export')
    const candidateRoot = join(output, 'candidate')
    execFileSync('python3', ['-B', 'tests/blender/export_fixture.py', output])
    const text = await readFile(join(output, 'export.json'), 'utf8')
    const receipt = JSON.parse(text)
    assert.equal(text, canonicalJson(receipt) + '\n', 'cross-language canonical receipt bytes')
    const manifest = createManifestFromExport(receipt)
    const profile = JSON.parse(await readFile('blender/render_profile.json', 'utf8'))
    assert.equal(receipt.profileSha256, digest(canonicalJson({
      profile: profile.profile, color: profile.color, normalRendering: profile.normalRendering,
    })))
    const expected = {
      sourceCommit: receipt.source.commit, sourceSha256: receipt.source.sha256,
      specificationSha256: receipt.specificationSha256, exporterSha256: receipt.exporter.sha256,
      profile: receipt.profile, profileSha256: receipt.profileSha256, recipeSha256: receipt.recipeSha256,
      exportReceiptSha256: manifest.exportReceiptSha256,
    }
    assert.equal((await validateAssetLibrary({ candidateRoot, manifest, expected })).libraryDigest, manifest.libraryDigest)
    assert.equal(manifest.appearanceAccepted, false)
    assert.equal(manifest.assets.length, 5)
    const technical = receipt.inputs.find((input: { path: string }) => input.path === 'technical.json')
    const bytes = await readFile(join(output, technical.path))
    assert.equal(technical.sha256, digest(bytes))
    assert.equal(technical.bytes, bytes.length)
    assert.equal(JSON.stringify(receipt).includes('triangleUvs'), false)
    const changed = structuredClone(receipt)
    changed.inputs.find((input: { path: string }) => input.path === 'technical.json').sha256 = digest('changed')
    assert.notEqual(createManifestFromExport(changed).libraryDigest, manifest.libraryDigest)
    // Import through a runtime URL: the legacy probe deliberately remains JavaScript.
    const probe = await import(new URL('../probes/r2/library-receipt.mjs', import.meta.url).href)
    const loaded = await probe.loadLibraryEvidence(receipt, output)
    assert.equal(loaded.assetRoot, candidateRoot)
    assert.ok(loaded.receipt.assets[0].geometry.triangleUvs)
    const glb = await import(new URL('../probes/r2/glb.mjs', import.meta.url).href)
    for (const asset of loaded.receipt.assets) {
      const decoded = glb.decode(await readFile(join(candidateRoot, asset.file)))
      glb.assertContent(decoded.document, asset, decoded.binary)
    }
    const legacy = await probe.loadLibraryEvidence(loaded.receipt, output)
    assert.equal(legacy.receipt, loaded.receipt)
    assert.equal(legacy.assetRoot, output)
    const contradictory = structuredClone(receipt)
    contradictory.assets[0].materials[0].roughness = 0.125
    contradictory.specification.assets[0].materials[0].roughness = 0.125
    contradictory.specificationSha256 = digest(canonicalJson(contradictory.specification))
    await assert.rejects(probe.loadLibraryEvidence(contradictory, output), /TECHNICAL_SPECIFICATION/)
    await writeFile(join(output, 'technical.json'), 'tampered')
    await assert.rejects(probe.loadLibraryEvidence(receipt, output), /TECHNICAL_(BYTES|HASH)/)
    await assert.rejects(finalizeExportReceipt(output, text), /TECHNICAL_IDENTITY/)
    await writeFile(join(output, 'technical.json'), bytes)
    await rm(join(output, 'export.json'))
    const assetFile = join(candidateRoot, manifest.exportReceipt.assets[0]!.file)
    const assetBytes = await readFile(assetFile)
    await rm(assetFile)
    await assert.rejects(finalizeExportReceipt(output, text), /MISSING_FILE/)
    await assert.rejects(readFile(join(output, 'export.json')), { code: 'ENOENT' })
    await assert.rejects(readFile(join(output, 'manifest.json')), { code: 'ENOENT' })
    await writeFile(assetFile, Buffer.alloc(assetBytes.length))
    await assert.rejects(finalizeExportReceipt(output, text), /CANDIDATE_HASH/)
    await assert.rejects(readFile(join(output, 'export.json')), { code: 'ENOENT' })
    await writeFile(assetFile, assetBytes)
    await finalizeExportReceipt(output, text)
    assert.equal(await readFile(join(output, 'export.json'), 'utf8'), text)
    assert.equal(JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8')).libraryDigest, manifest.libraryDigest)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
