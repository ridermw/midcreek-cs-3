# Mid Creek CS Lineage and CS3 Blueprint Implementation Plan

> **For agentic workers:** Use `executing-plans` to execute this plan task-by-task. Keep research claims tied to repository paths, commit SHAs, or retained artifact hashes.

**Goal:** Explain how Mid Creek CS1 and CS2 were planned and built, recover the complete Cel Shift art direction from Midcreek Concept with Midcreek as a cross-check, document Street Scene One's Blender pipeline and its Blender-to-Three.js boundary, and turn those findings into an implementation-ready blueprint for Mid Creek CS3.

**Architecture:** Treat each predecessor as a separate evidence case, pin its repository revision, and trace plan decisions through commits into runtime code and validation. Synthesize the cases only after their individual reports are complete, then derive a CS3 architecture that explicitly adopts, adapts, or rejects each relevant pattern.

**CS3 Tech Stack:** TypeScript, Three.js, DOM/CSS, Node.js/Vite, Vitest, Playwright, and Python/Blender tooling for glTF/GLB assets. Rust, Cargo, and Bevy are not dependencies. Exact tool versions are selected and pinned during code-level planning.

**Historical Toolchains Only:** CS1 uses Rust 1.98 and Bevy 0.19.1; the Street Scene delivery reports Blender 5.2.1 LTS with Cycles/Metal. These identify the systems being studied, not CS3 version requirements.

**Spec:** User request from September 10, 2026: produce both a comparative technical explainer and a CS3 implementation blueprint. The subsequent instruction makes this repository the durable home for the plan and accumulated research.

**Artwork scope:** Include the full Cel Shift set, not the other concept themes.
The user requested picture-size checks to avoid duplicate copies. Keep one
master per artwork, with supporting prompts, shared foundations, and reviewed
provenance. This revision documents the import; it does not copy artwork.

## Global Constraints

- Work in `midcreek-cs-3`; sibling Midcreek Concept, Midcreek, CS1, CS2, Street Scene One, Street Scene data, and Street Scene Showcase are read-only evidence sources.
- Read CS2 locally at `../midcreek-cs-2`, pinned to `7ce1aa3a9d11cc5198167221a11f0cc5edb214e4`; use GitHub for supplementary history and deployment records.
- Use `../midcreek-concept` at `870603632c4b6665c513d0fa692a3ee2dae2b683` as the primary art source and `../midcreek` at `b2e736726f7f9aea610274931b9c62555e9eeb67` as the master-artwork cross-check/fallback. Do not duplicate both catalogs.
- Keep concept reference images outside the runtime bundle. A reference plate is not a game-ready mesh, sprite, texture, or HUD component.
- Do not introduce Rust, Cargo, Bevy, a Rust asset generator, or a custom Rust-to-WASM stage into CS3. Reading historical Rust source does not require building it.
- Do not modify the selected Street Scene blend file or its retained delivery artifacts.
- Do not execute `street-scene-1/docs/plans/original-blender-unreal.md`; it is obsolete historical context only.
- Separate repository facts from interpretation and recommendations.
- Distinguish user acceptance, technical completion, and independent visual-reference matching.
- Do not claim that a Three.js rendering can be pixel-identical to Blender Cycles.
- Do not copy raw private plans, machine-specific paths, downloaded reference media, render sequences, or private run logs into public CS3 documentation.
- Prefer small, reviewable documentation commits, with README progress updated as each durable artifact lands.
- Saving this plan does not start a Blender job, export probe, runtime implementation, or deployment.

## CS3 Toolchain Decision: No Rust

**Status: confirmed by the user on September 10, 2026.** CS2 dropped the
Rust/Bevy runtime; CS3 keeps a TypeScript/Three.js browser runtime and adds
Python/Blender asset authoring. The original mixed toolchain heading described
the research subjects and was not a requirement; it is separated above.

```text
Cel Shift art references
  -> Blender authoring and Python export
  -> validated GLB assets
  -> TypeScript / Three.js runtime
  -> Vite production build and static deployment

Input commands -> deterministic TypeScript simulation -> scene and DOM HUD
```

