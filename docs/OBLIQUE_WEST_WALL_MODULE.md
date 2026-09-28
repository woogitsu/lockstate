# West-edge wall module

`wall.interior.module.west.full` uses the same authored Blender interior wall geometry as the north-edge module, rotated 90° around the tile origin before rendering. This gives the west edge a true wall face, cap, trim, and skirting instead of a gray prism. The source wall kit, materials, light, and world-origin pivot are unchanged.

The transparent catalog contains 24 yaw poses in 15° steps and three elevations (25°, 45°, 65°). Each image is 512 × 512 with 64 px/tile and pivot `(256, 256)`. It is published in the existing registry and uses the existing nearest-pose and lazy Phaser texture loader. Registry generation scripts preserve the entry.

Blender 5.2.1 rerendered all 72 PNGs and the manifest with identical SHA-256 hashes. The entire catalog is 1,038,716 bytes; individual frames range from 8,761 to 18,997 bytes. Full HD Chromium preview loaded only the 48 visited west-wall frames during sweeps of every yaw at low and high elevations, transferring 690,123 bytes. Every image returned HTTP 200 and the pivot stayed at `(1370, 585)` under the pointer. Low and high elevation captures at yaw -90°, -45°, 0°, 45°, and 90° are produced in the system temporary directory. The 0° west wall is end-on; at -45° and 45° the complete side, pale cap, and base trim are visible.

The registry contract failed before this catalog existed and passes after rendering. The separate ObliqueWorldScene branch must map west edges to this logical ID to replace its placeholder in the game. This branch does not edit that scene, the world projector, camera, HUD, or gameplay.
