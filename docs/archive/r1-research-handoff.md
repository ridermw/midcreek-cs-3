---
artifact_contract: "reference-archive/v1"
archived: true
created_at: "2026-09-10T17:27:45Z"
title: "ARCHIVED - completed R1 research handoff"
summary: "Historical R1 instructions. R1-R3 and U1-U4 are complete; do not resume this goal."
keywords: ["midcreek-cs3", "r1", "research-only", "hard-stop"]
historical_focus: "Research-only R1, subsequently completed and approved."
repository: "ridermw/midcreek-cs-3"
branch: "docs/research-plan"
head: "bcdd00903ee73b0c257ba15c6fd283d279320b39"
---

# ARCHIVED - R1 Research Handoff

> **REFERENCE ONLY - DO NOT RESUME.** This goal is completed and superseded.
> Its branch, approval gates and instructions describe September 10 intake,
> not the current project. The only active plan is the repository-root
> `plan.md`; the current goal is `docs/architecture/cs3-continuation-goal.md`.

This is an immutable snapshot of the planning session, not a replacement for
`plan.md`. The user requested a goal prompt for a fresh session and explicitly
required research-only R1 with a hard review stop before R2.

## Historical State at R1 Intake

- The existing local `midcreek-cs-3` checkout is on `docs/research-plan`.
- Planning, plan-exit review, and the Cel Shift source/size audit are complete.
- R1, R2, and R3 are pending. No CS3 runtime, export probe, or test suite has been implemented.
- No artwork has been imported into CS3.
- `approve-r1`, `approve-r2`, and `approve-r3` are human-only blocked gates in the original session's tracker.
- Work was committed locally. No push was performed in the planning session; do not assume a fresh clone contains these documents.
- The captured HEAD above precedes this handoff's own addition. Verify the receiving checkout rather than resetting it to that commit.

The prior session's task database is session-local. A new session must recover
the work and approval state from `plan.md`; missing tracker entries are not
permission to bypass the gates.

## Read These References

| Reference | What matters |
| --- | --- |
| `plan.md` | R1's exact research boundary; unit-scoped autopilot; mandatory human stops; settled decision ledger |
| `docs/research/evidence-index.md` | Repository identities/revisions, inspected sources, source gaps, and Street Scene artifact identities |
| `docs/research/initial-findings.md` | Existing CS1/CS2/Street Scene explanations; extend rather than redo them |
| `docs/research/cel-shift-source-audit.md` | All 49 master paths/hashes, dimensions, source-copy comparison, and missing shared prompt bases in Midcreek |
| `README.md` | Current project status and approved showcase/demo direction |
| `TODOS.md` | Explicitly deferred work; not part of R1 |

The read-only source checkouts are siblings: `../midcreek-cs-1`,
`../midcreek-cs-2`, `../midcreek-concept`, `../midcreek`,
`../street-scene-1`, and `../street-scene-showcase`. Existing delivery records
are under `../street-scene-1-data`. These locations depend on the receiving
session having access to the same local workspace; report unavailable sources
rather than creating substitutes or modifying the source repositories.

## Important Continuity Notes

- **User decision:** CS3 has no Rust/Cargo/Bevy requirement. Rust appears in historical source research only.
- **User decision:** Preserve CS2's core, add fixed-tick held-arrow walking, use runtime-owned layout with Blender visual templates, and provide a showcase plus a separate demo.
- **User decision:** Include the full Cel Shift master set without alternate-size duplicates. The recorded inventory has 49 masters at 1536 x 1024 and 49 alternate files at 1280 x 720; only the masters belong in the future import.
- **User decision:** Autopilot may complete one authorized unit, but must stop for actual user review afterward. Automatic replies, passing checks, or predecessor completion do not satisfy approval gates.
- **Observed:** Midcreek Concept has the complete shared prompt inputs. Midcreek mirrors the masters but lacks the bases referenced by its copied prompts.
- **Observed:** CS1 local and GitHub revisions differ; reconcile by reading and documenting history, not by changing checkouts.
- **Observed:** Street Scene's Three.js extension is an untracked design prompt, not an implemented pipeline. R2 must eventually prove that boundary.
- **Observed:** Some overview text and old generation metadata carry superseded camera/count information. Keep historical provenance separate from current direction.
- **Evidence limit:** Existing size/hash measurements and predecessor test/performance reports may be cited, but R1 must not rerun them or present them as fresh runtime results.

The earlier R1 instruction to generate a browsing index was removed. R1 only
describes the future manifest/import/index requirements. Implementing those
tools and their tests remains later work specified by R3, not an R1 task.

## Superseded R1 Goal - Historical Quotation Only

The following records the old R1 goal. It is not a current authorization,
not a new-session recommendation, and must not be executed again.

```text
Work in the existing local ridermw/midcreek-cs-3 checkout on
docs/research-plan. Read plan.md and docs/handoffs/r1-research.md,
then complete R1 ONLY.

This prompt authorizes autonomous source research and documentation,
not implementation. Follow the project's applicable instructions.

Read the evidence index, initial findings, Cel Shift source audit,
README, and deferred-work list. Extend the existing research rather
than starting over.

Inspect the named sibling repositories and read-only GitHub history.
Explain how CS1 and CS2 were built, what their plans/history reveal,
how Street Scene's Blender workflow operates, and which existing
contracts and lessons matter for CS3. Close source/revision and
artwork-provenance gaps that can be resolved by inspection.

R1 must not build anything:
- No application/helper code, scripts, schemas, generators, importers,
  tests, builds, benchmarks, validators, prototypes, or dependency installs.
- Do not launch Blender/the games, export/process/copy artwork, or deploy.
- Leave source repositories and their checkouts unchanged.
- Do not post GitHub comments, open PRs, or push changes.

Use existing code, docs, manifests, reports, and recorded measurements.
Label conclusions as observed in source, reported by an existing run,
or inferred/unverified. Record questions requiring experiments for R2
or later implementation; do not perform those experiments in R1.

Work autonomously within this boundary. Use read-only research subagents
only for genuinely independent gaps, with one documentation owner;
do not launch a factory or recursive delegation. Stop early for missing
access, a material scope conflict, or permission that cannot be inferred.

Save findings in the existing docs/research files and update README.
Update plan.md's R1 progress/handoff status without changing settled
architecture. Commit only these documentation changes locally.
Do not claim runtime validation or mark a human approval gate complete.

Finish or stop all R1 workers. Present the findings, changed documents,
commit, limitations, and questions needing later execution. Explicitly
state that no executable checks were performed.

HARD STOP: do not start, prepare, schedule, or delegate R2 or R3.
End this goal with: "Awaiting user review of R1."
```

## Access and Retention

This handoff lives in the repository, not temporary session storage. It does
not carry sibling source code, assets, private metadata, or the original
session's task database. A new session on another machine needs access to
the committed documents and the named sources separately.

Keep this snapshot unchanged. Update the authoritative plan and findings as
work proceeds; create a new handoff if another snapshot is needed.