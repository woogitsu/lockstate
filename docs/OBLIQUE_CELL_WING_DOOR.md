# Open shower privacy door module

The four-cell wing already has a ceramic shower floor and a wall-mounted shower head. Its corridor-facing opening had no doorway. This Blender source adds an open, moisture-resistant privacy door without changing simulation, the oblique scene, or the projector.

## Module contract

- `door.shower.privacy.open.full`: 2.30-tile frame, frosted aqua panel opened 65° toward the corridor.
- `door.shower.privacy.open.cutaway`: 0.58-tile low frame and panel for an occluded view.
- Both use one tile footprint, a ground pivot at `(256,256)` in a 512 px transparent frame, 64 px per tile, 24 yaw values at 15° steps and elevations 25°, 45°, and 65°.
- Source: `assets/source/blender/door.shower.privacy.open.blend`; renderer: `tooling/blender/render-oblique-shower-privacy-door.py`; registry: `public/game-content/oblique-module-registry.v1.json`.

## Visual gate

The same four-cell wing was composed at 1920×1080 and native 64 px/tile. The only difference in each pair is the new shower door at the corridor opening. At yaw 0° its pale frame and aqua leaf read separately from the cell doors; at yaw −45° the low cutaway preserves a view of the shower floor; at yaw 90° the open panel is visible at the near end. The top-level scene must still select these IDs; this browser composition is not a claim that the game scene already uses them.

| Yaw | Before | After |
| --- | --- | --- |
| −90° | [image](evidence/oblique-cell-wing-door/door-before-yaw-90.png) | [image](evidence/oblique-cell-wing-door/door-after-yaw-90.png) |
| −45° | [image](evidence/oblique-cell-wing-door/door-before-yaw-45.png) | [image](evidence/oblique-cell-wing-door/door-after-yaw-45.png) |
| 0° | [image](evidence/oblique-cell-wing-door/door-before-yaw0.png) | [image](evidence/oblique-cell-wing-door/door-after-yaw0.png) |
| 45° | [image](evidence/oblique-cell-wing-door/door-before-yaw45.png) | [image](evidence/oblique-cell-wing-door/door-after-yaw45.png) |
| 90° | [image](evidence/oblique-cell-wing-door/door-before-yaw90.png) | [image](evidence/oblique-cell-wing-door/door-after-yaw90.png) |

The registry contract test was run red before adding the assets, then green after rendering. A second Blender render produced the same manifest hash. The assembly preview uses `LOCKSTATE_SHOW_SHOWER_DOOR=0` for the before views; default selects the new module.
