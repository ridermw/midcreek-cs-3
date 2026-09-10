# Session telemetry and skill chronicle

**Snapshot cutoff:** September 10, 2026, 17:34:54.570 EDT
(`2026-09-10T21:34:54.570Z`), the request that started this inventory.
Environment/source inspection was performed later on September 10.

This page is an evidence ledger, not a recommended installation list.
See [skills and installation sources](README.md) for downloads and anticipated
CS3 use. No raw conversations, tool arguments/results, credentials, machine
usernames, internal URLs, artwork, or billing information are published here.

## Coverage and interpretation

The local session index identified **24 sessions**, of which **14 retained
event logs** were available, including one startup-only log. Those logs contain
**267 `skill.invoked` events across 36 skill names**, and **16,494
`tool.execution_start` events** before the cutoff.

| Project | Indexed sessions | Retained logs | Skill load events | Tool starts |
| --- | ---: | ---: | ---: | ---: |
| `midcreek-cs-1` | 12 | 6 | 157 | 14,153 |
| `midcreek-cs-2` | 0 found | 0 found | Unknown | Unknown |
| `midcreek-cs-3` | 7 | 5 | 30 | 749 |
| `street-scene-1` | 3 | 1 | 53 | 1,008 |
| `street-scene-showcase` | 2 | 2 | 27 | 584 |
| **Total observed** | **24** | **14** | **267** | **16,494** |

**Limits:** initial discovery covered September 3-10, then expanded to
August 1-September 10, 2026. An all-earlier local metadata check found the
first matching indexed session on August 29. Cloud discovery supplied one
already-known CS1 session ID, not additional coverage. Local Codex/Claude
project-history discovery found no additional matching logs in the inspected
locations. These results do not cover every machine, account, deleted session,
or unindexed worker.

No matching **CS2** session was found in the queried metadata, aliases or
retained matching logs. CS2 source remains a known research input, but reading
that source in CS3 does not establish which skills authored CS2. That history
must remain **unknown**, not zero usage. A future CS2 session export can close
this gap without changing the present evidence.

| Label | Meaning |
| --- | --- |
| Observed | An explicit retained event establishes the named load or tool start |
| Installed | Current local plugin/package inspection; not proof of historical use |
| Available | Exposed by the current host or present as a local skill; not proof of invocation |
| Candidate | Proposed future use, excluded from historical counts |
| Index only | Session metadata exists, but its event log was unavailable |

A skill load does not establish successful execution, test passage, a merged
change, or an independent review. Repeated loads count separately. The 263
explicit `skill` tool starts are a different metric from 267 load events;
automatic loads and failed requests prevent a one-to-one correspondence.
Three failed skill requests in CS1 named `smart-code-review:code-reviewer`,
which was also used as an **agent type**, not a successfully loaded skill.
These failed requests do not add another skill name to the inventory.

## Chronological sessions

Dates are UTC start dates. IDs are complete to support local lookup; skill
tables use their unique eight-character prefixes. Topics are condensed index
labels, not claims that the requested work finished.

