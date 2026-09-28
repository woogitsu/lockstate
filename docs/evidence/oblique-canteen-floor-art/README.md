# Finished Canteen: muted warm terrazzo

These are screenshots from the real application at 1920 × 1080, tilt 45°.
The browser test built a Canteen room plan at (10, 10), waited for it to finish,
saved, loaded the save in oblique preview, and captured three camera yaw poses.
Both images in each pair include the separately authored wooden tables and
benches from the two preceding stacked art changes.

| Yaw | Before | After |
| --- | --- | --- |
| −45° | [before](before-yaw-minus45.png) | [after](after-yaw-minus45.png) |
| 0° | [before](before-yaw0.png) | [after](after-yaw0.png) |
| +45° | [before](before-yaw45.png) | [after](after-yaw45.png) |

The original Canteen material has a saturated salmon base that dominates the
room despite the furniture. An isolated Blender source keeps its tile geometry,
fine grout and mineral chips, with a matte warm limestone base. Its overhead
sprite and 72 oblique floor poses are published through the existing pipelines.
The shared environment catalog and every unrelated room remain unchanged.

The accepted identity palette in ADR 0098 and the tint rule in ADR 0101 stay
intact: `room.canteen` keeps its assigned tint and 0.14 art wash. The overhead
floor mean was measured from the real 256 × 256 render and recalibrated to
`(191.438, 183.582, 169.882)` for ADR 0101's legibility check. A first, less
warm candidate failed the Canteen–Kitchen separation gate (28.77 against
required >30); the final material passes it.

The browser regression's salmon-pixel count in the Canteen region went from
71,280 to 0 at −45°, 78,540 to 0 at 0°, and 74,702 to 0 at +45°. This pixel
threshold checks the specific conspicuous defect; the paired screenshots show
that floor joints and wooden furniture remain legible. The test was red before
the Blender change and green after the final render.