| Consideration | CS3 decision |
| --- | --- |
| Build and deployment | Use Node tooling for the browser app and Python/Blender for asset tooling. Do not require Cargo, Rust target installation, Bevy, or Rust-to-WASM compilation in development, CI, or deployment. |
| Reuse from CS1 and Midcreek | Reuse art, contracts, reference data, and design lessons. Port only needed behavior into TypeScript; do not import Rust crates, create a language bridge, or rebuild the Rust asset generator. |
| Deterministic simulation | Keep commands, seeded randomness, fixed ticks, ordering, and immutable snapshots explicit in TypeScript. Use bounded integer units where exact state matters, validate numeric limits, and cover replay equivalence with Vitest. A language change does not preserve these properties automatically. |
| Test coverage | Use Vitest for pure runtime/state contracts, Playwright for real browser interaction, and Python/Blender plus glTF checks for exports. Translate relevant behavioral cases instead of carrying over Cargo test commands. |
| Historical measurements | Existing CS1 measurement reports are evidence, not a required executable. New CS3 measurements must use its Node/Python/browser tools. Rebuilding a predecessor to reproduce a historical result would be a separate, optional investigation, never a CS3 gate. |
| Performance | Do not assume either a gain or loss from dropping Rust. Profile the actual browser and asset workload; reduce allocation, batch rendering, or consider workers only where measurements justify it. Reintroducing Rust/WASM would require a separate approved architecture change, not an automatic optimization. |
| Asset boundary | Blender/Python produces runtime-ready GLBs; TypeScript loads them. Concept plates remain reference material, and a Blender export does not require CS1's custom Rust serializer. |

**Acceptance:** The eventual CS3 app can be installed, built, tested, and
deployed without a Rust toolchain. The asset-authoring/export path likewise
must not invoke a Rust compiler or generator. Inspect build scripts,
dependencies, and CI for accidental reintroduction before the blueprint is
considered complete.

## Saved Progress

Preparatory inspection and CS2 cloning are complete. The initial findings and
source index are saved in `docs/research/`. They are a research snapshot, not a
claim that the formal case studies or export audit are complete.

The art-source comparison and PNG dimension/size/hash inventory are also
complete: 49 master files and 49 lower-resolution counterparts were identified.
The future import selects the masters only; see
`docs/research/cel-shift-source-audit.md` for each path and hash. No images,
original prompts, or metadata sidecars have been imported.

| Task ID | Task | Status | Depends on |
| --- | --- | --- | --- |
| `pin-evidence` | Pin the evidence baseline | Pending | None |
| `reconstruct-cs1` | Reconstruct CS1 build lineage | Pending | `pin-evidence` |
| `reconstruct-cs2` | Reconstruct CS2 build lineage | Pending | `pin-evidence` |
| `audit-street-scene` | Audit Street Scene and the export boundary | Pending | `pin-evidence` |
| `compare-predecessors` | Compare predecessor architectures | Pending | All three case studies |
| `design-cs3` | Design the CS3 blueprint | Pending | `compare-predecessors` |
| `review-deliverables` | Review the deliverables | Pending | `design-cs3` |

The next substantive task is to finish the evidence baseline, particularly the
CS1 local/remote revision mismatch, untracked/ignored planning artifacts, and
the provenance/publication review for the deduplicated Cel Shift reference set.
Task state is also tracked in the session database; this table preserves the
state outside that session.

## Current-State Findings

