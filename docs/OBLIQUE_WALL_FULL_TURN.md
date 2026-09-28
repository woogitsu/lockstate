# Full-turn wall module study

The `wall.interior.module.full` source is rendered by Blender 5.2 into 24 yaw poses (`-180°` through `165°`, 15° apart) at elevations 25°, 45°, and 65°. All 72 transparent frames use a 512 × 512 canvas, 64 pixels per tile, world-origin camera target, and exact pivot `(256, 256)`. The render uses the existing wall kit geometry, lighting, and material palette.

The Phaser preview selects the nearest authored yaw using circular distance, including the 180° seam. It requests only the selected image and retains previously used textures in Phaser's cache. The existing bulk loader remains available to callers that explicitly need all frames. The current game painter must call `ensureObliqueModuleFrameTexture` to benefit from lazy loading; this branch does not edit the painter.

## Full HD browser measurement

Measured in Chromium at 1920 × 1080 on a local Vite server with the Phaser art preview:

| Measure | Result |
| --- | ---: |
| Wall catalog | 72 PNG files; 1,018,519 bytes total |
| Preview startup | 1 selected PNG; 13,313 bytes |
| Full 24-pose yaw sweep, elevation 45° | 24 wall requests (including startup) |
| All preview requests after wall sweep, two other wall elevations, and five other modules | 33 images; 489,818 bytes |
| Yaw click to loaded frame | 235 ms minimum, 246 ms median, 288 ms maximum |

The sweep revisited the first pose without another network request. Each PNG returned HTTP 200. The browser test checks the authored pivot at the same screen coordinate `(1370, 585)` under the pointer for every yaw. This establishes stable placement of the isolated sprite. The world point under the cursor during camera motion must be checked after the separate world painter and camera interaction are combined.

Visual inspection captures are written by `tooling/qa-oblique-art-browser.mjs` to the system temporary directory for yaw -180°, -90°, 0°, 90°, and 165° at elevation 45°. They show the wall rotating around its fixed tile pivot at normal 64 px/tile and enlarged inspection scale. Some views, especially the end-on wall, become narrow by design.

The 15° grid is under 1.1 MB for the entire wall catalog, while a typical interaction transfers one roughly 14 KB frame. The measured local load latency includes browser capture and UI update, so it is not a production network estimate. The current grid and lazy selection are sufficient for this representative module; extending the same grid to every object should be budgeted separately.

The render was rerun with unchanged source: all 72 PNG SHA-256 digests and the manifest SHA-256 remained identical. Contract tests detect a mutation that replaces circular yaw selection with linear nearest-angle selection (the 180° seam test fails), and pass after restoration.
