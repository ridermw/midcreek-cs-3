# Initial Research Findings

Updated September 10, 2026 for completed R1 research and R2 technical proof.
These findings extend and correct the preparatory research. The comparative
sections retain R1's dated observations; the
[R2 result](#r2-result-reproducible-bounded-exportload-proof) records fresh
execution, appearance limits and reproduction instructions.
The subsequent plan-exit review consolidated the original seven stages into
the three execution units now defined in `plan.md`; this document remains the
home for the comparative explanation.

Source labels E1-E7 refer to [the evidence index](evidence-index.md). Code,
plans, manifests, commit histories, and GitHub discussions were inspected.
**Source observations**, **historical reported results**, and **inference**
are distinguished below. No executable checks were performed **during R1**: no tests,
builds, benchmarks, validators, Blender jobs, export probes, or browser runs.
Previously recorded image/hash measurements were not repeated.

R1 was approved by the user on September 10, 2026 at commit
`5ceac6f4d4e2f3357b27990d8badf39c4e34240c`. R2 scope is authorized, but its
separate output/resource approval was initially missing. The later approved
allowance enabled the completed R2 proof below; user review of R2 remains pending.
The immutable handoff
remains a planning-session snapshot. In particular, its prompt-only description
of Street Scene Showcase is historical: newer tracked guards and untracked
viewer/exporter work were visible at intake, and its checkout advanced again
before closure. The evidence index pins each observation; none is qualified
as a CS3 export result. R2 evaluates an independent bounded CS3 probe, not that
changing sibling implementation.

## Main Distinction

| Project | Built product | Geometry pipeline | Runtime / output |
| --- | --- | --- | --- |
| CS1 | Cel Shift data-hall technician/repair POC | Declarative RON -> custom Rust tessellation/rigging -> committed GLBs; explicitly no Blender | Bevy native and browser WASM |
| CS2 | Smaller reproducible Cel Shift repair game | Procedural and instanced geometry created in Three.js | Three.js/WebGL2 browser game |
| Street Scene One | Editable animated street scene and selected five-second video | Python scene/geometry construction in Blender, packed permitted materials | Cycles/Metal frames -> FFmpeg MP4 |
| CS3 | Not implemented | Blender/Python-authored assets -> validated GLB | Planned TypeScript/Three.js runtime; no Rust |

Sources: E1 `docs/implementation-plan.md`, `src/assetgen.rs`, `src/lib.rs`;
E2 README, architecture and hill-climb documents; E3 README and construction
script. E4's newer source boundary is described below.

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

**Source correction:** the actual Pages workflow runs Build web with
`if: always()` after Verify, not only after successful verification as older
prose says. Promotion is separately gated. Site assembly keeps playable and
evidence retention independent, rejects a successful projection lacking its
frames/gallery, and prevents degraded output from replacing either retained
domain. It validates retained provenance before reconciliation.
Sources: E1 `.github/workflows/pages.yml:293-304`,
`src/sitegen.rs:2758-2939,2985-3115`,
`tests/pages_assembly_contract.rs:681-703,2645-2744`.

**Historical server records:** run `33565165791` corroborates Verify failure
with successful web build/publication. At remote tip, run `33590215810`
attempt 2 passed Verify/Build web but failed Deploy Pages because two artifacts
shared the `github-pages` name. This is a delivery failure, not a game-test
failure. The inspected CS1 Actions artifacts are now expired.

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

The milestone table preserves historical commit subjects; R1 additionally
read the pivotal corrective diffs below. Full identities are in E1's evidence
index. Reconciliation found identical production source but different test
policy: local has one license-only commit above the common ancestor; remote
has three commits covering test quarantine and documentation. No checkout was
changed to obtain that conclusion.

### Corrections that matter more than the milestone list

**Source observations:**

| Correction | What failed in the original approach | Contract worth carrying forward |
| --- | --- | --- |
| Skinning, `6f8a5cb` | Bind-origin displacement was applied twice, while a compensating test formula concealed the consumer-visible error | Test the actual hierarchy and joint-transform/inverse-bind calculation, not a generator's self-consistent substitute |
| Clip transition, `2aa9142` | `Repair -> Walk` retained transforms on bones the next clip did not animate | Restore all captured rest transforms on actual clip changes; do not restart a clip already playing |
| Asset readiness | A valid GLB and scene name alone did not prove the intended scene would spawn | Bind declared module name, scene index, and spawned handle; fail before world creation on disagreement |
| Measurement review, `b96ebde` | Asymmetric diagonal evidence, undefined ratios represented as zero, and missing analyzer provenance could mislead acceptance | Require evidence in both line families, expose role-specific metrics, represent absent ratios explicitly, and bind analyzer inputs |
| Pages review, `4bff384` | Partial or degraded evidence could overwrite trusted retained state | Validate complete sets and provenance before promotion; preserve distinct current-status and last-good outcomes |

Sources: E1 `tests/asset_contract.rs:1040-1165`,
`src/player.rs:907-962`, `src/assets.rs:439-562`,
`tests/app_contract.rs:1669-1735`, `src/metrics.rs:430-697`;
`ridermw/midcreek-cs-1#4` and `ridermw/midcreek-cs-1#5`.

Operations update before movement, so repair lock precedes player movement.
Zero-time render pumping does not advance gameplay timers, while real input
edges can still be processed. Scheduler candidates are retained rather than
rerolled when unavailable. These ordering principles transfer; CS1's diagonal
movement and repair lock do not override CS3's settled CS2 behavior.
Sources: E1 `src/lib.rs:30-75`, `src/operations.rs:509-680,1083-1300`,
`src/player.rs:850-962`.

### Fidelity, measurement, and reproducibility limits

**Source observation:** the Phase 2 plan explicitly responds to automated
success without the desired appearance. Its M0.5 amendment puts a first
visible improvement before costly milestone hardening. Its approximately
fifteen-hour retrospective is an author-reported duration, not a new
measurement. Sources: E1
`docs/plans/2026-08-31-1507-feat-phase-2-hill-climb-plan.md:30-56,196-202,555-747`.

The camera derivation commit changed elevation to about 36.09849 degrees and
coverage to 77 m, but the common-ancestor revert restored 57 degrees and the
72 m apron. No reason was found in the revert message. Meanwhile
`docs/reference/fidelity.json` remains explicitly unfrozen and still describes
camera derivation, contradicting the reverted runtime. The golden reference's
recorded mean linear luminance is about 0.3922, below the policy minimum 0.48.
**Inference:** copying that gate would reject its own positive reference;
calibration against approved examples must precede optimization.
Sources: E1 `src/design.rs:17-27,99-140`,
`docs/reference/fidelity.json:1-20`,
`tests/fixtures/metrics/key-art.json:1-15`, camera/revert diffs.

The verification application reuses production scene logic but chooses
synchronous compilation and a downlevel software-renderer profile. Source
provenance lists selected inputs, not every influencing file: the list omits
`src/reference.rs`, fidelity policy/reference manifest, and `src/lib.rs`'s
render configuration. This is an inspected list, not a mutation test.
Sources: E1 `src/lib.rs:109-220`, `src/verification.rs:3503-3535`.

**Historical result:** open `ridermw/midcreek-cs-1#7` reports moving pixel
differences across several frames and later Linux reproduction, leading to
two unconditional ignored contracts on remote main. Another intermittent
animation-crop case remains active; a single-capture category-mask failure is
not automatically the same readback defect. No universal root cause is proven.
The retained baseline's frame hashes identify saved artifacts, not reproducible
recapture bytes. Structural correctness, pixel stability, fidelity, and user
acceptance must remain separate outcomes.

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

Source: E2 `src/app/game.ts`.

### Exact reuse boundary: simulation is not held-key walking

**Source observations:** the 17-by-15 grid has four rows of eight racks;
breadth-first routing uses a fixed left/up/right/down neighbor order. Movement
advances on global ticks divisible by five, not five ticks after each command.
Repair starts on dispatch arrival at zero progress and then takes 120 work
ticks; the arrival tick does not also count as work. Walking to the service
cell manually remains idle until dispatch. A valid manual move cancels repair;
invalid/same-cell commands return messages without cancelling it. Repeated
dispatch does not reset active work, and resolved travel stays resolved.
Sources: E2 `src/world/layout.ts:1-124`,
`src/world/simulation.ts:5-7,136-302`,
`src/world/simulation.test.ts:115-269`.

Snapshots are deeply frozen, with unchanged route identity retained between
movement steps. Dispatch intent is a non-enumerable Symbol on the snapshot.
**Inference:** JSON serialization is not a save/restore contract; round-tripping
the visible snapshot would lose intent. Replay means reproducing seed,
commands and ticks, not inventing a persistence layer in R1.
Source: E2 `src/world/simulation.ts:12-82`.

The keyboard helper supports arrows and WASD at all four headings, but
`game.ts` emits a destination on each **keydown**. Movement is processed
before the `event.repeat` guard, and there is no held-key/keyup adapter.
Thus OS repeat still drives continued walking. The unit test samples W at
four headings and ArrowRight once; the browser navigation case presses W,
not a held-arrow matrix. The approved CS3 adapter is a real behavior addition,
not an existing verified CS2 feature.
Sources: E2 `src/input/keyboard.ts:1-23`, `src/input/keyboard.test.ts:1-11`,
`src/app/game.ts:182-225`, `tests/e2e/evidence.spec.ts:53-74`.

The accumulator caps each frame's catch-up at 0.25 seconds and clears on
visibility changes; no hidden-tab fast-forward is intended. Camera/input,
snapshot presentation, read-only inspection, explicit context-loss reload, and
Set-deduplicated GPU disposal are reusable patterns. They are not yet an
asynchronous GLB loading, shared-instance lifetime, or animation contract.
Sources: E2 `src/app/game.ts:226-256,314-342,384-416`.

### What the procedural appearance does and does not prove

The hall batches boxes/panels into color-keyed `InstancedMesh` groups, combines
outline segments, merges coolant tubes, and generates text textures in Canvas.
Toon materials use a two-entry nearest-filter gradient. The technician is
assembled from cylinders and a hemisphere; the app changes its cell position,
not rigged walk/repair poses. No Blender assets or animation clips are involved.
Sources: E2 `src/engine/geometry.ts:30-121`,
`src/engine/hall.ts:23-205`, `src/app/game.ts:337-353`.

**Inference from source comparison:** this is a selective art-direction
interpretation, not complete reference fidelity. For example, the source
draws floor seams although the corrected foundation calls for plain concrete;
CS2's 1.65 m technician constant is not either corrected Concept character
height. Preserve the gameplay core without treating every procedural shape,
palette value, scale or layout spacing as the future Blender visual authority.
Sources: E2 `src/engine/hall.ts:64-66`, `src/world/layout.ts:3-8`;
E6 `themes/_shared/foundation.md:66-89`.

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
the published build. R1 re-queried their server metadata and the tip's later
Pages/Quality runs `33924944955` / `33924945020`; all report success. This
corroborates historical workflow status, not a fresh live-site acceptance run.

Source: E2 `docs/hill-climb.md` and `docs/architecture.md`.

### Evidence qualifications for the cache result

The pinned source disables default-framebuffer antialiasing while the static
render target uses four samples. Thus "four-sample antialiasing" describes the
cached hall, not necessarily every dynamic edge. Restored color/depth and
per-frame dynamic rendering are directly visible in `hallCache.ts`; invalidation
only compares camera projection/world matrices and drawing-buffer size.
Source: E2 `src/app/game.ts:50-54`, `src/engine/hallCache.ts:24-95`,
cache commit `7ce1aa3`.

The active-repair JSON has 300 samples and a `dac6940-dirty` build stamp, not
an exact clean candidate revision. The timing test dispatches, waits 300
animation callbacks, and checks actual rendered-frame growth, but does not
record/assert repair state for every sample. Retain its historical
**dispatch-plus-repair window** label; it does not establish 300 exclusively
repairing frames. The first-window and warm-up results remain separate from
navigation startup; `startupMs` starts inside `startGame` and excludes earlier document/
module loading. Sources: E2 `docs/evidence/07-cached-active-repair.json:1-34`,
`tests/e2e/performance.spec.ts:1-55`, `src/app/game.ts:42-43,374-382`.

CI uses Node 24, a production build and expected build identity; Playwright
uses one worker. The timing test skips without `CHECK_FRAME_TARGET`, and
the fixed-pixel cache comparison skips outside Windows. Ubuntu workflow
success therefore does not mean all nine Windows/timing cases ran.
Source: E2 `.github/workflows/{quality,pages}.yml`,
`playwright.config.ts`, `tests/e2e/render-cache.spec.ts:6-13`.

CS2's transfer cutoff deliberately ignores requests after `loadEventEnd`,
and its browser regression asserts that behavior. **CS3 adaptation required:**
required GLBs may arrive after that event. Freeze game startup transfer only
after required assets and the first interactive rendered state are ready;
keep later gallery activity separate. That is the existing plan's requirement,
not a loader or metrics change implemented here.
Sources: E2 `src/app/game.ts:288-293`, `tests/e2e/evidence.spec.ts:44-51`.

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

The public showcase's original publication commit is `1538d86`. At preparation,
its extension prompt was untracked and no exporter/viewer was found. R1
observed newer tracked precondition work at local `7024553` and untracked
exporter/material-conversion/viewer files. Those are independently evolving
sibling work, not something R1 built or validated. The tracked checkpoint
explicitly stops before GLB export; no compatible viewer outcome is established
by this research. See E4's dated local/remote distinction in the evidence index.

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

### Ownership and acceptance guards, read in detail

**Source observations:** the supervisor creates a new process session and
records its owned PID; on interruption it terminates that process group,
escalating from TERM to KILL after two seconds. The nonblocking file lock
serializes cooperating jobs using the same `heavy.lock`, not every Blender
process on the machine. Pause is cancellation that preserves checkpoints,
not suspension/resumption of a live process. Deadline/pause are polled about
every 0.1 seconds and storage about once per second; the CLI reserves five
minutes for closeout. Forecasting includes representative worst-frame cost,
retry/storage allowances and encoding time.
Sources: E3 `pipeline/job.py:23-88`, `pipeline/runtime.py:8-33`,
`pipeline/capture.py:24-35`.

Capture checks scene identity, original versus capture ownership, actual Metal
availability and packed dependencies. Resume rejects mismatched scene/frame
fingerprints, changed PNG hashes and incomplete PNG/JSON pairs. Anchor captures
are frames 1/61/120; the reduced motion sample is only frames 1-12, not the
entire animation. Sources: E3 `blender/render_scene.py:31-99`.

Review records bind image hashes, scene/reference fingerprints and critic
instruction version. Fingerprints include resolved absolute paths, so they
are not inherently relocation-invariant. Neutral labeling and equal image
preparation reduce reviewer bias, but the generic delivery gate only checks
accepted current fingerprints and capacity: it does not itself inspect images
or authenticate an independent critic. The final-selection diff explicitly
replaced independent-reference acceptance wording with design acceptance.
Sources: E3 `pipeline/evidence.py:18-80`,
`tools/label_packet.py:13-33`, `prompts/image-critic.txt:3-27`,
`pipeline/capture.py:39-51`, `db07a4a -> d107a44` diff.

The encoder checks ordered scene-bound frames, image hashes, dimensions, rate,
and decoded count, and refuses overwrite. It requests duration but does not
explicitly assert it. These technical gates cannot establish visual fidelity.
There is an unresolved source/delivery discrepancy: `tools/encode_video.py:22-25`
specifies `bt709` transfer, while E5 `delivery/video-inspection.json:8-17`
records `iec61966-2-1` and `REPORT.md:44-46` describes sRGB transfer. Do not
claim the checked-in helper alone reproduces every delivered encoding detail.

### Concrete Blender portability questions exposed by source

Street geometry batches boxes/rods by material, with optional bevels.
Brick/asphalt use world-position-scaled BOX projection, color multiplication,
roughness textures and displacement-driven bump; the carbon material uses a
procedural checker. Parked-car plate lettering includes FONT curves rather
than only mesh objects. The hero uses recalculated normals, smooth shading and
selective bevels. Packed files remove some external dependencies, but do not
make these node graphs or object types automatically portable.
Sources: E3 `blender/street.py:22-108`, `blender/hero_car.py:72-121`,
`blender/parked_cars.py:447-471`. Export treatment remains untested in R1.

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

R1 additionally read the selected approval, decoded-video inspection,
repeat-capture and editing-copy receipts. **Historical results:** approval
records user selection with independent reference acceptance false; decoded
inspection reports no detected black/freeze events; repeat captures were
not pixel-identical; a separate editing copy reopened the intended controls.
The retained source review recommended shipment but was a single review,
exceeded its requested review time, and retained owner-default/test-coverage
limitations. The capture allowance expired September 9, 2026 at 13:33:48 UTC,
with heavy jobs stopping by 13:28:48 UTC. None of those permissions is reusable.
Sources: E5 `attempt-23/approval.json:2-20`,
`delivery/{video-inspection,repeat-capture,editing-verification}.json`,
`delivery/REPORT.md:98-163`, `delivery/source-review.md`.

GitHub has no returned E3/E4 PR, issue or commit-comment review threads.
E3 has no returned Actions runs; E4's two successful Pages runs demonstrate
publication only. Neither substitutes for the retained technical/visual
receipts or for an actual browser conversion result.

## Proposed Blender-to-Three.js Boundary

The preparatory local showcase prompt proposed:

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
been implemented or proven by R1. Newer sibling source is not an R1 result.

The planned probe must inspect geometry/modifiers, packed textures, shader
translation, axes/scale, camera/light export, animation duration, clip behavior,
and payload/performance. The final video has 120 frames at 24 FPS; the temporal
mapping of first/last Blender keyframes into a runtime clip must be verified
rather than inferred from the video's five-second duration.

Source: E4 preparatory untracked `THREEJS-SESSION-PROMPT.md`; E3 construction script.

**Newer source observation:** E4's tracked precondition checkpoint specifies
time as `(frame - 1) / 24` and a final-pose hold through five seconds.
This reconciles the intended 120-frame video duration with the earlier final
keyframe time, but remains intent, not observed exported clip behavior.
Sources: E4 `tools/export_contract.py:22-26`, `README.md:101-104` at
`7024553a797997c0e06689ebcc176e6e126173a2`. The untracked implementation
must not be silently promoted to the evaluated candidate.

## Source-Backed CS3 Conclusions

These conclusions support the settled plan; they do not introduce a new
architecture or constitute the R3 blueprint.

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

The corresponding contracts and exclusions are:

| Concern | Preserve or require | Do not inherit as an established CS3 result |
| --- | --- | --- |
| Gameplay | CS2 seed, fixed tick, ordered routing, immutable snapshots, arrival/repair/cancellation, pause/restart messages | CS1 recurring-ticket breadth, repair lock or diagonal motion; JSON snapshot persistence |
| Input | CS2 heading mappings and command boundary, with the already-approved fixed-tick held-arrow behavior | OS-repeat-driven walking or W-only browser coverage as proof of held arrows |
| Layout/assets | Runtime-owned IDs, collision and placement; explicit template bounds and loader bindings | A separate Blender gameplay map or structural GLB success as correct scene selection |
| Animation/ownership | Declared clips, transition/rest-pose behavior, independent instance state and shared-resource owner | CS2's static technician as animation proof, or scene-wide teardown as safe per-instance disposal |
| Visual direction | Corrected Concept prose and JSON, role-specific calibrated evidence, matched browser captures | CS1's reverted 57-degree view or global luminance gate; historical prompt claims as current truth |
| Performance | Actual rendered work, peak/steady costs, named hardware, startup versus sustained windows | Universal 60 FPS, clean-revision timing from dirty stamps, or static cache validity for animated imports |
| Delivery | Complete atomic evidence/package promotion, explicit failure, public allowlist | Successful Pages deployment as export, fidelity, permission or hardware qualification |

Evidence: the E1/E2/E3 sections above; E6's dependency/provenance contract in
the [source audit](cel-shift-source-audit.md); settled plan decisions 1A-17A.

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

R1 read the correction PRs as well as source. Concept PR 2 explicitly retained
older-scale scene plates while correcting future prompt inputs and restoring
the male animation sheet from older history. Therefore the full catalog is a
historical reference set, not 49 equally current acceptance oracles. Concept
PRs 1/2 contain author-reported local checks; their Copilot review records are
hosted-runner failure notices, not completed automated review. The audit
documents exact shared-base associations, sidecar limitations, and publication
blockers without copying operational metadata.

## Unresolved Questions and R1 Hard Stop

Questions below record evidence gaps only. They are not R2 preparation,
an executable procedure, task delegation, a schedule, or permission to proceed.

| Question | Evidence now | Boundary before an answer can be claimed |
| --- | --- | --- |
| Which immutable scene/exporter/viewer candidate will be evaluated? | Retained scene digest and newer E4 guards; the sibling implementation advanced during R1 | User-authorized R2 and new resource/output approval; fresh identity checks remain unperformed |
| What geometry/material content survives export? | BOX projection, bump, procedural carbon, bevels/normals, FONT curves, Cycles sky/light-path setup in source | R2 must establish actual evaluated content, bindings, appearance differences and payload, not infer them from source |
| Does animation/camera playback preserve matched poses and timing? | Frames 1/120 and newer final-pose-hold intent | Actual export/load comparison in authorized R2; five-second video duration alone is insufficient |
| Which color interpretation matches the retained output? | Encoder-source BT.709 versus delivery sRGB-transfer discrepancy | Resolve provenance and compare appearance under approved execution; no silent assumption of Cycles/AgX equivalence |
| Is a candidate technically usable and visibly accepted? | Historical user selection did not pass reference fidelity; current browser result is unqualified | Separate declared-content/load/failure evidence, visual comparison and user acceptance; no R1 claim |
| May all artwork, prompt material and derivatives be published? | Complete reference selection, sensitive sidecar field categories, no catalog-wide grant established | Explicit reviewed provenance/publication approval; CS2's limited reference terms are not a grant for a new derivative gallery |
| Which prompt revision produced each retained image? | Forty-nine masters, forty-seven current prompts, historical expanded sidecars and restoration history | Preserve unresolved associations honestly; a future manifest must not manufacture one-to-one prompt provenance |
| What performance and held-input claims can CS3 make? | CS2 dirty-candidate historical timing; no full held-arrow coverage; delayed-asset accounting gap | Later authorized implementation/qualification under the existing plan, not an expansion of R2 into a game build |

**R1 limitations:** this was targeted source research, not an exhaustive code
audit or legal opinion. No large scene/video was reopened, decoded, rehashed,
rendered or exported. No local planning-file digest was newly established.
No browser artifact archive was downloaded; retained source records and
GitHub job metadata are identified separately. Neither missing evidence nor
successful historical jobs waive later gates.

Both R1 research workers finished; documentation has one owner. R1 changed no
sibling source or artwork and performed no executable checks.

## Historical R2 Intake Checkpoint: Resource Approval Blocked

On September 10, 2026, local Git inspection confirmed the reviewed R1 commit
`5ceac6f4d4e2f3357b27990d8badf39c4e34240c` is retained on
`docs/r1-research`; the intake worktree was clean. No reset, checkout change,
or discard was needed. The user's R1 approval satisfies `approve-r1` and
authorizes R2 scope only.

The request and plan contain no explicitly approved external output location,
fresh time/disk limits, or recovery reserve. Those permissions were requested,
but the user was unavailable. No defaults or expired Street Scene allowances
were substituted. R2 is **blocked before execution**, not complete and not a
reproducible incompatibility.

No probe code, installs, asset copies, source rehashes, exporter reuse,
Blender/browser runs, or generated artifacts exist from this checkpoint.
All declared-content, material/FONT-curve, timing, color-management,
repeatability, matched-view and failure-injection checks remain unexecuted.
The validation loop remains the approved R2 contract: owned source copy,
bounded export, structural/semantic checks, actual Three.js load and matched
views, fresh repeat, then negative cases preserving the last complete evidence.
There is no executed reproduction procedure to report yet.

The existing questions above remain unresolved; historical identities and
sibling implementation observations have not become fresh runtime evidence.
No R2 workers or owned long-running processes were launched. Siblings and
accepted artifacts were not modified. No material was published or pushed.
`approve-r2` remains blocked pending actual user review. R3 has not been
started, prepared, scheduled or delegated.

That intake blocker was subsequently resolved by the explicit allowance below.

## R2 Result: Reproducible Bounded Export/Load Proof

**Fresh observation, September 10, 2026:** R2 demonstrates both a working
adapted Blender-to-GLB-to-Three.js boundary and a specific direct-material
export incompatibility. This completes the technical proof, **not user
acceptance of its appearance**. `approve-r2` remains blocked. No R3 work,
blueprint, game, full-street viewer, reference import, push or deployment occurred.

### Permission, Inputs and Scope

The user approved 90 minutes, with the final ten reserved for closeout; 4 GiB
additional disk including a 512 MiB recovery reserve; a 10 GiB free-space floor;
and one heavy job at a time. Execution began **19:26:51 UTC**; heavy work must
stop by **20:46:51 UTC**, with absolute closeout by **20:56:51 UTC**.
The user's subsequent location amendment put generated output **inside CS3,
Git-ignored**, at `.artifacts/r2/20260910T192651Z/`. It did not restart the clock.
`guard.py` serializes jobs, checks deadlines/disk, bounds each invocation,
records failures and terminates only its owned process group. All dependencies,
temporary browser profiles, scenes, GLBs, captures and logs are in that root.

The retained `attempt-23/scene.blend` was freshly hashed against R1's recorded
SHA-256, copied with identity checks, and never opened directly in Blender.
The accepted original and owned input remained unchanged. The considered
showcase scripts exactly match commit `3298bec1b1a853ada041d33576296ba910142a8f`
at their recorded hashes, but were **not reused**: they require a full-scene
inventory and seven textured groups. The sibling advanced independently during
R2; its later tip is not the evaluated dependency. The evidence index preserves
both dated observations. Sibling files were not written.

The independent `probes/r2/` procedure selects these eight objects:

| Retained source name | Exported role | Treatment |
| --- | --- | --- |
| `Hero car path` | `Hero` | Animated parent transform |
| `Hero.FrontL.Hub` | `Wheel` | Animated wheel transform/pivot |
| `Hero.FrontL.Rubber tire` | `Tire` | Selected mesh/material unchanged |
| `Hero.FrontL.Split spoke 0 -1` | `Spoke` | Asymmetric spoke makes rotation observable |
| `Hero.Floating red roof` | `Roof` | Lacquer/clearcoat material |
| `Hero.Broad rising diffuser tray` | `Carbon` | Procedural-material probe |
| `Original market sign` | `Sign` | FONT curve/text geometry probe |
| `Brick facades 0` | `Brick` | First connected box: eight vertices, six faces only |

The GLBs contain **8 nodes, 6 meshes, 6 materials, 4,764 triangles and one clip**.
The adapted GLB contains two embedded 256x256 images. Geometry uses meters and
Blender `(x,y,z)` to glTF `(x,z,-y)` axis conversion; hierarchy/pivots are retained,
not recentered. The reconstructed neutral studio is deliberately not the
delivered street's sky, lighting or composition.

### Actual Outcome and Feature Classification

| Feature | Classification | Fresh evidence and limitation |
| --- | --- | --- |
| Selected static geometry, hierarchy, units, pivots and poses | Preserved within measured tolerance | Local/world matrices and evaluated mesh bounds at frames 1, 61 and 120 pass `2e-4`; maximum matrix error `1.534963303573278e-6`, bounds error `1.2819192853896766e-6` m |
| Selected animation | Preserved for declared samples | `Manhattan Rear Chase`, 24 fps, frames 1-120; actual duration **119/24 = 4.958333... s**, not five seconds; a 5 s browser sample clamps to the final pose |
| Lacquer, tire, spoke and sign PBR values/bindings | Preserved as exported parameters | Base color, metallic, roughness and clearcoat values are checked; this does not establish pixel-equivalent shading |
| FONT sign | Export-supported; explicit mesh in adapted sample | Direct `export_apply=True` already exports the FONT as mesh; adapted path explicitly converts it; glyph/extrusion bounds pass |
| Brick source graph | Direct export unsupported in this configuration; reconstructed/approximated adaptation | Direct GLB has three invalid `texCoord: -1` references; adapted base color is baked to a UV atlas, roughness fixed to 0.65 and original bump omitted |
| Procedural carbon | Direct graph unsupported; reconstructed/approximated adaptation | Direct GLB has no base-color texture; adapted base color is a 256x256 bake with explicit UVs, fixed roughness and no source bump |
| Street lighting and composition | Not preserved or qualified | Neutral studio with matched camera/time replaces the original environment; this is not a whole-scene reconstruction |
| Source look / Cel Shift fidelity / performance | Not accepted or qualified | Visible material differences remain; no game budgets or Cel Shift catalog were exercised |

The two independent export directories, `run-d` and `run-e`, contain
byte-identical `portable.glb` (265,352 bytes) and `direct.glb` (3,066,148 bytes).
The adapted artifact has **zero validator errors and zero warnings**, plus one
informational unused sign UV attribute. The direct artifact has **three
`VALUE_NOT_IN_RANGE` errors** on the brick material's base-color,
metallic-roughness and normal `texCoord` fields, plus one tangent-generation
warning. Successful Blender export alone therefore does not prove a valid GLB.
Exact output identities and versions are in the evidence index.

### Readiness, Animation and Failure Checks

Each fresh Chrome process actually runs Three.js `GLTFLoader`, waits for decoded
textures, checks exact image/material/UV/color-space bindings and clip metadata,
renders a nonempty first declared view, and finishes GPU work before `ready`.
The initial view records four draw calls / 4,164 triangles because it shows the
selected hero parts, not every mesh in the sample.

Both final `checks-3.json` receipts passed these **16 named checks**:

1. Adapted Khronos validation.
2. Direct export incompatibility, missing procedural-carbon texture and FONT mesh support.
3. Declared nodes/parents/triangles/materials/UVs/images/clip.
4. Invalid declared content rejection.
5. Real loader readiness and bindings, including a completed nonempty first frame.
6. Local/world transforms, pivots and bounds at frames 1/61/120.
7. Five-second sample clamps to the 119/24-second final keyframe.
8. Ten matched camera/viewport/time browser captures with actual pose checks.
9. Ten three-way appearance comparisons, explicitly **not an acceptance gate**.
10. Missing GLB fails explicitly.
11. Corrupt GLB fails explicitly.
12. Missing required texture fails explicitly.
13. Invalid declared node fails before attachment.
14. Disposal during a delayed real load prevents attachment and releases the late asset.
15. Timeout remains failed after late real completion and releases that asset.
16. A superseded delayed request cannot attach over or dispose the newer ready request.

The final Python suite passes **6 tests**; the Node suite passes **7 tests**,
including exact texture-image mismatch rejection and first-frame attachment
failure. `negative-evidence-final.json` separately records **3 real checks**:
wrong source hash rejected before copying, corrupt candidate refused promotion,
and SIGINT of the owned supervisor with its child reaped. Each leaves the
previous `last-complete.json` bytes unchanged. The guard/promotion code has no
placeholder-as-success branch. Expected 404/missing-image diagnostics are
retained; no uncaught page error or unexpected external asset request occurred.

The initial bounds discrepancy was an oracle defect, not missing FONT content:
the raw FONT `bound_box` excluded its +/-5 mm extrusion, while evaluated mesh
vertices included it. The corrected oracle uses those vertices, with unchanged
tolerance. Independent animation samples reset/play the action because a
clamped `LoopOnce` action remains paused after reaching its end; setting mixer
time alone had produced stale earlier poses.

### Appearance and Color Management

For each view, the contact sheet is **source material in Blender / adapted
material in Blender / adapted GLB in Three.js**, in that order. Cameras,
orthographic framing, visible objects, time and 640x360 viewport are matched.
Blender uses a CPU Cycles studio; Three.js uses a directional light and a
constant PMREM environment so metallic parts are not evaluated without reflected
environment. These lighting implementations are approximations, not identical
integrators.

The baseline preserves Blender AgX / Medium High Contrast / exposure 0.3 and
uses Three.js AgX / exposure `2**0.3` / sRGB output. A second brick view pairs
Blender Standard / None / exposure 0 with Three.js NoToneMapping / exposure 1.
Adapted-Blender/browser foreground RGB mean absolute error is **15.924/255**
in the AgX comparison versus **2.001/255** in the Standard comparison. This
demonstrates a substantial color-pipeline contribution, not complete equivalence
or a general recommendation to disable tone mapping.

**Material baking is not appearance-preserving here.** Brick frequency/detail
and carbon weave visibly differ. The corrected supplemental emission diagnostic
at `run-e/emission-diagnostic-2/` removes roughness, bump and lighting from the
comparison and still shows source/adapted differences. The exact source-coordinate
reconstruction / finite-atlas loss mechanism remains unresolved. Do not attribute
all appearance differences to color management.

The recorded `silhouetteIoU` uses a background-color threshold, **not semantic
geometry masks**; dark metallic/carbon shading can lower it despite correct
geometry. Use the separately checked matrices/bounds for geometric claims.
No cross-GPU pixel-equality threshold, visual approval or whole-game performance
claim is inferred from these measurements.
Execution was on macOS; the guard uses POSIX locks/process groups. Windows
execution and cross-platform appearance have not been qualified.

### Reproduction Procedure

Run from this checkout with the original retained input available. **A new
explicit allowance is mandatory for another run**; the dated allowance above
is not reusable permission. Agree on a fresh ignored root, new UTC start/work/
closeout deadlines, disk cap, reserve and free-space floor. Create that root's
`allowance.json` using the same field schema as the retained receipt
(`root`, `started_utc`, `work_deadline_utc`, `closeout_deadline_utc`, `max_bytes`,
`reserve_bytes`, `min_free_bytes`, `max_heavy_jobs`), with absolute root and
newly approved values. Keep one heavy job at a time.

The following commands assume `ROOT` is exported to that approved **absolute**
path, its allowance exists, and Blender, Node, Python and installed Chrome match
the versions in the evidence index. They deliberately use fresh run/job names.
For a checkout with an existing `probes/r2/node_modules` symlink, stop its owned
jobs and explicitly repoint only that ignored symlink; do not overwrite an
unrelated dependency directory.

```sh
(
set -eu
mkdir -p "$ROOT/toolchain" "$ROOT/tmp"
cp probes/r2/package.json probes/r2/package-lock.json "$ROOT/toolchain/"
python3 -B probes/r2/guard.py --allowance "$ROOT/allowance.json" \
  --name dependencies --seconds 180 -- \
  npm ci --prefix "$ROOT/toolchain" --ignore-scripts --no-audit --no-fund
ln -s "$ROOT/toolchain/node_modules" probes/r2/node_modules

python3 -B probes/r2/guard.py --allowance "$ROOT/allowance.json" \
  --name source-copy --seconds 30 -- \
  python3 -B -c 'import sys; sys.path.insert(0,"probes/r2"); from guard import verified_copy; verified_copy(*sys.argv[1:])' \
  ../street-scene-1-data/run-20260909T124848Z/attempt-23/scene.blend \
  "$ROOT/source.blend" \
  0e4c90b1ab5bcfb052d2f5d2c5c4628a89b5b7145f6b6e9bf399d7f31cda4d05

TMPDIR="$ROOT/tmp" python3 -B -m unittest discover -s probes/r2 -p 'test_*.py'
node --test probes/r2/*.test.mjs

for RUN in run-1 run-2; do
  python3 -B probes/r2/guard.py --allowance "$ROOT/allowance.json" \
    --name "export-$RUN" --seconds 360 -- \
    blender --background --factory-startup --disable-autoexec \
    --python-exit-code 1 --python probes/r2/export_sample.py -- \
    --source "$ROOT/source.blend" --output "$ROOT/$RUN"
  python3 -B probes/r2/guard.py --allowance "$ROOT/allowance.json" \
    --name "browser-$RUN" --seconds 180 -- \
    node probes/r2/check.mjs "$ROOT/$RUN" checks
done

python3 -B probes/r2/promote.py --root "$ROOT" --runs run-1 run-2 --tag checks
python3 -B probes/r2/negative_evidence.py --root "$ROOT" --label final
)
```

Stop on any failure rather than promote or continue; inspect the named job
log/receipt. Promotion independently refuses incomplete, stale-code or changed
artifacts. The negative-evidence script must **not** be nested in another guard,
because it starts its own guarded interruption job. Export output directories
must be new and share the owned source's approved parent root. Keep
`--python-exit-code 1` **before** `--python`. Chrome is launched via Playwright's
installed `chrome` channel; this procedure neither downloads a browser nor
requires a global npm install. The Node server binds loopback and closes on exit.

Review the generated `export.json`, `checks.json`, validator reports, comparison
PNGs, `last-complete.json` and negative-evidence receipt. Rehash the accepted
original afterward; record resource usage and verify every recorded job PID/
process group has ended. Preserve both completed and failed evidence. Any new
appearance investigation or broader qualification needs separate authorization;
these commands do not authorize R3.
