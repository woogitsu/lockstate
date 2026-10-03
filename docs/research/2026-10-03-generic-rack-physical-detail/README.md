# Generic wooden rack: physical frame hardware, 2026-10-03

## Scope and audited starting point

Existing buildable `storage-rack-wooden`, object `object.storage-rack`, default asset `furniture.storage.rack.wooden`, authoritative footprint1x1. The accepted StorageRoom `furniture.storage-room.timber-rack` contextual override is unchanged. This is physical refinement of the already authored model, not a new buildable or an alignment repair.

Original source `assets/source/blender/furniture.storage.rack.wooden.blend` is retained byte-identically: SHA256 `3806d996ce473e166aaa00bef379655aac2c41ef4d45f7f32b48a893ff4b4eed`. Native source has48 meshes,12 material graphs,1904 evaluated polygons, all outward with zero degenerates. Fresh inspected historical branches include `codex/generic-wooden-rack-alignment-20261002` (`2d1e9fbba5688ffc325f77ecf13b12f656ceb5ce`), `art/storage-room-rack-20261002` (`0aa58051b3cad17e53dc4bec918b6f846d07f63f`) and `art/oblique-rack-consumer-20261001` (`d524936b5074c43b83220f66f7454a441788a08e`). Existing contents, crate/labels/folded canvas remain; this does not duplicate their densification.

## Actual Blender source checkpoint

New `assets/source/blender/furniture.storage.rack.wooden.angled-detail.blend`: SHA256 `600d62b3b5708081445b6ba84b5f38fc8534922f6a128b448e1585c97e95c212`.48 original parts plus56 actual structural parts =104 meshes/6902 evaluated polygons, all outward, zero degenerates. New geometry supplies six side bearers, twelve endplates and twelve fixing bolts, six solid triangular gussets, a rear X brace with plates/bolts, and four post shoes/fixings. Only existing materials are used. The paired four-yaw actual Blender renders were opened: bearing rails and rear diagonal bracing are visible; original shelf contents/material appearance remains.

Fresh independent reopened-scenes audit `reopened-source-audit.json` verifies all48 original raw vertex/topology/polygon-material bytes, material slots, modifiers, assembly matrices and actual evaluated vertex bytes exactly unchanged; actual world-edge cross products and signed-volume triangulation verify all104 solids. Dedicated production guard additionally checks complete12 material graphs/node properties/inputs/links/ramps/packed-image hashes. No original winding was reversed.

Exact centered bounds before/after: `[-0.49500030279159546,-0.4549993872642517,0]` to `[0.49500030279159546,0.4549993872642517,1.4079999923706055]`. Existing unit XY fit, min-corner translation0.5/0.5 gives `[0.004999697208404541,0.04500061273574829,0]` to `[0.9950003027915955,0.9549993872642517,1.4079999923706055]`; target `[0.5,0.5,0.7039999961853027]`. Dedicated pinned Blender guard verified allfour occupied rotations and72 actual camera transforms at64pixels/tile.

Initial new brace build stopped before saving: its cross-section rotation exceeded rear Y bounds. Corrected the newly authored brace cross-section; the strict bounds gate remains. The retained source had no such defect.

Blender5.2.1LTS upstream build ID `9e2066aef7ef`; executable SHA256 `284f4041f98e113f3dc10654a7193ffaaa9bfdfec8b87fa116620a48b5f6d4cb`.

## Acceptance boundary

This first source checkpoint has actual .blend/provenance and four-yaw comparisons. Canonical export integration, repeat72, production negative controls and prepared client build follow separately. No browser/server/native player acceptance ran; root owns the browser queue. No hosted completion claim.

## Canonical export and actual offline negative controls

The original production entrypoint `tooling/blender/render-generic-wooden-rack-oblique.py` routes only its existing default rack model tuple through the dedicated authored guard. Original fallback guard remains; shared functions and every other source tuple/registry/context mapping are unchanged. Canonical `public/game-content/oblique-cell-storage-rack.v1.json` SHA256 `2463369e2bd785c2edee78a46d0e7cdcdbb9efac9b4de097e56af5bae4461e2f` consumes the new source.72 canonical256px RGBA poses retain64ppt, target/pivot and all4 occupied orientations. Dedicated full repeat and original production-entrypoint full repeat each verify73/73 descriptor+frame files byte-identical. Independent Pillow decode found minimum66px transparent border; the complete72-pose sheet was opened.72 old same-asset frames were retired only after scanning all current public/game-content JSON references; original source and other assets stay.

Twenty actual production controls were RED, followed by byte-exact restoration and GREEN:

- Three source-producer controls before saving: omitted real rear brace; actual reversed triangular support topology; wrong new brace cross-section escaping accepted fullbounds. All rejected before newsource/provenanceSave. Original/source/provenance/builder exact restored.
- Twelve loaded producer controls: removed brace; moved physical plate; moved retained post; changed retained shelf bevel; changed material node Roughness; changed added brace material assignment; actual reversed support winding; wrong fit/target/canonical descriptor; wrong camera span/vector. Own wrapper and original/new source bytes exact restored; actual72-camera native verify GREEN.
- Three original-entrypoint dispatch controls: selecting historical48-part source, wrongYfit and target. Actual semantic guard RED then byte-exact wrapper restore/nativeverifyGREEN.
- Two decoded-consumer controls: a genuinely opaque corner with valid recomputed PNG hash/name/signature/dimensions fails decoded-border assertion; incorrect canonical target fails. Exact descriptor/PNG bytes restore and focused integrity GREEN.

Focused existing/default-source detail integrity and art-pipeline determinism:7passed/1skipped. The generic optional liveBlender check is skipped because Blender is absent from PATH; explicit pinned native Blender5.2.1 checks above ran independently. Both app/tools TypeScript checks exit0. An initial contact-sheet harness used nonexistent frame field `yawDeg` and failed after both full repeat assertions had already passed; corrected actual `yawDegrees`/`elevationDegrees`, repeated exports/decoder and produced the opened sheet. No weakened production guards.

Native individual PlaceObject q0/default and genuine rotated StorageRoom?Unzone q1 proof remains root queued; existing accepted contextual override is preserved. These offline controls are not native Build/SaveLoad or hosted acceptance.
