# Mid Creek CS3

A Blender-authored, Three.js-based data-hall simulation.

**Continuation active.** U1-U4 and U6 are complete. The frozen C5 U5 two-run
technical checkpoint passes. U7 supplies a local first playable using the active,
ignored provisional development selection. U8 instrumentation and deterministic
evidence are complete. U9 adds the isolated showcase and approved local reference
gallery staging; named-target timing and U10 remain. Appearance remains
pending and no qualified production library is promoted.

## Start here

| Document | Role |
| --- | --- |
| **[plan.md](plan.md)** | **The only active work plan:** next-session work and boundaries |
| [New-session goal](docs/architecture/cs3-continuation-goal.md) | Copyable goal, committed starting point and evidence locations |
| [Implementation contract](docs/architecture/cs3-blueprint.md) | Detailed unit requirements, verification and release gates; completed units are reference-only |
| [Remaining/deferred work](TODOS.md) | Outstanding work only, not a second execution plan |
| [Archive](docs/archive/README.md) | Completed research, superseded goals and old status snapshots; **do not execute** |

Do not resume R1-R3, repeat the satisfied launch gate, or select an archived
handoff. Older statements that implementation has not started are historical.

## Current baseline and next result

C5 source/tests are committed at `9844435f98848be030a3347108e1129c650ed875`.
The candidate preserves five asset IDs, the rigid technician hierarchy and
Idle/Walk/Repair. It adds corrected PPE bands/piping, shaped boots/calves and
differentiated leather equipment, retaining C4's diagnostic Repair task.

Its source/export/browser evidence is retained, but **technical agreement is
not appearance acceptance**. The last independent overall review assessed
the earlier C3 candidate and needs work; C4/C5 have not received overall
appearance acceptance.

The user reports AR1 is running separately in the concept repository to solve
authoring/rendering fidelity. This CS3 continuation keeps the frozen local
baseline separate from U8-U10 and final appearance qualification. No more broad
aesthetic sweeps belong here.

U6 now enforces the full required-ready deadline, stale-generation and context
loss guards, strict manifest/GLB identity and animation envelopes, same-origin
dependency loading, partial-failure cleanup and library-wide unique resource
teardown. Its focused verification currently covers 53 unit checks and 30 real
Chrome/WebGL browser cases, including delayed and failed loading, Reload/input
gating, time-zero posing and two-instance ownership.

The [September 11 development-use amendment](docs/architecture/cs3-provisional-development-use-2026-09-11.json)
records the actual user instruction and authorizes only `local-playable`,
`local-showcase` and `local-validation` for the frozen hash-bound baseline.
The local selection is active at `assets/library/development/selection.json`.
This does not relax appearance, performance, publication or release gates.
Future AR1 replacements require a versioned handoff and affected qualification again.

## Toolchain and local commands

TypeScript, Three.js, DOM/CSS, Node/Vite, Vitest, Playwright, Python and Blender.
No Rust, Cargo, Bevy or custom Rust-to-WASM pipeline is required.

