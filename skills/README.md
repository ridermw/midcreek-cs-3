# Skills and tooling

This is a documentation area, not an automatically loaded skill pack. It
records the working environment, where to obtain its components, and which
skills may help with CS3. No plugins, skills, hooks, MCP servers, dependencies,
or artwork were installed by this inventory.

**Start with [the session telemetry and chronicle](telemetry.md).** It
distinguishes observed skill loads, installed-but-disabled plugins, available
tools, and missing history. The snapshot is dated September 10, 2026; versions
below are observed versions, not claims about the latest release.

The [CS3 blueprint](../docs/architecture/cs3-blueprint.md) remains the authority
for implementation and qualification. `approve-r3` is still blocked.
Documentation or tool availability does not authorize implementation,
generation, reference import, experiments, or deployment.
The revised [launch checkpoint](../docs/architecture/cs3-blueprint.md#one-front-loaded-human-checkpoint)
collects the actual permissions once, before U1, and delegates bounded
non-interactive checks until human review after U10.

## Download and installation sources

Installation commands below are instructions for a future, explicitly chosen
setup, **not commands executed during this audit**. Review upstream code,
licenses, hooks, permissions, and compatibility first. Do not overwrite an
existing personal skill or enable every plugin to reproduce a historical list.

### Copilot

| Component | Observed here | Download / installation |
| --- | --- | --- |
| GitHub Copilot CLI | `1.0.84-4` | [Official getting started guide](https://docs.github.com/en/copilot/get-started/cli-quickstart), [CLI source and releases](https://github.com/github/copilot-cli) |
| Native CLI tools and agents | File/shell tools, history queries, task tracking, delegation and review helpers | Supplied by the host, not individual skill downloads; [command reference](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference) |
| Skills | Mostly personal skill directories in this snapshot | [Adding skills](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-skills) |
| Plugins | Enabled and disabled packages listed in telemetry | [Plugin reference](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference) |
| Models | Recorded model labels are listed separately in telemetry | Select through the host's `/model`; models are not downloadable skill packages. Historical labels do not establish current account access. |

Local `copilot plugin install --help` confirmed these source forms:
`plugin@marketplace`, `owner/repo`, `owner/repo:subdirectory`, and a Git URL.
Check local help before using flags from newer online documentation; in
particular, this audit did not establish support for newer `--skill` flags
in the installed CLI.

### Compound Engineering

**Source:** [EveryInc/compound-engineering-plugin](https://github.com/EveryInc/compound-engineering-plugin).
Observed package: `3.23.4`, **disabled as a plugin**. The `ce-*` skills still
resolve through personal symlinks into its installed skill directories.
Disabled plugin status therefore does not mean its personal skill aliases are
unavailable. The telemetry records historical loads as `personal-copilot`,
not as versioned plugin invocations.

For a fresh installation, upstream documents:

```sh
copilot plugin marketplace add EveryInc/compound-engineering-plugin
copilot plugin install compound-engineering@compound-engineering-plugin
```

This supplies the family containing the observed `ce-plan`, `ce-doc-review`,
`ce-work`, `ce-code-review`, `ce-commit`, and other `ce-*` names in the
telemetry table. Do not both copy and install the same names blindly; inspect
`/skills` for the effective source. A current install is not a reconstruction
of every historical skill revision.

### Superpowers and writing

| Source | Observed package | Covers |
| --- | --- | --- |
| [obra/superpowers](https://github.com/obra/superpowers) | `6.3.0`, enabled | Brainstorming, planning, debugging, test-first work, verification, worktrees and delegation skills |
| [obra/the-elements-of-style](https://github.com/obra/the-elements-of-style) | `1.0.0`, enabled | `writing-clearly-and-concisely` |
| [obra/double-shot-latte](https://github.com/obra/double-shot-latte) | `1.2.0`, enabled | Hook-based continuation support; no separately named skill load was recorded |

The [marketplace](https://github.com/obra/superpowers-marketplace) provides:

```sh
copilot plugin marketplace add obra/superpowers-marketplace
copilot plugin install superpowers@superpowers-marketplace
copilot plugin install elements-of-style@superpowers-marketplace
```

`double-shot-latte` is optional, not part of the recommended minimum. Its
marketplace installation identifier is
`double-shot-latte@superpowers-marketplace`; review its stop-hook behavior
before choosing to install it. Aggregate hook events do not prove that this
particular plugin executed.

The installed Elements of Style manifest contains an older
`obra/elements-of-style` URL. The current marketplace resolves to
`obra/the-elements-of-style`, which is the download linked above.

### Game-development skills

**Source:** [gamedev-skills/awesome-gamedev-agent-skills](https://github.com/gamedev-skills/awesome-gamedev-agent-skills).
See its [installation guide](https://github.com/gamedev-skills/awesome-gamedev-agent-skills/blob/main/docs/INSTALLATION.md).
Its documented interactive installer is:

```sh
npx skills add gamedev-skills/awesome-gamedev-agent-skills
```

Choose the relevant skills rather than adopting all engine packs. Copying a
skill manually must preserve the whole directory, including references,
scripts, assets, and license notices.

The following local `SKILL.md` files were byte-matched against upstream tree
[`b105e1cf617adf0b68ed98790a716bbb60993179`](https://github.com/gamedev-skills/awesome-gamedev-agent-skills/tree/b105e1cf617adf0b68ed98790a716bbb60993179):

| Upstream directory | Skills |
| --- | --- |
| `skills/web-engines/` | `threejs-scene-setup`, `threejs-gltf-loading`, `threejs-materials-lighting` |
| `skills/disciplines/` | `create-game-assets`, `input-systems`, `camera-systems`, `performance-optimization`, `game-ui-ux` |
| `skills/other-engines/` | `bevy-ecs` |

This verifies the current local entry files, **not every bundled reference or
every historical invocation's contents**. The Three.js skill examples target
r184; CS3's proposed toolchain is separately pinned in the blueprint. Resolve
version differences against those contracts rather than replacing them.

### Standalone review skills

**Source:** [ridermw/my-skills](https://github.com/ridermw/my-skills),
including [adversarial-review](https://github.com/ridermw/my-skills/tree/main/skills/adversarial-review)
and [plan-exit-review](https://github.com/ridermw/my-skills/tree/main/skills/plan-exit-review).
Follow that repository's installation and attribution instructions. For a
fresh target, its documented approach is to clone the repository and copy or
symlink the chosen skill directory into `~/.copilot/skills/`.

These are the source family for the local standalone review skills, but
neither installed entry file byte-matches the queried public `main` at
`3eb8ee5a8db03c6dafda04868226ee64c2445876`. Treat the public downloads as
maintained successors, not exact reproductions of this machine's copies.
Preserve the included licenses; the plan-review skill is an adapted work.

### Design and historical browser tooling

| Component | Source / install path | Qualification |
| --- | --- | --- |
| Impeccable | [pbakaus/impeccable](https://github.com/pbakaus/impeccable), [download site](https://impeccable.style) | Current plugin is `4.1.1`; the recorded CS1 load came from an app-provided custom skill, without plugin version attribution |
| gstack `browse` | [garrytan/gstack](https://github.com/garrytan/gstack) and its setup instructions | Historical plugin `1.59.0+0`; absent from the current installed-plugin list. The old Copilot adapter is not verified reproducible by today's upstream setup. |
| Organization review/integration plugins | Obtain through the owning organization's approved marketplace | No public installer verified. Internal repository URLs and configuration are deliberately omitted. These disabled packages are not prerequisites. |

The local Impeccable marketplace supports:

```sh
copilot plugin marketplace add pbakaus/impeccable
copilot plugin install impeccable@impeccable
```

This is the plugin route represented in the current environment. Upstream
also documents other installers; do not combine routes without checking for
duplicate skills and hooks.

### MCP servers and canvases

| Component | Evidence / current state | Download and setup |
| --- | --- | --- |
| Blender MCP | Six execution-tool starts in the retained logs; current `blender-mcp` distribution reports `1.0.0` | [Blender Lab project](https://projects.blender.org/lab/blender_mcp), [Blender Lab setup guide](https://www.blender.org/lab/mcp-server/) |
| GitHub MCP server | Available in this session; no separately named invocation in the frozen tool ledger | [Official server](https://github.com/github/github-mcp-server); [Copilot MCP guide](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers) describes the built-in integration |
| Computer Use | Bundled plugin `0.1.87`; available, not observed in the frozen tool ledger | Delivered by this Copilot host; no separate third-party install needed for this environment. OS permissions are a separate requirement. |
| Historical `browser` canvas | Six opens and four capability queries in Street Scene One | Host-provided surface; a standalone public download was not established. It is not the Playwright npm package. |
| Current canvas catalog | `canvas-explorer`, `crossfilter-dashboard`, `fabric-dashboard-replica`, `workflow-factory-canvas`, `world-clock` | Available, not observed as opened in the frozen logs. Exact portable installers were not established; do not invent gist URLs or vendor local extension code. |

**Use the right Blender MCP project.** The installed package came from the
`mcp/` subdirectory of the Blender Lab checkout at
`1856277973cfd314a80f7f2369e47e617de641df`, not a similarly named third-party
package inferred from its executable name. Its clean local README describes
both a Blender add-on and a separate stdio server; both are required for
interactive requests. The configured local command is `blender-mcp`, without
arguments. The source origin and the official setup page corroborate these
links. That page warns that generated code executes without a data-protection
sandbox: use an isolated environment without sensitive data. Follow its setup
instructions and use Copilot's `/mcp` UI rather than copying this machine's
configuration or credentials.

### Development tools, not skills

These are supporting toolchain downloads, not additional skill invocations.
Exact CS3 versions and proposed commands belong in the
[blueprint](../docs/architecture/cs3-blueprint.md); R2's actual dependencies
remain isolated in [its package manifest](../probes/r2/package.json).

| Purpose | Official source |
| --- | --- |
| Source control and GitHub operations | [Git](https://git-scm.com/downloads), [GitHub CLI](https://cli.github.com/) |
| JavaScript tooling | [Node.js/npm](https://nodejs.org/en/download), [TypeScript](https://www.typescriptlang.org/download/), [Vite](https://vite.dev/guide/) |
| Browser rendering | [Three.js source and documentation](https://github.com/mrdoob/three.js) |
| Tests and browser automation | [Vitest](https://vitest.dev/guide/), [Playwright](https://playwright.dev/docs/intro) |
| Asset authoring and scripting | [Blender](https://www.blender.org/download/), [Python](https://www.python.org/downloads/), [uv](https://docs.astral.sh/uv/getting-started/installation/) |
| Export validation | [Khronos glTF Validator](https://github.com/KhronosGroup/glTF-Validator) |
| CS1-only historical engine/toolchain | [Bevy](https://bevy.org/learn/quick-start/introduction/), [Rust](https://www.rust-lang.org/tools/install) |

Rust and Bevy remain **outside CS3's toolchain**. Installing software, browsers
or MCP integrations is not necessary to read the blueprint or this inventory.

## Anticipated CS3 use

This is a suggested selection, **not telemetry or execution authorization**.
Unit IDs refer to the existing blueprint.

| Work | Relevant skills | Evidence status |
| --- | --- | --- |
| Review and handoff | `ce-doc-review`, `ce-plan`, `ce-handoff`, `plan-exit-review`, `adversarial-review` | Observed across the audited projects |
| U1-U3: toolchain, simulation and held input | `ce-work`, `test-driven-development`, `verification-before-completion`; `input-systems` | First three observed; `input-systems` available but no recorded load |
| U4-U5: reference and asset contracts | `create-game-assets`, `threejs-gltf-loading` | Observed; neither opens artwork/publication or experiment gates |
| U6-U7: loading, ownership and rendering | The three `threejs-*` skills; `camera-systems` | Three.js skills observed in Street/R2; camera skill is an unobserved candidate |
| U8: qualification | `ce-test-browser`, `systematic-debugging`; `performance-optimization` | First two observed; optimization skill is an unobserved candidate, not evidence that targets were met |
| U9: showcase and HUD | `impeccable`, `writing-clearly-and-concisely`; `game-ui-ux` | First two observed in predecessor work; UI skill is an unobserved candidate |
| U10: release checks and delivery | `ce-code-review`, `ce-commit`, `ce-commit-push-pr` | Observed; review and deployment permissions remain separate |
| Future maintenance of actual repo skills | `writing-skills` from Superpowers | Available, no recorded load in the frozen project history; not needed just to read this documentation |
| Read-only CS1 comparison | `bevy-ecs` | Available, no recorded load; never a reason to introduce Bevy into CS3 |

Do not turn every suggested skill into a mandatory parallel agent. Choose
the smallest relevant set and preserve the explicit resource/review gates.

## Keeping this area useful

Keep inventories here in `skills/`. If actual repo-owned executable skills
are later authorized, Copilot's project skill location is
`.github/skills/<name>/SKILL.md`, as documented in the
[skills guide](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-skills).
No such payload or auto-install configuration is introduced here.

For a refresh, follow the [telemetry collection contract](telemetry.md#collection-and-verification).
Keep unknown versions, inaccessible sessions, disabled packages and changed
skill copies visible. Do not silently replace them with a claim that a fresh
install reconstructs the original environment.
