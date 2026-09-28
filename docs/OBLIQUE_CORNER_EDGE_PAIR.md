# Full-edge Blender corners for the oblique wall grid

The first north-east and south-east Blender corners joined two straight sprites
in the art study. Their authored arms extend only **0.5 tile** from the pivot.
The real `projectObliqueWorldFrame` emits each wall as a **whole one-tile edge**.
Replacing both runtime edge sprites with either original corner would therefore
leave a half-tile gap on both sides.

This update extends only the arm ends to cover **one whole runtime edge** in
Blender, retaining the source wall thickness, plaster, blue-grey coping and
cutaway height. The 0.11-tile anchor inset makes the source coordinates
asymmetric: NE uses `(1.11, 0.89)` and SE uses `(1.11, 1.11)` before rotation.
After the inset, their far ends meet the neighboring whole-edge sprites.
It updates
the four existing `wall.interior.corner.inner.north-east/south-east.full/cutaway`
catalogs (24 yaw × 3 elevations each). The source `.blend` is unchanged; the
deterministic geometry transform is in `pipeline_common.py` and both render
entry points. Old immutable hash-named PNGs remain present.

## Runtime placement contract

The corner replaces two complete wall modules. It is never layered as a trim.
For a grid vertex `(cx, cy)`:

| Module | Straight edge IDs to omit | Blender arms |
| --- | --- | --- |
| `north-east` | `north-edge:(cx-1):cy`, `west-edge:cx:cy` | west, south |
| `south-east` | `north-edge:(cx-1):cy`, `west-edge:cx:(cy-1)` | west, north |

Both replaced edges must be walls, not doors. World edge prisms are 0.22 tile
thick and `ObliqueWorldScene` anchors each straight sprite at the centroid of
that prism. Thus the matching corner centerline anchor is the shared grid
vertex inset by half the wall thickness on both axes:
`groundToScreen({ x: (cx + 0.11) * 64, y: (cy + 0.11) * 64 }, camera)`.
Keep the image pivot `(256,256)` and the existing 64 px/tile scale. The pure
grid vertex `(cx*64,cy*64)` produced visibly stepped joins in the real
projection comparison; a 1.00-tile Blender reach with that inset left a
0.11-tile gap at the far end. The asymmetric reach above removed it. Automatic
selection and occlusion belong to the integrator's scene PR; this art PR does
not change the projector or scene.

## Measured proof

Blender 5.2.1's arm verifier failed on the old geometry with
`north-east full leaves a runtime edge gap: (0.5, 0.5)` (exit 1), then passed
both full and cutaway variants at NE `(1.11, 0.89)` and SE `(1.11, 1.11)`
(exit 0). Re-rendering all four
catalogs independently yielded byte-identical manifests:

| Catalog | SHA-256 |
| --- | --- |
| north-east full | `a984a9fb158aad07b104350b731d9a638dcaee9f1e1f78a92d14b94a6a4fd53a` |
| north-east cutaway | `6b361c07c6d741f0fa6a51602ba523a4acdbf6e85bcb03e810772edb27d57208` |
| south-east full | `ab27e36d9fc03256dcb3df37e82d8083aacc81e97af3f5a636d396e738b87ee8` |
| south-east cutaway | `3c6232fdea33ef503cad4cc6224924f23b94778bfc9f57611b3b85df005ecc9f` |

The Full HD 1920×1080 browser harness imports the **real**
`projectObliqueWorldFrame` from the integrator's oblique branch, builds wall
edges in `SparseWorld`, and compares the two straight runtime solids with one
corner at five yaw angles. It keeps neighboring straight solids so a gap or
overlap at either end is visible. The harness source is
[`qa-oblique-corner-edge-pair.mjs`](../tooling/qa-oblique-corner-edge-pair.mjs); it needs
the integrator's projector branch and a Vite browser-test server on port 5208.
At all ten side/yaw samples the projector returned the expected four edge IDs
and the browser loaded three distinct frame textures. These are real-projector
compositions, not a claim that automatic corner selection is in the game yet.

| Yaw | North-east | South-east |
| --- | --- | --- |
| −90° | [PNG](evidence/oblique-corner-edge-pair/lockstate-corner-edge-pair-north-east-yaw-90.png) | [PNG](evidence/oblique-corner-edge-pair/lockstate-corner-edge-pair-south-east-yaw-90.png) |
| −45° | [PNG](evidence/oblique-corner-edge-pair/lockstate-corner-edge-pair-north-east-yaw-45.png) | [PNG](evidence/oblique-corner-edge-pair/lockstate-corner-edge-pair-south-east-yaw-45.png) |
| 0° | [PNG](evidence/oblique-corner-edge-pair/lockstate-corner-edge-pair-north-east-yaw0.png) | [PNG](evidence/oblique-corner-edge-pair/lockstate-corner-edge-pair-south-east-yaw0.png) |
| 45° | [PNG](evidence/oblique-corner-edge-pair/lockstate-corner-edge-pair-north-east-yaw45.png) | [PNG](evidence/oblique-corner-edge-pair/lockstate-corner-edge-pair-south-east-yaw45.png) |
| 90° | [PNG](evidence/oblique-corner-edge-pair/lockstate-corner-edge-pair-north-east-yaw90.png) | [PNG](evidence/oblique-corner-edge-pair/lockstate-corner-edge-pair-south-east-yaw90.png) |

The two adjacent material caps still show a thin seam at some oblique views;
the new corner avoids the open half-tile gap. Runtime selection must be
checked again with actors, occlusion and the chosen cutaway rule after the art
and scene branches meet.
