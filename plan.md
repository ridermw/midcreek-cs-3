# Mid Creek CS3 Research and Blueprint Plan

**Reviewed:** September 10, 2026, using plan-exit-review.
**Scope choice:** 0A, scope reduction. Preserve the product goals; consolidate the work and documents.
**Execution state:** Planning and review complete; R1-R3 below are pending.

**Goal:** Explain how CS1 and CS2 were built, recover the full Cel Shift art
direction, understand Street Scene One's Blender workflow, prove a bounded
Blender-to-Three.js boundary, and produce one implementation-ready CS3 blueprint.

This plan produces a comparative explanation, a reproducible technical probe,
and the blueprint. It does not authorize implementation of the full game,
artwork copying, model generation, or deployment during this review.

**R1 is source research only:** search existing code, documents, and history,
then write source-backed conclusions. Executable experiments begin in R2,
not R1.

## CS3 Toolchain Decision: No Rust

CS3 uses **TypeScript, Three.js, DOM/CSS, Node.js/Vite, Vitest, Playwright,
and Python/Blender asset tooling**. There is no Rust, Cargo, Bevy, custom Rust
asset generator, or Rust-to-WASM build stage.

Rust/Bevy remain historical subjects in CS1 and Midcreek research. Read their
code and retained measurements without requiring their toolchains. Port useful
contracts and behavior, not crates or a language bridge. Rebuilding a
predecessor would be a separately requested investigation, never a CS3 gate.

Keep deterministic commands, seeded randomness, fixed ticks, explicit ordering,
immutable snapshots, and bounded numeric state in TypeScript. Prove replay
behavior with tests; changing languages does not preserve it automatically.
Measure actual browser performance rather than assuming that dropping Rust
improves or worsens it. Exact CS3 dependency versions are pinned in R2/R3.

## Settled Scope and Source Boundaries

- Reuse CS2's deterministic first-scenario core and behavioral tests.
- Make held arrow-key walking explicit; reuse existing key mappings and movement commands rather than introducing a second simulation.
- Use a shared TypeScript layout for placement/collision and Blender-authored reusable visual assets.
- Use Midcreek Concept as the primary art source; use Midcreek's identical masters only as a fallback/cross-check.
- Include all 49 Cel Shift masters, not every concept theme. Preserve early studies, headings, characters, faults, environments, and distinct revisions.
- Keep originals once at 1536 x 1024. Exclude the 49 alternate 1280 x 720 copies and the second repository's duplicate masters from the future import.
- Preserve shared foundations, the art bible, the projection decision, 47 prompts, the theme manifest, and reviewed provenance.
- Keep reference material separate from runtime assets. Approve public gallery derivatives separately from the private/unapproved source material that must never be published.
- Keep all sibling repositories and selected Street Scene artifacts read-only. Never execute the obsolete Blender/Unreal plan or reuse expired capture allowances.
- Never present export success, user acceptance, reference fidelity, and performance qualification as equivalent.

Master PNGs total **86,349,779 bytes / 82.35 MiB**. The full path, dimensions,
and hash inventory is in `docs/research/cel-shift-source-audit.md`; do not create
another hand-maintained live inventory.

### Pinned sources

| Source | Role | Evidence |
| --- | --- | --- |
| `williamsmat_microsoft/midcreek-concept` | Complete Cel Shift direction and prompt dependencies | E6 |
| `azure-core/midcreek` | Identical original artwork; incomplete copied prompt dependencies | E7 |
| `ridermw/midcreek-cs-1` | Rust/Bevy build history and asset/verification contracts | E1 |
| `ridermw/midcreek-cs-2` | TypeScript gameplay, browser tests, diagnostics, and performance history | E2 |
| `ridermw/street-scene-1` | Blender construction, capture, ownership, and evidence patterns | E3 |
| `ridermw/street-scene-showcase` | Existing publication and local proposed Three.js extension | E4 |

