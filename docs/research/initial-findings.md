# Initial Research Findings

Saved September 10, 2026. These findings preserve the research already gathered
before formal execution of the seven-stage plan.

Source labels E1-E7 refer to [the evidence index](evidence-index.md). Code,
plans, manifests, and commit histories were inspected. No predecessor tests,
Blender jobs, export probes, or browser measurements were run in this session.

## Main Distinction

| Project | Built product | Geometry pipeline | Runtime / output |
| --- | --- | --- | --- |
| CS1 | Cel Shift data-hall technician/repair POC | Declarative RON -> custom Rust tessellation/rigging -> committed GLBs; explicitly no Blender | Bevy native and browser WASM |
| CS2 | Smaller reproducible Cel Shift repair game | Procedural and instanced geometry created in Three.js | Three.js/WebGL2 browser game |
| Street Scene One | Editable animated street scene and selected five-second video | Python scene/geometry construction in Blender, packed permitted materials | Cycles/Metal frames -> FFmpeg MP4 |
| CS3 | Not implemented | Blender/Python-authored assets -> validated GLB | Planned TypeScript/Three.js runtime; no Rust |

Sources: E1 `docs/implementation-plan.md`, `src/assetgen.rs`, `src/lib.rs`;
E2 README, architecture and hill-climb documents; E3 README and construction
script; E4 local Three.js prompt.

