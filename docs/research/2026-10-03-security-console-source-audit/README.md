# Actual security-console source audit and next-model proposal

2026-10-03. Isolated base `3fabd094e086c3ab6836b50d995b755524cdd428`; no browser process launched.

## Current gameplay coverage

All 21 default object mappings resolve existing Blender-backed angled catalogues. `object.sink` deliberately has no buildable. The source/descriptor list is [current-default-model-inventory.json](current-default-model-inventory.json); unhydrated original sources are checked by their literal LFS OID, and this identity check does not claim that their actual geometry was opened.

Yard exercise equipment is already a genuinely buildable `exercise-station` ? `object.exercise-station`, footprint2?1, with its own `furniture.yard.exercise-station` model. The literal Yard template remains an 8?8 empty outdoor zone; the existing individual Build route places the equipment. Its actual source has32meshes/five materials, grounded bounds `[0.050000027,0.059999987,0]`?`[1.949999928,0.939999998,1.697499990]`, and all2880 evaluated faces point outward. Its existing72poses use64ppt; prior actual worker/SaveLoad/consumer-negative evidence is recorded in `docs/research/2026-10-02-exercise-station-player-build/README.md`. The older source-draft note predates its buildable integration. Yard bench/bin contextual overrides also already have dedicated models and native evidence. This audit proposes no duplicate Yard model or new buildable.

## Confirmed next candidate

`security-console-brick` ? `object.security-console` (numeric16), authoritative2?1, surveillance/workstation capabilities. Default consumer `utility.security-console.variants` has no room override. The actual `security-office-basic` 5?5 template places this console at local1,1. The buildable requires60work/two existing bricks. No identity, palette, mechanics, template or copy change is proposed.

Immutable source `assets/source/blender/utility.security-console.variants.blend`, SHA256 `7b7c755e96cc460c6afa42d8a5e4a1f44480a21a6483cea122949290848db5d7`, retains nine source boxes: body/top/front/monitor/control/dial/status/two feet. It uses four existing materials: warm charcoal/control panel/amber status/monitor glass. Original source commit is `fce7b5c0c17b2fd5c3860584f73384b59ad6420b`. Earlier authored branches `codex/security-console-art-2026-09-23` and `codex/security-console-visual-refine-2026-09-25` contain the older environment catalogue and CCTV texture, not this standalone nine-part scene. They are preserved historical authorship; no competing current standalone-refinement branch was found in the inspected branch list.

The actual original scene was opened in pinned Blender5.2.1LTS. A centroid/normal dot audit of its convex boxes finds all54raw faces and all486 evaluated faces inward. The evaluated audit includes inverse-transpose normals, actual world transforms and bevel modifiers. By comparison the separately opened Yard source has zero inward evaluated faces. Full measurements are in [source-audit.json](source-audit.json).

The existing security fit `[1,0.9,1]` is valid: prepared evaluated bounds `[0.120000005,0.063500017,0]`?`[1.879999995,0.842000008,1.009999990]`, and allfour oriented footprints fit. Existing camera target `[1,0.5,0.65]`, 256px/4tiles=64ppt and72poses are already in the published descriptor. This is an actual topology/edge-lighting defect, not an invented footprint or camera alignment failure.

[Paired actual winding previews](security-winding-comparison.png) were opened at original resolution. Top row is the original source; bottom reverses only faces in memory, preserving the original file byte-for-byte and camera/material/fit settings. Four yaws at elevation40 show the corrected solid bevel edges. The front currently reads as a plain monitor strip plus a narrow rectangular controls strip with two box indicators; a restrained physical bezel/control refinement can make the existing surveillance/workstation role clearer using its existing materials.

## Proposed narrow model surface

Own `refine-security-console-angled.py`, `render-security-console-angled.py`, new dedicated `utility.security-console.angled.blend` and provenance, the existing canonical `oblique-utility.security-console.v1.json` plus its72frames, and only the security MODELS tuple/security-only guard dispatch in `render-control-fixtures-oblique.py` when authorised. Shared exporter/default functions, Utility and all other model tuples stay outside the proposed surface.

Retain original nine-part positions, raw vertex bytes, four complete material values/graphs and modifiers; explicitly correct the inward topology rather than falsely claiming raw topology unchanged. Proposed actual physical detail: monitor bezel, control keycaps and knob collars within the existing2?1 fit. Validate raw/evaluated outward normals and allfour actual footprints, run a reversed-winding producer control and exact restoration, repeat72canonical poses and decoded-frame integrity controls. Genuine SecurityOffice q0/q1 worker completion, unique source order/placed identity, Save/Load and consumer negative remain a later exclusive browser slot. No production model/export source was changed during this audit.
