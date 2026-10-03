# Actor visibly crosses a full wall, 2026-10-01

The [Full HD screenshot](actor-behind-full-wall-yaw45-elev45.png) is from the actual `ObliqueWorldScene` with built kitchen walls and catalog PNGs at yaw 45°, elevation 45°. The orange actor at tile (3.5, 5.5) stands behind the full rear wall but is painted over that wall's texture. The second orange actor at (10, 8) stands in front of the room and is displayed correctly.

Reproduce with `tests/browser/oblique-actor-depth-probe.spec.ts`. It loads `oblique-preset-art-qa.html?preset=kitchen-basic&actorDepth=1` and captures the frame at 1920×1080. In `oblique-world-scene.ts`, actor strokes are collected into one Graphics object with depth 3, while catalog images receive depths from 2 to less than 2.9. The projection sorts actors and solids together, but these separate Phaser display depths override that order. This screenshot records the defect; the browser probe itself is observational and does not assert corrected occlusion.

## Corrected production scene, issue #1913

The earlier observational probe is now a pixel regression test. Actors use reusable per-ID Graphics objects at the same sorted display depth as authored solids. Offscreen or removed actors are destroyed. The [corrected frame](actor-after-depth-fix.png) was inspected: the rear wall hides the actor behind it, the foreground actor remains visible, and the kitchen counter is visible through the independent cutaway fix.

At 1920×1080, the test samples the lower torso, deliberately excluding a head that could legitimately extend above a wall. Restoring the former fixed depth 3 makes it fail with 56 orange pixels behind the wall instead of 0. Restoring the fix passes 1/1 browser test (8.9 seconds), with the foreground torso still visible. TypeScript passes; projection/geometry tests passed 8/8 before the separate cutaway integration, and cutaway plus room quote tests passed 9/9 after it. This proves this real Phaser rendering path, not deployment or all camera angles. No save or simulation state changes.