- CS3 started as an empty Git repository. It now contains this plan and the saved research documentation, not application code.
- Midcreek Concept is `williamsmat_microsoft/midcreek-concept`; it contains the Cel Shift masters, preview variants, 47 prompts, theme manifest, shared foundations, art bible, and projection decision. Midcreek is `azure-core/midcreek` according to its local origin and contains an identical copy of the 49 masters but lacks the shared files required by its copied prompts.
- Every master is 1536 x 1024; every `-720p` counterpart is 1280 x 720. Masters total 86,349,779 bytes, previews 54,022,414 bytes. No byte-identical duplicates were found within the 98 concept PNGs; the lower-resolution counterparts and cross-repository copies are excluded from the planned import.
- CS1 is `ridermw/midcreek-cs-1`. It built the Cel Shift proof of concept in Rust/Bevy, generated deterministic GLBs from repository-owned RON without Blender, shipped native verification plus WASM, and accumulated a long contract- and evidence-driven history.
- CS2 is `ridermw/midcreek-cs-2`, cloned on September 10, 2026 to `../midcreek-cs-2` with full history and a clean `main` checkout at `7ce1aa3a9d11cc5198167221a11f0cc5edb214e4`. It rebuilt the concept directly in Three.js using procedural/instanced geometry, a pure fixed-step simulation, DOM HUD, browser tests, diagnostics, and a static color/depth render cache.
- Street Scene One is split across `street-scene-1` for private Blender authoring, `street-scene-1-data` for generated artifacts, and `street-scene-showcase` for public-safe publication.
- The selected Street Scene artifact is attempt 23, scene SHA-256 `0e4c90b1ab5bcfb052d2f5d2c5c4628a89b5b7145f6b6e9bf399d7f31cda4d05`. Its manifest records 299 objects, 360,561 vertices, 120 frames at 24 FPS, Cycles/Metal, AgX, and a five-second car/camera sequence.
- Street Scene One currently renders Blender output to PNG/MP4; no Blender-to-Three.js implementation was found in the inspected sources. The local, untracked `street-scene-showcase/THREEJS-SESSION-PROMPT.md` describes a proposed export/runtime boundary, not shipped code.

## Planned CS3 Documentation Shape

- `README.md`: purpose, evidence sources, document index, and implementation status; now exists.
- `plan.md`: this authoritative repository plan.
- `docs/research/evidence-index.md`: inspected sources, revision pins, caveats, and remaining evidence gaps; initial snapshot exists.
- `docs/research/initial-findings.md`: research gathered before formal execution; exists.
- `docs/research/cel-shift-source-audit.md`: source comparison, picture dimensions/bytes/hashes, dependency gaps, and reference-import rules; exists.
- `docs/research/cs1-build-lineage.md`: plan-to-code-to-history reconstruction of CS1.
- `docs/research/cs2-build-lineage.md`: plan-to-code-to-history reconstruction of CS2.
- `docs/research/street-scene-pipeline.md`: Blender authoring/capture pipeline and tested Blender-to-GLB/Three.js boundary.
- `docs/research/comparative-analysis.md`: side-by-side decisions, outcomes, costs, failures, and reusable lessons.
- `docs/architecture/cs3-blueprint.md`: selected CS3 architecture, interfaces, pipeline, gates, milestones, and rejected alternatives.
- `docs/architecture/decision-matrix.md`: explicit adopt/adapt/reject ledger with evidence references.

---

### Task 1: Pin the Evidence Baseline

**Files:** Extend `README.md`, `docs/research/evidence-index.md`, and `docs/research/cel-shift-source-audit.md`.

**Interfaces:**
- Consumes: all six source Git repositories, GitHub API metadata, Street Scene retained manifests, and the Cel Shift source/size audit.
- Produces: one immutable evidence index used by every later report.

**Steps:**

1. Record the exact local and remote repository identities for Midcreek Concept, Midcreek, CS1, CS2, Street Scene One, Street Scene Showcase, and CS3.
2. Pin the six source repositories to full commit SHAs; record branch, commit date, and dirty-state caveats. Resolve the CS1 local/remote mismatch before treating them as one revision.
3. Record the selected Street Scene scene, manifest, delivery report, source commit, source-scene hash, and video hash.
4. Inventory authoritative plans, architecture documents, READMEs, source entry points, tests, workflows, evidence captures, and release/deployment records.
5. Mark each source as public-safe, private/read-only, generated-local, obsolete, or excluded. Separately identify untracked and ignored documents.
6. Add an evidence citation convention: repository-relative path plus line range for files, full SHA for commits, and SHA-256 for retained artifacts.
7. Verify every later planned document can cite a pinned source rather than a moving branch tip.
8. Commit the completed evidence index and README update.

**Cel Shift reference extraction design:**

