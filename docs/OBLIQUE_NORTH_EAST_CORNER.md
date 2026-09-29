# North-east corner for the rotating cell

The selected cell in the real Full HD oblique harness has a visible crossed metal cap where its north and east straight wall sprites meet. The registry already contains the north-west inner corner in two heights, but no north-east equivalent. Existing corridor, cell and canteen floor modules cover the floor in this view, so this PR adds the missing corner pair rather than another floor tile.

`wall.interior.corner.inner.north-east.full` and `wall.interior.corner.inner.north-east.cutaway` use the authored `wall.interior.corner.inner.*` collections from `wall.interior.cutaway.blend`. The Blender renderer turns their east/north arms 180° to west/south, which aligns with the north and east edges of a cell. Both variants have 24 yaw × 3 elevation transparent frames, 512×512 resolution, 64 nominal pixels per tile and pivot `(256,256)`. Manifests are `oblique-wall-corner-north-east-full.v1.json` and `oblique-wall-corner-north-east-cutaway.v1.json`.

The Full HD browser comparison uses the existing art preview composition, identical cell geometry and camera at five yaw angles. It swaps the two straight pieces at `(1,1)` for the corresponding corner. At yaw 45°, the crossed end caps become a continuous L-shaped top and plaster face; the cutaway version stays low at negative yaw. The 2× view permits seam inspection, and the right-hand view shows normal 64 px/tile scale. These are browser module compositions. Runtime automatic corner selection remains a separate scene integration step, outside this PR.

| Yaw | Straight join | North-east corner |
| --- | --- | --- |
| −90° | [before](evidence/oblique-north-east-corner/before-yaw-90.png) | [after](evidence/oblique-north-east-corner/after-yaw-90.png) |
| −45° | [before](evidence/oblique-north-east-corner/before-yaw-45.png) | [after](evidence/oblique-north-east-corner/after-yaw-45.png) |
| 0° | [before](evidence/oblique-north-east-corner/before-yaw0.png) | [after](evidence/oblique-north-east-corner/after-yaw0.png) |
| 45° | [before](evidence/oblique-north-east-corner/before-yaw45.png) | [after](evidence/oblique-north-east-corner/after-yaw45.png) |
| 90° | [before](evidence/oblique-north-east-corner/before-yaw90.png) | [after](evidence/oblique-north-east-corner/after-yaw90.png) |

Registry contract first failed red with 28 actual versus 30 expected IDs. After Blender rendering, registry/catalog/determinism tests passed 9/9. A second Blender 5.2.1 render reproduced both manifests byte for byte: full `a786d4ea4efd4e21b6ef2a9eaad7d05e7497d2f38e1610e93af44ce8dd651d72`, cutaway `2e70ba7425fdc825555e1d4f9e30e10ebbd5e804e69e0ed49b89bdd839b51d5c`.
