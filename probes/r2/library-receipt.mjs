import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createManifestFromExport } from '../../tools/promote-assets.ts';

export async function loadLibraryEvidence(receipt, run) {
  if (!Object.hasOwn(receipt, 'source')) return { receipt, assetRoot: run };
  const strict = createManifestFromExport(receipt).exportReceipt;
  const binding = strict.inputs.find(input => input.path === 'technical.json' && input.role === 'script');
  assert.ok(binding, 'TECHNICAL_INPUT');
  const file = path.join(run, binding.path);
  assert.ok((await fs.lstat(file)).isFile(), 'TECHNICAL_PATH');
  const bytes = await fs.readFile(file);
  assert.equal(bytes.length, binding.bytes, 'TECHNICAL_BYTES');
  assert.equal(createHash('sha256').update(bytes).digest('hex'), binding.sha256, 'TECHNICAL_HASH');
  const technical = JSON.parse(bytes);
  assert.ok(technical.complete, 'TECHNICAL_COMPLETE');
  assert.equal(technical.kind, 'cs3-library-export', 'TECHNICAL_KIND');
  assert.equal(technical.sourceSha256, strict.source.sha256, 'TECHNICAL_SOURCE');
  assert.equal(technical.blender, strict.tools.blender, 'TECHNICAL_BLENDER');
  assert.equal(technical.blenderBuild, strict.tools.blenderBuild, 'TECHNICAL_BUILD');
  assert.equal(technical.profile, strict.profile, 'TECHNICAL_PROFILE');
  assert.equal(technical.strictSpecificationSha256, strict.specificationSha256, 'TECHNICAL_SPECIFICATION');
  const authoring = strict.inputs.find(input => input.path === 'source/authoring.json' && input.role === 'script');
  assert.equal(technical.authoringReceiptSha256, authoring?.sha256, 'TECHNICAL_AUTHORING');
  assert.equal(technical.assets.length, strict.assets.length, 'TECHNICAL_ASSETS');
  assert.equal(new Set(technical.assets.map(asset => asset.id)).size, strict.assets.length, 'TECHNICAL_ASSETS');
  for (const asset of strict.assets) {
    const evidence = technical.assets.find(candidate => candidate.id === asset.id);
    assert.ok(evidence, 'TECHNICAL_ASSET');
    for (const key of ['id', 'file', 'sha256', 'bytes', 'root', 'restBounds', 'animatedBounds']) {
      assert.deepEqual(evidence[key], asset[key], `TECHNICAL_ASSET_${key}`);
    }
    assert.deepEqual(evidence.nodes.map(node => node.id).sort(), asset.nodes.map(node => node.id).sort(),
      'TECHNICAL_NODES');
    for (const field of ['vertices', 'vertexUvs', 'triangleUvs']) {
      assert.ok(evidence.geometry[field] && Object.keys(evidence.geometry[field]).length, `TECHNICAL_${field}`);
    }
  }
  return { receipt: technical, assetRoot: path.join(run, 'candidate') };
}
