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
| [Initial findings](docs/research/initial-findings.md) | Findings already gathered from CS1, CS2, Street Scene One, their plans, source, GitHub history, and delivery records |
| [Evidence index](docs/research/evidence-index.md) | Source repositories, inspected files, revision pins, artifact hashes, and remaining evidence gaps |
| [Cel Shift source and size audit](docs/research/cel-shift-source-audit.md) | Concept/game source comparison, all 49 master identities, preview sizes, and the nonduplicating reference-import plan |
| [Deferred work](TODOS.md) | The three explicitly selected follow-ups, with rationale, context, and dependencies |
| [R1 handoff and goal prompt](docs/handoffs/r1-research.md) | New-session orientation and a copyable research-only goal with a mandatory R1 review stop |

**New-session branch:** Use `main`. The immutable handoff captured the earlier
`docs/research-plan` checkout and its publication state at that time. Substitute
`main` for that branch when using its goal prompt; the R1-only scope and human
review stops still apply.

## Current status

Preparatory research and the plan are saved here. CS2 has been cloned alongside
this repository at `../midcreek-cs-2`, with full history and a clean checkout at
`7ce1aa3a9d11cc5198167221a11f0cc5edb214e4`.

The plan-exit review is complete. The reduced plan has three pending units:
finish the evidence/comparison, prove a bounded export/load path, and produce
one implementation-ready CS3 blueprint. No runtime, export probe, or browser
test suite has been implemented. Prior-project measurements remain historical
evidence, not results rerun in CS3.

**R1 is research-only:** search existing code, docs, history, and retained
reports, then write conclusions. It produces documentation, not code or tools.
No builds, tests, scripts, dependency installs, asset processing, or prototypes
run in R1. Questions requiring execution are recorded for R2 or later work.

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
Scene One delivered a Blender-rendered video. Street Scene's Three.js conversion
exists as a local design prompt, not an implemented export/runtime pipeline.

The requested deliverables are both a comparative explanation of those projects
and a CS3 implementation blueprint. The intended direction is Blender-authored
assets consumed by Three.js; the export strategy still needs evidence.

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
1280 x 720 previews and duplicate copies from Midcreek. The master PNGs total
86,349,779 bytes (82.35 MiB); no artwork has been copied into CS3.

This repository is the durable home for the plan, findings, and subsequent
project documentation. Sibling repositories and retained Street Scene artifacts
remain read-only reference sources. Raw private plans, logs, reference media,
and large delivery files have not been copied here.
