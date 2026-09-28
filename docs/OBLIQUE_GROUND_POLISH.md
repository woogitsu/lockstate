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

Full HD game comparison and the grid contrast check are pending. The current
grid is drawn beneath opaque Blender ground images, so its visibility needs a
real browser gate before this visual change is complete.
