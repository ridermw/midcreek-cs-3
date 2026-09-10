# Mid Creek CS Lineage and CS3 Blueprint Implementation Plan

> **For agentic workers:** Use `executing-plans` to execute this plan task-by-task. Keep research claims tied to repository paths, commit SHAs, or retained artifact hashes.

**Goal:** Explain how Mid Creek CS1 and CS2 were planned and built, document Street Scene One's Blender pipeline and its Blender-to-Three.js boundary, and turn those findings into an implementation-ready blueprint for Mid Creek CS3.

**Architecture:** Treat each predecessor as a separate evidence case, pin its repository revision, and trace plan decisions through commits into runtime code and validation. Synthesize the cases only after their individual reports are complete, then derive a CS3 architecture that explicitly adopts, adapts, or rejects each relevant pattern.

**Tech Stack:** Rust 1.98 and Bevy 0.19.1; TypeScript, Three.js, Vite, Vitest, and Playwright; Python 3.11+, Blender 5.2.1 LTS, Cycles/Metal, glTF/GLB. These are observed predecessor toolchains, not a claim about current releases or a finalized CS3 dependency selection.

**Spec:** User request from September 10, 2026: produce both a comparative technical explainer and a CS3 implementation blueprint. The subsequent instruction makes this repository the durable home for the plan and accumulated research.

## Global Constraints

- Work in `midcreek-cs-3`; sibling CS1, CS2, Street Scene One, Street Scene data, and Street Scene Showcase are read-only evidence sources.
- Read CS2 locally at `../midcreek-cs-2`, pinned to `7ce1aa3a9d11cc5198167221a11f0cc5edb214e4`; use GitHub for supplementary history and deployment records.
- Do not modify the selected Street Scene blend file or its retained delivery artifacts.
- Do not execute `street-scene-1/docs/plans/original-blender-unreal.md`; it is obsolete historical context only.
- Separate repository facts from interpretation and recommendations.
- Distinguish user acceptance, technical completion, and independent visual-reference matching.
- Do not claim that a Three.js rendering can be pixel-identical to Blender Cycles.
- Do not copy raw private plans, machine-specific paths, downloaded reference media, render sequences, or private run logs into public CS3 documentation.
- Prefer small, reviewable documentation commits, with README progress updated as each durable artifact lands.
- Saving this plan does not start a Blender job, export probe, runtime implementation, or deployment.

## Saved Progress

Preparatory inspection and CS2 cloning are complete. The initial findings and
source index are saved in `docs/research/`. They are a research snapshot, not a
claim that the formal case studies or export audit are complete.

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
CS1 local/remote revision mismatch and untracked/ignored planning artifacts.
Task state is also tracked in the session database; this table preserves the
state outside that session.

## Current-State Findings

- CS3 started as an empty Git repository. It now contains this plan and the saved research documentation, not application code.
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
- `docs/research/cs1-build-lineage.md`: plan-to-code-to-history reconstruction of CS1.
- `docs/research/cs2-build-lineage.md`: plan-to-code-to-history reconstruction of CS2.
- `docs/research/street-scene-pipeline.md`: Blender authoring/capture pipeline and tested Blender-to-GLB/Three.js boundary.
- `docs/research/comparative-analysis.md`: side-by-side decisions, outcomes, costs, failures, and reusable lessons.
- `docs/architecture/cs3-blueprint.md`: selected CS3 architecture, interfaces, pipeline, gates, milestones, and rejected alternatives.
- `docs/architecture/decision-matrix.md`: explicit adopt/adapt/reject ledger with evidence references.

---

### Task 1: Pin the Evidence Baseline

**Files:** Extend `README.md` and `docs/research/evidence-index.md`.

**Interfaces:**
- Consumes: local Git repositories, GitHub API metadata, Street Scene retained manifests.
- Produces: one immutable evidence index used by every later report.

**Steps:**

1. Record the exact local and remote repository identities for CS1, CS2, Street Scene One, Street Scene Showcase, and CS3.
2. Pin the four source repositories to full commit SHAs; record branch, commit date, and dirty-state caveats. Resolve the CS1 local/remote mismatch before treating them as one revision.
3. Record the selected Street Scene scene, manifest, delivery report, source commit, source-scene hash, and video hash.
4. Inventory authoritative plans, architecture documents, READMEs, source entry points, tests, workflows, evidence captures, and release/deployment records.
5. Mark each source as public-safe, private/read-only, generated-local, obsolete, or excluded. Separately identify untracked and ignored documents.
6. Add an evidence citation convention: repository-relative path plus line range for files, full SHA for commits, and SHA-256 for retained artifacts.
7. Verify every later planned document can cite a pinned source rather than a moving branch tip.
8. Commit the completed evidence index and README update.