1. Select all 49 master paths listed in the source audit, rather than relying on the stale README claim of 45 plates. Preserve distinct early studies, headings, calibration plates, characters, faults, and environments.
2. Use the concept repository as the single source. Verify fallback master bytes against the same hashes if Midcreek is used; never copy both trees.
3. Keep master dimensions and bytes unchanged. Exclude `*-720p.png` and their derivative sidecars from the reference import. Record the alternate files in the audit rather than deleting or modifying them upstream.
4. Include the matching master provenance records, 47 prompts, `theme.yaml`, `ART-BIBLE.md`, `docs/decisions/projection.md`, and every file in `themes/_shared/`. Do not copy just `foundation.json`: prompt generation uses the shared prose.
5. Preserve the relative theme/shared layout under a future `references/midcreek/` root so `plan: ../../_shared/...` resolves. Write a CS3-specific index instead of importing broken cross-theme README navigation.
6. Review source terms and metadata before publication. Keep provenance and source hashes, but do not blindly publish account/service identifiers, private references, or obsolete prompt text as current art requirements.
7. Require a reference manifest with source repository/revision, source path, SHA-256, width, height, bytes, artwork family, master/derivative role, paired sidecar, and approval/provenance status.
8. Resolve stale overview statements using the shared foundation, art bible, projection decision, and measured-art record. Distinguish the rounded 35-degree concept contract, CS2's 35.264-degree runtime value, and CS1's historical 57-degree plan.
9. Keep all reference plates out of production asset loading. Generate separate runtime assets through the later Blender pipeline.

The reference copy is a later, explicitly executed action. This task first
finishes its documentation and provenance gates.

**Validation:**
- Every repository and artifact used later has a stable identifier.
- No raw private content or machine-specific source path is copied into public-facing prose. Identify local-only evidence without publishing its contents.
- The reference-import specification covers all 49 masters once, excludes alternate-resolution duplicates, preserves all prompt dependencies, and carries an explicit rights/metadata review gate.

---

### Task 2: Reconstruct How CS1 Was Built

**Files:** Create `docs/research/cs1-build-lineage.md`; modify `README.md`.

**Interfaces:**
- Consumes: Task 1 evidence index; CS1 plan, source, tests, workflows, and history.
- Produces: a chronological and architectural CS1 case study.

**Steps:**

1. Read `docs/implementation-plan.md` as the product contract and extract its locked decisions, plugin graph, runtime flow, asset pipeline, verification design, objective gates, failure registry, and task ordering.
2. Trace the initial implementation sequence from commit `a3a10dc` through authored assets, hall construction, technician movement, camera orbit, repair gameplay, HUD, verification, WASM publication, and later fidelity-contract work.
3. Map `CellShiftPlugin` and `CellShiftSet` scheduling to `assets`, `world`, `player`, `camera`, `operations`, `hud`, and native-only verification modules.
4. Explain the no-Blender asset pipeline: RON schema, deterministic tessellation, rig/animation generation, stable GLB serialization, committed generated assets, `--write`/`--check`, and stale/nondeterministic failure modes.
5. Explain how runtime and verification share production plugins while verification changes the driver, window, capture state machine, and software-adapter compatibility profile.
6. Document publication architecture: native site generation, WASM packaging, progress/evidence publication, last-green retention, and GitHub Pages.
7. Use Git history to identify significant corrections and what they reveal: glTF skin semantics, rendered-coverage separation, camera clamping, animation reset, input/browser ownership, readback readiness, software-rasterizer behavior, baseline binding, and policy/measurement separation.
8. Summarize strengths, complexity costs, portability problems, reported render-contract limitations, and which CS1 patterns are candidates for CS3.
9. Update the README index and commit the CS1 case study.

**Validation:**
- Every architectural claim points to a plan/code source and, where relevant, the commit that introduced or corrected it.
- The report clearly distinguishes the original planned architecture from later evolved behavior.
- Read CS1 source and retained reports without requiring its Rust toolchain. Label any optional historical rerun separately from CS3 prerequisites or gates.

---

### Task 3: Reconstruct How CS2 Was Built

**Files:** Create `docs/research/cs2-build-lineage.md`; modify `README.md`.