Full revisions, local/remote caveats, and Street Scene artifact hashes remain
authoritative in `docs/research/evidence-index.md`. The selected scene is
attempt 23. Its Three.js extension prompt is untracked planning evidence, not
proof of an existing viewer.

## What Already Exists

| Sub-problem | Existing source | Reuse rather than rebuild |
| --- | --- | --- |
| Historical explanation | `docs/research/initial-findings.md` | Complete its CS1, CS2, and Street Scene chapters and comparison in place |
| Source identities and caveats | `docs/research/evidence-index.md` | Finish pins, PR/review/workflow evidence, and provenance gaps |
| Full Cel Shift inventory | `docs/research/cel-shift-source-audit.md` | Keep as a dated audit; derive the future browsing index from one manifest |
| Simulation and commands | CS2 `src/world/contracts.ts`, `simulation.ts`, `layout.ts` | Retain the seeded single-fault behavior, fixed ticks, routing, repair, pause, and restart |
| Input mapping | CS2 `src/input/keyboard.ts` | Preserve mappings; add a fixed-tick held-key adapter and browser coverage |
| Behavioral/browser checks | CS2 world/input tests and `tests/e2e/` | Adapt relevant cases; do not import Windows-only screenshots as a cross-GPU oracle |
| Evidence and ownership | Street Scene `pipeline/evidence.py`, `pipeline/capture.py` | Adapt hash, ownership, and explicit-failure contracts into the bounded probe |
| Static hall optimization | CS2 `src/engine/hallCache.ts` | Study, but do not enable by default; its camera/size invalidation is insufficient for arbitrary animated assets |

## Architecture and Ownership

```text
Concept masters + shared direction
               |
       Blender visual assets
               |
     GLB + validated asset manifest
               |
        asset-library owner
     (shared geometry/materials/textures)
               |
       guarded load lifecycle
               |
          ready instances <------------------+
               |                            |
               v                            |
Arrow/WASD -> held-key adapter               |
Click/F    -> commands -> TS simulation -> snapshot
                             ^               |  |
                             |               |  +--> DOM HUD
                         shared layout ------+----> Three.js
                    (placement and collision)
```

The runtime layout owns stable logical IDs, transforms, and gameplay
footprints. Blender templates own visual geometry and declared bounds.
Validate the join before play: missing IDs, wrong scale, or visuals extending
outside the permitted footprint must produce a named error, not invisible
collision changes or guessed placement.

The asset library owns shared GPU resources. Instances own transforms and
animation state; per-instance visual overrides must be deliberate. Removing
one instance must not dispose shared resources or change another instance's
appearance. Use small ownership helpers, not a general resource framework.

### Loading and movement

```text
loading --all required assets valid + first frame--> ready
   |                                                |
   +--request/contract failure--> failed <---context loss
   |                                |
   +--> disposed <------------------+------ teardown
           |
           '-- late completion: discard/release, never attach

failed -> visible explanation + reload
reload -> a new application lifecycle, not an in-place retry framework

held keys -> fixed-tick adapter -> existing move command
   +-- opposite inputs: cancel
   +-- perpendicular inputs: documented deterministic precedence
   '-- release / blur / hide / pause / failure: clear held state

idle --move/dispatch--> walking --arrival--> idle or repairing
repairing --valid manual move--> walking; repair cancels per CS2 behavior
repairing --required work ticks--> resolved
```

No diagonal movement is introduced implicitly. The blueprint must pin the
perpendicular-key precedence policy and test it. Preserve focus guards: keys
used in form controls must not move the technician; gameplay keys must not
interfere with the showcase. Required assets must be ready before gameplay
advances. Restart must clear held state and reproduce the same seed.

## GitHub Pages Product Scope

**Decision 16A:** A lightweight project showcase plus a separate playable demo.
No frontend framework or documentation platform is required merely to provide
these two entry points.

Routes below are site-relative. The planned Project Pages prefix is
`/midcreek-cs-3/`, so the deployed entries are `/midcreek-cs-3/` and
`/midcreek-cs-3/play/`. Resolve links and asset requests against the configured
base path, not hardcoded origin-root URLs; test that prefixed production build.

