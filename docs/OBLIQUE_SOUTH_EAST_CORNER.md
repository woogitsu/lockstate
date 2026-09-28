# South-east corner for the selected cell cutaway

The real selected-cell oblique view still joins two low straight walls at the south-east corner when yaw 45° or 90° exposes the room. At 45° their metal caps cross and the corner has a doubled, blocky end. The registry has north-west and north-east corner pairs, but no south-east equivalent; the existing floor tiles already cover this view. This PR adds only the direction visible in that room.

The authored Blender `wall.interior.corner.inner.full` and `.cutaway` collections are rotated 90° from east/north arms to north/west arms, matching the cell's south and east edges. The published IDs are `wall.interior.corner.inner.south-east.full` and `.cutaway`. Both use 24 yaw × 3 elevations, transparent 512×512 frames, 64 nominal px/tile, and pivot `(256,256)`. Their manifests are `oblique-wall-corner-south-east-full.v1.json` and `oblique-wall-corner-south-east-cutaway.v1.json`.

The Full HD comparison below uses the existing browser art loader with the same cell, corridor, actors and camera in each pair. It replaces the two straight pieces at `(1,-1)` with the new corner. At yaw 45° the overlapping caps become a continuous L-shaped coping. The 2× panel exposes seams, while the native 64 px/tile panel checks normal game scale. These are browser module compositions; the runtime scene still needs automatic corner selection and occlusion rules, outside this PR.

| Yaw | Straight join | South-east corner |
| --- | --- | --- |
| −90° | [before](evidence/oblique-south-east-corner/before-yaw-90.png) | [after](evidence/oblique-south-east-corner/after-yaw-90.png) |
| −45° | [before](evidence/oblique-south-east-corner/before-yaw-45.png) | [after](evidence/oblique-south-east-corner/after-yaw-45.png) |
| 0° | [before](evidence/oblique-south-east-corner/before-yaw0.png) | [after](evidence/oblique-south-east-corner/after-yaw0.png) |
| 45° | [before](evidence/oblique-south-east-corner/before-yaw45.png) | [after](evidence/oblique-south-east-corner/after-yaw45.png) |
| 90° | [before](evidence/oblique-south-east-corner/before-yaw90.png) | [after](evidence/oblique-south-east-corner/after-yaw90.png) |

The registry contract failed red with 30 actual versus 32 expected IDs. After rendering, the registry/catalog/determinism suite passed 9/9. A second Blender 5.2.1 render reproduced both manifest SHA256 values: full `122391b065cd5635cfb3b3548806c765bb5b407636b0a988360becf4d85c3df7`, cutaway `98055d1c59bc6ff93a3c9a444d8b51c7ffe8e09817336f427668220ced30de1a`.