**Interfaces:**
- Consumes: Task 1 evidence index; CS2's pinned local checkout and five-commit history, supplemented by GitHub records.
- Produces: a chronological and architectural CS2 case study directly comparable to Task 2.

**Steps:**

1. Pin and retrieve CS2's README, `docs/architecture.md`, `docs/art-direction.md`, `docs/hill-climb.md`, package manifest, workflows, runtime modules, tests, and evidence artifacts.
2. Trace the five commits from scaffold (`02f9674`) through simulation (`e5b0e8a`), first playable (`40976cf`), verified release record (`dac6940`), and static render caching (`7ce1aa3`).
3. Explain the separation between normalized browser commands, fixed 30 Hz deterministic simulation, immutable snapshots, Three.js rendering, DOM/CSS HUD, and read-only diagnostics.
4. Explain procedural scene construction, instanced racks, camera measurement, pathfinding, repair flow, input handling, explicit GPU-resource disposal, and WebGL context-loss behavior.
5. Explain the evidence loop: fixed seed/scenario/view, Vitest contracts, Playwright gameplay tests, screenshots, frame-time/draw-call/triangle/transfer measurements, and exact deployed-build verification.
6. Reconstruct the performance hill climb, including rejected no-MSAA and reduced-raster experiments, promoted planar geometry, the SwiftShader constraint, and the full-resolution color/depth static hall cache.
7. Document why CS2 avoided imported detailed assets for the first playable and what that decision gained and lost versus CS1.
8. Summarize strengths, limitations, current budgets, and which CS2 patterns are candidates for CS3.
9. Update the README index and commit the CS2 case study.

**Validation:**
- The report reproduces documented before/after cache metrics without converting them into unsupported hardware-GPU claims.
- The five-commit narrative matches the pinned GitHub history and current module boundaries.

---

### Task 4: Audit Street Scene One and Prove the Blender-to-Three.js Boundary

**Files:** Create `docs/research/street-scene-pipeline.md`; modify `README.md`.

**Interfaces:**
- Consumes: Task 1 evidence index; Street Scene plan, source, selected `.blend`, manifests, delivery report, public showcase, and local Three.js session prompt.
- Produces: an authoring-pipeline explanation plus an evidence-backed export compatibility report.

**Steps:**

1. Reconstruct the Blender pipeline from the reviewed plan and three source commits: scene generation, procedural geometry modules, original vehicle construction, material provenance, isolated background Blender execution, Cycles/Metal configuration, and editable controls.
2. Explain the run-safety and evidence layers: owned process groups, one-heavy-job lock, pause/deadline/disk controls, atomic records, dependency retention by hash, review fingerprints, capture forecasting, scene ownership, frozen-scene checks, resumable frames, encoding, and delivery manifests.
3. Explain the visual iteration history and keep the outcome fields separate: workflow passed, user acceptance passed, video reference match failed, photograph criterion unevaluated.
4. Inspect the selected blend through a read-only Blender summary or a copy: scenes, collections, objects, meshes, materials, packed images, cameras, lights, animation actions, constraints, modifiers, drivers, custom properties, and linked/missing files.
5. After execution and resource approval, export a disposable copy to GLB with a reproducible script. Record Blender version, export options, source hash, output hash, size, warnings, and export duration; test determinism rather than assuming it.
6. Validate the GLB structurally with a glTF validator and inspect nodes, meshes, materials, textures, cameras, lights, and animation clips.
7. Load the GLB in a minimal temporary Three.js probe outside committed CS3 sources. Confirm coordinate orientation, scale, frame range/timing, hero-car and camera animation, texture resolution, material compatibility, and browser console cleanliness.
8. Classify each Blender feature as preserved, approximated, reconstructed in Three.js, baked, or unsupported. Pay special attention to Cycles shader nodes, sky/world lighting, AgX appearance, displacement, packed textures, camera animation, sun shadows, collection hierarchy, and custom editing metadata.
9. Compare start, middle, and end Three.js captures against accepted Blender frames for framing, silhouette, street scale, facade openings, fire escapes, vehicles, sun/shadows, material response, distant architecture, and continuity.
10. Recommend one of three CS3 asset strategies: direct GLB playback, GLB plus Three.js reconstruction layers, or export-derived procedural/runtime data. Explain why the other two are rejected or deferred.
11. Update the README index and commit the pipeline report. Do not commit the disposable export unless the later CS3 blueprint deliberately promotes it with provenance and budgets.