```text
Showcase "/"
  +--> architecture and Blender-to-Three.js pipeline
  +--> approved concept artwork
  +--> approved Blender renders/export studies
  +--> game mechanics and controls
  +--> measured results, or explicit "not measured yet"
  '--> "/play/" -> isolated playable demo

gallery -> small generated thumbnail -> selected original on demand
source metadata -> review/allowlist gate -> public gallery metadata
```

Generate small aspect-preserving thumbnails into ignored build output; retain
each master once in source. Do not import the alternate 720p files merely to
serve previews. Lazy-load galleries and request original masters only after
selection. The showcase must not preload the game/GLBs; the game must not
fetch the reference catalog. Preserve the source metadata hash while producing
only explicitly allowed public metadata fields.

Missing gallery media must show an understandable placeholder/error, not break
navigation. Unfinished Blender work or unmeasured performance must be labeled
honestly; reference images must not masquerade as game screenshots.

## Three Execution Units

| ID | Task | Status | Dependency |
| --- | --- | --- | --- |
| R1 / `consolidate-evidence` | Research existing sources and write the comparative explanation; no builds | Pending | None |
| R2 / `prove-export-boundary` | Prove the bounded Blender export/load boundary | Pending | R1 and new resource approval |
| R3 / `write-cs3-blueprint` | Produce one implementation-ready CS3 blueprint | Pending | R1 and R2 |

The previous seven pending tasks are consolidated into these three. The
comparison remains in the existing findings document; decisions belong in
the blueprint rather than another parallel decision-matrix document.

### R1: Complete the evidence and comparison

**Files:** Update `docs/research/evidence-index.md`,
`docs/research/initial-findings.md`, `docs/research/cel-shift-source-audit.md`,
and the README index/status.

**Method: inspection and reasoning, not execution.**

- Read and search existing code, plans, documentation, manifests, retained reports, Git history, and GitHub discussions/workflow records.
- Draw conclusions from those sources and save them in the Markdown documents listed above.
- Do not write or run application code, helper scripts, tests, builds, benchmarks, validators, generators, or prototypes. Do not install dependencies, launch applications, export/process assets, copy artwork, or deploy anything.
- Use already recorded measurements, hashes, and dimensions as attributed evidence. If a question requires an experiment, record it for R2 or later implementation instead of trying it in R1.
- Leave sibling repositories and their checkouts unchanged. Any delegated R1 worker must follow the same research-only boundary and return findings for the documentation owner.

Distinguish **observed in source**, **reported by an existing run**, and
**inferred or unverified**. A source inspection is not a fresh runtime pass.

1. Reconcile CS1's local/remote revision difference by reading history and documenting it, without altering either checkout. Attribute inspected local code and later remote history separately.
2. Finish relevant plans, pivotal diffs, PR/review discussions, workflow records, and source attribution. Prioritize decisions that affect CS3 rather than narrating every commit.
3. Explain CS1's generated GLBs, plugin scheduling, gameplay, verification, and publication, including corrections and limitations.
4. Explain CS2's pure simulation, procedural rendering, controls, browser acceptance, rejected quality reductions, and measured cache experiment.
5. Explain Street Scene's Blender construction, materials, ownership, evidence, guarded capture, and separate technical/visual acceptance results.
6. Read the existing Cel Shift inventory and metadata to identify dependency/provenance associations and gaps. Document the requirement to retain 49 distinct masters and all six referenced prose bases plus the JSON foundation; do not create or process assets.
7. Describe the fields needed by a future reference manifest: source revision/path, SHA-256, width, height, bytes, artwork family, master/derivative role, sidecar mapping, and approval/provenance status. Document that a future browsing index derives from it; do not implement the manifest, schema, or index generator in R1.
8. Describe the requirements for a future staged, all-or-nothing import: reject hash/dimension/dependency/path/provenance failures, retain the previous complete package, and report the failed file. Do not implement or run the importer.
9. Preserve the relative `references/midcreek/themes/{cel-shift,_shared}` layout in the import design so copied prompt references remain valid.
10. Consolidate source-backed conclusions and remaining unknowns in the existing findings document. Distinguish historical prompt text from the accepted camera/scale direction, and hand off questions requiring execution without claiming they have been tested.

