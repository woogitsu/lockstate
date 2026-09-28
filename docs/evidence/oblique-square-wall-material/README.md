# Built four-cell wing: square wall material

The screenshots come from the real app at 1920 × 1080, tilt 45°, after placing
the **Four-cell row** room plan at (10, 10), completing all four cells, saving,
and loading the save in oblique preview. Each before/after pair uses the same
camera pose and the same construction flow.

| Yaw | Before | After |
| --- | --- | --- |
| −45° | [before](before-yaw-minus45.png) | [after](after-yaw-minus45.png) |
| 0° | [before](before-yaw0.png) | [after](after-yaw0.png) |
| +45° | [before](before-yaw45.png) | [after](after-yaw45.png) |

The built `wall-brick` squares previously used a flat reddish-brown proxy,
which covered much of the wing and made the authored floor, bed and toilet/sink
look unrelated. They now use a Blender-authored low masonry module with mineral
plaster, sandstone coping and a dark stone footing. At −45° and +45° the low
wall height and continuous joints remain clear without hiding the furniture or
door openings. The module retains the square structure's 1 × 1 footprint,
ground-centered pivot and 0.75-tile height. This change is limited to the
oblique art mapping and asset pipeline.

The browser regression `tests/browser/oblique-four-cell-wing-art-fullhd.spec.ts`
checks all three poses. Before the change, its −45° material sample had zero
warm-wall pixels against a >300 requirement; after the change it passed all
three samples. The registry contract checks every rendered pose's checksum and
the source Blender file's checksum.