**Validation:**
- The original selected `.blend` hash remains unchanged.
- The report names every material or animation loss rather than presenting a partial export as success.
- The Three.js probe either demonstrates a viable path or records a concrete blocker with reproducible evidence.
- No expired Street Scene allowance is extended or reused.

---

### Task 5: Produce the Comparative Technical Explainer

**Files:** Create `docs/research/comparative-analysis.md` and `docs/architecture/decision-matrix.md`; modify `README.md`.

**Interfaces:**
- Consumes: Tasks 2-4 case studies.
- Produces: a normalized comparison and adopt/adapt/reject ledger.

**Steps:**

1. Compare CS1, CS2, and Street Scene One across goals, rendering/runtime architecture, asset creation, animation, simulation, UI, testing, visual validation, performance, deployment, provenance, reproducibility, failure handling, and operating complexity.
2. Compare CS1/CS2's inherited art contracts with the pinned Concept foundation; use Midcreek's catalog to verify artwork lineage, not as a complete prompt-generation source.
3. Normalize terminology so similarly named concepts are not falsely equated: Bevy verification versus browser acceptance, deterministic GLB generation versus Blender export, procedural runtime geometry versus authored scene geometry, and user acceptance versus reference matching.
4. Add a chronological lineage showing which problems each successor intentionally simplified or solved differently.
5. Identify reusable patterns with evidence: deterministic core state, explicit ownership, production-path testing, fixed-view evidence, content hashes, honest failure states, bounded performance budgets, and public/private artifact separation.
6. Evaluate possible high-cost patterns against evidence: verification coupling, software-renderer dependence, importing fidelity too early, unbounded visual iteration, and treating render success as visual success.
7. Fill the decision matrix with one explicit status for every candidate pattern: adopt unchanged, adapt, defer, or reject. Include rationale and source citations.
8. Update the README index and commit the comparative explainer.

**Validation:**
- Recommendations never rely on one project's terminology alone; each is tied to observed outcomes.
- Contradictions between plans and final implementations are surfaced, not smoothed over.

---

### Task 6: Design the Mid Creek CS3 Blueprint

**Files:** Create `docs/architecture/cs3-blueprint.md`; modify `docs/architecture/decision-matrix.md` and `README.md`.

**Interfaces:**
- Consumes: Task 1's complete art-reference contract and Tasks 4-5 export findings and decision matrix.
- Produces: an implementation-ready CS3 architecture and milestone sequence.

**Steps:**

1. State CS3's product boundary and first vertical slice: a TypeScript/Three.js runtime using Blender-authored, reproducibly exported assets, with deterministic TypeScript interaction/simulation kept independent from presentation. Preserve the confirmed no-Rust toolchain decision; confirm concrete gameplay scope before code-level planning.
2. Define repository boundaries for Blender sources, export scripts, promoted GLBs/textures, Three.js runtime, simulation, UI, diagnostics, tests, evidence, and deployment.
3. Define the asset contract from the full Cel Shift master set and shared foundation: palette, shading/outline rules, camera, technician/rack scale, coordinate system, meters, naming, origins/pivots, collections, material subset, texture formats, animation naming/timing, custom metadata, provenance, hashes, size budgets, and stale-export detection. Treat historical image-generation metadata as provenance, not an override of current direction.
4. Define the export pipeline from an immutable/copy-on-write `.blend` source through reproducible Blender CLI export, validation, optional optimization, manifest generation, and browser smoke loading.
5. Define TypeScript interfaces between asset loading, renderer, authored animation, deterministic simulation, input commands, DOM HUD, camera policy, diagnostics, and lifecycle/disposal; do not introduce Rust crates or a WASM language bridge.
6. Select the rendering approach based on Task 4: GLB baseline, explicit Three.js lights/shadows/color management, bounded DPR, responsive resize, loading/error states, WebGL fallback, and optional inspection controls.
7. Define validation layers with Vitest for pure TypeScript simulation/runtime tests, Python/Blender exporter checks, glTF validation, asset budgets, Playwright gameplay/loading/fallback tests, fixed-view screenshots, start/middle/end animation captures, performance measurements, and deployed-path checks. No Cargo gate is required.
8. Define measurable initial budgets for GLB/textures, initial transfer, draw calls, triangles, load time, sustained frame timing, and visual-comparison evidence. Mark platform-specific performance as measured rather than inferred.
9. Define milestone order: repository/evidence foundation; one Blender-to-GLB fixture; one production scene slice in Three.js; deterministic interaction; visual comparison/material correction; performance hill climb; Pages deployment and exact-build verification.
10. Add failure and recovery behavior for export errors, missing textures, unsupported materials, stale hashes, model-load failures, WebGL loss, animation mismatch, visual-regression failure, and deployment-path errors.
11. Record the disposition of alternatives: reject the CS1-style Rust runtime/custom GLB generator under the confirmed toolchain decision; evaluate CS2-only procedural geometry and a monolithic Blender-rendered video experience against the Blender-to-Three.js goal.
12. Update the README with the recommended architecture and commit the CS3 blueprint.