**Completion:** Both games and the Street Scene workflow are explained with
source evidence; the complete nonduplicating reference-import contract is
documented; provenance/publication blockers are explicit. R1 does not itself
build or run anything. Its only deliverables are documentation updates and
explicit questions for later execution.

**Effect on prior decisions:** Decisions 6A (manifest/generated index), 7A
(staged importer), 9A (negative contract tests), and 12A (structural prompt
checks) remain required. R1 describes them; it does not implement or run them.
R3 assigns their implementation and validation to the later build tasks.
Existing size/hash audits remain recorded evidence, not measurements rerun
in R1. Source inspection does not certify runtime compatibility.

R1 may finish with explicit questions that require experiments. R2 performs
the necessary fresh source-identity and export/load checks after approval;
its dependency on R1 does not require R1 to perform those experiments first.
Documenting a provenance or permission gap does not waive a later operation's
approval requirements.

### R2: Prove a bounded export/load path

**Files:** Version a minimal probe procedure and its assertions in CS3; keep
large generated scene/GLB/capture artifacts outside Git. Record the result in
the existing findings and evidence index, not a fourth historical report.

1. Establish a new, approved output location and resource allowance. Check source-scene identity; never modify the accepted scene or reuse its expired construction/capture budget.
2. Select a bounded static/animated sample and representative material/texture content from a copy of the retained scene. Do not recreate the full street, all lighting, or a standalone showcase viewer.
3. Record actual Blender and Three.js versions, exporter options, source hash, selected objects, script revision, output hashes, size, and warnings. Keep the scripts/assertions, not just a successful screenshot.
4. Validate GLB structure and declared content: nodes, transforms, units, pivots, bounds, materials, textures, and animation clips. Successful exporter exit or structural validity alone is insufficient.
5. Load the sample in a minimal Three.js probe. Check required asset readiness, material/texture bindings, clip timing, and representative poses/camera views. Repeat from a fresh run.
6. Compare exported results with the corresponding Blender sample. Report preserved, approximated, reconstructed, or unsupported features. Do not claim that a Street Scene material proves Cel Shift fidelity.
7. Exercise missing/corrupt assets, wrong source identity, invalid declared content, and interrupted/late load completion. Record explicit failures and retain the last complete evidence.
8. Record unresolved export limitations as concrete blockers or blueprint constraints. Do not substitute a procedural placeholder and report a successful export.

**Completion:** A fresh run can reproduce a small, tested export/load result or
a specific incompatibility. Source bytes remain unchanged. GLB correctness,
appearance comparison, and user acceptance are separate outcomes.

### R3: Produce the CS3 blueprint

**File:** Create `docs/architecture/cs3-blueprint.md`; update the existing plan
status, source findings if R2 changes them, and README.

1. Embed the settled decisions below and the evidence that supports them.
2. Define the first playable around CS2's seeded single-fault core, preserving repair/pause/restart behavior and adding the fixed-tick held-arrow adapter.
3. Define exact runtime module interfaces and asset/layout/animation contracts. Preserve one layout authority and explicit shared-resource ownership.
4. Define the no-Rust Blender/Python -> GLB -> TypeScript pipeline and its failure/recovery behavior from the actual R2 result.
5. Pin the actual dependency versions, development/build commands, export procedure, artifact locations, and permission/resource prerequisites.
6. Include the complete reference-adoption unit: all 49 masters once, shared foundations, reviewed provenance, generated index, staged promotion, and publication allowlist.
7. Define the showcase and `/play/` entry points, architecture/mechanics content, approved galleries, deferred loading, and honest result/status presentation.
8. Provide code-level implementation units with exact files, interfaces, ordered changes, and acceptance tests. Include R2's reusable procedure rather than rebuilding another parallel probe.
9. Carry forward the test map, failure registry, performance budgets, and qualification conditions below. Update every nearby ASCII diagram when its behavior changes.
10. Check source coverage, consistency, links, private-data boundaries, and missing prerequisites. The blueprint must be usable for implementation without another mandatory planning cycle.