**CS3 decision:** Rust was dropped in CS2 and is not part of the CS3 pipeline.
The user reaffirmed this boundary on September 10, 2026. CS3's browser runtime
and simulation use TypeScript; asset authoring/export uses Python and Blender.
The Rust/Bevy details below describe predecessors only. Their algorithms,
contracts, and measurements can inform CS3 without importing their crates,
Cargo commands, or Rust-to-WASM build. The [toolchain decision](../../plan.md#cs3-toolchain-decision-no-rust)
records the deterministic-state, testing, reuse, and performance implications.

## CS1: How It Was Built

### Product and runtime architecture

The reviewed plan specifies one data hall, a technician, camera-relative arrow
movement, eased Q/E quarter-turn orbit, recurring prioritized faults, and Space
to repair. Up to three tickets can coexist. Repair locks movement while the
camera remains usable. The plan specifies a 40 m walkable room inside a 72 m
non-playable visual apron, separating collision bounds from rendered coverage.

`CellShiftPlugin` composes generated assets, hall, technician, camera,
operations, and HUD plugins. Shared system sets define order explicitly:

```text
AssetReady -> SpawnWorld -> ReadInput -> UpdateOrbitIntent
  -> UpdateOperations -> MovePlayer -> UpdateAnimation
  -> FollowCamera -> UpdateHudAndBadges -> VerificationProbe
```

This prevents plugin insertion order from implicitly deciding gameplay order.
The native verification application composes the production plugins rather
than an alternate game.

The inspected plan specifies an orthographic camera with 57-degree elevation.
Later history includes camera calibration work and a reverted attempt to derive
elevation from the authority image. Do not silently treat this as the same
camera contract as CS2's 35.264-degree isometric view.

Sources: E1 plan lines 39-200; `src/lib.rs`; commits `685c7ca` and `cb9fd3a`.

### Asset generation

The pipeline is custom Rust, not a Blender export:

```text
assets/source/*.ron
  -> schema and invariant validation
  -> primitive tessellation, rigid bone weights, animation tracks
  -> merge static geometry by asset/material/bone
  -> deterministic GLB serialization
  -> assets/generated/*.glb
```

The five generated asset names are `cooling-unit`, `infrastructure`, `rack`,
`technician`, and `utility-props`. The technician declares 11 bones and
`Idle`, `Walk`, and `Repair` clips.

The implementation quantizes floats to a 1e-6 grid, normalizes negative zero,
orders collections deterministically, and excludes timestamps and machine paths.
`--write` produces committed assets; `--check` compares regeneration against
them. Named error variants distinguish parse/validation errors, stale output,
I/O failure, and nondeterminism.

The inspected budgets include 24,000 triangles per asset, 12 primitives per
mesh, and 60,000 vertices per primitive. These are CS1 contracts, not selected
CS3 budgets.

Source: E1 `src/assetgen.rs:1-220`.

### Verification and publication

The plan layers pure state contracts, actual input integration, generated-asset
checks, a scripted production-app journey, semantic reports, and rendered-image
metrics. It calls for exact semantic hashes and bounded image metrics, not
cross-GPU PNG byte equality.

The native verification startup uses synchronous pipeline compilation and a
restricted software-adapter profile. Code comments document software adapters
producing HUD-only frames through a GPU-preprocessing path, motivating the CPU
mesh-uniform compatibility profile. That is a documented implementation
rationale, not a defect reproduced in this session.

The publication design separates current status from last-green game/evidence:
publish progress on each main push, but replace playable WASM and screenshots
only when their associated gates pass. Native site generation and verification
are compiled out of the browser build.

Sources: E1 `src/lib.rs`, plan architecture/publication sections.

### Build sequence visible in Git history

| Abbreviated commit | Milestone |
| --- | --- |
| `a3a10dc` | Initial repository |
| `12110f6`, `504efdb` | Pages design and autonomous delivery plan |
| `2933eb4` | Reviewed project contracts |
| `aa9c215`, `ff8affe`, `6dfcf58` | Progress model, site generation, Pages publication |
| `7310d61`, `6f8a5cb` | Generated rigged assets, then glTF skinning correction |
| `64d4c70`, `ed931d5` | Authored hall, traversal/clearance/identity proof |
| `e1ed0be`, `a496834` | Technician movement and rig-loss/hitch handling |
| `236d12c`, `314fff9`, `6a82e12` | Orbit, walkable/rendered separation, camera clamp corrections |
| `cef3fc8`, `2aa9142` | Recurring fault/repair loop and animation rest-transform reset |
| `c2b1a2f` | Ticket HUD and rack badges |
| `ece76d4`, `a2d805b`, `3c80465` | Playable web build, automated verification, published evidence |
| `92ffc90` | Measurement engine extraction and `--measure` |
| `29918c1`, `3dd739b` | Phase 2 hill-climb plan and review amendments |
| `e703627`, `0856900` | Phase 1 baseline binding and machine-readable fidelity contract |
| `51f1d40`, `0046c63`, `eb50dac` | Policy/measurement separation and manifest-owned hashes |
| `685c7ca`, `cb9fd3a` | Camera-elevation derivation and its revert |
| `3d05ae2` | Software-rasterizer pixel-defect quarantine in remote history |
| `19716a9` | Baseline-rebind documentation in remote history |

These are observed subjects, not a substitute for reading every diff.
CS1's local and remote tips differ; see E1 before assigning later behavior to
the inspected local source.

## CS2: How It Was Built

### Smaller browser-first architecture

CS2 deliberately narrows the first playable to one reproducible coolant-leak
scenario. It uses strict TypeScript, Three.js/WebGL2, Vite, Vitest, Playwright,
ESLint/Prettier, and GitHub Pages. The inspected manifest declares Three.js
`^0.185.1`, Vite `^8.2.2`, and Node `>=22`; these are manifest ranges, not
independently verified installed versions.

```text
browser input -> normalized commands -> fixed-step world
                                         |
                                  immutable snapshots
                                     /        \
                             Three.js scene   DOM HUD
                                     \        /
                                    diagnostics
```

The world advances at 30 Hz with deterministic pathfinding and repair.
Presentation consumes snapshots rather than mutating world state. The engine
owns/disposes GPU resources; the UI owns accessible DOM controls; diagnostics
are read-only.

The initial scenario has 32 racks and one seeded fault. Clicking the floor or
using movement keys routes around blocked rack rows. Dispatch/F/fault badge
routes to the service aisle; repair takes four simulation seconds after
arrival. Restart repeats the seed. Camera controls are Q/E quarter turns,
bounded zoom, and a home view; the camera remains usable while paused.

The camera contract is orthographic, 35.264-degree elevation, with ground axes
at 45 degrees and four headings. There is no free tilt or roll.

Sources: E2 README, `docs/architecture.md`, `docs/hill-climb.md`,
`package.json`, and inspected `src/app/game.ts`.

### Runtime construction and error behavior

The application creates a procedural hall, moves the technician into a dynamic
scene, mirrors lighting into that scene, and adds a dynamic route line. The
renderer caps device pixel ratio at 1.5. Resize updates camera framing and
renderer size.

Input listeners respect focused DOM controls. Visibility changes reset timing
accumulation instead of fast-forwarding simulation after a hidden tab.
WebGL context loss stops the animation loop, pauses the world, and displays a
reload/restart error state rather than pretending play can continue.

Source: E2 `src/app/game.ts`, inspected first 260 lines.

### Five-commit implementation history

All five observed commits are dated September 4, 2026:

| Commit | Outcome |
| --- | --- |
| `02f9674` | Scaffold the concept game |
| `e5b0e8a` | Add deterministic data-hall repair simulation |
| `40976cf` | Ship the first playable Cel Shift hill climb |
| `dac6940` | Record verified live gameplay release |
| `7ce1aa3` | Cache static hall color and depth for sustained 60 FPS |

The hill-climb record describes test-first deterministic world/camera/input
work and real browser repair-loop acceptance. It records 21 unit tests, six
initial browser cases, and nine Windows browser cases after caching. Those
are historical reports, not tests run during this investigation.

### Measured performance iteration

The reference setup was seed 417, coolant-leak scenario, heading 0, zoom 1,
1280 x 720 browser viewport, and a 1280 x 600 renderer at pixel ratio 1.
Chromium used SwiftShader on a Windows VM, not a hardware GPU.

| Experiment | Reported mean FPS | Recorded verdict |
| --- | ---: | --- |
| Initial playable | 24.8 | Playability promoted; timing unmet |
| Remove MSAA | 37.0 | Rejected jagged outlines |
| Planar server-face details | 36.7 | Geometry reduction promoted, not a timing win |
| 75% raster | 41.0 | Rejected blur |
| Restore native raster/MSAA with planar details | 26.4 | Fidelity/gameplay promoted; timing still blocked |

The later cache experiment measured uncached sustained play at 38.7 FPS and
cached play at 60.0 FPS under its explicit warm-up protocol. These are separate
comparison windows from the earlier table, not inconsistent measurements.

The cache stores full-resolution static color and depth with four-sample
antialiasing. Every frame restores both and renders the technician and route,
preserving occlusion. Camera matrices and drawing-buffer changes invalidate the
cache. Cache-refresh cost is recorded separately from cheap steady frames.

| Cache checkpoint metric | Reported result |
| --- | --- |
| First 300 frames, including startup/JIT | 56.1 FPS |
| Sustained mean after fixed warm-up | 60.0 FPS |
| Active dispatch/repair mean | 60.0 FPS |
| Sustained p95 | 16.7 ms |
| Steady calls / triangles | 15 / 442 |
| Cache-refresh peak calls / triangles | 29 / 12,374 |
| Initial transfer | 151,809 bytes |

The explicit target gate requires at least 59 FPS mean and at most 18 ms p95.
The documented comparison keeps startup evidence rather than filtering it
away. Ordinary deterministic CI does not claim that an unrun timing gate passed.

The release record identifies gameplay commit `40976cf`, Pages run
`33922403443`, and Quality run `33922403453`, plus browser acceptance against
the published build. The run IDs were read from the record, not re-queried.

Source: E2 `docs/hill-climb.md` and `docs/architecture.md`.

## Street Scene One: What Actually Exists

### Authoring, not an existing Three.js pipeline

The active plan replaced an older Blender/Unreal concept with Blender-only
construction, animation, and Cycles rendering. It explicitly excludes gameplay.
The reviewed method uses fixed references, independently judged images,
correction of meaningful defects, retained best versions, and whole-scene
comparison. It does not claim to reproduce an unpublished external project.

The source history has three commits:

| Commit | Outcome |
| --- | --- |
| `db07a4a` | Editable street scene and guarded capture pipeline |
| `d107a44` | Final selected scene and frozen capture |
| `ae5a4e7` | Ignore local planning documents |

The public showcase has publication commit `1538d86`. Its local Three.js prompt
is untracked and describes future work. No export script, GLTFLoader runtime,
or Three.js package manifest was found in the inspected Street Scene source
and showcase inventories.

Sources: E3 plan/README/history; E4 inventory, README, and local prompt.

### Scene construction and look

`blender/build_scene.py` composes `street.py`, `hero_car.py`, and
`parked_cars.py` in an isolated background Blender process. The scene uses
meters and meaningful collections for street architecture, hero vehicle,
parked traffic, and camera/lighting.

The hero and camera have linear location keys across frames 1-120, traveling
17.5 m along Blender positive Y. Wheels rotate about local X using negative
travel distance divided by tire radius. The configured camera uses a 37 mm
lens. Named editing controls are `Hero car path`, `Chase camera path`, and
`Afternoon sun direction`.

The construction config selects Cycles/Metal, 64 samples, denoising, seed 42,
1920 x 1080 at 24 FPS, and AgX Medium High Contrast with exposure 0.3.
The world uses sky and light-path-dependent nodes to separate visible sky
from surface illumination. That node setup is a concrete export-compatibility
question, not proof that a GLB can preserve the look.

Brick and asphalt texture sets are ambientCG `Bricks059` and `Asphalt012`,
recorded under CC0. Vehicle and building geometry is original procedural work.
The delivery report states images are packed and there are no linked Blender
libraries; this session has not independently opened the `.blend` to confirm.

Sources: E3 construction script/README; E5 delivery report.

### Evidence and safety pipeline

```text
configuration + construction scripts + permitted materials
  -> isolated Blender construction
  -> saved scene + retained dependency contents + hashes
  -> previews / selected anchor frames / motion samples
  -> image review and correction decisions
  -> scene-bound design acceptance + capacity forecast
  -> controlled full frame sequence
  -> validated encoding and delivery manifest
```

The README describes one-heavy-job locking, owned process groups, pause files,
time/disk limits, and recovery reserve. The inspected evidence code writes
atomic records, retains dependencies under content hashes, rejects changed
review images or fingerprints, and rejects incomplete or mixed frame sequences.

Capture code binds imported scenes to a locked hash and original owner.
Delivery approval must match scene/reference fingerprints and remaining
capacity. A successful technical capture is separate from aesthetic acceptance.
The old construction/capture allowances are expired and not reusable.

Sources: E3 README, `pipeline/evidence.py`, `pipeline/capture.py`.

### Selected result and retained limitations

Attempt 23 retains the improved hero car and window design B, restores earlier
parked-vehicle geometry after a rejected minivan revision, and freezes that
selection for delivery. The minivan shape and distant architecture remain
below the target.

The delivery manifest records:

| Outcome | Value |
| --- | --- |
| Workflow executed | Passed |
| User accepted | Passed |
| Video reference target matched | Failed |
| Photograph criterion | Unevaluated |

The manifest records a 10,779,374-byte scene and 9,462,191-byte MP4. The scene
record counts 299 objects and 360,561 vertices; vertices are not a measured
Three.js draw-call or triangle budget.

The delivery report describes a 120-frame, five-second H.264 output, unchanged
scene bytes, editability demonstrated on a separate copy, 33 ordinary tests,
complete decoded-frame inspection, and repeat captures at frames 1, 61, and
120. It reports 979.22 seconds for full capture and 4.31 seconds for encoding.
These are historical delivery claims, not new measurements.

Source: E5 `scene.json`, `manifest.json`, `REPORT.md`.

## Proposed Blender-to-Three.js Boundary

The local showcase prompt proposes:

```text
selected Blender scene
  -> reproducible public-safe GLB export
  -> optimized GLB and permitted textures
  -> Three.js viewer
  -> GitHub Pages
```

It calls for GLTFLoader, authored camera/animation playback, responsive sizing,
capped pixel ratio, explicit loading/WebGL/asset failure states, optional
inspection controls, and video fallback. Existing video/concept/gallery pages
must remain intact.

It also requires matched start/middle/end comparison, provenance preservation,
and honest reporting of WebGL-versus-Cycles material, lighting, shadow, and
color-management differences. None of those export/runtime requirements has
been implemented or proven in this session.

The planned probe must inspect geometry/modifiers, packed textures, shader
translation, axes/scale, camera/light export, animation duration, clip behavior,
and payload/performance. The final video has 120 frames at 24 FPS; the temporal
mapping of first/last Blender keyframes into a runtime clip must be verified
rather than inferred from the video's five-second duration.

Source: E4 untracked `THREEJS-SESSION-PROMPT.md`; E3 construction script.

## Preliminary CS3 Lessons

These are candidate recommendations, not an approved final blueprint:

1. Preserve CS2's separation of deterministic state, rendering, DOM UI, and
   diagnostics rather than carrying Bevy-specific machinery into a browser app.
2. Carry over CS1's explicit asset contracts, stable identities, error reporting,
   and validation of actual production paths.
3. Carry over Street Scene's editable sources, retained dependencies, content
   hashes, one-writer discipline, and distinction between acceptance and fidelity.
4. Prove one Blender-to-browser asset before committing to a large scene or
   assuming Cycles appearance survives export.
5. Measure real browser performance and visual regressions. Do not automatically
   transplant CS2's static cache into an animated/imported scene without proving
   its invalidation requirements.
6. Keep the new pipeline small: Blender-authored assets and explicit runtime
   equivalents, not simultaneous custom Rust generation, procedural Three.js
   construction, and unexamined Blender exports.

## Cel Shift Art Sources Added to the Plan

The source/size audit established that `midcreek-concept` is the complete
upstream direction, while `midcreek/docs/artwork` mirrors its full-resolution
artwork but omits the shared prompt bases. The primary source contains 49
1536 x 1024 masters and 49 1280 x 720 preview counterparts; the game catalog's
49 masters, metadata, prompts, and manifest match the concept versions exactly.

The user selected the full Cel Shift set with size checks to avoid duplicate
copies. The future import therefore takes one master per artwork, all required
shared foundations and prompts, and reviewed provenance, but not the preview
images or a second copy from Midcreek. No artwork has been copied.

The source overview has stale statements: it says 45 plates and describes an
axis-aligned camera, while the tracked catalog has 49 masters and the accepted
projection decision specifies diamond framing. The foundation and art bible
document the corrected approximately 35-degree elevation; historical render
metadata can still contain the superseded 55-60-degree instruction. These must
be treated as different versions of evidence, not silently merged.

See [the full source and picture-size audit](cel-shift-source-audit.md) for
the master-by-master inventory and dependency findings.

The remaining work and its acceptance criteria are in [the plan](../../plan.md).
