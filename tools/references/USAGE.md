# U4 reference tools

These tools prepare and adopt the **local** Cel Shift reference package. They
never stage, commit, publish, deploy, or copy raw source sidecars. The local
manifest contains machine paths and prompt associations and is **not** a public
metadata projection. U9 must independently check its publication allowlist;
reference approval is not public-Git permission.

## Parent-owned execution

Run only under the parent launch envelope, with its single-heavy-job slot.
No test, build, candidate preparation, reference import, or promotion was
executed by the implementation worker. Parent verification remains mandatory.
The parent also owns root package scripts and ignore rules.

The integration owner subsequently qualified the full pinned import, CLI
prepare/import/index, 57 reference checks including the opt-in integration,
root typing/build and the U1-U3 regressions. Run receipts remain under the
ignored launch directory. No reference bytes were staged or published.

The following are script expansions, not package.json changes:

| Suggested script | Expansion |
| --- | --- |
| `references:prepare` | `node --experimental-strip-types tools/references/prepare.ts` |
| `references:import` | `node --experimental-strip-types tools/references/import.ts` |
| `references:index` | `node --experimental-strip-types tools/references/index.ts` |

Use the pinned Node 22.23.1 installation. No YAML or image dependency is needed.
All CLI arguments are explicit; duplicate/unknown options are rejected.
The tools do not infer a source from the caller's working directory.

```sh
REPO=/absolute/path/to/midcreek-cs-3
SOURCE=/absolute/path/to/midcreek-concept
STORE="$REPO/.artifacts/references"
AUTH="$REPO/.artifacts/implementation/20260910T232859Z/authorization.json"
REV=870603632c4b6665c513d0fa692a3ee2dae2b683
CANDIDATE="$STORE/candidates/u4-candidate.json"

node --experimental-strip-types tools/references/prepare.ts \
  --repository "$REPO" --source-repository "$SOURCE" \
  --source-revision "$REV" --authorization "$AUTH" --output "$CANDIDATE"

node --experimental-strip-types tools/references/import.ts \
  --manifest "$CANDIDATE" --source-revision "$REV" \
  --store "$STORE" --authorization "$AUTH"
```

Preparation hashes the reviewed audit and evidence from approval commit
`eff76cb3b7db33e09a4403a10fbdabc73b37c6e1`, parses the audit's master table,
checks the pinned source theme and all required Git blobs, then emits
`candidate-prepared-not-imported`. Candidate files are exclusive-create:
choose another output name rather than overwriting a prior candidate.
The importer independently repeats this derivation under its exclusive lock
and requires exact candidate equality. It emits
`local-reference-package-active` only after pointer replacement completes.

`AUTHORIZATION_SHA256` in `contracts.ts` is the trust anchor for the actual
parent launch bytes. A candidate's own `approved` string or a new self-signed
authorization is not sufficient. The authorization itself is never embedded
in the package. Changed authorization bytes, input hashes, source revisions,
source location, or uses require integration-owner reconciliation, not an
automatic trust-anchor refresh.

The source is read from the exact E6 Git commit, not its current worktree.
Origin identity is checked for GitHub, Azure DevOps HTTPS, and documented SSH
forms; credentials are not included in diagnostics. E7 is not automatically
used: this implementation fails closed on a missing E6 member. Adding an E7
fallback would require an explicit, exact-master approval and reviewed code.
No missing prompt/shared base can ever fall back to E7.

Before output, Git must confirm that `.artifacts/references/**` and
`references/midcreek` are ignored, and neither may already be tracked.
The importer checks the launch deadline, remaining additional disk budget,
2 GiB reserve, and 30 GiB free-space floor. `du -sk` accounts for the
repository's current allocated usage against the recorded baseline; this is
an additional local guard, not a replacement for the parent's global job
and resource accounting.

## Package and index contract

The 155 original input identities are sorted by source path and hashed as a
compact, recursively sorted-key JSON array of `{path,bytes,sha256}` records.
Their approved digest is
`9cf248787d79aec5b016853c4255d54016f5c63c48b372d2ef68c441a8907ae7`.
The package digest is SHA-256 of canonical JSON for the logical specification
with ID-sorted record arrays and sorted relative-path/content-hash pairs.
The self digest, generated manifest/index/receipts and absolute storage/source
prefixes are excluded. Both per-use approval records remain bound. The full
candidate, including local locations, is separately compared against the
authorized derivation before import.

`validateManifest` checks structure and internal consistency; it is not a
standalone grant of rights. Only `importReferences` reconstructs the reviewed
candidate under the pinned parent authorization before promotion. Synthetic
fixtures intentionally exercise structural checks without possessing import
authority.

The package has **156 files**: 49 exact PNG masters, 49 deterministic sanitized
provenance sidecars, 47 unchanged prompts, seven shared inputs, art bible,
projection decision, theme, and `reference-manifest.json`. Original metadata
hashes/lengths remain in the manifest; the raw operational fields and expanded
prompts from sidecars do not enter the package. The 47 current prompt files
are retained only in this ignored local package.