| Start | Project | Session ID | Topic / retained evidence | Loads |
| --- | --- | --- | --- | ---: |
| 2026-08-29 | CS1 | `376f0ec5-fda7-4138-8783-08800e53b888` | Data-center simulator; planning, execution, reviews, debugging and delivery | 116 |
| 2026-08-30 | CS1 | `cad232e6-a913-4b1d-af3c-8e0e5250053c` | Unlabelled; index only | Unknown |
| 2026-08-31 | CS1 | `0fab5d1a-5451-4933-af3e-d05d3dd63435` | Session audit; tools recorded, no skill-load event | 0 |
| 2026-08-31 | CS1 | `c07f04e6-edb6-4c17-8264-8ccbbf279c8a` | PR review planning; index only | Unknown |
| 2026-08-31 | CS1 | `4dbfa995-69a0-4b9e-a009-617e6ddbb045` | Site-generation closeout worktree; index only | Unknown |
| 2026-08-31 | CS1 | `c48761e4-e6b7-4347-bdfe-dae7f188efdd` | Site-generation PR closeout request; index only | Unknown |
| 2026-08-31 | CS1 | `12c6ec26-1f48-4792-9478-84f2ab172ca0` | Web-CI closeout worktree; index only | Unknown |
| 2026-08-31 | CS1 | `0ca7b83b-69a8-4480-9143-24d51ac3e200` | Web-CI PR closeout request; index only | Unknown |
| 2026-08-31 | CS1 | `5e8686fc-75b3-4d66-9d7c-7d2de8bc77dd` | Phase-two setup, execution and review | 9 |
| 2026-08-31 | CS1 | `5560ee76-ffd2-4ab9-bcf5-318012307032` | Phase-two POC planning, Impeccable and document review | 26 |
| 2026-08-31 | CS1 | `daf663ce-2d03-4358-b92a-4f5500f03d83` | Plan-exit review | 1 |
| 2026-08-31 | CS1 | `23c04ad9-32eb-4c51-b2a5-7dfbbb06a3f2` | Simulation standards, planning and research | 5 |
| 2026-09-08 | CS3 | `fb27b284-3dc8-4416-8a99-e087adfb0560` | Initial worktree; index only | Unknown |
| 2026-09-08 | CS3 | `5676a385-c36d-4412-9071-e89dcff77682` | 3D world-building discussion; index only | Unknown |
| 2026-09-08 | Street One | `3b198bb5-7de7-46d6-b16a-bac961da2d72` | Initial worktree; index only | Unknown |
| 2026-09-08 | Street One | `558bf63d-bf4b-4208-882b-03f6741241a4` | Unlabelled; index only | Unknown |
| 2026-09-08 | Street One | `c76721fb-5a70-407e-a4d4-77ddf3b8bace` | Scene implementation, assets, feedback and reviews | 53 |
| 2026-09-09 | Street Showcase | `57f8a895-aae9-450a-b10a-bb6f499e8add` | Three.js prompt, planning and handoff | 10 |
| 2026-09-10 | CS3 | `de95045f-9437-4ee7-ab95-28e1e54c3412` | Predecessor comparison and graphics-pipeline planning | 13 |
| 2026-09-10 | Street Showcase | `00f7418f-7973-445c-9e62-2e5fa0737115` | Interactive Three.js implementation and browser checks | 17 |
| 2026-09-10 | CS3 | `4c3dbe7b-18a3-4ae7-a88c-82bbaf66b80a` | R1 research, verification and handoff | 4 |
| 2026-09-10 | CS3 | `ae137017-a08e-4bd3-a78a-372872e39f13` | Startup-only retained log; no tool or skill event | 0 |
| 2026-09-10 | CS3 | `23a79411-6c4f-4fb9-9d0d-232fd187813a` | R2 bounded export/load proof and review | 9 |
| 2026-09-10 | CS3 | `6c56544b-d669-4c4e-8dbf-577fb013b11a` | R3 blueprint, document review, commit and main push | 4 |

Several August 31 sessions have retained events through September 4.
The start date is not an end date or a measure of continuous active time.

### CS3 progression

The first comparison session loaded planning, review, asset and handoff
skills. R1 loaded `ce-work`, `ce-commit`, `verification-before-completion`
and `ce-handoff`. R2 added an observed `threejs-gltf-loading` load alongside
execution, review, debugging and prose skills. R3's four loads before the
cutoff were `ce-plan`, `ce-doc-review`, `ce-commit` and `ce-commit-push-pr`.

Skill names are not a substitute for the project's approval record. The
[evidence index](../docs/research/evidence-index.md) and
[blueprint](../docs/architecture/cs3-blueprint.md) establish the R1/R2/R3
results and limits. R3 approval and implementation authorization remain
separate from the completed push.

## Observed skill inventory

Family links point to the installation guide, not necessarily to the exact
historical revision. **CE** = Compound Engineering; **SP** = Superpowers;
**Game** = game-development pack; **Review** = standalone review skills;
**Style** = Elements of Style. Personal loading can differ from plugin state.

