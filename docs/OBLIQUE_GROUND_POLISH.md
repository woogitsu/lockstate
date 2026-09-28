# Oblique ground polish

The existing `floor.terrain.dirt`, `floor.terrain.grass`, and four directional
`dirt-grass.edge` catalogs already load in the angled scene. The new prison's
large unzoned area is logically dirt, so another grass-only catalog would have
no visible consumer there. This change keeps the terrain ID and existing save
format intact while giving the dirt source a restrained olive mineral palette
and sparse procedural moss. Grass remains a distinct terrain color.

The dirt source was rebuilt in Blender 5.2.1 and all 24 yaw × 3 elevation
ground frames were republished at 128×128, 64 nominal pixels per tile, pivot
`(64,64)`. Old hash-named PNGs remain available; the manifest points to new
hashes. Two complete rerenders produced the same manifest SHA-256:
`00fa9837e57ca67826d35ae0674fd2a01d0a39c9b6855b17cd6fc42dd2e0713c`.
The registry, catalog, and art determinism tests passed (8 passed, 1 skipped).

The browser test reproduced the lost grid at Full HD: luminance separation
between two dirt fields and their shared edge was only 7.85 at yaw -45°.
The grid now uses a separate Phaser graphics layer above the Blender ground
images and below the selection and raised geometry. The same 1920×1080 test
passes the shared-edge contrast threshold of 18 at yaw -45°, 0°, and 45°.
The whole-square grid is intentionally neutral dark so both dirt and grass
remain distinguishable without adding false terrain boundaries to saves.

The real `/?oblique-preview=1` application was opened at 1920×1080, a prison
was created, and the HUD camera was turned through yaw -45°, 0°, and 45° at
45° elevation. All three frames retain the new dirt texture and the same
whole-field grid. The targeted application browser test passed with one worker.
The screenshots are in `docs/evidence/oblique-ground-polish/` as
`new-prison-yaw-45.png`, `new-prison-yaw0.png`, and `new-prison-yaw45.png`.
At -45° and 0° the grid remains legible at the default game zoom while the
olive soil is less stark than the prior brown field. No terrain save ID or
camera projection changed.