Each artwork has a stable `cel-shift/<family>/<stem>` identity, original byte
identity, current prompt/base associations, separate historical uncertainty,
sanitized-sidecar transformation/digest, attribution, CS3-only terms, and
independent reference/gallery approvals. Approvals bind the parent
authorization, inventory, source hash, and named policy fields. Gallery
approvals also declare the public-field allowlist, but do not replace the
later publication allowlist.

Both early hall-fault masters share `key-art.mock.md`; both animation sheets
share `animation-sheet.mock.md`. All historical producing-prompt identities
are explicitly unresolved against the dated audit; none are fabricated from
the current names. Male-sheet restoration commits are separately qualified.
The validator checks both height-bearing prose bases and the JSON values
(1.73 m man, 1.58 m woman, 2.10 m rack), plus the accepted approximately
35-degree orthographic diamond profile. Historical angle/scale text is not
rewritten or treated as a contradictory current specification.

Generation layout:

```text
.artifacts/references/packages/<digest>/midcreek/reference-manifest.json
.artifacts/references/packages/<digest>/midcreek/themes/...
.artifacts/references/index/<digest>/index.html
.artifacts/references/receipts/<digest>.json
.artifacts/references/managed-link.json
references/midcreek -> <absolute immutable package root>
```

The importer generates the local index in the same transaction. Its original
links target the immutable package, not the active symlink. It does not
preload images, read a second catalog, expose raw prompts/metadata, or
generate public thumbnails. The index command validates and locates this
already-generated result without changing an addressed generation:

```sh
DIGEST=<packageDigest-from-the-import-result>
node --experimental-strip-types tools/references/index.ts \
  --manifest "$STORE/packages/$DIGEST/midcreek/reference-manifest.json" \
  --store "$STORE"
```

Its success status is `local-index-verified`. `buildIndex(manifest)` is the
pure generator shared by the importer and index validation; the CLI does not
silently repair missing/corrupt immutable output.

## Atomicity and recovery

`store.ts` is the reusable filesystem transaction primitive, **not an
authorization API**. The production importer supplies its locked preflight,
complete builder and verifier. Lifecycle callbacks also permit genuine
filesystem failure injection in tiny tests without weakening the import CLI.

An exclusive `.import.lock` covers source preflight through final cleanup.
No stale lock is automatically stolen. Files and directories are flushed
before installing a generation; the temporary sibling symlink is atomically
renamed over the managed active link only after package/index validation.
Any preexisting unmanaged destination, even an in-store lookalike link, is
rejected. Symlink inputs/ancestors, unexpected files or empty directories,
missing files, duplicate identities, traversal and corrupt hashes reject
the candidate. PNG inspection streams serially and retains only its 33-byte
signature/IHDR header; no full-image decoder runs.

Before pointer replacement, failure leaves the previous complete pointer (or
no pointer on first import). After replacement, a failure can be reported
while the fully validated new generation is already active. Receipts use
`validated-generation` and `activation: read-managed-link`, not a false
assertion that a later pointer swap necessarily happened. Inspect the managed
link to determine activation. `resolveActive(store, activeLink)` resolves it
once; callers retain that immutable path throughout an operation.

Old packages/indices are never overwritten or garbage-collected by these
tools. Orphan complete generations may remain after an interruption. A hard
process kill can retain its exclusive lock or an ignored `.stage-<uuid>`:
the parent must inspect the recorded owner/process before targeted cleanup.
The tools enforce content-addressed immutability by never modifying existing
generations and revalidating them on reuse; this is not OS-enforced read-only
storage or protection against a hostile same-user filesystem racer.
No power-loss durability or Windows atomicity is claimed.

## Authoritative validation

Run in the repository root using installed dependencies, without installing
anything or overlapping another heavy job:

```sh
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/vitest run tests/reference-contract.test.ts --maxWorkers=1
CS3_REFERENCE_FULL_IMPORT=1 ./node_modules/.bin/vitest run \
  tests/reference-contract.test.ts --maxWorkers=1
```

Normal fixtures contain synthetic hashes/strings and a generated PNG header,
not source artwork, raw sidecars, or copied source prose. Unit coverage
includes 49/47/7 structure, exact inventories, rights/attribution, source
revision, input/path/symlink failures, header/bytes/hash rejection, shared
dependencies, history, sanitization, immutable index links, serial reading,
exclusive locking and actual temporary-directory promotions. Failure cases
cover missing/extra/corrupt/symlinked staged members and interruption before
and after pointer replacement, with old-generation retention.

The opt-in test actually prepares and imports the approved sources into the
authorized local store. It requires the unchanged parent authorization, live
deadline, correct ignored paths and real pinned E6 repository. Expect 49
masters totaling **86,349,779 bytes**, each 1536 x 1024; 47 current prompts;
seven shared inputs; 155 source identities; 156 package files; one generated
local index; no preview, raw original sidecar, second catalog or public output.
The integration owner must run its normal regression suite as well. A
synthetic pass alone does not complete U4.
