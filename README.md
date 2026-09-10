# Mid Creek CS3

Research and planning for a Blender-authored, Three.js-based Mid Creek experiment.

## Saved work

| Document | Contents |
| --- | --- |
| [Implementation plan](plan.md) | The complete seven-stage research and CS3 blueprint plan, task dependencies, and current status |
| [Initial findings](docs/research/initial-findings.md) | Findings already gathered from CS1, CS2, Street Scene One, their plans, source, GitHub history, and delivery records |
| [Evidence index](docs/research/evidence-index.md) | Source repositories, inspected files, revision pins, artifact hashes, and remaining evidence gaps |

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

This repository is the durable home for the plan, findings, and subsequent
project documentation. Sibling repositories and retained Street Scene artifacts
remain read-only reference sources. Raw private plans, logs, reference media,
and large delivery files have not been copied here.
