# Deferred Work

Selected during the September 10, 2026 plan-exit review. These items are not
authorization to implement them or to expand the three-unit plan.

## Research checkpoint

| Unit / gate | State on September 10, 2026 |
| --- | --- |
| R1 / `approve-r1` | Complete / user-approved at `5ceac6f` |
| R2 / `approve-r2` | Complete / user-approved for `a28f58c` and `7144246`, recorded at `806d3c5` |
| R3 / `write-cs3-blueprint` | Documentation deliverable complete at [cs3-blueprint.md](docs/architecture/cs3-blueprint.md); ten implementation units specified, not executed |
| `approve-r3` | **Satisfied:** user supplied `approve-r3` for `732ff39` on September 10, 2026 at 18:26:14 EDT |
| Launch preflight | **Satisfied:** user approved the launch envelope and source/publication uses September 10, 2026; subsequent credit amendment and exact limits remain in the ignored authorization receipt |
| Blueprint execution | **U1-U2 complete; U3-U10 pending**; proceed without mid-run human checkpoints under `.artifacts/implementation/20260910T232859Z/authorization.json` |
| Post-U10 human review | Final appearance/release review and deployment decision; no live deployment in the unattended run |

The closed R2 allowance is not renewed. The new implementation
[launch envelope](docs/architecture/cs3-blueprint.md#one-front-loaded-human-checkpoint)
is authorized; interruption does not renew its clock or limits.
Agent appearance, technical and publication-policy checks run without human
interruptions; results are not human-approved until final review.
D1/D3 remain deferred. D2 is dormant until a measured miss and may activate
within the completed launch scope/budget. U1 establishes only the toolchain,
guarded job execution and isolated entry builds, not gameplay qualification.
U2 adds the preserved deterministic core and validated visual placement
contracts; real media and integrated gameplay are still pending.

## D1: Complete Street Scene interactive viewer

**What:** Build a full Three.js interpretation of the selected Street Scene
attempt 23, beyond the bounded export sample.

**Why:** The small probe establishes technical compatibility but cannot prove
that the entire animated street, lighting, materials, and camera survive the
web-runtime translation as a coherent experience.

**Context:** `street-scene-1` contains the private Blender authoring/capture
pipeline; `street-scene-1-data` contains the frozen scene and delivery;
`street-scene-showcase` contains the published video/gallery and an untracked
Three.js extension prompt, not an implemented viewer. Start with the pinned
sources and scene hash in `docs/research/evidence-index.md`, then the R2 probe
findings. Preserve the selected source bytes and existing showcase pages.
Classify material/lighting differences honestly instead of promising
pixel-identical Cycles output. This belongs in a separately approved showcase
project, not as extra CS3 gameplay scope.

**Depends on / blocked by:** R2 export findings, separate product and repository
write approval, reviewed publication rights, and a new resource allowance.
Old Street Scene run deadlines must not be extended or reused.

## D2: Optimize rendering only after a measured budget miss

**What:** Profile a failing CS3 workload and implement the smallest
quality-preserving rendering optimization that addresses the measured cause.

**Why:** Meet the agreed frame-time, draw-call, triangle, and transfer budgets
without lowering visual fidelity or making misleading performance claims.

**Context:** The approved baseline uses normal rendering, shared asset
resources, and explicit instance ownership. CS2's `src/engine/hallCache.ts`
provides useful prior art, but invalidates only on camera matrices and
drawing-buffer size. An imported scene may also change geometry, materials,
lighting, or animation. Capture walking, repair, and orbit/resize before/after
results on the same named target. Compare allocation/resource reuse, batching,
asset simplification, and cache/worker approaches against the actual bottleneck.
If a static cache is justified, require explicit invalidation and regression
tests for every mutable input, occlusion, and actual frame rendering. Do not
introduce a cache merely because CS2 used one.

**Depends on / blocked by:** Implemented first playable, trustworthy
asset-ready metrics, hardware qualification, and an observed budget miss.
The combined R3/launch approval covers bounded D2 work inside U1-U10 without
a further human instruction. Preserve matched quality, behavior and target
gates; no expansion into D1/D3 or extension of the resource allowance.
If the normal renderer meets the targets, close this item as unnecessary.

## D3: Extend browser and GPU qualification

**What:** Qualify the showcase and demo on additional explicitly selected
browsers/devices beyond the first named desktop target.

**Why:** One device's successful load or 60 FPS result does not establish
compatibility, memory safety under pressure, or acceptable performance for
the intended wider audience.

**Context:** The current plan requires a named browser/GPU/backend, fixed
comparison conditions, real arrow-key interaction, responsive layout, and
separate showcase/game transfer budgets. Start from those recorded results
and the T3/T5/T7/T8/T9 tests. Select additional targets based on the intended
audience, including their input capabilities, DPR, and resource constraints.
Check WebGL support and loss, load failures, interaction/focus, gallery
decoding, resize, and asset-ready timings. Keep visual references appropriate
to each backend; do not use Windows/SwiftShader PNGs as a universal oracle.
Do not claim touch gameplay support solely because a narrow layout renders.

**Depends on / blocked by:** A stable first playable and showcase, the initial
desktop qualification, selected additional targets, and access to those
environments. Hardware-budget changes require an explicit decision rather
than silently weakening the original target.