**Completion:** One coherent, implementation-ready blueprint covers the game,
asset workflow, and Pages site. This review does not implement that blueprint.

## Required Test Map

All tests below are **planned**, not implemented or passing in CS3. Reuse the
appropriate CS2 cases; the new boundaries require new tests. JS/TS covers
application and data contracts; real Blender/Python integration additionally
proves export behavior. No Rails or Rust test stack is introduced.

**Phase ownership:** R1 reads existing test code and historical reports only.
R2 implements and runs the bounded probe's checks, including T2 and relevant
loading/failure cases. R3 specifies the remaining reference-import, game,
and site tests for later implementation. The T1-T9 map is not a command to
build or execute test suites during R1.

```text
Pinned sources
  |
  +-- [N:T1] manifest + dimensions + hashes + metadata + prompt bases
  |             +-- invalid/interrupted -> error; previous package retained
  |             '-- valid -> complete reference package
  |
  '-- [N:T2] owned copy -> bounded export -> declared-content validation
                +-- wrong source/export failure/missing content -> reject
                '-- valid GLB + receipt
                        |
                   [N:T3] guarded loading
                     +-- loading -> controls disabled
                     +-- failed -> error/reload
                     +-- disposed -> late result released
                     '-- ready
                          |
                   [N:T4] shared-layout/asset join
                     +-- ID/bounds/scale mismatch -> named error
                     '-- valid instances
                          |
       [N:T5] held arrows + focus ----+---- [R:T6] click/dispatch/pause
         +-- opposite -> cancel      |         |
         +-- blur/hide -> clear      '--> deterministic world
         '-- fixed-tick command               |
                                      immutable snapshot
                                        /           \
                                [N:T7] animation    DOM HUD
                                 +-- missing clip -> reject
                                 '-- pose/occlusion/camera checks

Build -> [N:T8] base paths + publication allowlist + no Rust prerequisite
           +-- unexpected/private file or missing route/GLB -> fail release
           '-- valid -> deployable site

Showcase [N:T9] -> sections/galleries -> original on demand
    +-- missing media -> explicit fallback; navigation still works
    +-- no results -> "not measured yet"
    '-- /play/ -> separate game assets; no catalog fetch on game startup
```

`N` identifies new integration/behavior; `R` identifies reused behavior.

### Failure registry and proposed coverage

| Flow | Required JS/TS test surface | Realistic failure | Required handling and visible outcome |
| --- | --- | --- | --- |
| T1 | `tests/reference-contract.test.ts` | Wrong master size/hash, missing shared base, disallowed path/metadata, or interrupted import | Reject the staged package, name the file/reason, preserve the previous complete package |
| T2 | `tests/asset-contract.test.ts`, plus a real Blender/Python integration check | Export reports success but omits a declared node, texture, or clip | Reject output/receipt; export compatibility remains failed |
| T3 | `src/assets/library.test.ts` and `tests/e2e/assets.spec.ts` | Load completes after teardown, texture fails, or one instance disposes shared resources | Guard completion, release late resources, keep gameplay disabled on failure, show reload/error |
| T4 | Extend `src/world/layout.test.ts` and asset-contract tests | Imported geometry exceeds its gameplay footprint or has a wrong logical ID | Named contract error before play, not a visual/collision mismatch |
| T5 | Extend `src/input/keyboard.test.ts` and browser gameplay tests | Lost keyup, OS-repeat dependence, or focused controls cause unintended movement | Fixed-tick input, cleared held state, focus isolation, unchanged collision commands |
| T6 | Reuse `src/world/simulation.test.ts` | Adapter changes replay, pause, arrival, repair timing/cancellation, or restart | Exact tick/command assertions detect regression; preserve existing user-visible rejection messages |
| T7 | `tests/e2e/assets.spec.ts` | Walking uses the wrong clip, instance animation leaks, or technician draws through a rack | Validate declared clips; assert state/pose independence, transforms, and fixed-view appearance |
| T8 | `tests/e2e/release.spec.ts` plus artifact-content/build checks | Wrong deployment prefix, missing GLB, private/unapproved source publication, or accidental Cargo requirement | Fail qualification with an explicit route/file/dependency error |
| T9 | `tests/e2e/showcase.spec.ts` | Galleries preload all masters/game code, media fails, or unavailable results look verified | Assert isolated loading, usable navigation, image failure states, accurate labels, and showcase transfer cap |

