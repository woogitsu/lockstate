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