After resumption under a valid allowance, use the existing commands:

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run test:e2e -- tests/e2e/build.spec.ts
npm run dev -- --host 127.0.0.1
```

Install/restore dependencies only when needed. Heavy jobs run through
`tools/run_guard.py` with the original authorization and finite job timeouts.

### U9 isolated showcase and reference gallery

`npm run build` now typechecks, proves publication inputs, prepares the site and
builds both Vite entries. `npm run gallery:build` prepares only the ignored media
stage. Use `npm run preview` to browse the built showcase at `/midcreek-cs-3/`;
`npm run dev` and a direct `vite build` deliberately remain in the awaiting state
without the approved-media preparation step. No command deploys Pages or
qualifies a release.

`config/publication-allowlist.json` is a projection of the immutable launch grant:
its exact authorization and complete 155-record inventory hashes bind the
approved source hashes/paths without maintaining a second artwork inventory.
Every operation resolves the canonical U4 package once, verifies the original
launch bytes and full package file set, and checks the independent per-artwork
gallery uses. Public records contain only the exact allowed fields, credit,
terms and generated media URLs. Unknown fields/uses, changed bytes, denied
approval or missing output proof reject the build. No Blender/game captures are
approved in this policy; provisional development assets are not public media.

When the reviewed local authorization/package is unavailable, the built shell
honestly displays **Reference gallery awaiting publication approval** on opening
the gallery. It does not guess permission or fetch images. An empty policy is
also supported. `node --experimental-strip-types tools/site/build.ts
--require-gallery` instead fails if populated staging cannot be proven.

With the reviewed local inputs present, all 49 original references are approved
for **local release staging only**. Each build decodes one source at a time with
pinned Playwright and installed Chrome, producing a contain-fit 384-by-256 WebP
at quality 0.8, rejecting outputs over 60,000 bytes. Original files are never
rewritten. Hash-addressed media and a private recipe/browser/source/output
receipt are written under `.artifacts/site/<build-id>/`; `current.json` points
to the last complete stage. Only the exact public index, thumbnails and selected
originals are emitted into ignored `dist`. Receipts, prompts and sidecars are not.

The initial shell requests no gallery media/index and imports no game/Three.js
code. Opening the gallery loads the bounded index and at most six visible
thumbnails per page. Selecting an original opens a keyboard-accessible native
dialog; replacement/close aborts requests and revokes blob URLs. Errors retain
captions and credit with retry/navigation. Narrow layouts stack controls; they
do not provide touch gameplay.

`window.showcase.startup` is a frozen navigation-relative Resource Timing
**candidate**, including readiness roles and cache/encoded/decoded/transfer
sizes. It remains unqualified without independent network reconciliation;
pending or failed requests cannot be assumed absent from Resource Timing.
`window.showcase.laterBytes()` reports later gallery transfers separately.
The guarded browser suite reconciles CDP and the actual built shell on a cold,
uncompressed loopback server with all 49 approved production references staged.
That local byte-cap check is not a compressed Pages or named-target timing pass.

```sh
npm test -- tests/publication-contract.test.ts tests/reference-contract.test.ts tests/build-contract.test.ts
# Run through tools/run_guard.py with a fresh job name:
npm run test:e2e -- tests/e2e/showcase.spec.ts tests/e2e/build.spec.ts
```

Populated-content tests require the reviewed local inputs and a completed
`npm run build`; synthetic fixtures are never substituted for publication or
startup qualification. The showcase preserves the exact technical result
labels: U5 technical passed; appearance pending; U7 playable passed locally;
U8 deterministic instrumentation passed; named-target timing unqualified;
production/release blocked. U10 and final appearance/deployment approval remain
outside this unit.

### U7 local first playable

With the authorized ignored selection/package present, run `npm run dev -- --host
127.0.0.1` and open `/midcreek-cs-3/play/`. The loader accepts only the amendment's
hash-bound manifest/package on a loopback host. Missing, changed or failed assets
disable gameplay and expose Reload; there are no replacement models or clips.
The ordinary build does not copy this unqualified library into `dist`, so
`npm run preview` without an explicitly served local package remains disabled.

The playable uses the existing seed-417 simulation/session at 30 Hz, its 37
authoritative placements, U6 loading/lifetimes, and one native-depth orthographic
renderer at `cs3-standard-v1`. Click floor cells to walk or the amber marker to
dispatch. Arrow/WASD movement, F dispatch, Space pause, Q/E orbit, Home view reset
and +/- zoom share the existing input path. Moving during repair cancels work;
manual service-cell arrival waits for dispatch. Restart resets seeded time and
pose without reloading assets or resetting the current view. Hidden time is
discarded, and animation advances only on completed simulation ticks.

`window.midcreek.inspect()` returns frozen, read-only scene/session observations;
it cannot set world state or advance ticks. U7 browser tests compile the real play
entry, serve only the selected local package, and use real Chrome/WebGL, including
one unmodified RAF journey. Exact tick tests control only the browser frame
boundary. They retain desktop/narrow and four-heading visibility/occlusion
captures under each guarded job, not appearance or performance verdicts.

Focused checks (use unique guarded job names and one heavy job at a time):

```sh
npm test -- src/app/game.test.ts src/engine/presentation.test.ts src/ui/hud.test.ts
npm run test:e2e -- tests/e2e/game.spec.ts tests/e2e/assets.spec.ts tests/e2e/input.spec.ts
```

The selection tests and game browser tests require the authorized local package;
they fail explicitly if it is absent. These checks do not qualify U8 performance,
appearance, publication or release.

### U8 instrumentation and deterministic qualification

`window.midcreek.diagnostics.snapshot()` exposes immutable navigation-relative
readiness, the frozen startup request/byte ledger, actual completed-render
receipts, simulation steps, interruptions and completed workload boundaries.
`diagnostics.stop()` freezes capture without stopping gameplay. Render counters
reset once before all production passes, including shadows. RAF callbacks that
do not render do not create receipts. Hidden/background/error events invalidate
a run even when no frame is rendered during the interruption.

The deterministic evidence/performance specs use the real built entry and
WebGL submissions with a controlled clock. They retain first-300, the >=12
simulation-second warmup, 300 idle and scripted-loop frames, complete dispatch
travel/arrival/120-tick repair/resolution, and 300 orbit/resize frames. The
1024-by-768 browser window covers precisely orbit frames 120..179; the remaining
frames use 1280-by-720. These tests are **not named-target timing runs**.
Statistics use completed intervals divided by elapsed time and nearest-rank
p95, without dropping long samples. First-300 timing remains descriptive;
each post-warmup window (including separate travel, repair, combined and
fixed/resized orbit sections) is gated independently. Byte/call/triangle
ceilings are exact integer limits, without rounding or best-run selection.

```sh
npm test -- src/diagnostics/metrics.test.ts src/app/lifecycle.test.ts
# Run these browser specs through tools/run_guard.py with a fresh job name:
npm run test:e2e -- tests/e2e/evidence.spec.ts tests/e2e/performance.spec.ts

