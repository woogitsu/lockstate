# Ground grid in Browse and Build

The Blender ground module and the whole-square grid are separate Phaser layers.
The original grid above terrain was necessary for precise building, but its
dark outline dominated an ordinary Full HD view of a cell and an empty prison.
At yaw -45° its measured shared-edge luminance separation was 49.52.

`ObliqueWorldScene.setGroundGridEmphasis(isBuildActive)` now controls only the
grid and hover layers. Browse uses a light 0.09-opacity outline; Build uses
0.65-opacity lines plus a warm yellow outline and slight fill on the current
square. A mode change repaints neither ground sprites nor raised objects.
The existing world projection, tile picking, and terrain/save IDs are intact.

The scene browser gate at 1920×1080 uses the same built cell, bed, actor,
shower and Blender ground for three yaw angles. Browse edge contrast is below
12 at yaw -45°; Build stays above 18 at yaw -45°, 0° and 45°. The test also
proves that toggling the mode does not increase the ground paint count, and
that hovering changes the highlighted square. Targeted tests passed 2/2 with
one browser worker after the red baseline. Evidence is in
`docs/evidence/oblique-ground-grid-context/` (`browse-yaw-45.png`,
`browse-yaw0.png`, `browse-yaw45.png`, `build-yaw45.png`,
`build-hover-yaw45.png`).

The application owns the Build tool state in `src/main.ts`; its integration
branch must call this public scene method when that state changes. This art
branch does not edit the app orchestrator. The default Browse presentation is
already active in the scene without that wiring; stronger Build styling waits
for the app call.

The real `/?oblique-preview=1` application was also exercised at 1920×1080:
a new prison was created, the `Basic cell` plan was placed, Browse was opened,
and yaw -45°, 0°, and 45° were captured. The exact-source targeted browser
test passed 1/1 with one worker. Its screenshots are
`app-planned-cell-yaw-45.png`, `app-planned-cell-yaw0.png`, and
`app-planned-cell-yaw45.png` in the same evidence directory. That plan is
still a construction order with translucent geometry, so the application
check proves the ground
presentation around a placed plan; the built cell visual review above comes
from the actual Phaser scene fed a completed world snapshot.
