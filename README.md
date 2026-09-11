# Mid Creek CS3

A Blender-authored, Three.js-based data-hall simulation.

**Continuation active.** U1-U4 and U6 are complete. C5 source is checkpointed;
U5 final technical packaging and U7-U10 remain unfinished. No production
library is promoted, and the application entries are not yet a playable game.

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
authoring/rendering fidelity. This CS3 continuation completed U6 loading/lifetimes and now owns remaining U5
technical packaging and U7's actual playable, followed by U8-U10. No more broad
aesthetic sweeps belong here.

U6 now enforces the full required-ready deadline, stale-generation and context
loss guards, strict manifest/GLB identity and animation envelopes, same-origin
dependency loading, partial-failure cleanup and library-wide unique resource
teardown. Its focused verification currently covers 53 unit checks and 30 real
Chrome/WebGL browser cases, including delayed and failed loading, Reload/input
gating, time-zero posing and two-instance ownership.

Provisional development use requires a recorded, hash-bound exception and
does not relax technical, appearance or release gates. Future AR1 replacements
require a versioned handoff and affected qualification again.

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

### U5 packaging API (not full library qualification)

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
Unknown fields and incomplete legacy receipts fail closed. The existing C5
exporter's older receipt is **not silently upgraded**: completing that producer
contract with actual identities/evidence remains part of fresh technical
qualification, without changing the frozen visual source.

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

The original launch is approved, but execution is currently paused. Heavy work
ends **September 12, 2026 at 22:28:59.608228 UTC** and closeout ends at
**23:28:59.608228 UTC**. A fresh session does not restart the allowance.
No Pages deployment, new external art-generation service or unapproved source
publication is authorized by this handoff.

The [research references](docs/research/initial-findings.md) and
[source audit](docs/research/cel-shift-source-audit.md) remain useful evidence,
not active plans. Completed implementation code and regression tests remain
in place intentionally.
