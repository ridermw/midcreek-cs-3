# Remaining and Deferred Work

The only execution plan is [plan.md](plan.md). Completed research and checkpoint
history are in [the reference archive](docs/archive/README.md), not this list.

## Current continuation

The user started the continuation against the
[committed session goal](docs/architecture/cs3-continuation-goal.md), following
the [continuation plan](plan.md#september-11-pause-and-continuation-plan).
The earlier September 11 pause is historical; it did not renew the original
allowance. Keep C5 source `9844435` frozen and do not duplicate AR1's separately
launched appearance work.

- U6 guarded loading/resource ownership is complete with unit and real-browser
  failure/ownership coverage.
- U5 frozen two-run technical qualification passes: strict R1c/R2 at exporter
  `9213c63659158780f186c22e3bf6579353fb8f75`, 31 checks / 30 matched captures each,
  identical export/manifest/technical/five-GLB bytes, plus the 16-check
  `checks-strict-9213c63` eight-node regression. Full U5 appearance acceptance
  remains pending; technical checks do not decide appearance.
- Orchestrator: create the local ignored qualification receipt with
  `node --experimental-strip-types tools/qualify-assets.ts`; optionally append
  `--select local-playable` to activate the separately authorized provisional
  development package. The [dated amendment](docs/architecture/cs3-provisional-development-use-2026-09-11.json)
  records the actual user instruction and exact baseline. Neither persistent
  receipt creation nor selection was activated by the worker.
- Performance qualification, qualified production promotion, the release
  allowlist, public publication and final human appearance/release approval
  remain blocked/pending. Ignored development artifacts are not release inputs.
- Implement U7, then U8-U10 with baseline-specific claims and unchanged gates.
- Import any later AR1 replacement only through a pinned, reviewed handoff;
  rerun affected qualification rather than inheriting the old results.

AR1's separate session owns appearance research. Its outputs are not
automatically accepted by CS3. Final appearance/release approval remains
outstanding, and a pause never renews the original allowance.

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