The original plan had **one critical silent-failure gap**: publishing
reference/private files without a rejecting release check. Decisions 11A and
17A address it in the design through T8's reviewed-publication allowlist.
Approved gallery derivatives are permitted; raw/private/unapproved material
is not. The guard and tests remain implementation requirements, not completed
protections.

### Specific input, visual, and prompt coverage

- Test all four arrows at all four camera headings, held duration, release, opposing inputs, deterministic perpendicular-key precedence, focus, blur, hiding, pause, loading failure, blocked moves, and restart.
- Preserve pointer movement, dispatch, repair cancellation on valid manual movement, fixed repair timing, and seeded replay. Do not use WASD-only tests as a proxy for arrow-key acceptance.
- Inject delayed/failed loads, late completion after disposal, context loss, missing clips, and shared-instance resource/animation changes.
- Capture declared camera/viewport/time states in the actual browser. Keep structural assertions separate from screenshot tolerances; do not demand cross-GPU PNG equality.
- No `CLAUDE.md` or eval registry exists in CS3 at this review. Unchanged source prompts need preservation checks, not fresh model generation.
- Check prompt hashes, base resolution, master/sidecar mapping, and prose/JSON agreement against the pinned Concept source. Historical sidecar text remains historical.
- If later work changes prompt behavior or generates art, define a separately approved evaluation scope and budget; do not silently reuse this structural-only approval.

### Inline diagram maintenance

The blueprint should place concise ASCII ownership/state diagrams beside the
eventual asset loader/library, held-key adapter, reference importer, and
export-probe procedure. Test fixtures with non-obvious lifecycle sequences
should show the sequence being exercised. Reuse existing module locations
where practical; do not create new modules merely to house diagrams. Update
diagrams in the same change as behavior and flag stale diagrams during review.

## Performance and Delivery Contract

Start with normal rendering and shared resources. Do not copy CS2's static
color/depth cache into CS3 before profiling. Its camera/size-only invalidation
does not cover arbitrary imported animation, material, or lighting changes.

| Gate | Initial requirement |
| --- | --- |
| Game draw calls | At most 250 per frame; report peak as well as steady work |
| Game visible triangles | At most 1,000,000 per frame |
| Game initial transfer | At most 15,000,000 bytes through the first required-asset-ready, rendered, interactive state |
| Showcase initial transfer | At most 2,000,000 bytes; subsequent selected-original downloads reported separately |
| Named desktop timing target | At least 59 mean FPS and at most 18 ms p95 frame interval |
| Reproducible comparison | Fixed seed/scenario and 1280 x 720 CSS viewport; record actual renderer size, drawing-buffer size, and DPR |

These are starting gates, not achieved results. R3 must identify the browser,
GPU/backend, device, and DPR used for qualification. Retain CS2's fixed-DPR
comparison protocol and record any different application DPR explicitly.

Measure navigation-to-interactive startup separately from the first 300
rendered frames and sustained play. Retain the fixed warm-up protocol from
CS2 when making before/after claims. Record walking, dispatch/repair, and
orbit/resize workloads with phase labels; do not call an idle window an
active-repair measurement or count callbacks as proof of actual rendering.

CS2's `navigation.loadEventEnd` transfer cutoff must not be reused unchanged:
it can omit GLBs fetched after page load. Required delayed assets must count
through game readiness; later gallery activity must not change that frozen
startup result. Test this distinction explicitly.

