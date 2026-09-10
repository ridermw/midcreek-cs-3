# Mid Creek CS3

Research and planning for a Blender-authored, Three.js-based Mid Creek experiment.

## CS3 toolchain

**Rust is not required.** CS3 continues CS2's TypeScript/Three.js direction.

| Responsibility | Planned tools |
| --- | --- |
| Browser runtime, simulation, input, and HUD | TypeScript, Three.js, DOM/CSS |
| Development and production bundling | Node.js and Vite |
| Asset authoring and export | Blender with Python scripts, glTF/GLB |
| Validation | Vitest, Playwright, Python/export checks |

No Cargo, Bevy, Rust asset generator, or custom Rust-to-WASM build belongs in
CS3's development, CI, or deployment pipeline. Rust references in the research
describe CS1 and the original Midcreek game, not prerequisites for this project.
The [plan's toolchain decision](plan.md#cs3-toolchain-decision-no-rust) covers
reuse, deterministic simulation, measurement, and performance implications.

## Saved work

| Document | Contents |
| --- | --- |
| [Reviewed plan](plan.md) | Three execution units, settled architecture/site decisions, T1-T9 test map, and performance gates |
| [CS3 blueprint](docs/architecture/cs3-blueprint.md) | R3 implementation-ready contracts, ten ordered implementation units, reference/asset/site workflow and qualification gates; awaiting user review |
| [Research findings](docs/research/initial-findings.md) | R1 comparison and fresh R2 export/load results, appearance limits and reproduction procedure |
| [R2 probe source](probes/r2/) | Bounded Blender export, real Three.js checks, resource guard and negative evidence tests; not a game |
| [Evidence index](docs/research/evidence-index.md) | Reconciled revisions, inspected source and GitHub discussions/workflows, recorded artifact identities, and evidence limits |
| [Cel Shift source and size audit](docs/research/cel-shift-source-audit.md) | Existing 49-master inventory, prompt/sidecar provenance, publication blockers, and the documentation-only manifest/atomic-import contract |
| [Deferred work](TODOS.md) | The three explicitly selected follow-ups, with rationale, context, and dependencies |
| [R1 handoff and goal prompt](docs/handoffs/r1-research.md) | New-session orientation and a copyable research-only goal with a mandatory R1 review stop |

**Current branch:** `main` contains the completed R1-R3 research, probe source
and blueprint. The local `docs/r1-research` branch retains the R3 review
checkpoint at `ca8852d`. The user separately authorized committing and pushing
this work to `main` on September 10, 2026; this is not R3 approval or permission
to implement or deploy. The immutable handoff's `docs/research-plan` branch
and R1-only instructions are historical. Human review stops still apply.

## Current status

**R2 technical proof was approved September 10, 2026.** The user supplied
`approve-r2` for probe commit `a28f58c` and findings commit `7144246`.
**R3's documentation deliverable is complete and awaiting user review.**
The [blueprint](docs/architecture/cs3-blueprint.md) specifies ten ordered units
covering tooling, simulation/layout, held input/replay, reference adoption,
Blender assets, guarded loading, playable animation, qualification, showcase
and release-content gates. None has been implemented.
R1 was approved
September 10, 2026 at retained commit
`5ceac6f4d4e2f3357b27990d8badf39c4e34240c`. The user subsequently approved
R2's resource allowance, then amended the output location to **inside CS3,
Git-ignored**. All generated assets and captures are under
`.artifacts/r2/20260910T192651Z/`; none is committed.

Two fresh Blender runs and two fresh browser processes reproduce an eight-node,
4,764-triangle sample. The adapted **265,352-byte GLB** is byte-identical across
exports and passes 16 checks per browser run. It includes static brick geometry,
animated hero/wheel parts, six material bindings, two baked textures and a FONT
sign. Tests cover first-frame readiness, transforms/bounds, clip timing,
matched views, explicit load failures and last-complete evidence preservation.

**Direct material export is incompatible with this tested configuration.**
It produces three invalid `texCoord: -1` values, and procedural carbon has no
exported base-color texture. Explicit UV/base-color baking makes the small
sample loadable, but visibly changes its materials. FONT geometry exports
successfully with `export_apply=True`; its evaluated mesh, not the raw FONT
bounding box, is the correct bounds oracle.

Start review with `last-complete.json`, `negative-evidence-final.json`, and
`run-e/checks-3-comparison-*.png` in that ignored directory. The
[R2 findings and reproduction instructions](docs/research/initial-findings.md#r2-result-reproducible-bounded-exportload-proof)
explain the exact checks and commands.

This is **technical compatibility after adaptation**, not source-look or
Cel Shift fidelity, full-game performance qualification, or
a Street Scene viewer. R1's predecessor measurements remain historical.
The accepted scene's hash is unchanged; sibling work was not modified.
`approve-r1` and `approve-r2` are satisfied; `approve-r3` remains blocked.
R3 used pinned source reads and retained receipts/comparisons only, with one
documentation owner and no workers or executable experiments.
No game, reference importer or deployment was built.

**Autopilot is unit-scoped:** complete the authorized R1, R2, or R3
autonomously, then **hard-stop for user review**. Each next unit requires
explicit user approval; completing a task or passing an automated review
does not open that gate. R3 also stops before any blueprint implementation.
The task tracker has separate human-only approval gates for all three units.

The approved first-playable direction reuses CS2's simulation and behavioral
tests, adds explicit fixed-tick held-arrow walking, keeps layout/collision in
TypeScript, and uses reusable Blender visual assets. Loading and shared-resource
ownership must be explicit; normal rendering comes before speculative caching.

The important pipeline distinction is already established: CS1 generated GLBs
in Rust without Blender, CS2 generated geometry directly in Three.js, and Street
Scene One delivered a Blender-rendered video. The earlier prompt-only Street
Scene Showcase snapshot had advanced to tracked export preconditions and
untracked exporter/viewer work at R1 intake, then advanced again during research.
The evidence index records those distinct observations. R1 did not run or
validate that work; it is not evidence of a successful Blender-to-browser path.

The comparative explanation, bounded export proof and implementation-ready
blueprint are consolidated on `main`, with the local `docs/r1-research`
checkpoint retained. R3 review remains pending.
Reference/publication permissions, production-asset and appearance qualification,
and named-target performance measurements remain gates, not achieved results.

## Planned GitHub Pages experience

A lightweight showcase will cover architecture/pipeline, concept art, Blender
work, mechanics, and measured results, linking to a separate playable demo.
Generated aspect-preserving thumbnails belong in ignored build output;
approved original artwork loads on demand. The showcase must not preload the game,
and the game must not fetch the reference catalog.

Initial targets are 2 MB showcase transfer and 15 MB game transfer through
interactive readiness. The game also has 250 draw-call / one-million-triangle
limits and a named desktop qualification target of at least 59 FPS mean and at
most 18 ms p95. These are requirements, not achieved measurements.

## Art reference source

The art reference source is `../midcreek-concept`: the complete Cel Shift
direction, including shared foundations, prompts, and provenance. The
`../midcreek/docs/artwork` catalog provides byte-identical master copies but
omits the shared prompt dependencies. The future reference import keeps all
49 distinct master files at 1536 x 1024 and excludes their 49 alternate
1280 x 720 previews and duplicate copies from Midcreek. The preparatory audit
records 86,349,779 bytes (82.35 MiB) of master PNGs; R1 did not repeat that measurement.
No artwork has been copied into CS3. Public use of every master, prompt and
gallery derivative is not yet approved; raw service metadata and private
reference material must not enter a public package.

This repository is the durable home for the plan, findings, and subsequent
project documentation. Sibling repositories and retained Street Scene artifacts
remain read-only reference sources. Raw private plans, logs, reference media,
and large delivery files have not been copied here.

R1/R2 approved; R3 deliverable complete, `approve-r3` blocked pending actual
user review. The closed R2 resource allowance is not renewed. Even after
blueprint approval, implementation, artwork import and deployment need a
separate explicit instruction. No push or publication is part of R3.
