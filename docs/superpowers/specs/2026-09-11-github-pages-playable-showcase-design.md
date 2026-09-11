# GitHub Pages Playable Showcase Design

## Status

Approved on September 11, 2026 through the user's direction that the GitHub
Pages showcase must include a playable Three.js demo and must publish no ignored
files.

## Goal

Publish a polished Mid Creek showcase at the repository's GitHub Pages URL. The
site must include a complete playable repair scenario while building only from
tracked source files in a clean checkout.

## Publication Boundary

The Pages artifact may contain only output generated from tracked source and
installed dependencies. It must not read, copy, upload, or require:

- `assets/library/`
- `dist/`
- `.artifacts/`
- reference originals or thumbnails
- Blender exports, receipts, prompts, captures, logs, or local paths
- any other ignored file

The existing asset-backed local playable and U10 production-release validation
remain unchanged. The Pages demo is a separate source-only showcase channel, not
a qualified production-library promotion.

## User Experience

The root page keeps the existing Mid Creek visual language, architecture
explanation, control guide, and factual results summary. Reference-gallery
controls that require unpublished media are removed from the Pages variant.

The Play entry is a real interactive Three.js version of the seed-417 coolant
leak scenario. It supports:

- pointer routing to floor cells
- keyboard movement with arrows and WASD
- fault dispatch with `F` or the HUD button
- travel and repair progression
- movement cancellation during repair
- pause/resume and restart
- camera orbit, reset, and zoom
- responsive HUD and canvas layout
- hidden-page time suppression

The public page describes this as a source-only procedural demo. It does not use
the words "provisional assets," show `RELEASE_BLOCKED`, or imply that the C5
Blender appearance was published or accepted.

## Architecture

### Build Modes

The normal build and release commands retain their current semantics.

A new `pages:build` command selects the Pages entry mode and writes a fresh
artifact to a dedicated ignored staging directory. The mode is explicit at build
time and cannot be inferred from missing assets.

### Procedural Presentation

A new procedural presentation module implements the same presentation boundary
used by the asset-backed game:

- create tracked Three.js geometries and materials for floor slabs, racks,
  cooling units, technician, and coolant fault
- instantiate the authoritative 37 world placements
- update technician position, facing, mode, fault visibility, and repair feedback
  from immutable `WorldSnapshot` values
- dispose every generated geometry and material exactly once

The module reuses the existing renderer, camera, session, simulation, held-key
input, keyboard mapping, and HUD components. It does not call the GLTF loader or
asset-library lifecycle.

### Pages Game Orchestration

A small Pages-specific game orchestrator:

1. creates the renderer, procedural presentation, session, input, and HUD
2. marks the source-only scene ready after its first nonempty render
3. runs the existing fixed-tick simulation pump
4. maps snapshots into procedural presentation updates
5. handles pointer picking, dispatch, resize, visibility, and teardown

This module stays separate from `startGame`. The asset-backed local path keeps
its strict loading and release-binding behavior.

### Entry Selection

The Play entry chooses the Pages orchestrator only when the explicit tracked
build-time Pages flag is present. All other builds continue to use `startGame`.
The showcase entry uses the same flag to remove unavailable gallery controls and
to label the site as a public procedural demo.

## GitHub Pages Deployment

Add a dedicated workflow that:

1. checks out the repository without persisted credentials
2. installs pinned Node and npm dependencies
3. runs typecheck and portable tests
4. runs the source-only Pages build
5. validates the exact artifact allowlist and scans for forbidden paths/content
6. runs browser smoke tests against the built artifact
7. uploads the Pages artifact
8. deploys through the official pinned Pages action

The build job has read-only contents permission. Only the deployment job receives
`pages: write` and `id-token: write`. The workflow publishes no generic workflow
artifact and does not consume secrets or ignored local inputs.

## Validation

### Unit and Contract Tests

- procedural presentation creates the exact authoritative placements
- snapshot updates move and pose the technician deterministically
- fault and repair state map correctly
- generated resource disposal is unique and complete
- Pages build contains no ignored/private sentinel or forbidden extension
- Pages artifact contains only declared HTML, CSS, JavaScript, and generated
  source-only application files

### Browser Tests

- showcase loads under `/midcreek-cs-3/`
- Play navigation stays under the project prefix
- no request targets `assets/library`, `gallery`, `.artifacts`, or an external
  origin
- the first frame is nonempty and the HUD reports ready
- pointer and keyboard movement work
- dispatch reaches the fault and completes repair
- moving during repair cancels work
- pause, restart, orbit, zoom, resize, and back navigation work
- source-only public-demo labeling is exact

### Deployment Verification

After deployment, verify the Pages API reports the expected URL, both routes
return 200, the Play route performs a complete repair journey, and the repository
has exactly one Pages deployment environment.

## Error Handling

WebGL or initialization failure disables controls and shows a stable reload
message. The page never falls back to local assets. Build validation fails closed
if any forbidden path, dependency, request, or output appears.

## Non-Goals

- publishing the ignored C5 GLBs
- publishing reference images or local evidence
- changing U5 technical or appearance qualification
- claiming named-target performance qualification
- replacing the strict local asset lifecycle
- adding touch gameplay
