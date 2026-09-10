# Mid Creek CS3

A Blender-authored, Three.js-based Mid Creek experiment.

## Implementation checkpoint

**U1-U3 complete; U4-U10 pending.** The September 10, 2026 launch authorization
now permits unattended implementation on `main`. The exact user-approved
envelope, subsequent credit amendment, pinned input identities, resource
receipts and failed/successful checks are retained locally under
`.artifacts/implementation/20260910T232859Z/`. That authorization does not
permit Pages deployment or constitute final human appearance acceptance.

The root toolchain is exactly pinned and independently locked from R2.
Both `/midcreek-cs-3/` and `/midcreek-cs-3/play/` build and navigate in installed
Chrome. At this checkpoint they are honest entry shells, not a playable game
or a populated/qualified gallery. URL and build contracts pass 24 cases;
the browser navigation contract and five resource-supervisor checks pass.

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run test:e2e -- tests/e2e/build.spec.ts
npm run dev -- --host 127.0.0.1
```

During the authorized run, commands execute through `tools/run_guard.py`,
which uses the retained R2 ownership helpers, enforces the total repository
disk delta/deadline/free-space limits, and writes unique job logs and receipts.
Browser evidence uses a separate directory per job, retaining failed attempts.
Runtime asset, appearance, performance and release-content qualification are
still pending. The original R1-R3 records below describe their historical
research checkpoints; the implementation status above supersedes their
pre-launch state.

U2 reuses the pinned CS2 RNG, world contracts, simulation and behavioral
tests, preserving seeded faults, hidden dispatch intent, immutable snapshots,
five-tick movement and 120-tick repair. `LICENSE-CS2` retains the source notice.
Only the visual technician height changes to the approved 1.73 m.
TypeScript now creates 37 immutable visual placements and validates the
five-template join, identity/unit scale, envelopes, rack fronts/service cells,
grounded actor/fault visuals and outside-hall cooling units. All 55 current
unit/contract tests pass. Real Blender geometry remains U5 work; these
declarations are not an export or appearance pass.

U3 adds fixed-tick held arrows/WASD, opposite-key cancellation and
vertical-first precedence at every camera heading. The session owns ordered
commands, pause/restart epochs, hidden-time clearing and JSON-replayable
operations. The browser adapter preserves native focus/button behavior and
the pinned camera shortcuts. The current 89 unit/contract checks and 21
Chrome checks pass. Input browser checks mount the actual production
session/input/camera modules in an isolated test fixture; the scene/HUD
journey still belongs to U7, not a second simulation in the fixture.

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
| [CS3 blueprint](docs/architecture/cs3-blueprint.md) | User-approved R3 contracts and ten implementation units; remaining launch-envelope inputs precede execution |
| [Research findings](docs/research/initial-findings.md) | R1 comparison and fresh R2 export/load results, appearance limits and reproduction procedure |
| [R2 probe source](probes/r2/) | Bounded Blender export, real Three.js checks, resource guard and negative evidence tests; not a game |
| [Evidence index](docs/research/evidence-index.md) | Reconciled revisions, inspected source and GitHub discussions/workflows, recorded artifact identities, and evidence limits |
| [Cel Shift source and size audit](docs/research/cel-shift-source-audit.md) | Existing 49-master inventory, prompt/sidecar provenance, publication blockers, and the documentation-only manifest/atomic-import contract |
| [Deferred work](TODOS.md) | The three explicitly selected follow-ups, with rationale, context, and dependencies |
| [R1 handoff and goal prompt](docs/handoffs/r1-research.md) | New-session orientation and a copyable research-only goal with a mandatory R1 review stop |
| [Skills and installation sources](skills/README.md) | Observed tooling, verified source links, installation guidance and candidate skills for the blueprint units; no automatic installs |
| [Session telemetry and chronicle](skills/telemetry.md) | Dated CS1, CS3 and Street session/skill inventory, installed-versus-used distinctions, and the explicit missing CS2 history |

**Current branch:** `main` contains the completed R1-R3 research, probe source
and blueprint. The local `docs/r1-research` branch retains the R3 review
checkpoint at `ca8852d`. The user separately authorized committing and pushing
this work to `main` on September 10, 2026; this is not R3 approval or permission
to implement or deploy. The immutable handoff's `docs/research-plan` branch
and R1-only instructions are historical. Human review stops still apply.

## Retained research status

**R2 technical proof was approved September 10, 2026.** The user supplied
`approve-r2` for probe commit `a28f58c` and findings commit `7144246`.
**R3 was user-approved September 10, 2026 at `732ff39`** via `approve-r3`
at 18:26:14 EDT. The documentation deliverable and review are complete;
the finite resource limits and explicit source/publication grant still need
to be recorded in the single launch preflight before U1.
The [blueprint](docs/architecture/cs3-blueprint.md) specifies ten ordered units
covering tooling, simulation/layout, held input/replay, reference adoption,
Blender assets, guarded loading, playable animation, qualification, showcase
and release-content gates. None had been implemented at the R3 handoff.
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
`approve-r1`, `approve-r2` and `approve-r3` are satisfied; launch preflight remains incomplete.
R3 used pinned source reads and retained receipts/comparisons only, with one
documentation owner and no workers or executable experiments.
No game, reference importer or deployment was built.

**Research autopilot is unit-scoped:** complete the authorized R1, R2, or R3
autonomously, then **hard-stop for user review**. Each next unit requires
explicit user approval; completing a task or passing an automated review
does not open that gate. R3 also stops before any blueprint implementation.
The task tracker has separate human-only approval gates for those research units.

**Implementation will be unattended:** the revised blueprint
[collects approvals before U1](docs/architecture/cs3-blueprint.md#one-front-loaded-human-checkpoint).
One actual R3/launch approval covers U1-U10, local asset/reference work,
delegated appearance checks, permitted publication/staging and bounded
measured optimization. Required rights, finite resource limits and host
access must be resolved together before launch; they are not granted by this
documentation change. No routine approval prompts or progress notifications
are planned until after U10. An unrecoverable safety/resource blocker requires
truthful terminal closeout, not fabricated completion. Final human appearance
review and any live deployment decision remain after U10.

Commit and push every small, coherent, verified sub-checkpoint and milestone,
well before an hour passes during active work. Split oversized work early;
no unfinished/WIP commits to satisfy the clock. The 24-48-hour horizon is not
a guaranteed duration or an unlimited resource allowance.

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
checkpoint retained. R3 review is complete; implementation has not started.
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

R1/R2/R3 are approved; the remaining up-front launch fields must be completed
before implementation. The closed R2 resource
allowance is not renewed. The combined approval will authorize unattended
U1-U10 execution; deployment is a post-U10 decision. No implementation starts
as a result of this documentation revision.
