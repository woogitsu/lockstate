# Open cell door and corridor camera study

This is an authored Blender module and visual test for the cell/corridor
opening. The [wall kit](WALL_CAMERA_ART_PLAN.md) owns its galvanized jambs,
lintel and cutaway frame. The new `door.interior.leaf.open` collection contains
only the timber leaf, raised panels, steel latch and hinges. It replaces the
plain door stand-in in the [canonical cell scene](CAMERA_ANGLE_ART_STUDY.md).
No runtime camera, gameplay or door-state rule changes in this study.

The hinge is at `(-0.36, 0, 0)` inside the one-tile frame. The leaf spans
0.76 tile and is 2.28 tiles tall. It swings **−125°** into the corridor,
folding toward the adjoining wall. A first −80° prototype completely filled
the projected mid-height opening at −45° yaw and 25°/45° elevation. Moving
the open leaf farther out of the aperture was based on the real 64 px/tile
renders rather than a top-down assumption.

The fixed grid reuses the same cell, light, target and nine yaw/elevation
poses: yaw −45°/0°/+45° × elevation 25°/45°/65°. Full HD 1920 × 1080 with
Blender orthographic scale **30** gives **64 px/tile** across the horizontal
frame (`TILE_SIZE_PX` in the game is 64). The source scene and every PNG
hash are recorded in the [manifest](../assets/rendered/cell-door-angle-study/manifest.json).

## Opening visibility

At 1.20 tiles high, the render script samples the projected span from
`x=-0.32` to `x=+0.32` between the inner jamb edges. It counts unique
pixels with alpha below 16 in a door-and-frame-only image, so the floor,
actor and furniture cannot be mistaken for an open aperture. The nine
furnished images can be opened through the table below.

| Yaw | 25° elevation | 45° elevation | 65° elevation |
| --- | --- | --- | --- |
| −45° | [View](../assets/rendered/cell-door-angle-study/door-yaw-45-elev25.png) | [View](../assets/rendered/cell-door-angle-study/door-yaw-45-elev45.png) | [View](../assets/rendered/cell-door-angle-study/door-yaw-45-elev65.png) |
| 0° | [View](../assets/rendered/cell-door-angle-study/door-yaw+00-elev25.png) | [View](../assets/rendered/cell-door-angle-study/door-yaw+00-elev45.png) | [View](../assets/rendered/cell-door-angle-study/door-yaw+00-elev65.png) |
| +45° | [View](../assets/rendered/cell-door-angle-study/door-yaw+45-elev25.png) | [View](../assets/rendered/cell-door-angle-study/door-yaw+45-elev45.png) | [View](../assets/rendered/cell-door-angle-study/door-yaw+45-elev65.png) |

Unique clear sample pixels / total projected sample pixels:

| Yaw | 25° | 45° | 65° |
| --- | ---: | ---: | ---: |
| −45° | 22/40 | 22/41 | 31/46 |
| 0° | 41/41 | 41/41 | 41/41 |
| +45° | 24/40 | 27/41 | 29/46 |

The leaf folds beside the jamb at −45°/25° and its raised panel remains
visible on the opposite +45° side. In both shallow oblique views the opening
is still at least half clear. At the head-on 0°/45° pose, the solid-wall
control measures **0/41**, while both full and cutaway doorframes measure
**41/41**. The open leaf is hidden in the cutaway control so it does not
remain as an isolated full-height panel next to the low frame.

At the same 0°/45° view, compare the [full doorway](../assets/rendered/cell-door-angle-study/door-yaw+00-elev45.png),
the [low cutaway frame](../assets/rendered/cell-door-angle-study/door-yaw+00-elev45-frame-cutaway.png),
and a [solid wall in the doorway tile](../assets/rendered/cell-door-angle-study/door-yaw+00-elev45-solid-wall.png).
The cutaway option hides the tall open leaf with the upper frame so it does
not look like an isolated plank. These are controlled art options, not a
runtime selection policy or a change to physical door collision.
