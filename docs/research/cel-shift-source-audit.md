# Cel Shift Source and Picture-Size Audit

> **REFERENCE ONLY - source inventory and historical audit.** U4's reference
> import is already implemented. Use this inventory as evidence when cited,
> not as a new import/research assignment; follow [the active plan](../../plan.md).

Recorded September 10, 2026; extended during R1 source research. Documentation
only at that checkpoint: no source artwork, prompts, or metadata sidecars had
yet been copied into CS3. The numerical inventory below is the **previously recorded preparatory
audit**, not measurements repeated in R1. R1 read source, metadata and history
only; no executable checks or asset processing were performed.

## Source Decision

Use **Midcreek Concept as primary** and **Midcreek as a verified master-art
fallback**, not as two catalogs to import.

| Role | Source | Pinned revision |
| --- | --- | --- |
| Primary art direction and complete prompt inputs | `williamsmat_microsoft/midcreek-concept` | `870603632c4b6665c513d0fa692a3ee2dae2b683` |
| Mirrored full-resolution artwork | `azure-core/midcreek` | `b2e736726f7f9aea610274931b9c62555e9eeb67` |

Local directories are `../midcreek-concept` and `../midcreek`. Repository
identities come from their configured origins; older prose links use different
owners and should not override these observations.

Compared `themes/cel-shift/` in Concept against `docs/artwork/` in Midcreek:

- All 49 original PNGs have identical Git blobs across the repositories.
- Their 49 original metadata sidecars, 47 prompts, and theme manifest also match.
- The README is the only differing file among the 147 shared relative paths.
- Concept has 98 additional files: 49 `-720p.png` images and their sidecars.
- Concept has the art bible, projection decision, and shared foundations outside
  the theme directory. The game catalog has no equivalent shared-base bundle.
- All 47 Concept prompts resolve their `plan:` base. All 47 copied Midcreek
  prompts refer to missing bases at their copied locations.

This makes Midcreek a viable source of identical master bytes, but not a
self-contained art-direction or regeneration package.

## Scope and Deduplication

User selection: the **full Cel Shift set**, with picture-size checks to avoid
duplicate copies. This means all distinct studies and revisions in Cel Shift,
not every theme in the larger concept exploration.

| Image family | Count | Actual PNG dimensions | Total PNG bytes | Future import |
| --- | ---: | --- | ---: | --- |
| Masters | 49 | 1536 x 1024 | 86,349,779 | Keep once |
| Alternate preview files | 49 | 1280 x 720 | 54,022,414 | Exclude |
| Midcreek mirror of masters | 49 | Same master bytes | Same 86,349,779 | Do not copy again |

Master images total approximately **82.35 MiB**. Omitting previews avoids
another **51.52 MiB**, before metadata and documentation.

All 98 Concept PNGs have different SHA-256 file hashes. Thus there are no
byte-identical duplicates within that directory; the redundant set is the
paired alternate-resolution version of each artwork. Every original has one
preview counterpart and vice versa. Cross-repository originals are identical.

The master aspect ratio is 3:2 and the preview aspect ratio is 16:9. These are
not interchangeable for measuring composition or camera angles. This audit
does not determine whether every preview was stretched, cropped, or otherwise
processed, nor does it claim perceptual deduplication of distinct master studies.
Keep the originals; do not collapse genuinely different passes or headings
merely because the subject is similar.

The root Concept README says 45 Cel Shift plates. The tracked manifest/file
inventory contains 49 masters; use the inventory rather than that stale count.

## Complete Master Inventory

Paths are relative to `themes/cel-shift/masters/` in the primary source.
Every row is **1536 x 1024**. Each has a paired `-720p.png` file at
**1280 x 720**, excluded from the planned import. Bytes and SHA-256 below were
read from the actual master files during the preparatory audit, not inferred
from metadata or recalculated during R1.