# Consume retained raw reports only; never launches a browser.
node --experimental-strip-types tools/qualification.ts \
  --input .artifacts/qualification/run-1/report.json \
  --input .artifacts/qualification/run-2/report.json \
  --input .artifacts/qualification/run-3/report.json \
  --output .artifacts/qualification/review-1
```

Each raw `QualificationReport` carries target metadata, ready/startup receipts,
all frames and simulation steps, exact phase boundaries, ordered move/dispatch
actions and an independent CDP response ledger. The required list binds the
entry HTML/JS/CSS, selection pointer, strict manifest and five GLBs. A collector
must enable CDP before navigation, record cold/cache/service-worker and serving
conditions, and retain pending/failed requests as well as completed responses.
Resource Timing's transfer size is the startup budget authority; CDP retains its
own wire byte count and reconciles URLs, timing and encoded bodies (header
accounting is not assumed identical). Embedded GLB image decodes are not extra
network transfers. Missing/zero data, changed ledgers, incomplete windows,
interruptions or target prerequisites are unqualified, never passes.

The CLI validates raw shapes and recomputes results, writes per-run raw files and
checksums to a **fresh** private output directory, and writes a separate
allowlisted `sanitized/result.json`. Exit codes are 0 passed, 1 measured failure,
2 unqualified/error. Three fresh, identically configured complete runs are
required for an aggregate pass; individual misses remain visible. Raw logs,
paths and host details are never copied into the sanitized projection, and
neither projection nor raw output is automatically published.

Named-target qualification remains pending orchestrator review and **three
headed, foreground, 60 Hz CS3-M4Pro-Chrome153-DPR1 repetitions** with complete
Mac/CPU/GPU/RAM/macOS/display/power/browser/WebGL/backend and application/content/
profile/recipe identities. No performance, appearance or release pass is
claimed. The normal play layout now produces the required 1280-by-600 CSS and
drawing-buffer rectangle at a 1280-by-720 DPR1 browser viewport, with the
remaining 120 pixels reserved for the HUD.

### U5 packaging API (not full library qualification)

The retained `strict-r1c-9213c63` and `strict-r2-9213c63` runs under
`.artifacts/assets/u5-c5/` pass the read-only technical qualification checkpoint:
**31 checks and 30 matched source/browser captures per run**, completed
export/capture/check jobs, and identical strict export, manifest, technical
evidence and five GLB bytes. The original eight-node R2
`checks-strict-9213c63` regression passes **16 checks with 10 browser captures**.
The source is `9844435f98848be030a3347108e1129c650ed875`, exporter revision
`9213c63659158780f186c22e3bf6579353fb8f75`, and library digest
`200366356f3665ac9ef45c404bd9462e29b2ae0c813b688c4df3ed2cf119a934`.
The amendment pins the exact blend/spec/profile/recipe/export/check/job hashes.
Appearance remains pending; performance is unqualified; qualified production
promotion, the release allowlist and publication remain blocked.

`tools/qualify-assets.ts` validates these two runs without launching Blender or
a browser. It rejects missing, corrupt, stale, duplicate or partial evidence;
verifies historical influencing Git bytes at the pinned exporter revision,
local source bytes, captures/sidecars and guarded job logs; and records input
hashes in canonical technical-only JSON. It never interprets numeric image
comparisons as appearance acceptance. It has no import-time side effects.

The canonical local receipt and `local-playable` development selection are
active on this machine. Revalidate or deliberately reselect them with:

```sh
# Revalidate and write only the local ignored technical qualification receipt.
node --experimental-strip-types tools/qualify-assets.ts

