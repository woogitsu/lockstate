# West-edge wall cutaway for the rotating cell

## Observed gap

The real selected-cell harness at 1920×1080 showed separate short posts along the west-edge cutaway at yaw −90°, −45°, 0°, 45°, and 90°. The scene currently requests the north-edge `wall.interior.module.cutaway` for both north and west full walls. That sprite has its length on the wrong local axis for a west edge.

## Blender module

`wall.interior.module.west.cutaway` is rendered from the existing authored `wall.interior.module.cutaway` collection in `wall.interior.cutaway.blend`, rotated a quarter turn in Blender before the standard camera loop. It has 24 yaw × 3 elevation transparent frames, 512×512 RGBA, 64 nominal pixels per tile, and pivot `(256,256)`. Its manifest is `public/game-content/oblique-wall-west-cutaway.v1.json`. The new atlas uses the same material, height and footprint as the north-edge cutaway and shares pose indices with `wall.interior.module.west.full`.

To integrate in the game, map `wall.interior.module.west.full` to `wall.interior.module.west.cutaway` in the planned ObliqueWorldScene cutaway selection method. That scene method has not landed on this branch. The catalog and textures are already discoverable through the shared module registry. This PR does not edit the scene or its projection.

## Full HD gate

The comparison uses the real `ObliqueWorldScene` browser harness and the same selected tile `(3,3)`, elevation 45°, camera target, and 1920×1080 viewport for every view. The reproducible QA script `tooling/qa-live-oblique-cutaway.mjs` captures before state normally. With `--after`, it intercepts the browser's served scene module and catalog to exercise precisely the integration mapping above, without writing to the scene source. The west cutaway becomes a continuous low wall at diagonal and cardinal angles, while the bed and actor stay visible. This is browser proof of the proposed mapping, not a merged runtime change.

| Yaw | Current scene | New catalog and mapping in browser |
| --- | --- | --- |
| −90° | [before](evidence/oblique-west-wall-cutaway/before-yaw-90.png) | [after](evidence/oblique-west-wall-cutaway/after-yaw-90.png) |
| −45° | [before](evidence/oblique-west-wall-cutaway/before-yaw-45.png) | [after](evidence/oblique-west-wall-cutaway/after-yaw-45.png) |
| 0° | [before](evidence/oblique-west-wall-cutaway/before-yaw0.png) | [after](evidence/oblique-west-wall-cutaway/after-yaw0.png) |
| 45° | [before](evidence/oblique-west-wall-cutaway/before-yaw45.png) | [after](evidence/oblique-west-wall-cutaway/after-yaw45.png) |
| 90° | [before](evidence/oblique-west-wall-cutaway/before-yaw90.png) | [after](evidence/oblique-west-wall-cutaway/after-yaw90.png) |

The registry test failed red at 27 actual versus 28 expected modules. After adding the catalog and 72 Blender frames, registry, catalog and determinism tests passed 9/9. A second Blender 5.2 render reproduced manifest SHA256 `841d3ccb6660c2a321e3eabc48a92157851b73fc9a352e39425b681dd2dd4135` exactly.
