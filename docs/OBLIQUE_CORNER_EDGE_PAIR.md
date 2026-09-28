# Full-edge Blender corners for the oblique wall grid

The first north-east and south-east Blender corners joined two straight sprites
in the art study. Their authored arms extend only **0.5 tile** from the pivot.
The real `projectObliqueWorldFrame` emits each wall as a **whole one-tile edge**.
Replacing both runtime edge sprites with either original corner would therefore
leave a half-tile gap on both sides.

This update extends only the arm ends to **1.0 tile** in Blender, retaining the
source wall thickness, plaster, blue-grey coping and cutaway height. It updates
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
projection comparison; the 0.11-tile inset reduced that mismatch. Automatic
selection and occlusion belong to the integrator's scene PR; this art PR does
not change the projector or scene.

## Measured proof

Blender 5.2.1's arm verifier failed on the old geometry with
`full leaves a runtime half-edge gap: (0.5, 0.5)` (exit 1), then passed both
full and cutaway variants at `(1.0, 1.0)` (exit 0). Re-rendering all four
catalogs independently yielded byte-identical manifests:

| Catalog | SHA-256 |
| --- | --- |
| north-east full | `93edb5f7076d846b56da30678f48ebc9d9bc8850d2ec2f9e3379e8b04abcd4ba` |
| north-east cutaway | `badd1d44650acc13f57fc0fba083bc4d51e8e6b25cf9e7a8aa6692358377b385` |
| south-east full | `a3f1faf3f1bd63bf92e206062b3abc1e7de79e9cdd8a4bfafb92e2b6cb505f3` |
| south-east cutaway | `9bd2bf06046f9cdda283b99f2c012bea7168ccf83d884160fff199f01a6b08f4` |

The Full HD 1920×1080 browser harness imports the **real**
`projectObliqueWorldFrame` from the integrator's oblique branch, builds wall
edges in `SparseWorld`, and compares the two straight runtime solids with one
corner at five yaw angles. It keeps neighboring straight solids so a gap or
overlap at either end is visible. The harness source is
[`qa-harness.mjs`](evidence/oblique-corner-edge-pair/qa-harness.mjs); it needs
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