**Validation:**
- Every repository and artifact used later has a stable identifier.
- No raw private content or machine-specific source path is copied into public-facing prose. Identify local-only evidence without publishing its contents.

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
2. Normalize terminology so similarly named concepts are not falsely equated: Bevy verification versus browser acceptance, deterministic GLB generation versus Blender export, procedural runtime geometry versus authored scene geometry, and user acceptance versus reference matching.
3. Add a chronological lineage showing which problems each successor intentionally simplified or solved differently.
4. Identify reusable patterns with evidence: deterministic core state, explicit ownership, production-path testing, fixed-view evidence, content hashes, honest failure states, bounded performance budgets, and public/private artifact separation.
5. Evaluate possible high-cost patterns against evidence: verification coupling, software-renderer dependence, importing fidelity too early, unbounded visual iteration, and treating render success as visual success.
6. Fill the decision matrix with one explicit status for every candidate pattern: adopt unchanged, adapt, defer, or reject. Include rationale and source citations.
7. Update the README index and commit the comparative explainer.

**Validation:**
- Recommendations never rely on one project's terminology alone; each is tied to observed outcomes.
- Contradictions between plans and final implementations are surfaced, not smoothed over.

---

### Task 6: Design the Mid Creek CS3 Blueprint

**Files:** Create `docs/architecture/cs3-blueprint.md`; modify `docs/architecture/decision-matrix.md` and `README.md`.

**Interfaces:**
- Consumes: Tasks 4-5 export findings and decision matrix.
- Produces: an implementation-ready CS3 architecture and milestone sequence.

**Steps:**

1. State CS3's product boundary and first vertical slice: a Three.js runtime using Blender-authored, reproducibly exported assets, with deterministic interaction/simulation kept independent from presentation. Confirm concrete gameplay scope before code-level planning.
2. Define repository boundaries for Blender sources, export scripts, promoted GLBs/textures, Three.js runtime, simulation, UI, diagnostics, tests, evidence, and deployment.
3. Define the asset contract: coordinate system, meters, naming, origins/pivots, collections, material subset, texture formats, animation naming/timing, custom metadata, provenance, hashes, size budgets, and stale-export detection.
4. Define the export pipeline from an immutable/copy-on-write `.blend` source through reproducible Blender CLI export, validation, optional optimization, manifest generation, and browser smoke loading.
5. Define runtime interfaces between asset loading, renderer, authored animation, deterministic simulation, input commands, DOM HUD, camera policy, diagnostics, and lifecycle/disposal.
6. Select the rendering approach based on Task 4: GLB baseline, explicit Three.js lights/shadows/color management, bounded DPR, responsive resize, loading/error states, WebGL fallback, and optional inspection controls.
7. Define validation layers: pure simulation tests, exporter contract tests, glTF validation, asset-budget checks, Three.js unit tests, Playwright gameplay/loading/fallback tests, fixed-view screenshots, start/middle/end animation captures, performance measurements, and deployed-path checks.
8. Define measurable initial budgets for GLB/textures, initial transfer, draw calls, triangles, load time, sustained frame timing, and visual-comparison evidence. Mark platform-specific performance as measured rather than inferred.
9. Define milestone order: repository/evidence foundation; one Blender-to-GLB fixture; one production scene slice in Three.js; deterministic interaction; visual comparison/material correction; performance hill climb; Pages deployment and exact-build verification.
10. Add failure and recovery behavior for export errors, missing textures, unsupported materials, stale hashes, model-load failures, WebGL loss, animation mismatch, visual-regression failure, and deployment-path errors.
11. Record the disposition of alternatives, including a CS1-style custom GLB generator, CS2-only procedural geometry, and a monolithic Blender-rendered video experience.
12. Update the README with the recommended architecture and commit the CS3 blueprint.

**Validation:**
- Every adopted decision traces back to evidence in the comparative analysis.
- Every blueprint component has a clear owner, input, output, failure mode, and test surface.
- The first milestone can produce a working, reviewable vertical slice without requiring the full scene or game.

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
- Street Scene One's current Three.js material is a local, untracked design prompt. Task 4 must validate the proposed GLB boundary rather than repeat the prompt as fact.
- The selected scene's delivery report says it contains packed images and no linked Blender libraries. Treat Cycles world/shader fidelity and AgX appearance as export risks to investigate, not established compatibility.
- CS1 uses generated committed GLBs; CS2 uses runtime procedural geometry. The proposed CS3 direction is Blender-authored GLBs, not a default combination of all three asset-generation systems.
- This plan produces research and architecture documentation, with an explicitly bounded export probe. After Task 7, create a separate code-level implementation plan for the selected CS3 vertical slice.