| Skill | Loads | Sessions | Source family |
| --- | ---: | --- | --- |
| `adversarial-review` | 11 | 376f0ec5, 5560ee76, c76721fb, de95045f | [Review](README.md#standalone-review-skills) |
| `brainstorming` | 12 | 376f0ec5, 23c04ad9, c76721fb, 57f8a895, de95045f, 23a79411 | [SP](README.md#superpowers-and-writing) |
| `browse` | 1 | 376f0ec5 | [gstack](README.md#design-and-historical-browser-tooling) |
| `ce-brainstorm` | 2 | 5560ee76 | [CE](README.md#compound-engineering) |
| `ce-code-review` | 15 | 376f0ec5, 5e8686fc, 5560ee76, c76721fb, 00f7418f, 23a79411 | [CE](README.md#compound-engineering) |
| `ce-commit` | 21 | 376f0ec5, 5560ee76, c76721fb, de95045f, 00f7418f, 4c3dbe7b, 23a79411, 6c56544b | [CE](README.md#compound-engineering) |
| `ce-commit-push-pr` | 2 | 376f0ec5, 6c56544b | [CE](README.md#compound-engineering) |
| `ce-debug` | 2 | 376f0ec5, 5560ee76 | [CE](README.md#compound-engineering) |
| `ce-doc-review` | 14 | 5560ee76, 6c56544b | [CE](README.md#compound-engineering) |
| `ce-handoff` | 4 | 57f8a895, de95045f, 4c3dbe7b | [CE](README.md#compound-engineering) |
| `ce-plan` | 5 | 376f0ec5, 5560ee76, c76721fb, de95045f, 6c56544b | [CE](README.md#compound-engineering) |
| `ce-riffrec-feedback-analysis` | 1 | c76721fb | [CE](README.md#compound-engineering) |
| `ce-simplify-code` | 9 | 376f0ec5, c76721fb, 23a79411 | [CE](README.md#compound-engineering) |
| `ce-test-browser` | 1 | 00f7418f | [CE](README.md#compound-engineering) |
| `ce-work` | 19 | 376f0ec5, 5e8686fc, c76721fb, 4c3dbe7b, 23a79411 | [CE](README.md#compound-engineering) |
| `ce-worktree` | 1 | 376f0ec5 | [CE](README.md#compound-engineering) |
| `code-review` | 1 | 376f0ec5 | [Organization plugin](README.md#design-and-historical-browser-tooling) |
| `create-game-assets` | 5 | c76721fb, de95045f | [Game](README.md#game-development-skills) |
| `dispatching-parallel-agents` | 5 | 376f0ec5, 5e8686fc, 5560ee76, 23c04ad9, de95045f | [SP](README.md#superpowers-and-writing) |
| `executing-plans` | 9 | 376f0ec5, 00f7418f | [SP](README.md#superpowers-and-writing) |
| `finishing-a-development-branch` | 5 | 376f0ec5, de95045f | [SP](README.md#superpowers-and-writing) |
| `impeccable` | 1 | 5560ee76 | [Impeccable](README.md#design-and-historical-browser-tooling) |
| `plan-exit-review` | 9 | 376f0ec5, daf663ce, 23c04ad9, 57f8a895, de95045f | [Review](README.md#standalone-review-skills) |
| `receiving-code-review` | 3 | 376f0ec5 | [SP](README.md#superpowers-and-writing) |
| `requesting-code-review` | 1 | 376f0ec5 | [SP](README.md#superpowers-and-writing) |
| `subagent-driven-development` | 3 | 376f0ec5 | [SP](README.md#superpowers-and-writing) |
| `systematic-debugging` | 18 | 376f0ec5, 5e8686fc, c76721fb, 00f7418f, 23a79411 | [SP](README.md#superpowers-and-writing) |
| `test-driven-development` | 22 | 376f0ec5, 5e8686fc, c76721fb, 00f7418f | [SP](README.md#superpowers-and-writing) |
| `threejs-gltf-loading` | 3 | 57f8a895, 00f7418f, 23a79411 | [Game](README.md#game-development-skills) |
| `threejs-materials-lighting` | 2 | 57f8a895, 00f7418f | [Game](README.md#game-development-skills) |
| `threejs-scene-setup` | 2 | 57f8a895, 00f7418f | [Game](README.md#game-development-skills) |
| `using-git-worktrees` | 5 | 376f0ec5, 00f7418f | [SP](README.md#superpowers-and-writing) |
| `using-superpowers` | 31 | 376f0ec5, 5e8686fc, 5560ee76, 23c04ad9, c76721fb, de95045f | [SP](README.md#superpowers-and-writing) |
| `verification-before-completion` | 12 | 376f0ec5, 00f7418f, 4c3dbe7b | [SP](README.md#superpowers-and-writing) |
| `writing-clearly-and-concisely` | 5 | 376f0ec5, 57f8a895, de95045f, 23a79411 | [Style](README.md#superpowers-and-writing) |
| `writing-plans` | 5 | 376f0ec5, 23c04ad9, 57f8a895, de95045f | [SP](README.md#superpowers-and-writing) |

## Plugin snapshot versus historical provenance

`copilot plugin list` reported the following on September 10. Enabled does
not imply used; disabled does not rule out a personal alias loading its files.

| Package | Version | Current state | Historical attribution |
| --- | --- | --- | --- |
| `compound-engineering` | 3.23.4 | Disabled plugin; personal aliases available | `ce-*` events report personal source, without plugin version |
| `superpowers` | 6.3.0 | Enabled; personal aliases available | Related events report personal source, without plugin version |
| `elements-of-style` | 1.0.0 | Enabled; personal alias available | Writing skill reports personal source |
| `double-shot-latte` | 1.2.0 | Enabled | No named skill load; per-plugin hook attribution not established |
| `impeccable` | 4.1.1 | Enabled | Historical skill came from an app custom source; cannot assign 4.1.1 to that load |
| `code-review` | 2.7.1 | Disabled | One skill event explicitly names plugin/version 2.7.1 |
| `smart-code-review` | 1.0.0 | Disabled | Agent requests observed; three failed attempts to load an agent name as a skill |
| `agency-gh-app-extensions` | 0.1.37 | Disabled | No skill load with this plugin name; do not infer ownership from generic host tools |
| `configgen` | 1.0.0 | Disabled | No matching skill load |
| `computer-use` | 0.1.87 | Bundled with CLI | Available now; no matching tool starts in this ledger |
| `gstack` | 1.59.0+0 | Historical only; absent from current list | One `browse` event explicitly attributes this plugin/version |

The historical `browse` adapter, app-provided Impeccable copy, organization
plugins and local review-skill variants are not fully reproducible from
today's public installers. Download links identify available source families,
not a complete environment lockfile.

## Tool-start ledger

These are exact recorded names and start counts, not successful calls.
Built-in tools can be renamed between host versions. Tools executed through
shell commands are included under `bash`, not expanded into fabricated
per-program counts. A skill's body mentioning a tool is not counted.

| Tool | Starts |
| --- | ---: |
| `ado-repo_file` | 2 |
| `ado-repo_search_commits` | 1 |
| `apply_patch` | 648 |
| `ask_user` | 109 |
| `bash` | 5571 |
| `blender-execute_blender_code` | 3 |
| `blender-execute_blender_code_for_cli` | 3 |
| `create` | 87 |
| `edit` | 944 |
| `exit_plan_mode` | 4 |
| `fetch_copilot_cli_documentation` | 1 |
| `get_changes_overview` | 1 |
| `get_session` | 1 |
| `get_session_automation` | 1 |
| `glob` | 190 |
| `grep` | 177 |
| `list_agents` | 14 |
| `list_bash` | 9 |
| `list_canvas_capabilities` | 4 |
| `list_projects` | 1 |
| `list_sessions_and_chats` | 1 |
| `manage_schedule` | 1 |
| `open_canvas` | 6 |
| `read_agent` | 104 |
| `read_bash` | 78 |
| `rename_branch` | 3 |
| `rename_session` | 4 |
| `rg` | 702 |
| `save_session_automation` | 2 |
| `semantic_code_search` | 5 |
| `session_store_sql` | 17 |
| `skill` | 263 |
| `sql` | 257 |
| `stop_bash` | 15 |
| `store_memory` | 4 |
| `str_replace` | 1 |
| `task` | 419 |
| `task_complete` | 20 |
| `tool_search_tool` | 36 |
| `view` | 6375 |
| `vote_memory` | 11 |
| `web_fetch` | 341 |
| `write_agent` | 58 |

All ten canvas open/capability requests identified the `browser` canvas in
Street Scene One. They do not establish use of the currently exposed
crossfilter, Fabric, workflow or clock canvases. No `run_factory` start was
recorded in this corpus. Historical delegation is not permission to start
factories or workers in CS3.

### Agent requests

Counts come from `task` start arguments, not completion receipts. They sum to
419 and do not assert that every requested agent started or completed.

| Agent type | Requests |
| --- | ---: |
| `general-purpose` | 217 |
| `task` | 141 |
| `smart-code-review:code-reviewer` | 39 |
| `explore` | 16 |
| `research` | 3 |
| `smart-code-review:quick-reviewer` | 2 |
| `rubber-duck` | 1 |

### Model attribution

The following labels come from the `model` field on tool-start events. This
is **not** a count of model API requests, token usage, billable credits,
independent reviewers or successful outcomes. Availability today was not
checked. The counts sum to the same 16,494 tool starts.

| Recorded model label | Attributed tool starts |
| --- | ---: |
| `claude-haiku-4.5` | 290 |
| `claude-opus-4.8` | 77 |
| `claude-opus-5` | 5803 |
| `claude-sonnet-4.6` | 195 |
| `claude-sonnet-5` | 838 |
| `gemini-3.1-pro-preview` | 13 |
| `gemini-3.6-flash` | 75 |
| `gpt-5-mini` | 246 |
| `gpt-5.4` | 22 |
| `gpt-5.4-mini` | 465 |
| `gpt-5.5` | 89 |
| `gpt-5.6-luna` | 21 |
| `gpt-5.6-sol` | 3679 |
| `gpt-5.6-sol-fast` | 2569 |
| `gpt-6-astra` | 2112 |

Session-start CLI labels were `1.0.80`, `1.0.82-1`, `1.0.83-0`,
`1.0.84-3`, `1.0.84-4`, and `0.0.0`. The Street Scene One log reported
`0.0.0`; retain that literal metadata rather than interpreting it as a
verified public release. The current CLI independently reports `1.0.84-4`.

## Collection and verification

The evidence sources are local and are **not committed**:

| Source | Use |
| --- | --- |
| Copilot session index, accessed through `session_store_sql` | Discover sessions by repository and checkout, including worktrees and missing-log rows |
| `~/.copilot/session-state/<session-id>/events.jsonl` | Count explicit `skill.invoked`, `tool.execution_start`, and matching failure events |
| `copilot plugin list` and `copilot plugin marketplace list` | Snapshot installed versions, enabled state and installation source identifiers |
| `copilot plugin install --help`, marketplace help and `copilot --version` | Check commands against this installed CLI, not only online docs |
| Personal skill symlink targets and installed public plugin manifests | Corroborate current source families without assigning those versions retrospectively |
| Public Git tree/blob metadata for game and standalone review skills | Compare local entry-file bytes; distinguish matches from drift |
| Blender MCP package metadata and clean local source checkout | Identify the actual integration rather than guessing by executable name |

Refresh procedure:

1. Declare a fixed UTC cutoff. Query a bounded date range, widening only for
   missing coverage. Preserve index-only rows and distinguish project metadata
   from mere mentions of another repository in a prompt.
2. Select matching session logs from their `session.start` checkout context.
   Count only events at or before the cutoff. Deduplicate skill events by
   event ID across logs; this audit found no duplicate skill event IDs.
3. Group `skill.invoked.data.name`; preserve explicit `source`, `pluginName`
   and `pluginVersion` separately. Do not derive use from the offered skill
   list, quoted history, loaded skill prose, or shell search results.
4. Count tool starts by `toolName`, agent requests by the `task` argument's
   `agent_type`, and model attribution by the tool-start `model` field.
   Do not interpret missing completion records as success.
5. Capture current package state separately. Match source paths and entry-file
   hashes where possible; mark unavailable sources and changed versions.
6. Reconcile session, skill, tool, agent and model totals. Verify local
   Markdown links and upstream install sources. Publish only the allowlisted
   metadata shown here, never raw logs or MCP configuration.

Representative source-event receipts for local spot checks:

| Session prefix | Skill | Event ID | UTC timestamp |
| --- | --- | --- | --- |
| 376f0ec5 | `ce-plan` | `dd3310b9-d72c-458b-bcbd-feec8f1f351d` | 2026-08-30T20:47:24.986Z |
| 376f0ec5 | `browse` | `cbe3ec00-c725-4949-9077-68b8dfa31496` | 2026-08-30T20:33:13.942Z |
| 376f0ec5 | `code-review` | `e68fabdb-78ca-40f2-9d79-20047295b080` | 2026-08-29T23:06:33.473Z |
| 5560ee76 | `impeccable` | `6c8330dd-a780-4694-8d75-b97f5f1b204a` | 2026-08-31T17:30:27.600Z |
| c76721fb | `create-game-assets` | `ff3e4dc8-5921-4bdf-9b93-991fb6b24355` | 2026-09-08T23:13:08.709Z |
| 57f8a895 | `threejs-gltf-loading` | `5c4fa21e-baeb-47a1-a058-7f7344cf644b` | 2026-09-09T20:09:31.444Z |

The private audit workspace retains an allowlisted JSON projection and
per-log prefix hashes for this cutoff; it is not required to read this page
and contains no copied prompts or skill bodies. Readers without the original
logs cannot independently reproduce the historical counts from this checkout
alone. The receipts make the provenance explicit without publishing the logs.

### This inventory task

After the cutoff, the current session additionally loaded `ce-work` once for
this documentation request. It used local history queries, read-only package
inspection, official-source browsing, and documentation edits. These audit
operations are excluded from the frozen totals above, avoiding a moving
denominator. No new skill payload, installer, telemetry collector or hook was
added to the repository; this is a manually refreshed Markdown record.
