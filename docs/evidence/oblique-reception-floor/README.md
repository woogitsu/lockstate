# Reception floor in the real oblique app

At 1920 × 1080, a finished 6 × 6 Reception was built by workers, saved, loaded,
and photographed at −45°, 0°, and +45° yaw with 45° tilt. The base is the
compacted-earth art stack `b3d44946565e91c302f5527e07083368be2dae61`.

Before, the completed room's interior used the same dirt tile as the yard:

| yaw | before | after |
| --- | --- | --- |
| −45° | [image](before-yaw-minus45.png) | [image](after-yaw-minus45.png) |
| 0° | [image](before-yaw0.png) | [image](after-yaw0.png) |
| +45° | [image](before-yaw45.png) | [image](after-yaw45.png) |

At 0°, a furniture-free interior sample (x 790–859, y 345–424) and an exterior
sample (x 1140–1209, y 345–424) differed by just **0.52** in mean RGB
brightness before. After the authored linoleum tile was mapped to
`room.reception`, the same difference was **111.79**. The comparison is a
fixed-screen visual regression measure, not a claim about every camera zoom.
The browser test requires a gap above 20, verifies the room after Save/Load,
and records all three angles. No room tint or zoning rule changed (ADR 0098,
0101); the Blender source changes only the physical floor material.

The isolated `.blend` source is built by
`tooling/blender/build-reception-linoleum-floor.py`, then rendered to 72
orthographic poses by `tooling/blender/render-oblique-floor-frames.py -- --only
floor.reception.linoleum`. The manifest records the source hash and every PNG
hash. The authored tile keeps its 1 × 1 ground pivot and fine joints at every
pose.
