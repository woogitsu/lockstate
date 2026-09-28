# Finished Canteen: four wooden benches

These screenshots come from the real application at 1920 × 1080 and tilt 45°.
The browser test placed the Canteen room plan at (10, 10), completed the room,
saved it, loaded the save in oblique preview, then captured the same scene at
three camera yaw angles. The baseline includes the separately authored dining
tables from the preceding stacked change.

| Yaw | Before | After |
| --- | --- | --- |
| −45° | [before](before-yaw-minus45.png) | [after](after-yaw-minus45.png) |
| 0° | [before](before-yaw0.png) | [after](after-yaw0.png) |
| +45° | [before](before-yaw45.png) | [after](after-yaw45.png) |

Four 2 × 1 Canteen benches previously appeared as blue-gray solid blocks. The
existing Blender catalog has a wood-and-steel bench of the same footprint:
separate timber slats, a raised back, steel supports and visible feet. The
oblique pipeline now renders it at every 15° yaw and 25°/45°/65° elevation,
and maps the built `bench-wooden` to that asset. The Canteen floor and the
earlier dining tables are unchanged by this commit.

In representative bench regions, warm timber pixels went from 0 to 1,947 at
−45°, 0 to 1,782 at 0°, and 0 to 1,380 at +45°. The browser regression
checks all three after building and Save/Load. The registry contract checks
the source `.blend` and the SHA-256 hash of each of the 72 generated images.
