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
| [Research findings](docs/research/initial-findings.md) | Completed R1 comparison, corrective history, transferable contracts, historical-result limitations, and unresolved questions |
| [Evidence index](docs/research/evidence-index.md) | Reconciled revisions, inspected source and GitHub discussions/workflows, recorded artifact identities, and evidence limits |
| [Cel Shift source and size audit](docs/research/cel-shift-source-audit.md) | Existing 49-master inventory, prompt/sidecar provenance, publication blockers, and the documentation-only manifest/atomic-import contract |
| [Deferred work](TODOS.md) | The three explicitly selected follow-ups, with rationale, context, and dependencies |
| [R1 handoff and goal prompt](docs/handoffs/r1-research.md) | New-session orientation and a copyable research-only goal with a mandatory R1 review stop |

**Review branch:** Completed R1 is retained locally on `docs/r1-research`;
it has not been pushed. The earlier new-session guidance pointed at `main`,
and the immutable handoff captured `docs/research-plan`. Use the local R1
review branch for these conclusions rather than assuming either older branch
contains them. The handoff's R1-only instructions are historical; the current
R2 authorization and unresolved resource gate are recorded below. Human review
stops still apply.

## Current status

**R1 was approved September 10, 2026; R2 is blocked before probe execution.** The comparative
explanation and reference-import requirements are saved in the three research
documents above. The user reviewed commit
`5ceac6f4d4e2f3357b27990d8badf39c4e34240c`, confirmed available on local
`docs/r1-research`, and authorized R2 only. Its separate output/resource gate
is unresolved: no explicit external output directory, fresh time/disk limits,
or recovery reserve was supplied. Approval was requested but unavailable.
`approve-r1` is satisfied; `approve-r2` and `approve-r3` remain blocked.
R3 is unauthorized and has not been started, prepared, scheduled or delegated.

R1 reconciled CS1's local/remote divergence: production source matches, but
remote render-test policy and documentation differ. It distinguished CS2's
repeat-driven keyboard behavior from the required held-arrow adapter and
qualified its dirty-candidate, platform-specific performance evidence. Street
Scene's selected delivery passed technical/user acceptance while missing the
reference target; export compatibility remains unproven here.

**No export/load checks were performed.** R2 intake only inspected local Git
history and recorded the approval/blocker; no probe code, installs, scene copies,
Blender/browser jobs or workers were started. No generated artifact paths or
reproduction commands exist. This is a permission blocker, not a demonstrated
compatibility or incompatibility. R1 produced documentation only:
no application/helper code, scripts, tests, builds, benchmarks, validators,
installs, prototypes, Blender launches, asset processing/copying or deployment.
Prior-project measurements, hashes and dimensions remain recorded evidence,
not results rerun in CS3. Two bounded read-only workers finished; one owner
made the documentation edits. No sibling source was modified by R1.

No CS3 runtime, export probe or browser suite exists. The findings record
questions about source identity, material/animation portability, encoding
provenance, publication permission and later qualification; they do not
prepare or start the next units.

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

The comparative explanation is complete for review. The requested export proof
and CS3 blueprint remain later gated work. The intended direction is
Blender-authored assets consumed by Three.js; compatibility still needs evidence.

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

Awaiting user review of R2.