# Revalidate, write the same receipt, and explicitly select development-only use.
node --experimental-strip-types tools/qualify-assets.ts --select local-playable
```

The receipt is `.artifacts/assets/u5-c5/technical-qualification-2026-09-11.json`.
Identical receipt writes are idempotent; different existing receipts are never
overwritten. `--select` also accepts `local-showcase` or `local-validation` and
calls the existing unsigned, parent-hash-bound packaging API. It writes
`assets/library/development/selection.json`, **not**
`assets/library/manifest.json` or a release allowlist. All of `assets/library/`
is ignored by default, including packages, receipts, transaction files and
pointers; later qualified publication may force-add only reviewed allowlisted
files. A selection failure is reported explicitly and may leave the valid
technical-only receipt; that receipt never claims successful selection.

Qualification tests use tiny temporary synthetic runs. The opt-in retained-run
test reads local evidence without writing a receipt or selecting anything:

```sh
npm test -- tests/assets-qualification.test.ts tests/assets-promotion.test.ts tests/asset-contract.test.ts
CS3_U5_RETAINED=1 npm test -- tests/assets-qualification.test.ts
npm run typecheck
git diff --check
```

Missing local evidence or pinned Git objects blocks the opt-in test/tool; a
clean clone does not silently skip requested qualification or reconstruct old
receipts. Changed assets, textures, materials, animations, shaders or rendering
settings invalidate affected claims and require the corresponding gates again.

`tools/promote-assets.ts` exposes `createManifestFromExport`,
`validateAssetLibrary`, `promoteAssetLibrary` and
`selectProvisionalAssetLibrary`. It runs directly under
`node --experimental-strip-types`; it does not run Blender, load an implicit
local candidate, change the ordinary build, or publish anything on import.
`validateAssetLibrary` is the read-only API for a future `assets:validate`
script and requires independently pinned `ExportIdentity` values.

The complete packaging `ExportReceipt` type is defined in
`tools/assets/contracts.ts`. Its `cs3-library-export` schema includes the exact
five observed assets and independently declared specification records,
source commit/blend identity, raw influencing input identities, canonical
specification hash, exporter exit/revision, actual tool versions and frozen
profile/recipe hashes. Declarations cover the scene hierarchy, rigid column-major
local/world matrices, geometry totals, bounds, named portable-PBR material and
embedded texture/UV bindings, permissions and every clip key/midpoint pose.
Unknown fields and incomplete legacy receipts fail closed. The retained C5
legacy receipt is immutable and is **not silently upgraded**. The strict
exporter checkpoint and the two retained guarded Blender/loader repetitions
are complete, without changing the frozen visual source.

`blender/render_profile.json` is the canonical `cs3-standard-v1` development
recipe: Standard/None and Linear-sRGB/sRGB/NoToneMapping color settings, normal
`cs3-lighting-v1` hall lighting, antialiasing, shadow/outline/filtering assumptions,
1280x720 browser / 1280x600 renderer at DPR1, and explicit exporter settings.
Its asset-centered 640x360 comparison recipe is deliberately separate from
normal hall lighting. This document freezes assumptions, not an appearance pass
or a claim that the future playable already implements them.

For a later authorized requalification that actually needs fresh exports, use
the **Python supervisor**, not a direct Blender export, inside
`tools/run_guard.py` with a fresh job name, current authorization and a bounded
allowance. Do not repeat the already-passing frozen runs merely to create the
local qualification receipt:

```text
python3 -B blender/export_library.py --blender <approved-blender-executable>
  --source .artifacts/assets/<frozen-source-run>/library.blend
  --sha256 5b9870942fb42a1390aa048c6840e99ab3dafbc94ea63fe4c75e44563b8fd2da
  --source-commit 9844435f98848be030a3347108e1129c650ed875
  --exporter-revision <exact-40-character-commit-containing-the-exporter>
  --output .artifacts/assets/<frozen-source-run>/<fresh-export-directory>
  --node <approved-node-executable>
