# Cel Shift Source and Picture-Size Audit

Recorded September 10, 2026. Documentation only: no source artwork, prompts,
or metadata sidecars have been copied into CS3.

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
read from the actual master files, not inferred from metadata.

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
