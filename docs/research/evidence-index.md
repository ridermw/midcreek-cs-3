# Evidence Index

Snapshot: September 10, 2026. This records what has already been inspected,
including limitations; it is not a completed evidence audit.

## Repository Revisions

| ID | Repository / sibling directory | Local HEAD | Caveat |
| --- | --- | --- | --- |
| E1 | `ridermw/midcreek-cs-1` / `../midcreek-cs-1` | `c00758396febc2961ece2a6e9556a09487a818fd` | Clean checkout, but GitHub history differed from local HEAD |
| E2 | `ridermw/midcreek-cs-2` / `../midcreek-cs-2` | `7ce1aa3a9d11cc5198167221a11f0cc5edb214e4` | Full-history clone; clean `main` tracking `origin/main` |
| E3 | `ridermw/street-scene-1` / `../street-scene-1` | `ae5a4e780ae4565294a882ffa931f41b623504d5` | Private source; clean tracked tree does not mean ignored plans are committed |
| E4 | `ridermw/street-scene-showcase` / `../street-scene-showcase` | `1538d862d1ceec391d7f7d94993d8d5980ec30ef` | `THREEJS-SESSION-PROMPT.md` is untracked |

CS3's repository identity is `ridermw/midcreek-cs-3`. It had no commits or
application files when research began.

The CS1 GitHub commit list observed during preparation began at abbreviated
SHA `19716a9`, dated September 2, 2026. The local checkout instead ends at
`c007583`, dated September 1, 2026. Local source reads and GitHub history must
remain separately attributed until that difference is reconciled.

## Inspected Sources

Paths below are relative to the named source repository, not CS3.

### E1: CS1

- `docs/implementation-plan.md`: first 240 lines and full heading inventory;
  product contract, locked decisions, architecture, asset pipeline, camera,
  gameplay, and publication design.
- `Cargo.toml`: dependency/toolchain declarations and native/WASM features.
- `src/lib.rs`: first 260 lines; plugin composition, ordered system sets,
  runtime startup, verification startup, and software-adapter profile.
- `src/assetgen.rs`: first 220 lines; deterministic serialization rules, asset
  names, rig/animation names, budgets, errors, and source schemas.
- File inventory: `src/{assets,world,player,camera,operations,hud,metrics,reference,verification,sitegen,web}.rs`,
  generator binaries, `assets/generated/*.glb`, and contract test suites.
- Local recent commits and GitHub's returned commit list, covering initial
  scaffolding through September 2 documentation.

Discovered but not yet fully read:

- `README.md`: the initial full read exceeded the tool limit.
- `docs/plans/2026-08-31-1507-feat-phase-2-hill-climb-plan.md`.
- The original plan's referenced Pages design and implementation documents.
- Runtime subsystems beyond the inspected entry points, complete contract
  suites, workflows, and individual corrective commit diffs.

### E2: CS2

- `README.md`: controls, architecture, commands, runtime status, and performance
  checkpoint.
- `docs/architecture.md`: immutable state ownership and static hall cache.
- `docs/hill-climb.md`: design, implementation checkpoints, tests, rejected
  experiments, measurements, release evidence, and cache acceptance protocol.
- `package.json`: Three.js, TypeScript, Vite, Vitest, Playwright, formatting,
  linting, and Node declarations.
- `src/app/game.ts`: first 260 lines; renderer setup, world composition,
  static/dynamic scenes, input, HUD commands, resizing, and context-loss handling.
- GitHub's recursive tree and complete five-commit history.
- Local clone remote, HEAD, clean status, and full-history flag.

Discovered but not yet fully read:

- `docs/art-direction.md`, `src/engine/hallCache.ts`, procedural geometry,
  simulation, camera, diagnostics internals, test bodies, workflows, and
  individual evidence JSON/PNG pairs.

### E3: Street Scene One

- `README.md`: selected result, source/data separation, capture controls,
  construction/capture commands, editing, materials, and reconstruction.
- `docs/plans/blender-claude-of-duty.md`: lines 1-250 and 350-582; goal,
  requirements, source-workflow adaptation, architectural decisions, work units,
  and outcome distinctions. This is local planning evidence, not copied here.
- `blender/build_scene.py`: scene construction, Cycles/Metal setup, car and
  camera keyframes, sky/light nodes, collections, dependency retention, and
  preview capture.
- `pipeline/capture.py`: imported-scene identity, capture specification,
  capacity forecast, and delivery approval checks.
- `pipeline/evidence.py`: file hashes, atomic records, retained dependencies,
  stale-review rejection, sequence validation, and curated progress output.
- Targeted source searches across Blender scripts and scene inspection tests.
- Source commit history: `db07a4a`, `d107a44`, `ae5a4e7`.

Discovered but not yet fully read:

- `pipeline/job.py`, `pipeline/runtime.py`, geometry builders, renderer,
  encoder, test bodies, critic instructions, and all retained attempt records.
- `docs/plans/original-blender-unreal.md` is obsolete; its occurrence in source
  search is not approval to execute it.

### E4: Street Scene Showcase

- `README.md`: public content boundary, final-video and attempt-gallery
  publication, selected scene limitations, build instructions, and provenance.
- Local untracked `THREEJS-SESSION-PROMPT.md`: complete proposed Three.js
  extension brief. It is not part of the pinned commit and not evidence of an
  implemented viewer.
- File inventory and Git history. The publication commit is `1538d86`.

### E5: Retained Street Scene Delivery

Read-only data root relative to the sibling data repository:

`../street-scene-1-data/run-20260909T124848Z/`

Inspected records:

- `attempt-23/scene.json`.
- `delivery/manifest.json`.
- `delivery/REPORT.md`.

Artifact identities recorded by those manifests:

| Artifact | Identifier |
| --- | --- |
| Selected scene SHA-256 | `0e4c90b1ab5bcfb052d2f5d2c5c4628a89b5b7145f6b6e9bf399d7f31cda4d05` |
| Delivered video SHA-256 | `31b4c10b7051ce67b980fbc12d39b5eedf1bbcf37ec168be1cc8f6c270dd1b1e` |
| Delivered source commit | `d107a44471d1973f0138901306f35bed22e079a9` |
| Source base commit | `db07a4ab3417211b97d82d89fdb81d1e5971946b` |
| Original scene owner | `run-20260909T020617Z` |
| Separate capture run | `run-20260909T124848Z` |

The manifests were read; the large scene/video files have not been independently
rehash-verified, opened, rendered, or exported during this research session.

## Evidence Rules for Continuation

Use source-relative paths and full commit IDs for tracked content. Hash
untracked/ignored planning inputs separately before relying on them as frozen
evidence. Record historical metrics as reported results unless actually rerun.

Do not infer a feature exists because a plan mentions it. Do not infer that
visual acceptance passed because a build, export, or video encode succeeded.
Do not publish private source documents, machine paths, raw logs, or reference
media merely because they were consulted.

## Remaining Baseline Work

1. Resolve CS1's local/GitHub revision difference without overwriting local work.
2. Confirm remote default-branch pins and capture full IDs for historical
   commits used in final case studies.
3. Establish hashes and provenance for untracked/ignored planning sources.
4. Inspect relevant pull requests, reviews, workflow runs, and commit diffs;
   the preparation inspected commit lists, not the complete GitHub discussion.
5. Verify selected artifact hashes and inspect the actual Blender scene before
   an export-compatibility claim.