```

These are argument lines for one guarded command, not an authorization to run
Blender. Both revisions are explicit and their applicable input bytes must
match those Git objects; dirty branch identity is never used. The worker opens
only `owned.blend`, validates source inputs, reads actual Blender/build/glTF
exporter versions and records installed operator defaults. The supervisor
observes the actual child exit with `--python-exit-code 1`; nonzero exit,
missing pending evidence, changed inputs or missing GLBs leave no completed
`export.json`. Logs and partial evidence are retained, never repaired into a pass.

Each export directory contains `candidate/` with **only the five GLBs**,
`technical.json` with the full evaluated vertex/triangle/UV/pose evidence,
`export.pending.json`, `process.json`, and the Node-validated strict
`export.json` plus candidate `manifest.json`. The technical, pending, process
and authoring receipts are raw hash/byte-bound inputs (`script` is the existing
contract's role for auxiliary JSON evidence). Public specification records
exclude machine paths, raw operational provenance and large comparison arrays;
publication approval remains false. `source/` input paths are portable identity
aliases for the frozen source directory, not candidate files. Diagnostic logs
do not influence the recipe or claim qualification.

`profileSha256` covers canonical `{profile,color,normalRendering}`;
`recipeSha256` covers the full recipe, raw influencing inputs and effective
export settings, excluding generated technical/process/pending receipts.
Those generated receipts still affect the export/library identity through
their raw input hashes. `blender/export_receipt.py` supplies the no-bpy mapping;
`tools/export-receipt.ts` uses the unchanged packaging API and actual Node
runtime to validate bytes before writing the completion marker.
`capture_library.py` and `probes/r2/library-check.mjs` resolve the hash-bound
technical sibling for new exports and continue accepting legacy evidence.
All original source/geometry/UV/texture/pose comparisons remain in place.

Lightweight checkpoint checks:

```sh
python3 -B -m unittest discover -s tests/blender -p 'test_*.py'
node --experimental-strip-types --test tests/exporter-receipt.node.ts
npm run typecheck
npm test -- tests/assets-promotion.test.ts tests/asset-contract.test.ts
node --test probes/r2/glb.test.mjs probes/r2/png.test.mjs probes/r2/lifecycle.test.mjs
git diff --check
```

The two fresh guarded real Blender repetitions and real checker runs are
retained and verified by the checkpoint above. For future repetitions, the real `tests/blender/test_library.py`
invocation accepts `--export <fresh-export-directory>/export.json` alongside
its existing `--source` and `--sha256` arguments. Capture/check commands still
take the export directory's `export.json`, not `technical.json` or `candidate/`.
Retain the original eight-node R2 regression and all C5 negative checks.
Neither these lightweight tests nor the exporter grant appearance, promotion
or release approval. Provisional use comes only from the separate actual-user
amendment, not from a technical pass.

Canonical UTF-8 JSON sorts object keys and record arrays by identity; scalar
arrays retain their semantic order, except UV-set inventories are normalized
numerically by the receipt parser. The specification hash excludes exported
GLB paths/byte identities. The library digest binds the canonical specification, influencing
identities, observations and sorted candidate-relative path/hash pairs, before
adding any output paths or digest field. Export-receipt and completed-manifest
hashes each cover their canonical JSON plus one LF. No absolute filesystem
prefix, promotion receipt or generated index enters the library digest.

Supply a dedicated GLB-only candidate tree and a disjoint destination using
canonical, symlink-free absolute filesystem roots. Publication verifies exact
files and copies them into `packages/<libraryDigest>/`, then installs a separately
hashed publication receipt and atomically replaces the small `manifest.json`
pointer. Pointer paths and runtime asset URLs are relative to the destination
root (not to the nested manifest file). Old generations are never overwritten
or removed. Consumers must explicitly resolve the pointer's `manifest` and
verify `manifestSha256`; the pointer itself is not an `AssetManifest`.

Qualified publication requires an actual dated `QualifiedApproval` binding the
parent authorization, **completed manifest hash**, source commit/blend,
profile/recipe and library digest to both appearance acceptance and
publication-policy approval with evidence identities. The caller supplies the
independently trusted parent-authorization hash. An Ed25519-signed envelope is
also supported when a separately provisioned public trust key exists, but
signing infrastructure is not invented as a prerequisite. Candidate booleans
and candidate-provided trust data establish no authority.

Provisional selection instead requires an actual dated
`ProvisionalAmendment`, the independently pinned parent-authorization hash and
an explicitly allowed `local-playable`, `local-showcase` or `local-validation`
use. It writes only `development/selection.json`, never the qualified pointer
or a release allowlist. The manifest's `appearanceAccepted` remains false;
qualification belongs to the separate hash-bound selection/publication record.

Transactions expose `after-staging`, `before-pointer-replace` and
`after-pointer-replace` hooks. Pre-activation failures preserve the previous
pointer. Post-activation durability or cleanup errors report
`ACTIVATED_WITH_ERRORS` with the active generation identity instead of implying
rollback. Abrupt process exit can leave a lock, stage or complete unselected
generation; locks are never automatically stolen. Inspect the recorded owner
and retained files before explicit recovery. These are cooperative, local POSIX
filesystem transactions, not protection against a privileged process rewriting
the store or an unqualified network filesystem. Packaging verifies declarations
and exact bytes; it does not replace Khronos, evaluated
Blender/loader/decoded-texture comparisons, the two fresh repetitions,
appearance review or release qualification.

## Local evidence and visual monitor

Approved references, generated Blender/GLB candidates, images and operational
receipts remain under ignored `.artifacts/`; they were not published by the
request to commit the session's source/documentation work. A clean clone does
not contain that local evidence. See the goal document for hashes and paths.

The live monitor is stopped for handoff. Its retained snapshot is
`.artifacts/implementation/20260910T232859Z/u5-monitor/index.html`.
It opens offline and depends on the retained local image files.
When the new session is authorized to resume, the existing monitor command is:

```sh
npm run u5:monitor -- --authorization .artifacts/implementation/20260910T232859Z/authorization.json
```

Do not start a second owner while its lock is held. Receipt-derived image
labels distinguish source, browser, comparison, reference and study images;
matching a receipt is not an approval. The tool publishes nothing.

## Authorization

The original launch and this bounded continuation are authorized. Heavy work
ends **September 12, 2026 at 22:28:59.608228 UTC** and closeout ends at
**23:28:59.608228 UTC**. A fresh session does not restart the allowance.
No Pages deployment, new external art-generation service or unapproved source
publication is authorized by this handoff.

The [research references](docs/research/initial-findings.md) and
[source audit](docs/research/cel-shift-source-audit.md) remain useful evidence,
not active plans. Completed implementation code and regression tests remain
in place intentionally.
