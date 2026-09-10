import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import validator from 'gltf-validator';
import { assertContent, decode, encode } from './glb.mjs';

const code = path.dirname(fileURLToPath(import.meta.url));
const run = path.resolve(process.argv[2]);
const tag = process.argv[3] ?? 'checks';
assert.match(tag, /^[a-z0-9-]+$/);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const readJSON = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const result = { complete: false, checks: [], captures: [], versions: { node: process.version } };
let browser;
let server;

async function check(name, action) {
  const detail = await action();
  result.checks.push({ name, pass: true, detail: detail ?? null });
}

function closeEnough(actual, expected, tolerance, name) {
  const observed = actual.flat(Infinity);
  const target = expected.flat(Infinity);
  assert.equal(observed.length, target.length, name);
  const error = Math.max(...observed.map((n, i) => Math.abs(n - target[i])));
  assert.ok(error <= tolerance, `${name}: ${error} > ${tolerance}`);
  return error;
}

async function main() {
  const receipt = await readJSON(path.join(run, 'export.json'));
  assert.ok(receipt.complete, 'EXPORT_INCOMPLETE');
  for (const [name, artifact] of Object.entries(receipt.artifacts)) {
    const bytes = await fs.readFile(path.join(run, name));
    assert.equal(hash(bytes), artifact.sha256, `ARTIFACT_HASH: ${name}`);
    assert.equal(bytes.length, artifact.bytes, `ARTIFACT_SIZE: ${name}`);
  }
  result.source = receipt.source_sha256;
  result.exportScript = receipt.script_sha256;
  result.versions.blender = receipt.blender;
  for (const name of ['three', 'playwright', 'gltf-validator']) {
    result.versions[name] = (await readJSON(path.join(code, 'node_modules', name, 'package.json'))).version;
  }
  for (const file of ['package.json', 'package-lock.json', 'browser.mjs', 'lifecycle.mjs', 'glb.mjs', 'check.mjs']) {
    result.code ??= {};
    result.code[file] = hash(await fs.readFile(path.join(code, file)));
  }
  const portable = await fs.readFile(path.join(run, 'portable.glb'));
  const direct = await fs.readFile(path.join(run, 'direct.glb'));
  const doc = decode(portable);
  const native = decode(direct);
  await check('portable Khronos glTF validation: zero errors', async () => {
    const report = await validator.validateBytes(new Uint8Array(portable), { uri: 'portable.glb' });
    await fs.writeFile(path.join(run, `${tag}-validator-portable.json`), JSON.stringify(report, null, 2));
    assert.equal(report.issues.numErrors, 0, JSON.stringify(report.issues.messages));
    return report.issues;
  });
  await check('direct export incompatibility reproduced', async () => {
    const report = await validator.validateBytes(new Uint8Array(direct), { uri: 'direct.glb' });
    await fs.writeFile(path.join(run, `${tag}-validator-direct.json`), JSON.stringify(report, null, 2));
    assert.ok(report.issues.numErrors > 0, 'expected invalid direct textured export');
    assert.ok(report.issues.messages.some(m => m.pointer?.includes('texCoord')));
    const carbon = native.document.materials.find(m => m.name === 'Hero.Satin carbon');
    assert.equal(carbon.pbrMetallicRoughness.baseColorTexture, undefined, 'procedural graph unexpectedly exported');
    assert.ok(native.document.nodes.find(n => n.name === 'Sign')?.mesh !== undefined,
      'FONT support changed');
    return { issues: report.issues, fontExportedAsMesh: true, proceduralCarbonTextureMissing: true };
  });
  await check('declared GLB nodes, parents, triangles, materials, UVs, images and clip', () => {
    assertContent(doc.document, receipt);
    return { nodes: doc.document.nodes.length, meshes: doc.document.meshes.length,
      materials: doc.document.materials.length, images: doc.document.images.length,
      clips: doc.document.animations.map(a => a.name) };
  });
  await check('invalid declared content rejected', () => {
    const invalid = structuredClone(receipt);
    invalid.poses[0].objects.NotPresent = invalid.poses[0].objects.Sign;
    delete invalid.poses[0].objects.Sign;
    assert.throws(() => assertContent(doc.document, invalid), /DECLARED_NODE/);
  });
  const brokenImage = structuredClone(doc.document);
  delete brokenImage.images[0].bufferView;
  brokenImage.images[0].uri = 'missing-texture.png';
  const routes = new Map([
    ['/', path.join(code, 'probe.html')],
    ['/browser.mjs', path.join(code, 'browser.mjs')],
    ['/lifecycle.mjs', path.join(code, 'lifecycle.mjs')],
    ['/portable.glb', path.join(run, 'portable.glb')],
  ]);
  for (const capture of [...receipt.captures.source, ...receipt.captures.portable]) {
    assert.equal(path.basename(capture.file), capture.file, 'CAPTURE_PATH');
    routes.set(`/capture/${capture.file}`, path.join(run, capture.file));
  }
  const network = [];
  server = http.createServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    network.push(pathname);
    if (pathname === '/delay.glb') {
      await new Promise(r => setTimeout(r, 200));
      response.setHeader('Content-Type', 'model/gltf-binary');
      response.end(portable);
      return;
    }
    if (pathname === '/bad-texture.glb') {
      response.end(encode(brokenImage, doc.binary));
      return;
    }
    if (pathname === '/corrupt.glb') {
      response.end('glTF corrupt payload');
      return;
    }
    let file = routes.get(pathname);
    if (pathname.startsWith('/three/')) {
      const module = pathname.slice('/three/'.length);
      if (!module.split('/').includes('..') && /^(build|examples\/jsm)\//.test(module)) {
        file = path.join(code, 'node_modules/three', module);
      }
    }
    if (!file) {
      response.writeHead(404);
      response.end(`MISSING_ASSET: ${pathname}`);
      return;
    }
    try {
      const bytes = await fs.readFile(file);
      const type = file.endsWith('.html') ? 'text/html' :
        /\.(js|mjs)$/.test(file) ? 'text/javascript' :
          file.endsWith('.png') ? 'image/png' : 'model/gltf-binary';
      response.setHeader('Content-Type', type);
      response.end(bytes);
    } catch (error) {
      response.writeHead(500);
      response.end(`SERVER_READ_FAILED: ${error.code}`);
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(origin)).status, 200, 'SERVER_READINESS');
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  result.versions.browser = browser.version();
  const page = await browser.newPage({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
  const blockedExternal = [];
  await page.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith(`${origin}/`) || url.startsWith('blob:') || url.startsWith('data:')) {
      return route.continue();
    }
    blockedExternal.push(url);
    return route.abort('blockedbyclient');
  });
  const warnings = [];
  page.on('console', msg => { if (['warning', 'error'].includes(msg.type())) warnings.push(msg.text()); });
  page.on('pageerror', error => warnings.push(`PAGE_ERROR: ${error.message}`));
  await page.goto(origin);
  await page.waitForFunction(() => window.r2);
  result.renderer = await page.evaluate(() => window.r2.metadata());
  await check('real GLTFLoader readiness and material/texture/clip bindings', async () => {
    const status = await page.evaluate(receipt => window.r2.load('/portable.glb', receipt), receipt);
    assert.equal(status.state, 'ready', JSON.stringify(status));
    assert.ok(status.firstFrame?.calls > 0 && status.firstFrame.triangles > 0, 'READY_BEFORE_FIRST_FRAME');
    return status;
  });
  await check('world transforms, pivots and bounds at frames 1/61/120', async () => {
    const errors = [];
    for (const pose of receipt.poses) {
      const observed = await page.evaluate(time => window.r2.sample(time), pose.time);
      for (const [name, expected] of Object.entries(pose.objects)) {
        errors.push({ frame: pose.frame, name,
          matrixError: closeEnough(observed[name].matrix_world, expected.matrix_world, 2e-4, `MATRIX: ${name}`),
          localMatrixError: closeEnough(observed[name].matrix_local, expected.matrix_local, 2e-4, `LOCAL_MATRIX: ${name}`),
          boundsError: expected.bounds ?
            closeEnough(observed[name].bounds, expected.bounds, 2e-4, `BOUNDS: ${name}`) : null });
      }
    }
    return errors;
  });
  await check('5-second sample clamps to 119/24-second final keyframe', async () => {
    const end = await page.evaluate(() => window.r2.sample(119 / 24));
    const hold = await page.evaluate(() => window.r2.sample(5));
    for (const name of ['Hero', 'Wheel', 'Spoke']) {
      closeEnough(hold[name].matrix_world, end[name].matrix_world, 2e-4, `HOLD: ${name}`);
    }
  });
  await check('matched camera/viewport/time browser captures', async () => {
    for (const capture of receipt.captures.portable) {
      const info = await page.evaluate(({ capture, lighting }) => window.r2.view(capture, lighting),
        { capture, lighting: receipt.lighting });
      assert.ok(info.calls > 0 && info.triangles > 0, 'EMPTY_RENDER');
      const expectedPose = receipt.poses.find(p => p.frame === capture.frame);
      for (const name of capture.visible) {
        closeEnough(info.pose[name].matrix_world, expectedPose.objects[name].matrix_world,
          2e-4, `CAPTURE_POSE: ${name}`);
      }
      closeEnough(info.camera, capture.camera.matrix_world, 1e-7, 'CAMERA');
      assert.deepEqual(info.renderer, [640, 360]);
      const file = `${tag}-browser-${capture.label}-${capture.frame}.png`;
      await page.locator('canvas').screenshot({ path: path.join(run, file) });
      routes.set(`/capture/${file}`, path.join(run, file));
      result.captures.push({ file, sha256: hash(await fs.readFile(path.join(run, file))), ...info });
    }
  });
  await check('matched three-way appearance measurements (not an acceptance gate)', async () => {
    const comparisons = [];
    for (const capture of receipt.captures.portable) {
      const original = receipt.captures.source.find(c => c.label === capture.label && c.frame === capture.frame);
      closeEnough(original.camera.matrix_world, capture.camera.matrix_world, 1e-6, 'MATCHED_CAMERA');
      assert.equal(original.camera.ortho_width, capture.camera.ortho_width, 'MATCHED_FRAMING');
      const urls = [original.file, capture.file, `${tag}-browser-${capture.label}-${capture.frame}.png`]
        .map(name => `/capture/${name}`);
      const comparison = await page.evaluate(urls => window.r2.compare(urls), urls);
      const file = `${tag}-comparison-${capture.label}-${capture.frame}.png`;
      await fs.writeFile(path.join(run, file), Buffer.from(comparison.contact.split(',')[1], 'base64'));
      delete comparison.contact;
      comparisons.push({ label: capture.label, frame: capture.frame, profile: capture.profile,
        ...comparison, contact: file, sha256: hash(await fs.readFile(path.join(run, file))) });
    }
    return comparisons;
  });
  const negativeCases = [
    { name: 'missing asset', url: '/missing.glb', expected: 'failed' },
    { name: 'corrupt GLB', url: '/corrupt.glb', expected: 'failed' },
    { name: 'missing required texture', url: '/bad-texture.glb', expected: 'failed' },
    { name: 'invalid declared node', url: '/portable.glb', expected: 'failed', wrongNode: true },
    { name: 'disposal during delayed real load', url: '/delay.glb', expected: 'disposed',
      options: { disposeAfterMs: 10 } },
    { name: 'timeout then late real completion', url: '/delay.glb', expected: 'failed',
      options: { timeoutMs: 10 } },
  ];
  for (const test of negativeCases) {
    await check(test.name, async () => {
      const declared = structuredClone(receipt);
      if (test.wrongNode) declared.poses[0].objects.NotPresent = {};
      const before = await page.evaluate(() => window.r2.status());
      const after = await page.evaluate(({ test, declared }) =>
        window.r2.load(test.url, declared, test.options), { test, declared });
      assert.equal(after.state, test.expected, JSON.stringify(after));
      assert.equal(after.attached, before.attached, 'FAILED_LOAD_ATTACHED');
      if (test.expected === 'failed') assert.ok(after.error, 'SILENT_FAILURE');
      if (test.url === '/delay.glb') assert.ok(after.released > before.released, 'LATE_RESOURCE_LEAK');
      return after;
    });
  }
  await check('superseded delayed load cannot dispose or attach over newer ready load', async () => {
    const statuses = await page.evaluate(async receipt => {
      const older = window.r2.load('/delay.glb', receipt, { disposeAfterMs: 50 });
      const newer = await window.r2.load('/portable.glb', receipt);
      const old = await older;
      return { old, newer, final: window.r2.status() };
    }, receipt);
    assert.equal(statuses.old.state, 'disposed');
    assert.equal(statuses.newer.state, 'ready');
    assert.equal(statuses.final.state, 'ready');
    assert.equal(statuses.final.attached, statuses.newer.attached);
    return statuses;
  });
  result.network = network;
  result.blockedExternal = blockedExternal;
  assert.equal(blockedExternal.length, 0, 'EXTERNAL_REQUEST');
  result.browserWarnings = warnings;
  assert.ok(!warnings.some(w => w.startsWith('PAGE_ERROR')), 'UNCAUGHT_BROWSER_ERROR');
  await page.evaluate(() => window.r2.dispose());
  result.complete = true;
}

try {
  await main();
} catch (error) {
  result.failure = String(error.stack ?? error);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (server) {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
  await fs.writeFile(path.join(run, `${tag}.json`), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
}
console.log(JSON.stringify({ complete: result.complete, checks: result.checks.length,
  failure: result.failure, result: path.join(run, `${tag}.json`) }, null, 2));