| Master path | Bytes | SHA-256 |
| --- | ---: | --- |
| `animation/01-model-sheet-man.png` | 1187130 | `8a5a31e7bceb8ad16b3481d2bae89e7a32bb4edd0ef711b7d07a26f177cf6b25` |
| `animation/02-model-sheet-woman.png` | 1563478 | `0c11cf308bfec82037bb6f19f19d4b1546b08230d948bbe7ac676ba86de19f50` |
| `calibration/01-elev-35.png` | 2601065 | `d1254ef2f05b5ee3526c9e7347091d9ac0ada54ba1d37267a9801411537a8a78` |
| `calibration/02-elev-45.png` | 2391040 | `e154f6c97403e2fc1fa4430e6786ae3fa1fd23e51438408c9acf1fec86547114` |
| `calibration/03-elev-57.png` | 2537584 | `2ef84cf9ccbf8c0809ce1e0ab0177df4d20ef7e27ee21091d298458f4b51b1ad` |
| `character-both/01-pair.png` | 1867975 | `17521f981ab8dadf3fcd4e7eaabe42155914f5d3c47fa92fe1e8338b8aa184fd` |
| `character-man/01-sheet.png` | 1387731 | `3639bc2b326a3e5884bbf18b9fd5f8737343dd8a1f3914c10594ac369bdef729` |
| `character-man/02-facings.png` | 899384 | `977632103d72fcbecd210401ff332a4277626847cc17a28bf63d6d4f59755e1d` |
| `character-man/03-scale.png` | 925644 | `3264d58c684091b95376b598bb8eba86dd31d0af5d7c6be907e29b86fa36b35e` |
| `character-man/04-work-poses.png` | 1399418 | `2215ce4f24d93324da1411b11fddaeb884a2ac805c20f3cc4b880759bf957a20` |
| `character-man/05-silhouette.png` | 864104 | `ace5195ee6a64bde798fff52b9c0369c0169050565eea11ab0fc611545159327` |
| `character-woman/01-sheet.png` | 1205638 | `e410cda945fa084f43c72a097dcada9db315993a2ce697985f951f38fd9f68c3` |
| `character-woman/02-facings.png` | 933177 | `2b1d362a7ea3237eab20a69e21aa8a8f2ab5f0c2e583825bd21c8b5c4a6cb0e3` |
| `character-woman/03-scale.png` | 1503120 | `c5e537f48eb00d54d163a3e808d1959a2edd400afd7187cd1e23ab1dc8fca0e4` |
| `character-woman/04-work-poses.png` | 1894854 | `93f314f5b398bc8ea6ec4ac32999f976bd3a3fe748ec29e3520266502ab2b0cd` |
| `character-woman/05-silhouette.png` | 717862 | `355ba3473b37641d480987faeb57fe25d2395654f7a5095b2019e183af81dfdc` |
| `env/01-entry.png` | 2548316 | `c3c5fe34eccf358b74f5443c1efe103e30e6016fc3e3c60c1df6e7790bfc7ea2` |
| `env/02-perimeter.png` | 2625487 | `e134e5135fd2e2892d4d24bcbb598472ee4e63656f1360a0b11088c1463e195d` |
| `env/03-plant.png` | 2347913 | `bcd7335fddf47cc55043e2e95e4cb7fdedfbdf4f042df11b9028320ba4e62f2c` |
| `fault/01-coolant-leak.png` | 2660471 | `7ab2271e2864ca5d62283c4e9283b2c9f3de0ff678c97dad08ed47da298783f8` |
| `fault/02-thermal.png` | 2624439 | `590e171c659da867e083878b2e87e660d71d94e5b073dbb65b60c232f93b1304` |
| `fault/03-power.png` | 2871493 | `2eef2dd9ae82eeeda71c0041609a463bdf52dd8d060e02abecbc88c6330879c0` |
| `fault/04-fire.png` | 2698614 | `f083cd2f69285b87be8eed5b493bbb627dcf756d3d077005e38485809e775421` |
| `fault/05-escalation.png` | 1441688 | `76d1095452ea1c4e315c029c5ab84d6f1ccf49e7223f8b6433868fa43fab721e` |
| `floor/01-grid.png` | 563900 | `eaaf787a440d601b912cfae17aa78043ced5f1cd46fd55f1fb099fcf4b886303` |
| `floor/02-containment.png` | 696038 | `8b8beaeba84c0f7248777d94cea7639a9ad89e283f5ba0f682a1135cfb4d1132` |
| `heading/01-heading-ne.png` | 2400570 | `3e61f021db9a49f957095f9d31173c2cacfbf046b12705deb9f8753196af3bdf` |
| `heading/02-heading-se.png` | 2542186 | `bb1d3c63b4ad15e12ed85ca4edf51f4a430418059b24bcc71de0c0878f31276b` |
| `heading/03-heading-sw.png` | 2426162 | `70129451ef7855af686f9b9bc837c386a64e2d7bb25c42143294bfc554f2a404` |
| `heading/04-heading-nw.png` | 2796231 | `d63777f31ccb3548d743dcf2085ee99d8ef5e905a112364b0ef9038b9ce34c95` |
| `interface/01-hud-overlay.png` | 616349 | `3ed395653eb4dd5cf7eb4544fb53b720666c246815d06577f4f3743dc8f28513` |
| `interface/02-hud-components.png` | 754943 | `f63719c5f706262f00fe51f413d2921083203408fb38980f56eb48484c998a4d` |
| `kerb/01-crossing.png` | 2337045 | `45d3d00fab36ec9efad7b9879cce8b23b8ac7b980c3c8e84cbbaaf04ce0012f8` |
| `kerb/02-junctions.png` | 1672273 | `d533e7fddf1f5a4a66a397ec7b010207c505fcd0999a00e52a5b3be2c08cd6d7` |
| `key-art/01-hall-fault.png` | 3030111 | `840582a4a2e677893b8abef873905c00cfeb02dc544f36098ca8b4f55f3ea4ad` |
| `key-art/02-hall-fault.png` | 2922725 | `b2636049a6555ef8caaceb060cb27655e0ea4db41229a508cebaecb03ed008b7` |
| `key-art/03-archer.png` | 2761149 | `cdc7567223a50ff4f3e2f3f75b57f5f7350e626f7505b21c52e6a8790fae5161` |
| `key-art/04-diamond-bright.png` | 2747581 | `a30e12b63a36743015b1c73eeca6248a8b8ee974cf007f23666dc101f06c0e75` |
| `lighting/01-alarm.png` | 2902386 | `69d32a0c09d5af8ef8e90b0968b1d645f0930218625c09ef3668cf903c2f1b09` |
| `lighting/02-lowpower.png` | 2730720 | `2f783b14aec6bf9acdecc05ba28222445dce9b48272c93a09452ff389d1b7bf9` |
| `rack/01-topology.png` | 1704680 | `c5043d307307b260874fc8d94167a628a1da330ec79366c2b7457d56f318c637` |
| `rack/02-types.png` | 1200451 | `699d6125384ff24cecdfba534380b4f86b165a5ecefed5985cbb0c1580421513` |
| `state/01-rack-states.png` | 1350223 | `89e20ee77d697f6bf96303d45920fe300ee67606c2c7954f30406a5e93d74ea3` |
| `turnaround/01-rack.png` | 979362 | `7969d47248eb4f481a978537dd1e8f792a22884b4d21cf8f33e08ce7ac38e501` |
| `turnaround/02-cooling-unit.png` | 809055 | `14f08e834e9ef9fe2d9b637c3c0616079638de00344c0575bffb10c972d33e14` |
| `turnaround/03-tray-and-hose.png` | 594269 | `b02345fce06b0f223d2d295429810c45de8db476f37f8706e6ca53ea8e056429` |
| `turnaround/04-cart-and-stool.png` | 542559 | `c2dbc335be7e5978a5c6ac73e416e714ae0e9ffbc5a59ebc1c33f4a41e1f61a8` |
| `turnaround/05-row-endcap.png` | 790617 | `613243ffdb0de28a54e92ece408c8c81967d162cd9523bf2ae1f0aa68ae41ba9` |
| `turnaround/06-kerb.png` | 780569 | `395b9749024fb62136fb46918ad076ef0fea8b2c4472ffc58d155381dbef307a` |

