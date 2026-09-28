# Cell bed at nine camera angles

This study replaces the simple bed stand-in in the [canonical cell scene](CAMERA_ANGLE_ART_STUDY.md)
with the existing `furniture.cell.bed.single.variants` collection from
`environment.mvp.catalog.blend`. It changes no game renderer, camera control,
simulation or catalog model. The bed's authored bottom-center origin is placed
at `(1, 2.1, 0)` in the cell. The wall, actor, door, one area light and camera
target remain the same.

All views use **1920 × 1080**, orthographic scale **30**, the original
−45°/0°/+45° yaw by 25°/45°/65° elevation grid, and the same light at
`[-4, -5, 9]`. Blender's orthographic scale sets the horizontal world span:
1920 / 30 yields **64 pixels per tile** at Full HD, matching the game's
nominal default zoom. Each angle has
a furnished image and a bed-only transparent silhouette. The latter measures
the model without any wall occlusion.

| Yaw | 25° elevation | 45° elevation | 65° elevation |
| --- | --- | --- | --- |
| −45° | [5,992 px; 127 × 101](../assets/rendered/cell-bed-angle-study/bed-yaw-45-elev25.png) | [6,858 px; 127 × 126](../assets/rendered/cell-bed-angle-study/bed-yaw-45-elev45.png) | [7,326 px; 127 × 136](../assets/rendered/cell-bed-angle-study/bed-yaw-45-elev65.png) |
| 0° | [4,902 px; 64 × 99](../assets/rendered/cell-bed-angle-study/bed-yaw+00-elev25.png) | [6,417 px; 64 × 122](../assets/rendered/cell-bed-angle-study/bed-yaw+00-elev45.png) | [7,159 px; 64 × 131](../assets/rendered/cell-bed-angle-study/bed-yaw+00-elev65.png) |
| +45° | [5,982 px; 126 × 102](../assets/rendered/cell-bed-angle-study/bed-yaw+45-elev25.png) | [6,837 px; 126 × 126](../assets/rendered/cell-bed-angle-study/bed-yaw+45-elev45.png) | [7,318 px; 126 × 136](../assets/rendered/cell-bed-angle-study/bed-yaw+45-elev65.png) |

The table reports nontransparent bed pixels and silhouette width × height.
The [nine silhouette images](../assets/rendered/cell-bed-angle-study/manifest.json)
are linked from the manifest. The smallest silhouette is the head-on 0°/25°
view: 64 × 99 px and 4,902 pixels. Its pillow, orange folded blanket,
rails and raised end posts remain distinct. Oblique views show the bed's
depth and four posts. The bed itself does not collapse into a flat slab at
the sampled default-scale views, so this study leaves its accepted geometry
and palette intact.

The furnished **+45°/25°** view reveals a different issue: the full east
wall hides most of the bed despite the clear [isolated silhouette](../assets/rendered/cell-bed-angle-study/bed-yaw+45-elev25-silhouette.png).
The [same-angle east cutaway candidate](../assets/rendered/cell-bed-angle-study/bed-yaw+45-elev25-east-cutaway.png)
replaces east wall modules 1–3 and the northeast outer corner with their
authored cutaway variants. The candidate rule sampled here is yaw ≥ +30°
and elevation ≤ 30°. Within the bed's projected silhouette, an orange blanket
proxy (`R>105`, `R>1.45G`, `G>35`, `B<0.9G`) rises from **0 visible pixels**
behind the full wall to **728 pixels** with the cutaway. The actor is
outside that measured silhouette. It is an art visibility proposal for projection work,
not a runtime rule or evidence about unsampled continuous angles.

The Blender script writes the [manifest](../assets/rendered/cell-bed-angle-study/manifest.json)
with source hashes, every PNG hash, camera coordinates, and independently
counted silhouette bounds. The contract test decodes each canonical PNG and
recounts nontransparent pixels; it also checks the source catalog and all
nine fixed camera positions.
