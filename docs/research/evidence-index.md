# Evidence Index

> **REFERENCE ONLY - pinned sources and dated research evidence.** This is
> not a work plan. Historical approval/blocker statements do not override
> [the current plan](../../plan.md) or reopen completed research.

Updated September 10, 2026. R1 source research and R2 technical proof are
complete. The R1 sections retain their inspection-only scope; the
[fresh R2 evidence](#fresh-r2-execution-evidence-september-10-2026) records the
bounded export/load runs. Neither constitutes publication-rights, whole-game
performance or user appearance approval.

**Subsequent approval, September 10, 2026:** The user's `approve-r2` accepts
the R2 handoff at probe commit `a28f58c59e2f02a4fbbe151dd84dea2203887d64`
and findings commit `7144246e27e68b786abc121ce5fa6101a8dc0583`, with its recorded
limitations. R3's [blueprint](../architecture/cs3-blueprint.md) is complete and
was user-approved at `732ff39` on September 10, 2026 at 18:26:14 EDT.
At that R3 checkpoint, launch-envelope fields were still missing; the later
launch was approved and U1-U4 are now complete. R3 re-read pinned E2/E6 source, approved commit
history and retained final R2 receipts/comparisons without a new experiment.
Historical receipts and intake/
closeout approval states are unchanged; the R2 resource allowance is not renewed.

**Evidence classes:** **Source** means inspected code, configuration, history,
or a GitHub record; **Historical result** means a retained run's report;
**Inference** means a conclusion not demonstrated by execution here. All
previous image dimensions, byte sizes, and hashes remain attributed to the
preparatory audit or retained manifests. No executable checks were performed
in R1, and no asset hashes or dimensions were remeasured.

## Repository Revisions

| ID | Repository / sibling directory | Inspected local revision | Caveat |
| --- | --- | --- | --- |
| E1 | `ridermw/midcreek-cs-1` / `../midcreek-cs-1` | `c00758396febc2961ece2a6e9556a09487a818fd` | Clean; divergent local/remote history reconciled below, without checkout changes |
| E2 | `ridermw/midcreek-cs-2` / `../midcreek-cs-2` | `7ce1aa3a9d11cc5198167221a11f0cc5edb214e4` | Clean; matches observed GitHub default `main` |
| E3 | `ridermw/street-scene-1` / `../street-scene-1` | `ae5a4e780ae4565294a882ffa931f41b623504d5` | Private source; clean tracked tree does not mean ignored plans are committed |
| E4 | `ridermw/street-scene-showcase` / `../street-scene-showcase` | `7024553a797997c0e06689ebcc176e6e126173a2` | Advanced since preparation; tracked preconditions plus untracked exporter/viewer work, not validated here |
| E6 | `williamsmat_microsoft/midcreek-concept` / `../midcreek-concept` | `870603632c4b6665c513d0fa692a3ee2dae2b683` | Clean checkout; primary art source; overview contains stale count/camera wording |
| E7 | `azure-core/midcreek` / `../midcreek` | `b2e736726f7f9aea610274931b9c62555e9eeb67` | Clean checkout; master-art mirror, but all 47 copied prompts lack their referenced shared bases |

CS3's repository identity is `ridermw/midcreek-cs-3`. It had no commits or
application files when research began.

GitHub default branches are `main`. E2, E3, E6, and E7 match the local pins
above. E1 remote `main` is `19716a91e23a229700738827dfab10a72cca27ea`.
E4 remote `main` was `90713e9b3efb0b67b60d8287b9b2a647fb30e33b` during
inspection; its local tip above is one subsequent commit. These are dated
observations, not promises about future remote state.

### E1 local/remote reconciliation

The merge base is `cb9fd3a31d213c865add836e381d92f371195831`. Local has
one additional commit, `c00758396febc2961ece2a6e9556a09487a818fd`, adding
`LICENSE`. Remote has three:

| Remote-only commit | Meaning |
| --- | --- |
| `3d05ae2d3233eef6cc916714a8eec2d7f49a71c5` | Two Windows-only render-test ignores become unconditional after Linux reproduction was reported |
| `fefb948d07e392097b54cec7910683c11e5445b3` | Record compilation/capture timing decisions |
| `19716a91e23a229700738827dfab10a72cca27ea` | Document baseline rebinding after probe changes |

The complete local-to-remote changed-path set is `LICENSE`, `README.md`,
`TODOS.md`, and `tests/render_contract.rs`. Production `src/`, assets,
manifests, workflows, and plans are identical. Thus local source explains
remote runtime construction, but local render-test policy does not represent
the later remote policy. A local-only license is not a remote deletion event.
Existing Git objects and GitHub's merge-base-to-remote comparison establish
this without fetching or moving either checkout. GitHub's direct divergent-tip
comparison returned 404; it was not treated as proof of missing history.

### E4 temporal boundary

The preparatory pin `1538d862d1ceec391d7f7d94993d8d5980ec30ef` contained
the video/gallery publication; the local extension brief was then untracked.
The subsequent `90713e9b3efb0b67b60d8287b9b2a647fb30e33b` and local
`7024553a797997c0e06689ebcc176e6e126173a2` establish a newer tracked
checkpoint. Read `README.md:78-104`, `tools/export_contract.py:10-107`,
`configs/gltf-export.example.json:1-22`, and `.gitignore:9-14` at the latter
pin: source/output guards and animation-time intent exist, but that checkpoint
explicitly does not export a GLB.

At R1 intake, untracked `blender/{export_gltf,gltf_materials}.py`, `web/*`,
`docs/interactive/index.html`, package/Vite files, and export/browser/web test
files were present. Only enough content was read to classify the work, not
review or validate it. It is a changing sibling workspace, not a frozen CS3
input or evidence that R2 has passed. R1 did not create or modify those files.

**Closing status observation:** while CS3 documentation was being written,
E4 advanced independently to `d64759d731045157cbe59a9bacb6f7cb74728c3b`,
with tracked modifications to `blender/gltf_materials.py` and
`tests/inspect_gltf_export.py`. That later implementation was not inspected
or qualified; the detailed source citations remain pinned to `7024553...`.
Do not describe the whole sibling workspace as unchanged or still
untracked-only. The other five source repositories retained their intake
HEADs and clean statuses. R1 issued no sibling write, commit, fetch or checkout.

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

R1 additions:

- README, Pages design/implementation history, Phase 2 hill-climb plan and
  amendments, remote `TODOS.md`, and `.github/workflows/pages.yml`.
- `src/{assets,player,operations,design,camera,metrics,verification,sitegen}.rs`
  and relevant app/asset/metrics/render/Pages contract bodies. Targeted ranges
  and corrective diffs, not an exhaustive review of every implementation line.
- `docs/reference/{fidelity,phase-1-baseline}.json` and
  `tests/fixtures/metrics/key-art.json`: recorded calibration/baseline evidence.
- Skinning, clip-transition, measurement, renderer-profile, Pages recovery,
  camera/revert, and quarantine diffs; PR/issue evidence below.

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

Additional plan-exit-review reads:

- `src/world/contracts.ts`, `src/world/layout.ts`, the first 235 lines of
  `src/world/simulation.ts`, and its exported function locations.
- `src/engine/hall.ts`, `src/engine/hallCache.ts`, the later application loop
  and teardown in `src/app/game.ts`, input mapping/tests, and
  `src/diagnostics/metrics.ts`.
- Gameplay, evidence, render-cache, and performance browser test files;
  `playwright.config.ts`, `src/config/performanceBudget.ts`, and the first
  230 lines of the simulation unit tests.

These reads grounded the reuse decisions and exposed two adaptation risks:
camera/size-only cache invalidation and `loadEventEnd`-based transfer accounting.
No predecessor tests were run during this review.

R1 additions: complete simulation, layout, keyboard mapping/test, application
loop and teardown, geometry/hall/cache source, art direction, all four browser
test files, both workflows, manifest/lockfile, and cache commit diff. Retained
hill-climb tables and cache JSON were read without decoding images or rerunning
measurements. Lockfile entries resolve Three.js `0.185.1` and Vite `8.2.2`;
these are source declarations, not installed-version observations.

CS2 has five commits:
`02f96747e6ad44dac4dd6bc8c2222d861dfc925a`,
`e5b0e8ae5cc100bbd1bddc24752eb1aa1cb6e4d8`,
`40976cf17a99f3f4eca422d9596ad72b4ed85137`,
`dac694096bcda82a638bc4b659d4a26bad5ad144`, and
`7ce1aa3a9d11cc5198167221a11f0cc5edb214e4`.
The cache JSON's `dac6940-dirty` identity is a candidate working-tree base,
not proof the clean predecessor commit contained the cache.

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

R1 additions: `pipeline/{job,runtime}.py`, `blender/{street,hero_car,parked_cars,render_scene}.py`,
`tools/{encode_video,label_packet}.py`, critic instructions, selected acceptance
and delivery receipts. Full-history milestones are
`db07a4ab3417211b97d82d89fdb81d1e5971946b`,
`d107a44471d1973f0138901306f35bed22e079a9`, and the E3 pin above.
The first-to-second diff explains visual corrections, frozen-scene ownership,
and the deliberate distinction between design and independent reference acceptance.
Unselected attempts were not exhaustively audited.

`docs/plans/original-blender-unreal.md` remains obsolete. Its presence does not
authorize execution. No new hash was calculated for ignored/local plans.

### E4: Street Scene Showcase

- `README.md`: public content boundary, final-video and attempt-gallery
  publication, selected scene limitations, build instructions, and provenance.
- Preparatory local untracked `THREEJS-SESSION-PROMPT.md`: complete proposed
  extension brief, outside the original `1538d86` pin. It is historical planning
  context, not a frozen implementation or acceptance record.
- File inventory, history, and newer tracked precondition checkpoint described
  above. Publication history is not export/runtime acceptance.

### E5: Retained Street Scene Delivery

Read-only data root relative to the sibling data repository:

`../street-scene-1-data/run-20260909T124848Z/`

Inspected records:

- `attempt-23/scene.json`.
- `delivery/manifest.json`.
- `delivery/REPORT.md`.
- R1 additionally read `attempt-23/approval.json`,
  `delivery/{video-inspection,repeat-capture,editing-verification}.json`,
  `delivery/source-review.md`, and material provenance records. Public-safe
  conclusions only are reproduced; private paths and review transcripts are not.

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

### E6: Midcreek Concept

- Root README, `ART-BIBLE.md`, `themes/cel-shift/README.md`, and
  `themes/cel-shift/theme.yaml`.
- `themes/_shared/foundation.md`, `themes/_shared/foundation.json`, and the
  tracked shared-file inventory.
- `docs/decisions/projection.md`, including the explicit reversal of the
  axis-aligned recommendation.
- `themes/cel-shift/prompts/key-art-diamond.mock.md` and all 47 prompts' shared
  `plan:` dependency targets.
- `tests/test_site.py:300-350,549-589`: prompt dependency and prose/JSON
  consistency contracts; read, not executed.
- The original and preview metadata for `key-art/04-diamond-bright.png`.
- Preparatory audit: Git tree comparison against E7, actual PNG headers/byte
  lengths and SHA-256 hashes for all 98 tracked Cel Shift images; not repeated.
- Art-source history through `8706036`, including `eedfcff` for preview
  additions and `0ed9011`/`b6b1c6a` for camera/reference/scale corrections.
- R1 read all 47 `plan:` associations, metadata field structure and representative
  master/preview history, character-restoration history, PRs 1/2 and their actual
  review outcomes. The complete image audit above was not repeated.

The [source audit](cel-shift-source-audit.md) records 49 full-resolution masters
and 49 alternate-resolution previews. The 45-plate count in the root README
does not match the tracked inventory. The README's axis-aligned wording also
conflicts with the accepted diamond-projection decision and shared foundation.

### E7: Midcreek

- Origin, local HEAD, clean status, root README, and `AGENTS.md`.
- `docs/artwork/README.md`, tracked catalog/support inventory, and
  `docs/artwork/prompts/key-art-diamond.mock.md`.
- Git blob comparison for every shared artwork-catalog path against E6.
- The artwork import/catalog commits `b81b083` and `b2e7367`.

All 49 masters, 49 master sidecars, 47 prompts, and `theme.yaml` have identical
Git blobs to E6; the catalog README differs. The concept repo additionally has
49 preview images and 49 corresponding sidecars. Every copied game prompt
still references `../../_shared/`, but none of those six base paths resolves
from its new location.

## Evidence Rules for Continuation

Use source-relative paths and full commit IDs for tracked content. Local or
ignored planning inputs without a previously recorded digest remain unfrozen
context. Establishing new artifact identities belongs to separately authorized
execution, not this R1. Record historical metrics as reported results.

Reading CS1 and Midcreek's Rust source does not make Rust a CS3 requirement.
CS3 uses TypeScript/Three.js and Python/Blender tooling. Historical executable
reproduction, if separately requested, is not part of CS3 setup, CI, or
deployment, and a missing Rust compiler does not block this document research.

Do not infer a feature exists because a plan mentions it. Do not infer that
visual acceptance passed because a build, export, or video encode succeeded.
Do not publish private source documents, machine paths, raw logs, or reference
media merely because they were consulted.

## GitHub Discussions and Workflow Evidence

Read-only GitHub API queries on September 10, 2026 inspected repository
metadata, commit comparisons, PR bodies/reviews/inline comments, issue comments,
Actions runs/jobs, and artifact metadata. These are historical server records,
not jobs run by R1. Dedicated GitHub Discussions is disabled on E2-E4 and
E6-E7; issue/PR discussions, especially E1, still supply evidence.

| Source | Observed record | What it establishes or limits |
| --- | --- | --- |
| E1 | `ridermw/midcreek-cs-1#1`, `ridermw/midcreek-cs-1#4` | Review-driven complete-evidence, degraded-publication, timeout and retained-provenance corrections; PR bodies alone do not carry the inline findings |
| E1 | `ridermw/midcreek-cs-1#5`; review comments `3896479943`, `3896480007`, `3896480186`, `3896480229` | Measurement asymmetry, undefined ratios, source provenance and binary coverage concerns |
| E1 | Open `ridermw/midcreek-cs-1#7`; comments `5493421178`, `5500169531`, `5501482314` | Reported moving pixel differences and Linux reproduction; not fresh R1 reproduction or a proven shared root cause for every render failure |
| E1 | Run `33565165791` at the merge base | Verify failed while Build web and Publish succeeded |
| E1 | Run `33590138994` at `fefb948d07e392097b54cec7910683c11e5445b3` | Verify, Build web and Publish succeeded |
| E1 | Run `33590215810`, attempt 2, at remote tip | Verify/Build web succeeded; Deploy Pages failed with duplicate `github-pages` artifacts; inspected artifacts are expired |
| E2 | No returned PRs, issues or commit comments | Its documented independent reviews are local historical reports, not GitHub PR approvals |
| E2 | Runs `33922403443` / `33922403453` at `40976cf17a99f3f4eca422d9596ad72b4ed85137` | Pages/Quality success agrees with the first-release report |
| E2 | Runs `33924944955` / `33924945020` at the pinned tip | Pages/Quality success, including browser-command steps; not an opt-in hardware timing or Windows pixel gate pass |
| E2 | Quality artifact `9956466988`, `browser-evidence` | Metadata says unexpired at inspection; payload not downloaded or examined in R1 |
| E3 | No returned PRs, issues, commit comments or Actions runs | Retained source-review/delivery receipts must be attributed locally |
| E4 | No returned PRs, issues or commit comments; Pages runs `34358977995`, `34507234128` | Successful publication at the original and observed remote pins; jobs deploy `main:/docs`, not Blender/browser qualification |
| E6 | `williamsmat_microsoft/midcreek-concept#1` and `williamsmat_microsoft/midcreek-concept#2` | Camera/plate-index correction and character-scale/restoration decisions; local results reported by authors |
| E6 | Reviews `5068638820`, `5069494748` | Hosted-runner-disabled notices, not substantive automated review approval; no inline review findings returned |
| E7 | PR inventory and direct artwork commits | Artwork import/catalog history is in the direct commits; no art-specific PR thread appeared in the returned inventory |

Selected additional full commit identities used in the findings:

| Source | Commit | Relevant change |
| --- | --- | --- |
| E1 | `6f8a5cb356f3149e3d587cfea9bf09fac131d596` | Skinning correction |
| E1 | `2aa9142d560b8fd86203f75e8e0b5944642a6c63` | Rest transforms on clip transitions |
| E1 | `4bff384a4eb8e2e7e24db89825bc73fbd552c0f6` | Pages review corrections |
| E1 | `b96ebdefd6f58f1a3c0efa28f2ce9458c663f6ec` | Measurement/provenance corrections |
| E1 | `2737f8a478f0c0516cd27ec8a7bc7b7f92985f42` | Software-renderer compatibility profile |
| E1 | `685c7ca261139479b838b060a0aecd4d2b1902a1` | Camera derivation, subsequently reverted at the merge base |
| E1 | `2426711cfde06cb38a3d255553735d1492d384e6` | Retained Phase 1 baseline's source identity |
| E6 | `49a25dc9e2eb8b9261736f4ef0cda283a6abc174` | Adopt diamond projection |
| E6 | `0ed9011350f73ecb734201c5e486a04d91d38f78` | Reference, camera and index corrections |
| E6 | `b6b1c6af408378039a64998b20383f5407cea1af` | Character scale and restored male sheet |
| E6 | `f173f7fea3fe357a37de57fed520115547ed9f9b` | Original animation-sheet history referenced by restoration |
| E6 | `eedfcff2425fd0ffc672dd23aeca59541c75776a` | Alternate previews |
| E7 | `b81b083e50e3888237c46707e4645d670e9f88f8` | Hero art import; followed by catalog at E7's pin |

## R1 Closure and Remaining Evidence Limits

Source/revision reconciliation, relevant discussion inspection, comparative
explanations, and the documentation-only reference-import contract are complete.
Two bounded read-only workers covered E1 and E3/E4/E5; both returned and ended.
The parent alone edited CS3 documentation. No sibling checkout was written by
R1, and no executable checks were performed.

Still unqualified: selected scene/video bytes, actual export/load behavior,
untracked/local planning identities, exact candidate-to-performance-artifact
binding, complete artwork publication permissions, and runtime visual fidelity.
These are explicit limits, not waived requirements. The findings' question
register records what requires later approval or execution; no R2/R3 work,
procedure, schedule, or delegation was started here.

## Historical R2 Intake Evidence: September 10, 2026

This checkpoint records local history and permission status only, not an
export/load experiment.

| Check | Fresh observation |
| --- | --- |
| Reviewed R1 history | `git show --no-patch --format=fuller 5ceac6f4d4e2f3357b27990d8badf39c4e34240c` succeeded |
| Retained branch | `git branch --contains 5ceac6f4d4e2f3357b27990d8badf39c4e34240c` included current `docs/r1-research` |
| Intake worktree | `git status --short --untracked-files=all` returned no changes |
| R1 approval | User explicitly approved that output on September 10, 2026 and authorized R2 only |
| R2 resource permission | No approved output directory, fresh time/disk limits or recovery reserve supplied; explicit request could not be answered because the user was unavailable |
| Execution result | Blocked before probe execution; neither compatibility nor incompatibility demonstrated |

No reset/discard, sibling write, accepted-scene access, new scene hash,
exporter pin/reuse, dependency install, export, browser check or capture was
performed. No R2 workers or long-running processes were started. There are no
new scene/GLB/capture paths, output hashes, tool-version receipts or executable
reproduction instructions. E4 and E5 remain the dated observations above,
not revalidated inputs. The findings and plan record this blocker;
`approve-r2` remains blocked and no R3 work was undertaken.

## Fresh R2 Execution Evidence: September 10, 2026

The later explicit resource approval and in-repository ignored-output amendment
supersede the intake blocker, not the original R2/R3 human-review boundary.
The root is **`.artifacts/r2/20260910T192651Z/`**, excluded by `/.artifacts/`.
Its `allowance.json` records the unchanged 19:26:51 UTC start, 20:46:51 UTC
heavy-work deadline, 20:56:51 UTC closeout deadline, 4 GiB cap with 512 MiB
reserve, 10 GiB free floor and one heavy job. Paths below are relative to that
root unless explicitly marked otherwise. Assets/captures/candidate snapshots
are retained locally, not committed, pushed or published.
The versioned probe is local commit
`a28f58c59e2f02a4fbbe151dd84dea2203887d64` on `docs/r1-research`.

At the 19:52:58 UTC closeout check, the artifact root used **238,559,232 bytes**
and the volume had **128,350,650,368 bytes free**, safely within the allowance.
All 23 recorded job PIDs/process groups had ended. Owned npm/node temporary
caches were removed; installed dependencies and complete/failed evidence remain.
The original and owned input hashes still matched. `closeout.json` records the
final post-commit snapshot without extending the allowance.

### Fresh Input and Candidate Pins

| Input | Identity / disposition |
| --- | --- |
| Accepted scene, freshly rehashed | `../street-scene-1-data/run-20260909T124848Z/attempt-23/scene.blend`; SHA-256 `0e4c90b1ab5bcfb052d2f5d2c5c4628a89b5b7145f6b6e9bf399d7f31cda4d05` |
| Owned input | `source.blend`, same SHA-256; source-copy checks precede Blender access |
| Candidate considered | `street-scene-showcase` revision `3298bec1b1a853ada041d33576296ba910142a8f`; **not reused** |
| Candidate `blender/export_gltf.py` | SHA-256 `96d8846b3e92db5966471ac149b7df0e7cf21dc0051f998d89cb6fad6a205fc1` |
| Candidate `blender/gltf_materials.py` | SHA-256 `5c17626bb01811adf8deba1f88dfe2e03cb37040e4a3ca1cfeb0709e04cca15a` |
| Snapshot qualification | Both snapshot hashes were compared to `git show` bytes at the candidate commit and matched; no assumption about a changing worktree |
| Independent later sibling observation | Showcase advanced to `8d1b1195b31138da68cf200f16589a754b5c3b88` during R2; not the inspected/reused pin and not validated by CS3 |
| Independent CS3 exporter | `probes/r2/export_sample.py`, SHA-256 `089050fff0dd9b8135ca487d1a57f26377e3f2e709220ecddb528de85bae50a7` |

`source-identity.json` records the source/candidate identities and non-reuse
reason. `inventory.json` records the owned scene's materials, packed-image
hashes, units, animation, color settings and bundled exporter option inventory.
`run-d/export.json` and `run-e/export.json` record exact selected roles,
packed source-image hashes, export flags, poses/evaluated bounds, conversions,
lighting, camera records and all exported/captured file hashes/sizes.

### Actual Toolchain

| Tool / surface | Observed value |
| --- | --- |
| Blender | `5.2.1 LTS`, build `9e2066aef7ef`, built August 25, 2026 |
| Bundled glTF exporter | `5.2.40`, recorded in `exporter-version.log` |
| Python | `3.14.7` |
| Node / npm | `v22.23.1` / `10.9.8` |
| Three.js | `0.185.1` |
| Playwright | `1.63.0`, installed Chrome channel; no browser download |
| Khronos validator package | `gltf-validator` `2.0.0-dev.3.10` |
| Chrome | `153.0.8010.37` |
| Actual WebGL renderer | WebGL2; `ANGLE (Apple, ANGLE Metal Renderer: Apple M4 Pro, Unspecified Version)` |
| Browser target | Headless, 640x360 drawing buffer/viewport, DPR 1, loopback-only asset traffic |
| Versioned dependency manifest | `probes/r2/package.json`, SHA-256 `3cec850bf8a74b09001c7a2d8ee33372e6179c1436fcb0774e38f6fab6df9e44` |
| Versioned dependency lock | `probes/r2/package-lock.json`, SHA-256 `be936e762a422c91e0c89889ad4b1f485c9767dca491005e68b211dc1a03ed5a` |

### Qualifying Artifacts and Checks

Both fresh export runs produce these identical files:

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `direct.glb` | 3,066,148 | `42941fd8c27e58d62867f75e6d09fc9073bcdbbc83b86ccaf3b4761861873d98` |
| `portable.glb` | 265,352 | `b70e082d676c1d92d1dc3892fcbb4f056c97683987c2226d7e9e7b31577f096d` |

| Retained evidence | Result / meaning |
| --- | --- |
| `run-d/checks-3.json`, `run-e/checks-3.json` | Two fresh real browser processes, **16 passed checks each**, ten captures and ten three-way comparisons each |
| `run-*/checks-3-validator-portable.json` | Zero errors, zero warnings; one informational unused sign UV |
| `run-*/checks-3-validator-direct.json` | Three invalid brick `texCoord: -1` errors, one tangent-space warning; direct export incompatibility reproduced |
| `run-*/checks-3-comparison-*.png` | Left to right: source Blender / adapted Blender / adapted browser; appearance evidence, not an acceptance gate |
| `run-e/emission-diagnostic-2/` | Corrected orthographic emission-only material diagnostic; script/input/capture hashes and camera metadata in its receipt |
| `last-complete.json` | Atomically promoted `run-d`/`run-e` current-code evidence, SHA-256 `ecbe78ab03d43ab547a3c2796b1f1bd301d3570bf68ebed3b2731c05a5a26a81` |
| `negative-evidence-final.json` | Wrong identity, corrupt candidate and real supervisor SIGINT: **3 passed**, pointer hash unchanged before/after |
| `final-python-tests.log`, `final-node-tests.log` | **6 Python / 7 Node tests passed**; guarded receipts retain commands and log hashes |
| `*.job.json`, matching `.log` | Exact owned command/PID, allowance, timeout, exit/outcome, resource usage and log hash, including failed attempts |
| `closeout.json` | Final source/pointer/code identities, local commit, resource/time snapshot and owned-process status |

Final checker identities are also embedded in both qualifying check receipts:

| File in `probes/r2/` | SHA-256 |
| --- | --- |
| `browser.mjs` | `9da14f88b3a0f80a878a88f2bafd8a88cceea1357ec4b1a8fc8162b26805229c` |
| `lifecycle.mjs` | `578fb16b40361020f5ed8383d80f9b17f341a3e2710946c9a6b6781e3dd83502` |
| `glb.mjs` | `2f27d1425edd08d565892b41706f73c9b8fbb8f98f298d3cc094e15f5ae0a7dc` |
| `check.mjs` | `9dc0c36ca9bfd0754655d252aa2c7e8c3372b82ffc9b5234f007cd83912cf4d2` |

`run-a`, `run-b`, `run-c`, earlier `checks`/`checks-2` receipts, and the first
emission diagnostic are developmental or superseded observations, not the final
proof. In particular, the first emission diagnostic had mismatched perspective/
orthographic cameras; only `emission-diagnostic-2` supports the material-isolation
finding. Failed runs remain available rather than being rewritten as successes.

Fresh R2 supports the bounded adapted technical path, direct-export failure,
FONT geometry, sampled animation and explicit failure/lifecycle boundary.
It does **not** validate the changing showcase implementation, whole-scene
fidelity, accepted video bytes/encoding, Cel Shift artwork, publication
permissions or game performance. See the findings for exact reproduction and
remaining material/color questions. R1 source history remains retained;
`approve-r2` was blocked at closeout and subsequently satisfied by the user on
September 10, 2026. R3 subsequently completed its documentation-only blueprint;
the user subsequently supplied `approve-r3` for revised blueprint `732ff39`.
Launch preflight remains incomplete and no implementation has started.
