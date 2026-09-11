# Mid Creek CS3

A Blender-authored, Three.js-based data-hall simulation.

**Continuation active.** U1-U4 and U6 are complete. C5 source is checkpointed;
U5 final technical packaging and U7-U10 remain unfinished. No production
library is promoted, and the application entries are not yet a playable game.

## Start here

| Document | Role |
| --- | --- |
| **[plan.md](plan.md)** | **The only active work plan:** next-session work and boundaries |
| [New-session goal](docs/architecture/cs3-continuation-goal.md) | Copyable goal, committed starting point and evidence locations |
| [Implementation contract](docs/architecture/cs3-blueprint.md) | Detailed unit requirements, verification and release gates; completed units are reference-only |
| [Remaining/deferred work](TODOS.md) | Outstanding work only, not a second execution plan |
| [Archive](docs/archive/README.md) | Completed research, superseded goals and old status snapshots; **do not execute** |

Do not resume R1-R3, repeat the satisfied launch gate, or select an archived
handoff. Older statements that implementation has not started are historical.

## Current baseline and next result

C5 source/tests are committed at `9844435f98848be030a3347108e1129c650ed875`.
The candidate preserves five asset IDs, the rigid technician hierarchy and
Idle/Walk/Repair. It adds corrected PPE bands/piping, shaped boots/calves and
differentiated leather equipment, retaining C4's diagnostic Repair task.

Its source/export/browser evidence is retained, but **technical agreement is
not appearance acceptance**. The last independent overall review assessed
the earlier C3 candidate and needs work; C4/C5 have not received overall
appearance acceptance.

The user reports AR1 is running separately in the concept repository to solve
authoring/rendering fidelity. This CS3 continuation completed U6 loading/lifetimes and now owns remaining U5
technical packaging and U7's actual playable, followed by U8-U10. No more broad
aesthetic sweeps belong here.

U6 now enforces the full required-ready deadline, stale-generation and context
loss guards, strict manifest/GLB identity and animation envelopes, same-origin
dependency loading, partial-failure cleanup and library-wide unique resource
teardown. Its focused verification currently covers 53 unit checks and 30 real
Chrome/WebGL browser cases, including delayed and failed loading, Reload/input
gating, time-zero posing and two-instance ownership.

Provisional development use requires a recorded, hash-bound exception and
does not relax technical, appearance or release gates. Future AR1 replacements
require a versioned handoff and affected qualification again.

## Toolchain and local commands

TypeScript, Three.js, DOM/CSS, Node/Vite, Vitest, Playwright, Python and Blender.
No Rust, Cargo, Bevy or custom Rust-to-WASM pipeline is required.

After resumption under a valid allowance, use the existing commands:

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run test:e2e -- tests/e2e/build.spec.ts
npm run dev -- --host 127.0.0.1
```

Install/restore dependencies only when needed. Heavy jobs run through
`tools/run_guard.py` with the original authorization and finite job timeouts.

## Local evidence and visual monitor

Approved references, generated Blender/GLB candidates, images and operational
receipts remain under ignored `.artifacts/`; they were not published by the
request to commit the session's source/documentation work. A clean clone does
not contain that local evidence. See the goal document for hashes and paths.

The live monitor is stopped for handoff. Its retained snapshot is
`.artifacts/implementation/20260910T232859Z/u5-monitor/index.html`.
It opens offline and depends on the retained local image files.
When the new session is authorized to resume, the existing monitor command is:

```sh
npm run u5:monitor -- --authorization .artifacts/implementation/20260910T232859Z/authorization.json
```

Do not start a second owner while its lock is held. Receipt-derived image
labels distinguish source, browser, comparison, reference and study images;
matching a receipt is not an approval. The tool publishes nothing.

## Authorization

The original launch is approved, but execution is currently paused. Heavy work
ends **September 12, 2026 at 22:28:59.608228 UTC** and closeout ends at
**23:28:59.608228 UTC**. A fresh session does not restart the allowance.
No Pages deployment, new external art-generation service or unapproved source
publication is authorized by this handoff.

The [research references](docs/research/initial-findings.md) and
[source audit](docs/research/cel-shift-source-audit.md) remain useful evidence,
not active plans. Completed implementation code and regression tests remain
in place intentionally.