## Inputs Beyond the Pictures

Retain the following source hierarchy when the reference import is executed:

```text
references/midcreek/
  ART-BIBLE.md
  docs/decisions/projection.md
  themes/
    _shared/
      foundation.md
      foundation.json
      character-sheet.md
      floor-sheet.md
      interface-sheet.md
      rack-sheet.md
      turnaround.md
    cel-shift/
      theme.yaml
      prompts/                  47 source prompts
      masters/                  49 masters and reviewed provenance
```

This is a proposed future layout, not directories created by this audit.
Preserving the relative structure keeps all six referenced Markdown bases
reachable from the prompts.

### Observed dependency associations

The `plan:` line at line 3 of every current Cel Shift prompt identifies the
following bases. Do not choose a base from the image's family name alone:
the male scale and kerb-junction studies are important exceptions.

| Shared prose base | Current prompt associations |
| --- | --- |
| `foundation.md` | Three key-art prompts, three calibration prompts, four headings, five faults, three environments, two lighting prompts, `kerb-crossing.mock.md` |
| `character-sheet.md` | Animation sheet, paired characters, all five woman prompts, four man prompts other than scale |
| `turnaround.md` | Six asset turnarounds, `state-matrix.mock.md`, `technician-man-scale.mock.md` |
| `floor-sheet.md` | Two floor prompts and `kerb-junctions.mock.md` |
| `rack-sheet.md` | Rack topology and rack types |
| `interface-sheet.md` | HUD overlay and HUD components |

