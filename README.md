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
| [Implementation plan](plan.md) | The complete seven-stage research and CS3 blueprint plan, task dependencies, and current status |
| [Initial findings](docs/research/initial-findings.md) | Findings already gathered from CS1, CS2, Street Scene One, their plans, source, GitHub history, and delivery records |
| [Evidence index](docs/research/evidence-index.md) | Source repositories, inspected files, revision pins, artifact hashes, and remaining evidence gaps |
| [Cel Shift source and size audit](docs/research/cel-shift-source-audit.md) | Concept/game source comparison, all 49 master identities, preview sizes, and the nonduplicating reference-import plan |

## Current status

Preparatory research and the plan are saved here. CS2 has been cloned alongside
this repository at `../midcreek-cs-2`, with full history and a clean checkout at
`7ce1aa3a9d11cc5198167221a11f0cc5edb214e4`.

The seven formal research and blueprint tasks remain pending. No CS3 runtime,
Blender export probe, browser validation, or final architecture has been
implemented. Prior-project measurements in the research notes are historical
evidence, not results rerun in CS3.

The important pipeline distinction is already established: CS1 generated GLBs
in Rust without Blender, CS2 generated geometry directly in Three.js, and Street
Scene One delivered a Blender-rendered video. Street Scene's Three.js conversion
exists as a local design prompt, not an implemented export/runtime pipeline.

The requested deliverables are both a comparative explanation of those projects
and a CS3 implementation blueprint. The intended direction is Blender-authored
assets consumed by Three.js; the export strategy still needs evidence.

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