Read/hash reference files sequentially or with bounded concurrency; do not
decode all 49 masters at once just to validate dimensions. Avoid repeated
downloads for instances sharing an asset. Generate gallery thumbnails only
into ignored build output and preserve aspect ratio.

Keep deterministic CI separate from the named hardware timing run. A skipped
timing test is unqualified, not passed. The site must label unavailable or
unmeasured results accordingly; do not claim universal 60 FPS from one target.

## NOT in Scope

- Full Street Scene viewer or complete Cycles-to-WebGL recreation: deferred to D1; the bounded probe suffices for this plan.
- Static caching, workers, or other speculative rendering optimization: deferred to D2 until measurements show a need.
- Additional browser/GPU qualification beyond the first named target: deferred to D3; responsive-layout checks still apply.
- New fault systems, minigames, or broader gameplay beyond CS2's first scenario: not part of the initial behavioral baseline.
- Fresh prompt/model rerenders: unchanged reference inputs require structural checks, not new image generation.
- Rust/Cargo/Bevy integration or a custom Rust-to-WASM pipeline: explicitly excluded.
- Unrelated concept themes, duplicate alternate-size images, and private source photography: outside the selected reference set.
- Application implementation, artwork copying, public deployment, or heavy jobs during this review: not authorized by saving the plan.

## Review Decision Ledger

| Issue | Chosen direction |
| --- | --- |
| 0A | Reduce to three units and existing evidence documents plus one blueprint |
| 1A | Reuse CS2 core/behavioral tests; explicitly require arrow-key walking |
| 2A | Runtime-owned shared layout, Blender visual templates |
| 3A | Version the bounded probe's procedure and assertions |
| 4A | Explicit guarded loading lifecycle |
| 5A | Fixed-tick held-key input using existing movement commands |
| 6A | One reference manifest with generated browsing index |
| 7A | Staged all-or-nothing import and explicit metadata policy |
| 8A | Shared GPU-resource ownership, instance-owned transforms/animation |
| 9A | Negative asset/import fixtures and real export/load proof |
| 10A | Full arrow/heading unit matrix and real-browser input acceptance |
| 11A | Lifecycle/presentation fault injection and release gates |
| 12A | Structural prompt checks and runtime captures; no model rerenders |
| 13A | Normal-render baseline; optimize measured bottlenecks only |
| 14A | Account for required assets through interactive readiness |
| 15A | Explicit initial game budgets and named hardware qualification |
| 16A | Showcase plus separate playable demo |
| 17A | Build-only thumbnails, deferred originals, 2 MB showcase cap, T9 and revised T8 |
| 18A/B/C | Capture all three selected deferred items in `TODOS.md` |
| 19A | Save the reduced plan and review decisions in the repository; documents only |

### Retrospective and completion summary

The reviewed branch contained `926aaba` and `04f0bda`, both documentation
commits. There was no earlier implementation/review-refactor cycle on this
branch. The latter corrected toolchain ambiguity and art sourcing; preserve
those corrections. Review references to the old plan apply to `04f0bda`,
before this consolidation.

| Review item | Result |
| --- | --- |
| Step 0 | User chose SCOPE REDUCTION |
| Architecture | 4 issues reviewed; separate Pages scope decision also resolved |
| Code quality | 4 issues reviewed |
| Tests | Diagram produced; 4 coverage-gap groups reviewed; T1-T9 specified |
| Performance | 4 issues reviewed, including the new showcase scope |
| NOT in scope | Written above |
| What already exists | Written above |
| TODOS.md | 3 items proposed, all selected and documented |
| Failure modes | 1 critical gap identified and addressed in the design; tests/guards not yet implemented |

**Unresolved review decisions that may bite later:** none; all presented
choices were answered. **Execution prerequisites are still open:** final
source/provenance qualification, CS1 revision reconciliation, actual export
compatibility, a new probe resource allowance, and a named performance target.
Report a concrete blocker if any cannot be established; do not infer success.