**Validation:**
- Every adopted decision traces back to evidence in the comparative analysis.
- Every blueprint component has a clear owner, input, output, failure mode, and test surface.
- The first milestone can produce a working, reviewable vertical slice without requiring the full scene or game.
- Development, asset generation, application build, CI, and deployment do not depend on Rust, Cargo, or Bevy.

---

### Task 7: Review the Deliverables as an Executable Starting Point

**Files:** Modify planned documentation as findings require.

**Interfaces:**
- Consumes: Tasks 1-6.
- Produces: a consistent, source-backed documentation set ready for a separate code-level implementation plan.

**Steps:**

1. Check source coverage: every important plan, runtime subsystem, pivotal commit, retained Street Scene artifact, and Three.js export finding appears in at least one report.
2. Check internal consistency across repository names, SHAs, metrics, dates, scene hashes, architecture terms, budgets, and milestone names.
3. Search for placeholders, unsupported certainty, stale branch-tip references, leaked private paths, and claims that confuse acceptance with fidelity.
4. Walk the CS3 blueprint from Blender source to deployed browser and confirm every transition has an explicit artifact and validation gate.
5. Review the decision matrix against the blueprint and resolve any adopt/adapt/reject contradictions.
6. Run documentation link/path checks and any repository-standard Markdown formatting checks introduced during execution.
7. Perform a plan-exit or adversarial architecture review of the finished CS3 blueprint before generating code-level implementation tasks.
8. Commit the review corrections as a final documentation-only increment.

**Validation:**
- A new engineer can explain CS1, CS2, and Street Scene One without opening their source repositories first.
- The same engineer can derive a code-level CS3 implementation plan without reopening unresolved architectural questions.

## Notes and Considerations

- CS2 clone preparation is complete. The seven research and blueprint tasks remain pending; cloning and saving the initial findings did not complete them.
- Both art-source repositories already exist locally. Include the complete Cel Shift direction, not all 30 concept themes or private reference photography; retain one full-resolution master per artwork and omit alternate-size copies from the future import.
- Street Scene One's current Three.js material is a local, untracked design prompt. Task 4 must validate the proposed GLB boundary rather than repeat the prompt as fact.
- The selected scene's delivery report says it contains packed images and no linked Blender libraries. Treat Cycles world/shader fidelity and AgX appearance as export risks to investigate, not established compatibility.
- CS1 uses generated committed GLBs; CS2 uses runtime procedural geometry. The proposed CS3 direction is Blender-authored GLBs, not a default combination of all three asset-generation systems.
- Rust remains relevant to explaining CS1 and Midcreek history only. Their source/toolchain descriptions must never be copied into CS3 setup instructions as requirements.
- This plan produces research and architecture documentation, with an explicitly bounded export probe. After Task 7, create a separate code-level implementation plan for the selected CS3 vertical slice.