Source: E6 `themes/cel-shift/prompts/*.mock.md:3` at the pinned revision.
Retain `foundation.json` as the seventh shared input alongside these six prose
files; JSON is not a substitute prompt base. Preserve `ART-BIBLE.md`,
`docs/decisions/projection.md`, `theme.yaml`, and all 47 prompts together.

The JSON foundation is useful for code, but cannot replace the prose:
`tests/test_site.py:549-564` documents a scale failure caused by heights present
only in JSON. Both prose foundations now state the same technician heights.
The prompt-reference checks at lines 300-326 and prose/JSON check at lines
340-351 describe the relevant invariants.

Include the theme, sources, and generation history without treating old
generation settings as the current visual contract. The sampled original
key-art sidecar contains the older 55-60-degree/axis-aligned foundation,
whereas the accepted art bible and shared foundation now specify roughly
35-degree diamond projection. The overview README retains older camera prose
too. Do not overwrite provenance or silently average those requirements.

Metadata also contains service/account identifiers. Before any public import,
review provenance fields and source terms, preserve required attribution and
source hashes, and omit private operational details from public records.
The current task has not established publication rights for every source.
Do not copy private source photography or unrelated themes.

### Historical provenance is not a current visual specification

**Source observations:** Concept's accepted projection decision reverses
axis-aligned framing. Shared foundation prose rounds elevation to 35 degrees;
its JSON distinguishes that chosen value from a recorded 36.1-degree key-art
estimate and a 32.92-36.1-degree sample range. The source's claim that the image
model ignores requested angles is a conclusion from those historical samples,
not a universal model capability test conducted here. Likewise animation
model sheets illustrate poses; their verdict text is not a rendered rig test.

The accepted dimensions are 2.10 m racks, a 1.73 m man and 1.58 m woman.
Concept PR 2 explicitly says the scene back catalog retains older character
scale and explains why the rack height was retained as an artistic decision.
Its restored male animation sheet comes from
`f173f7fea3fe357a37de57fed520115547ed9f9b`; restoration lands in
`b6b1c6af408378039a64998b20383f5407cea1af`. Thus current prompt prose
must not be represented as the exact generation input for every old master.
Sources: E6 `themes/_shared/{foundation.md,foundation.json,character-sheet.md}`,
`docs/decisions/projection.md:1-10`, and
`williamsmat_microsoft/midcreek-concept#2`.

The current manifest lists 49 images, while current prompt inventory has 47
files. The key-art family has two early hall-fault passes but one current
`key-art.mock.md`; animation has two retained sheets but one current
`animation-sheet.mock.md`. History and expanded sidecars explain why a
one-file-per-image prompt rule would be false. Family/name associations alone
do not prove the exact historical prompt revision or all generation settings.
The manifest must allow shared/current prompt associations, an independently
identified historical sidecar, and an explicit unresolved provenance state.

The sampled key-art master sidecar has only `account`, `deployment`, `prompt`,
`prompt_char_count`, `quality`, `rendered_at`, and `size`. It has no source
revision, original-byte digest, rights approval, or explicit derivative-parent
record. The paired 720p sidecar repeats the same timestamp and prompt length
but declares a different size. The preview-addition commit
`eedfcff2425fd0ffc672dd23aeca59541c75776a` records their addition, not a
reproducible crop/resize recipe. Do not infer a fresh generation or a
composition-preserving transform from those sidecars.
Sources: E6 `themes/cel-shift/masters/key-art/04-diamond-bright{,-720p}.png.metadata.json:1-9`,
the preview commit, and `theme.yaml:37-114`.

**Historical review results:** Concept PR 1 reports 67 local tests and PR 2
reports 70, alongside their site checks. The returned Copilot reviews contain
hosted-runner-disabled notices, not substantive code approval. These numbers
were not rerun. PR 1's earlier chapter/count description is not the authority
for the final renamed inventory.

### Publication and metadata policy remains a gate

