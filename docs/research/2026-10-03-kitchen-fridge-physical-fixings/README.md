# Kitchen fridge physical fixings - 2026-10-03

## Actual existing consumer and preserved source

Existing buildable `fridge-brick` places `object.fridge`, authoritative 1x1, default `furniture.kitchen.fridge.variants` (`src/content/object-catalog.ts:107`, `src/simulation/construction/definition.ts:452-458`, `src/rendering/assets/oblique-object-mapping.ts:23`). Actual `kitchen-basic` places the fridge at local(1,3), `src/content/room-template-catalog.ts:67-72`. No new identity, template or mapping is introduced.

Current source `furniture.kitchen.fridge.angled.blend` SHA256 `d85097c30f524948f3e3c9c82d0a15b11eea956a680227569c37d6e52a6a52bc` already contains 73 meshes and six stored complete material graphs: 9 legacy parts plus 64 previously authored gaskets, hinge plates/barrels, handle standoffs, front grille, side ventilation and status bezel. Fresh native audit finds 4194 outward evaluated faces and zero degenerates. This source is correctly aligned and richly authored; none of those parts is recreated and no winding or alignment defect is claimed. Original legacy variants file and current angled source remain separately preserved.

Fresh published branches verified: `codex/kitchen-fridge-angled-20261002` head `03955b36fc641c2df7b71638ba88de5c44deae68`, `codex/fridge-refinement-art-2026-09-24` head `cbbadf2c64cdd98d818e33007409b331cb11380d`, `art/oblique-kitchen-fridge-20261001` head `b5767347aac413137df1dda554a489f067c44869`. Existing previously accepted native Kitchen q0/q1 evidence belongs to the older source and is not claimed for this new refinement.

Actual part inventory has four bare hinge mounting plates/barrels and four bare handle standoffs. Opened original front/side renders confirm these parts have no retaining heads, endcaps or collar fixings. Approved narrow refinement adds eight hinge-plate retaining heads, eight barrel endcaps, four handle collars and four collar retaining heads: **24 actual parts, 97 total**, retaining all original 73 raw vertex/topology/material-index/modifier/matrix/evaluated-position bytes and all six full graphs. New parts use only existing `steel` and `handle` materials. Actual evaluated bounds of each fixing overlap its real retained plate/barrel/standoff (retaining heads overlap the corresponding new collars), checked from loaded geometry, not declared metadata alone.

## Source geometry and verification boundary

Original and new exact full bounds: `[-0.42500001192092896,-0.4845000207424164,0]` to `[0.42500001192092896,0.3995000123977661,2.3999998569488525]`. Unit XY fit, 1x1 occupied rectangle, target `[.5,.5,1.1999999284744263]` and shared 64 pixels/tile camera stay unchanged. Four occupied rotations and 72 actual camera transforms verified. New source `furniture.kitchen.fridge.angled-detail.blend` SHA256 `0cb6861e636324cf4d1e6ad35c1739cbac6068f32eb702244f5ddb196715f3d5`; 8082 actual evaluated outward faces, zero degenerates.

Fresh reopen checks all 97 actual raw parts, six full shader graphs, evaluated-position hashes, all 24 physical contacts and independently computed world-space geometric normals. Weighted shading normals do not substitute for topology evidence. Initial scratch audit reused a bookshelf-specific material-name filter and recorded only the shared steel graph; removed that filter in the independent scratch auditor, then verified all six actual stored graphs. Production own auditor enumerates every stored graph.

Opened original/new four-yaw comparison shows subtle actual hinge retaining heads and gold handle collars, while the already authored doors, louvres, gaskets and back remain preserved. These are native Blender renders, not player screenshots. Pinned Blender 5.2.1 LTS upstream ID `9e2066aef7ef`; executable SHA256 `284f4041f98e113f3dc10654a7193ffaaa9bfdfec8b87fa116620a48b5f6d4cb`.

Source/refiner/guard checkpoint first. Canonical72 integration, repeat and real producer/decoded consumer negatives follow separately. No browser or server launched; parent owns subsequent real Build/SaveLoad acceptance. No context, palette, gameplay, save, copy, projection or matcher change.
