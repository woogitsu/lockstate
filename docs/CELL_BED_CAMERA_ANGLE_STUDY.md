# Cell bed at nine camera angles

This study replaces the simple bed stand-in in the [canonical cell scene](CAMERA_ANGLE_ART_STUDY.md)
with the existing `furniture.cell.bed.single.variants` collection from
`environment.mvp.catalog.blend`. It changes no game renderer, camera control,
simulation or catalog model. The bed's authored bottom-center origin is placed
at `(1, 2.1, 0)` in the cell. The wall, actor, door, one area light and camera
target remain the same.

All views use **1920 × 1080**, orthographic scale **16.5**, the original
−45°/0°/+45° yaw by 25°/45°/65° elevation grid, and the same light at
`[-4, -5, 9]`. That scale yields **65.45 pixels per vertical world tile**
at Full HD, close to the game's nominal 64 px default zoom. Each angle has
a furnished image and a bed-only transparent silhouette. The latter measures
the model without any wall occlusion.

| Yaw | 25° elevation | 45° elevation | 65° elevation |
| --- | --- | --- | --- |
| −45° | [19,154 px; 229 × 183](../assets/rendered/cell-bed-angle-study/bed-yaw-45-elev25.png) | [21,978 px; 229 × 229](../assets/rendered/cell-bed-angle-study/bed-yaw-45-elev45.png) | [23,573 px; 229 × 246](../assets/rendered/cell-bed-angle-study/bed-yaw-45-elev65.png) |
| 0° | [15,923 px; 113 × 179](../assets/rendered/cell-bed-angle-study/bed-yaw+00-elev25.png) | [20,655 px; 113 × 221](../assets/rendered/cell-bed-angle-study/bed-yaw+00-elev45.png) | [23,248 px; 113 × 237](../assets/rendered/cell-bed-angle-study/bed-yaw+00-elev65.png) |
| +45° | [19,120 px; 228 × 184](../assets/rendered/cell-bed-angle-study/bed-yaw+45-elev25.png) | [21,963 px; 228 × 228](../assets/rendered/cell-bed-angle-study/bed-yaw+45-elev45.png) | [23,551 px; 228 × 246](../assets/rendered/cell-bed-angle-study/bed-yaw+45-elev65.png) |

The table reports nontransparent bed pixels and silhouette width × height.
The [nine silhouette images](../assets/rendered/cell-bed-angle-study/manifest.json)
are linked from the manifest. The smallest silhouette is the head-on 0°/25°
view: 113 × 179 px and 15,923 pixels. Its pillow, orange folded blanket,
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
behind the full wall to **2,379 pixels** with the cutaway. The actor is
outside that measured silhouette. It is an art visibility proposal for projection work,
not a runtime rule or evidence about unsampled continuous angles.

The Blender script writes the [manifest](../assets/rendered/cell-bed-angle-study/manifest.json)
with source hashes, every PNG hash, camera coordinates, and independently
counted silhouette bounds. The contract test decodes each canonical PNG and
recounts nontransparent pixels; it also checks the source catalog and all
nine fixed camera positions.
