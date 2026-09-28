# Default dirt in the rotating preview

I opened the real `/?oblique-preview=1` app at 1920×1080, created a prison, and rotated its camera through −90°, −45°, 0°, 45°, and 90° at 45° elevation. The initial map is almost entirely a flat brown grid. This is the largest visible material gap before the player constructs anything. The current flat colors are `dirt` in `src/rendering/world/appearance.ts`.

The new Blender source `floor.terrain.dirt.blend` contains a tile-sized, matte compacted-earth plane with restrained procedural grain. Its palette stays close to the existing dirt colors, leaving the grid legible while adding surface detail. `floor.terrain.dirt` has 24 yaw × 3 elevation transparent frames, a 512 px frame, a 256 px ground pivot, and 64 nominal pixels per tile.

## Visual evidence

The live screenshots below are from the app branch with a newly created prison and its current flat ground. The before/after pair is a separate browser composition at the same 64 px/tile and 1920×1080: it compares the current flat palette with the new Blender tile on the same grid. **The Blender ground is not yet selected by the live game scene.** That integration should map default dirt terrain to `floor.terrain.dirt` and validate it in the game, without changing the simulation terrain id.

| Yaw | Live app | Flat composition | Blender composition |
| --- | --- | --- | --- |
| −90° | [image](evidence/oblique-default-dirt/live-yaw-90.png) | [image](evidence/oblique-default-dirt/candidate-before-yaw-90.png) | [image](evidence/oblique-default-dirt/candidate-after-yaw-90.png) |
| −45° | [image](evidence/oblique-default-dirt/live-yaw-45.png) | [image](evidence/oblique-default-dirt/candidate-before-yaw-45.png) | [image](evidence/oblique-default-dirt/candidate-after-yaw-45.png) |
| 0° | [image](evidence/oblique-default-dirt/live-yaw0.png) | [image](evidence/oblique-default-dirt/candidate-before-yaw0.png) | [image](evidence/oblique-default-dirt/candidate-after-yaw0.png) |
| 45° | [image](evidence/oblique-default-dirt/live-yaw45.png) | [image](evidence/oblique-default-dirt/candidate-before-yaw45.png) | [image](evidence/oblique-default-dirt/candidate-after-yaw45.png) |
| 90° | [image](evidence/oblique-default-dirt/live-yaw90.png) | [image](evidence/oblique-default-dirt/candidate-before-yaw90.png) | [image](evidence/oblique-default-dirt/candidate-after-yaw90.png) |

The registry contract failed red with 21 IDs against the expected 22 before registration. After rendering, the registry, catalog and art determinism suite passed 9/9. Repeating the Blender render produced the same catalog SHA256 `245FA4ADF7926F4D0E7AE6FD3E319939609EAF2D5303961333F38EE284E40455`.
