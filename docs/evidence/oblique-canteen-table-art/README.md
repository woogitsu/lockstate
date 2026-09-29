# Finished Canteen: dining-table artwork

These screenshots come from the real application at 1920 × 1080 and tilt 45°.
The browser test placed the Canteen room plan at (10, 10), completed the room,
saved it, loaded the save in oblique preview, then captured the same scene at
three camera yaw angles.

| Yaw | Before | After |
| --- | --- | --- |
| −45° | [before](before-yaw-minus45.png) | [after](after-yaw-minus45.png) |
| 0° | [before](before-yaw0.png) | [after](after-yaw0.png) |
| +45° | [before](before-yaw45.png) | [after](after-yaw45.png) |

The two 3 × 2 dining tables were the largest equipment placeholders: flat
blue-gray raised slabs at all three angles. The Blender catalog already had a
matching table with a wooden top, three meal trays and stools. The oblique
pipeline now renders that source at every 15° yaw and 25°/45°/65° elevation,
and the renderer maps the built `dining-table-wooden` to it. The unchanged
four smaller benches still use their current proxy; they are outside this
single-model art change.

In the selected table-top regions, warm timber pixels went from 0 to 2,328
at −45°, 0 to 2,093 at 0°, and 0 to 2,276 at +45°. The browser regression
checks all three regions after building and Save/Load. The registry contract
checks the source `.blend` and each of the 72 generated image SHA-256 hashes.