No tracked catalog-wide license grant was found in the inspected Concept
license-file inventory; this is an evidence gap, not a legal determination.
CS2's `references/cel-shift/ASSET-LICENSE.md:1-15` separately permits only
specified unchanged redistribution with its notice and excludes its images
from the code's MIT license. That notice must not be generalized into
permission for all 49 Concept masters, cross-project reuse, or new thumbnails.
Street Scene's recorded CC0 texture provenance does not grant rights to
Concept art or private photographic/video references.

The user's selection of all 49 masters establishes desired scope, not an
unreviewed public redistribution grant. Before future promotion, each record
needs reviewed provenance/attribution and a publication decision for that use.
Unapproved raw context remains in the read-only upstream source, not copied
into public Git history merely because a later web build might exclude it.
Required attribution must not be removed in the name of sanitization.

Public metadata should be an explicit allowlist: approved artwork identity,
family/title, public source revision/path, appropriate hashes/dimensions,
permitted credit/terms, and display role. Do not copy service/account values,
deployment identifiers, private paths, raw expanded prompts or private
reference names automatically. Retain the original sidecar's identity and
source association in the reference manifest; if a reviewed sanitized sidecar
is retained, distinguish its digest from the original's and record the
transformation/approval rather than overwriting provenance.

## Future Manifest and Atomic Import Contract

This is a documentation contract only. No manifest, schema, index generator,
importer, fixture, or test was created or executed in R1.

| Field group | Required meaning |
| --- | --- |
| Identity | Stable artwork ID/family and master versus derivative role; every one of the 49 distinct masters represented once |
| Source | Repository, full pinned revision, canonical source-relative path, and approved destination-relative path |
| Bytes | Expected original SHA-256, byte length, width and height from the dated audit; metadata size text alone is insufficient |
| Relationships | Source sidecar path/hash, historical versus current prompt association, dependency-base paths, and parent identity for any later derivative |
| Provenance | Generation/history association with confidence or unresolved status, required attribution/terms, metadata-review state |
| Approval | Separate reference-package and public-gallery approvals, their scope/evidence, permitted public fields; unknown does not mean approved |
| Package | Complete expected inventory and shared-input identities; schema/package revision and promotion receipt belong to later implementation |

Derive the future browsing index from this single manifest; do not keep a
second mutable handwritten inventory. This document's master table stays a
dated source audit. An index must not silently glob in previews or expose
unapproved metadata. Support inputs need pinned identities too, not just PNGs.

Future import is staged and all-or-nothing: prepare the entire allowed package
outside its active destination, check every file/relationship, then promote
only a complete valid package. Hash, dimensions, missing or escaping dependency
paths, unexpected/duplicate files, invalid sidecars, or unapproved provenance
must reject the candidate and identify the failing file and reason. An
interrupted stage or failed promotion must retain the previous complete
package; partial success must never become the active reference set. With no
previous package, failure leaves no active package rather than a partial one.

The destination must stay under the approved reference root, including after
symlink/path resolution. Preserve
`references/midcreek/themes/{cel-shift,_shared}` so each original relative
`plan:` reference resolves. Masters remain byte-identical; later thumbnails
are distinct approved derivatives generated into ignored build output with
aspect ratio preserved. Exclude all `-720p` counterparts and the second
repository's duplicate masters, but retain genuinely distinct studies and
revisions. A failure must not be hidden by switching to an incomplete mirror
or falling back to metadata-declared dimensions.

The game must not fetch this reference catalog, and the showcase must not
preload all masters or game assets. Public build promotion needs a separate
allowlist check even when reference-package import succeeds. These requirements
describe existing plan decisions 6A, 7A, 9A, 11A, 12A and 17A; their
implementation/negative tests remain later work, not R1 deliverables.

## Future Import Acceptance

1. Exactly the 49 inventoried masters are represented once; every master retains
   its original bytes and 1536 x 1024 dimensions.
2. Each copied master matches the recorded SHA-256 and has reviewed provenance.
3. No `-720p` previews or duplicate catalog from Midcreek is copied.
4. The 47 prompts retain valid shared-base references; structured and prose
   foundations remain available together.
5. A reference manifest records revision, source path, hash, width, height,
   bytes, artwork family, sidecar mapping, and provenance/approval status.
6. Reference masters are not loaded into the production game bundle by default.
7. New commits/source revisions require a fresh inventory instead of assuming
   the counts, hashes, or dimensions in this snapshot remain valid.
