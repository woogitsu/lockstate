# Default prison ground: warm compacted earth

These pairs come from the real application at 1920 × 1080 and tilt 45°.
The browser regression built a Canteen at (10, 10), waited for completion,
saved, reloaded in oblique preview and captured the three yaw poses.
The Canteen has the separate table, bench and floor art from the parent stack.

| Yaw | Before | After |
| --- | --- | --- |
| −45° | [before](before-yaw-minus45.png) | [after](after-yaw-minus45.png) |
| 0° | [before](before-yaw0.png) | [after](after-yaw0.png) |
| +45° | [before](before-yaw45.png) | [after](after-yaw45.png) |

The old oblique ground was a dark olive surface with green moss mixed into
nonperiodic noise. Its colour filled most of the view and made the exterior
read muddy. The existing straight-down `terrain.dirt.compacted` art already
uses a warm brown, so this change brings the oblique module toward that
published direction. It replaces the moss mix with matte warm soil and 4D
periodic noise; the single square tile and picking footprint remain intact.
The shader's opposite edges carry the same noise coordinates, which keeps
adjacent tiles consistent. The 72 yaw/elevation frames were regenerated from
the authored Blender source. Square-grid guide lines remain a separate scene
layer and are outside this material change.

In a 300 × 300 ground region away from the room, mean RGB moved from roughly
`(107, 102, 83)` to `(135, 118, 96)` across all three poses. The real-app
test was red on the old material (`R−G = 4.98`, expected >10; red also below
120), then green on the new material (`R−G = 17.4`; red >135). The accepted
room tint palette and alpha rules from ADR 0098/0101 are unchanged: this is
default unzoned terrain art.
